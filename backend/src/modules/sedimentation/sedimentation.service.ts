import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { LlmProxyService } from '../chat/services/llm-proxy.service';
import { KnowledgeBaseService } from '../knowledge/services/knowledge-base.service';
import { SedimentationFeedEntity } from './entities/sedimentation-feed.entity';
import {
  AnalyzeDto, ApplyDto, UndoDto, AnalyzeOutput,
} from './dto/sedimentation.dto';

const DEFAULT_KB_NAME = '对话沉淀';

export interface ApplyResult {
  feedId: number;
  undoToken?: string;
  kbId?: number;
  docId?: number;
  /** target=hermes_memory 时返回待写记忆内容（桌面端本地写入） */
  memoryWrite?: { target: 'hermes_memory'; title: string; content: string };
  /** 幂等命中（24h 内同标题同内容已沉淀），未重复写入 */
  alreadyExisted?: boolean;
}

/** 分类提示词：系统侧 */
export function buildClassifySystemPrompt(): string {
  return [
    '你是一个「对话知识沉淀识别器」。根据对话内容判断是否需要沉淀为知识，只输出严格 JSON，不要输出任何多余文字。',
    'JSON 结构：',
    '{"type":"enterprise_doc"|"customer_profile"|"requirement"|"data_update"|"none",',
    ' "target":"knowledge_base"|"hermes_memory"|"requirement_draft"|"customer_profile"|null,',
    ' "title":"简短标题(≤255字)",',
    ' "content":"清洗后的正文",',
    ' "confidence":0-1,',
    ' "operation":"add"|"replace"|"remove"}',
    '判定规则：',
    '- enterprise_doc：企业资料、制度、产品说明、长文本、粘贴的文档内容 → target=knowledge_base，operation=add',
    '- customer_profile：客户/顾客名称、需求、偏好、联系信息 → target=hermes_memory',
    '- requirement：明确的需求描述 → target=requirement_draft',
    '- data_update：明确的“改成/更新为/删掉/纠正”指令 → 保留 operation（replace/remove），content 为更新后的内容，title 用于定位旧条目',
    '- none：闲聊、寒暄、纯咨询、无实质信息 → target=null',
    '- 无法确定或 confidence<0.7 → type=none，target=null',
  ].join('\n');
}

/** 分类提示词：用户侧 */
export function buildClassifyUserPrompt(content: string, history: string[]): string {
  const hist = history.length > 0 ? '最近对话上下文：\n' + history.slice(-3).join('\n') + '\n' : '';
  return hist + '本次用户消息：\n' + content + '\n\n只输出 JSON。';
}

/** 解析分类器输出（容错：取第一个 JSON 对象/数组；解析失败或置信度不足返回 none） */
export function parseAnalyzeOutput(text: string): AnalyzeOutput | null {
  if (!text) return null;
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const v = JSON.parse(m[0]) as Record<string, unknown>;
    const allowed = ['enterprise_doc', 'customer_profile', 'requirement', 'data_update', 'none'];
    const type = String(v.type ?? '');
    if (!allowed.includes(type)) return null;
    const confidence = Number(v.confidence) || 0;
    if (type !== 'none' && confidence < 0.7) {
      return { type: 'none', target: null, title: '', content: '', confidence };
    }
    return {
      type: type as AnalyzeOutput['type'],
      target: (v.target as AnalyzeOutput['target']) ?? null,
      title: String(v.title ?? '').slice(0, 255),
      content: String(v.content ?? ''),
      confidence,
      operation: v.operation as AnalyzeOutput['operation'],
    };
  } catch {
    return null;
  }
}

@Injectable()
export class SedimentationService {
  private readonly logger = new Logger(SedimentationService.name);

  constructor(
    @InjectRepository(SedimentationFeedEntity)
    private readonly feedRepo: Repository<SedimentationFeedEntity>,
    private readonly llmProxy: LlmProxyService,
    private readonly knowledgeService: KnowledgeBaseService,
  ) {}

  /** 沉淀识别：LLM 分类用户消息 */
  async analyze(userId: number, dto: AnalyzeDto): Promise<AnalyzeOutput> {
    const apiKey = await this.llmProxy.ensureLlmProxyKey(userId);
    const { iterator } = await this.llmProxy.chatCompletions(apiKey, {
      model: dto.model || 'deepseek-chat',
      messages: [
        { role: 'system', content: buildClassifySystemPrompt() },
        { role: 'user', content: buildClassifyUserPrompt(dto.content, dto.history ?? []) },
      ],
      stream: false,
      temperature: 0,
      max_tokens: 1000,
    });
    let text = '';
    for await (const chunk of iterator) text += chunk;
    const parsed = parseAnalyzeOutput(text);
    if (!parsed) {
      this.logger.warn(`[sedimentation] 分类输出解析失败，按 none 处理: ${text.slice(0, 200)}`);
      return { type: 'none', target: null, title: '', content: '', confidence: 0 };
    }
    return parsed;
  }

