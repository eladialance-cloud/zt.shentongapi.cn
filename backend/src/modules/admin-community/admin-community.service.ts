import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ChannelEntity } from "../community/entities/channel.entity";
import { PostEntity, PostStatus } from "../community/entities/post.entity";
import { TagEntity } from "../community/entities/tag.entity";

@Injectable()
export class AdminCommunityService {
  constructor(
    @InjectRepository(ChannelEntity)
    private readonly channelRepo: Repository<ChannelEntity>,
    @InjectRepository(PostEntity)
    private readonly postRepo: Repository<PostEntity>,
    @InjectRepository(TagEntity)
    private readonly tagRepo: Repository<TagEntity>,
  ) {}

  // ===== 帖子审核 =====

  async listPendingPosts(page: number, pageSize: number) {
    const [list, total] = await this.postRepo.findAndCount({
      where: { status: PostStatus.PENDING },
      order: { createdAt: "ASC" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { list, total, page, pageSize };
  }

  async approvePost(id: number) {
    const post = await this.postRepo.findOne({ where: { id } });
    if (!post) throw new NotFoundException("帖子不存在");
    post.status = PostStatus.APPROVED;
    return this.postRepo.save(post);
  }

  async rejectPost(id: number, reason: string) {
    const post = await this.postRepo.findOne({ where: { id } });
    if (!post) throw new NotFoundException("帖子不存在");
    post.status = PostStatus.REJECTED;
    post.reviewReason = reason;
    return this.postRepo.save(post);
  }

  async deletePost(id: number) {
    const post = await this.postRepo.findOne({ where: { id } });
    if (!post) throw new NotFoundException("帖子不存在");
    return this.postRepo.remove(post);
  }

  async togglePinPost(id: number, isPinned: boolean) {
    const post = await this.postRepo.findOne({ where: { id } });
    if (!post) throw new NotFoundException("帖子不存在");
    post.isPinned = isPinned;
    return this.postRepo.save(post);
  }

  async toggleEssencePost(id: number, isEssence: boolean) {
    const post = await this.postRepo.findOne({ where: { id } });
    if (!post) throw new NotFoundException("帖子不存在");
    post.isEssence = isEssence;
    return this.postRepo.save(post);
  }

  // ===== 频道管理 =====

  async listChannels() {
    return this.channelRepo.find({ order: { sortOrder: "ASC", createdAt: "ASC" } });
  }

  async createChannel(data: {
    id: string;
    name: string;
    slug: string;
    description?: string;
    icon?: string;
    color?: string;
  }) {
    const channel = this.channelRepo.create({
      id: data.id,
      name: data.name,
      slug: data.slug,
      description: data.description || "",
      icon: data.icon || "",
      color: data.color || "#1890ff",
      isEnabled: true,
      sortOrder: 0,
    });
    return this.channelRepo.save(channel);
  }

  async updateChannel(
    id: string,
    data: Partial<{
      name: string;
      description: string;
      icon: string;
      color: string;
      isEnabled: boolean;
      sortOrder: number;
    }>,
  ) {
    const channel = await this.channelRepo.findOne({ where: { id } });
    if (!channel) throw new NotFoundException("频道不存在");
    Object.assign(channel, data);
    return this.channelRepo.save(channel);
  }

  async deleteChannel(id: string) {
    const channel = await this.channelRepo.findOne({ where: { id } });
    if (!channel) throw new NotFoundException("频道不存在");
    return this.channelRepo.remove(channel);
  }

  // ===== 标签管理 =====

  async listTags() {
    return this.tagRepo.find({ order: { postCount: "DESC" } });
  }

  async deleteTag(id: number) {
    const tag = await this.tagRepo.findOne({ where: { id } });
    if (!tag) throw new NotFoundException("标签不存在");
    return this.tagRepo.remove(tag);
  }
}
