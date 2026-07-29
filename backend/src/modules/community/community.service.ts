import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { ChannelEntity } from './entities/channel.entity';
import { PostEntity, PostStatus, PostType } from './entities/post.entity';
import { ReplyEntity, ReplyStatus } from './entities/reply.entity';
import { VoteEntity, VoteTargetType } from './entities/vote.entity';
import { BookmarkEntity } from './entities/bookmark.entity';
import { TagEntity } from './entities/tag.entity';
import { PostTagEntity } from './entities/post-tag.entity';
import { UserProfileEntity } from './entities/user-profile.entity';
import { CreatePostDto } from './dto/create-post.dto';
import { CreateReplyDto } from './dto/create-reply.dto';
import { QueryPostsDto, PostSort } from './dto/query-posts.dto';

/**
 * 社区服务
 * 数据合同真源：Community 模块 - 社区核心逻辑
 */
@Injectable()
export class CommunityService {
  constructor(
    @InjectRepository(ChannelEntity)
    private readonly channelRepo: Repository<ChannelEntity>,
    @InjectRepository(PostEntity)
    private readonly postRepo: Repository<PostEntity>,
    @InjectRepository(ReplyEntity)
    private readonly replyRepo: Repository<ReplyEntity>,
    @InjectRepository(VoteEntity)
    private readonly voteRepo: Repository<VoteEntity>,
    @InjectRepository(BookmarkEntity)
    private readonly bookmarkRepo: Repository<BookmarkEntity>,
    @InjectRepository(TagEntity)
    private readonly tagRepo: Repository<TagEntity>,
    @InjectRepository(PostTagEntity)
    private readonly postTagRepo: Repository<PostTagEntity>,
    @InjectRepository(UserProfileEntity)
    private readonly userProfileRepo: Repository<UserProfileEntity>,
  ) {}