  /** 应用沉淀：knowledge_base 写知识库；hermes_memory 仅记录（桌面端本地写） */
  async apply(userId: number, dto: ApplyDto): Promise<ApplyResult> {
    if (dto.target === 'hermes_memory') {
      const feed = await this.feedRepo.save(
        this.feedRepo.create({
          userId,
          type: dto.type,
          target: dto.target,
          title: dto.title,
          content: dto.content,
          sessionId: dto.sessionId ?? null,
          taskId: dto.taskId ?? null,
          status: 'applied',
        }),
      );
      return {
        feedId: Number(feed.id),
        memoryWrite: { target: 'hermes_memory', title: dto.title, content: dto.content },
      };
    }

    const kb = await this.resolveKb(userId, dto.kbId);

    // 幂等：24h 内同用户同标题同内容已沉淀 -> 直接复用，不重复入库
    const dup = await this.feedRepo.findOne({
      where: {
        userId,
        target: 'knowledge_base',
        title: dto.title,
        content: dto.content,
        status: 'applied',
      },
      order: { createdAt: 'DESC' },
    });
    if (dup) {
      const dupCreated = dup.createdAt instanceof Date ? dup.createdAt : new Date(String(dup.createdAt));
      if (!Number.isNaN(dupCreated.getTime()) && Date.now() - dupCreated.getTime() < 24 * 3600 * 1000) {
        this.logger.log(`用户 ${userId} 对话沉淀幂等命中，跳过写入: ${dto.title}`);
        return {
          feedId: Number(dup.id),
          undoToken: dup.undoToken ?? undefined,
          kbId: Number(kb.id),
          docId: dup.docId ? Number(dup.docId) : undefined,
          alreadyExisted: true,
        };
      }
    }

    const doc = await this.knowledgeService.createTextDocument(userId, Number(kb.id), {
      name: dto.title,
      content: dto.content,
    });
    const undoToken = randomUUID();
    const feed = await this.feedRepo.save(
      this.feedRepo.create({
        userId,
        type: dto.type,
        target: 'knowledge_base',
        title: dto.title,
        content: dto.content,
        kbId: Number(kb.id),
        docId: Number(doc.id),
        sessionId: dto.sessionId ?? null,
        taskId: dto.taskId ?? null,
        status: 'applied',
        undoToken,
      }),
    );
    this.logger.log(`用户 ${userId} 对话沉淀 -> 知识库 ${kb.id} 文档 ${doc.id} (${dto.title})`);
    return { feedId: Number(feed.id), undoToken, kbId: Number(kb.id), docId: Number(doc.id) };
  }

  /** 撤回沉淀：删除对应知识库文档（记忆由桌面端本地移除，feed 标记 undone） */
  async undo(userId: number, dto: UndoDto): Promise<{ ok: boolean }> {
    const feed = await this.feedRepo.findOne({ where: { undoToken: dto.undoToken, userId } });
    if (!feed) throw new NotFoundException('沉淀记录不存在');
    if (feed.status !== 'applied') return { ok: false };
    if (feed.target === 'knowledge_base' && feed.kbId && feed.docId) {
      await this.knowledgeService.deleteDocument(userId, Number(feed.kbId), Number(feed.docId));
    }
    feed.status = 'undone';
    await this.feedRepo.save(feed);
    return { ok: true };
  }

  /** 最近沉淀记录（供管理/撤回） */
  async feed(userId: number, limit = 50): Promise<Array<Record<string, unknown>>> {
    const rows = await this.feedRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
    return rows.map((r) => ({
      id: Number(r.id),
      type: r.type,
      target: r.target,
      title: r.title,
      status: r.status,
      createdAt: r.createdAt,
      undoToken: r.undoToken,
    }));
  }

  /** 目标知识库：指定库（校验归属）或默认「对话沉淀」库（不存在则创建） */
  private async resolveKb(userId: number, kbId?: number) {
    if (kbId) {
      const bases = await this.knowledgeService.listBases(userId, { page: 1, pageSize: 100 });
      const hit = bases.list.find((b) => Number(b.id) === kbId);
      if (!hit) throw new NotFoundException('知识库不存在');
      return hit;
    }
    const bases = await this.knowledgeService.listBases(userId, { page: 1, pageSize: 100 });
    const existing = bases.list.find((b) => b.name === DEFAULT_KB_NAME);
    if (existing) return existing;
    return this.knowledgeService.createBase(userId, { name: DEFAULT_KB_NAME, description: '对话自动沉淀的知识' });
  }
}