  /**
   * 列出所有启用的频道
   */
  async listChannels(): Promise<ChannelEntity[]> {
    return this.channelRepo.find({
      where: { isEnabled: true },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
  }

  /**
   * 分页查询帖子列表
   */
  async listPosts(query: QueryPostsDto): Promise<{ list: PostEntity[]; total: number; page: number; pageSize: number }> {
    const page = Math.max(1, query.page || 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize || 20));
    const sort = query.sort || PostSort.NEW;

    const where: any = { status: PostStatus.APPROVED };
    if (query.channel) {
      where.channelId = query.channel;
    }

    let order: any = {};
    if (sort === PostSort.HOT) {
      order = { isPinned: 'DESC', voteCount: 'DESC', replyCount: 'DESC', createdAt: 'DESC' };
    } else if (sort === PostSort.ESSENCE) {
      where.isEssence = true;
      order = { isPinned: 'DESC', createdAt: 'DESC' };
    } else {
      order = { isPinned: 'DESC', createdAt: 'DESC' };
    }

    const [list, total] = await this.postRepo.findAndCount({
      where,
      order,
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return { list, total, page, pageSize };
  }

  /**
   * 获取帖子详情并增加浏览量
   */
  async getPost(id: number): Promise<PostEntity> {
    const post = await this.postRepo.findOne({ where: { id } });
    if (!post) {
      throw new NotFoundException('帖子不存在');
    }
    post.viewCount += 1;
    await this.postRepo.save(post);
    return post;
  }

  /**
   * 创建帖子
   */
  async createPost(userId: number, dto: CreatePostDto): Promise<PostEntity> {
    const channel = await this.channelRepo.findOne({ where: { id: dto.channelId } });
    if (!channel) {
      throw new NotFoundException('频道不存在');
    }

    const post = this.postRepo.create({
      channelId: dto.channelId,
      authorId: userId,
      type: dto.type,
      title: dto.title,
      content: dto.content,
      contentHtml: null,
      bounty: dto.bounty || 0,
      coverImage: dto.coverImage || null,
      demoUrl: dto.demoUrl || null,
      status: PostStatus.APPROVED,
    });

    const savedPost = await this.postRepo.save(post);

    // 处理标签
    if (dto.tags && dto.tags.length > 0) {
      await this.ensureTags(savedPost.id, dto.tags);
    }

    // 更新频道帖子数
    channel.postCount += 1;
    await this.channelRepo.save(channel);

    // 确保用户档案存在并更新发帖数
    await this.ensureUserProfile(userId);
    await this.userProfileRepo.increment({ userId }, 'postCount', 1);

    return savedPost;
  }

  /**
   * 获取帖子回复列表
   */
  async listReplies(postId: number): Promise<ReplyEntity[]> {
    return this.replyRepo.find({
      where: { postId, status: ReplyStatus.ACTIVE },
      order: { isAccepted: 'DESC', voteCount: 'DESC', createdAt: 'ASC' },
    });
  }

  /**
   * 创建回复
   */
  async createReply(userId: number, postId: number, dto: CreateReplyDto): Promise<ReplyEntity> {
    const post = await this.postRepo.findOne({ where: { id: postId } });
    if (!post) {
      throw new NotFoundException('帖子不存在');
    }

    const reply = this.replyRepo.create({
      postId,
      authorId: userId,
      parentId: dto.parentId || null,
      content: dto.content,
      contentHtml: null,
      status: ReplyStatus.ACTIVE,
    });

    const savedReply = await this.replyRepo.save(reply);

    // 更新帖子回复数
    post.replyCount += 1;
    await this.postRepo.save(post);

    // 更新用户回复数
    await this.ensureUserProfile(userId);
    await this.userProfileRepo.increment({ userId }, 'replyCount', 1);

    return savedReply;
  }

  /**
   * 采纳最佳回复
   */
  async acceptReply(userId: number, replyId: number): Promise<ReplyEntity> {
    const reply = await this.replyRepo.findOne({ where: { id: replyId } });
    if (!reply) {
      throw new NotFoundException('回复不存在');
    }

    const post = await this.postRepo.findOne({ where: { id: reply.postId } });
    if (!post) {
      throw new NotFoundException('帖子不存在');
    }

    if (post.authorId !== userId) {
      throw new ForbiddenException('只有帖子作者可以采纳回复');
    }

    if (reply.isAccepted) {
      return reply;
    }

    // 取消旧的已采纳回复
    if (post.bestReplyId) {
      await this.replyRepo.update({ id: post.bestReplyId }, { isAccepted: false });
    }

    reply.isAccepted = true;
    await this.replyRepo.save(reply);

    post.isResolved = true;
    post.bestReplyId = reply.id;
    await this.postRepo.save(post);

    // 更新回复作者的采纳数与声望
    await this.ensureUserProfile(reply.authorId);
    await this.userProfileRepo.increment({ userId: reply.authorId }, 'acceptedCount', 1);
    await this.userProfileRepo.increment({ userId: reply.authorId }, 'reputation', 10);

    return reply;
  }

  /**
   * 投票/踩赞
   */
  async vote(
    userId: number,
    targetType: VoteTargetType,
    targetId: number,
    value: number,
  ): Promise<{ voteCount: number }> {
    const sign = value > 0 ? 1 : -1;

    let existing = await this.voteRepo.findOne({
      where: { userId, targetType, targetId },
    });

    if (existing) {
      if (existing.value === sign) {
        // 取消投票
        await this.voteRepo.remove(existing);
        await this.adjustVoteCount(targetType, targetId, -sign);
      } else {
        // 反转投票
        existing.value = sign;
        await this.voteRepo.save(existing);
        await this.adjustVoteCount(targetType, targetId, sign * 2);
      }
    } else {
      existing = this.voteRepo.create({ userId, targetType, targetId, value: sign });
      await this.voteRepo.save(existing);
      await this.adjustVoteCount(targetType, targetId, sign);
    }

    const target = await this.getVoteTarget(targetType, targetId);
    return { voteCount: target.voteCount };
  }

  /**
   * 收藏帖子
   */
  async bookmark(userId: number, postId: number): Promise<void> {
    const post = await this.postRepo.findOne({ where: { id: postId } });
    if (!post) {
      throw new NotFoundException('帖子不存在');
    }

    const existing = await this.bookmarkRepo.findOne({ where: { userId, postId } });
    if (existing) {
      return;
    }

    await this.bookmarkRepo.save(this.bookmarkRepo.create({ userId, postId }));
    post.bookmarkCount += 1;
    await this.postRepo.save(post);
  }

  /**
   * 取消收藏帖子
   */
  async unbookmark(userId: number, postId: number): Promise<void> {
    const existing = await this.bookmarkRepo.findOne({ where: { userId, postId } });
    if (!existing) {
      return;
    }

    await this.bookmarkRepo.remove(existing);
    await this.postRepo.decrement({ id: postId }, 'bookmarkCount', 1);
  }

  /**
   * 获取用户社区档案
   */
  async getUserProfile(userId: number): Promise<UserProfileEntity> {
    let profile = await this.userProfileRepo.findOne({ where: { userId } });
    if (!profile) {
      profile = this.userProfileRepo.create({ userId });
      profile = await this.userProfileRepo.save(profile);
    }
    return profile;
  }

  /**
   * 热门帖子（7天内，按 vote_count 降序）
   */
  async listHotTopics(limit: number = 10): Promise<PostEntity[]> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return this.postRepo.find({
      where: {
        status: PostStatus.APPROVED,
        createdAt: MoreThanOrEqual(sevenDaysAgo),
      },
      order: { voteCount: 'DESC', replyCount: 'DESC' },
      take: limit,
    });
  }

  /**
   * 活跃用户（按 reputation 降序）
   */
  async listActiveUsers(limit: number = 10): Promise<UserProfileEntity[]> {
    return this.userProfileRepo.find({
      order: { reputation: 'DESC' },
      take: limit,
    });
  }

  // --------------- 私有辅助方法 ---------------

  private async ensureUserProfile(userId: number): Promise<void> {
    const exists = await this.userProfileRepo.findOne({ where: { userId } });
    if (!exists) {
      await this.userProfileRepo.save(this.userProfileRepo.create({ userId }));
    }
  }

  private async ensureTags(postId: number, tagNames: string[]): Promise<void> {
    const uniqueNames = [...new Set(tagNames.map((t) => t.trim()).filter(Boolean))];
    for (const name of uniqueNames) {
      let tag = await this.tagRepo.findOne({ where: { name } });
      if (!tag) {
        tag = await this.tagRepo.save(this.tagRepo.create({ name }));
      }

      const existing = await this.postTagRepo.findOne({ where: { postId, tagId: tag.id } });
      if (!existing) {
        await this.postTagRepo.save(this.postTagRepo.create({ postId, tagId: tag.id }));
        await this.tagRepo.increment({ id: tag.id }, 'postCount', 1);
      }
    }
  }

  private async adjustVoteCount(targetType: VoteTargetType, targetId: number, delta: number): Promise<void> {
    if (targetType === VoteTargetType.POST) {
      await this.postRepo.increment({ id: targetId }, 'voteCount', delta);
    } else if (targetType === VoteTargetType.REPLY) {
      await this.replyRepo.increment({ id: targetId }, 'voteCount', delta);
    }
  }

  private async getVoteTarget(targetType: VoteTargetType, targetId: number) {
    if (targetType === VoteTargetType.POST) {
      const post = await this.postRepo.findOne({ where: { id: targetId } });
      if (!post) {
        throw new NotFoundException('帖子不存在');
      }
      return post;
    }
    if (targetType === VoteTargetType.REPLY) {
      const reply = await this.replyRepo.findOne({ where: { id: targetId } });
      if (!reply) {
        throw new NotFoundException('回复不存在');
      }
      return reply;
    }
    throw new NotFoundException('投票目标不存在');
  }
}
