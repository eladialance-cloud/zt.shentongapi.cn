import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KnowledgeEngineClient } from './engine-client.interface';
import type {
  EngineDocument,
  EngineRetrieveHit,
  EngineUploadFile,
} from './engine-client.interface';

/** 引擎调用异常（引擎未配置 / 网络失败 / 业务错误） */
export class MaxkbException extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'MaxkbException';
  }
}

/**
 * MaxKB 引擎 HTTP 适配（飞致云开源）
 *
 * 认证：MaxKB v2 管理接口（数据集/文档/检索）只接受「用户 token」，
 *   即先用管理员账号密码 POST /api/user/login 换取 token，再以
 *   Authorization: Bearer <token> 调用。token 每次请求自动续期，
 *   失效（Login expired）时自动重新登录重试一次。
 *
 * ⚠️ 端点基于 MaxKB v2 API（Swagger 地址：<host>/api/docs/）
 * 部署后请按实际版本核对：路径前缀 /api/dataset 与请求/响应字段。
 * 若字段不同，只需修改本文件内的映射，不影响上层业务。
 */
const MAXKB_ADMIN_PREFIX = '/admin/api';
const MAXKB_WORKSPACE_ID = 'default';

@Injectable()
export class MaxkbClient extends KnowledgeEngineClient {
  private readonly logger = new Logger(MaxkbClient.name);
  private readonly baseUrl: string;
  private readonly username: string;
  private readonly password: string;
  private readonly timeoutMs: number;
  private token: string | null = null;

  constructor(private readonly configService: ConfigService) {
    super();
    this.baseUrl = (configService.get<string>('MAXKB_BASE_URL') || '').replace(/\/+$/, '');
    this.username = configService.get<string>('MAXKB_USERNAME') || '';
    this.password = configService.get<string>('MAXKB_PASSWORD') || '';
    this.timeoutMs = Number(configService.get<number>('MAXKB_TIMEOUT_MS', 15000));
  }

  /** 引擎是否已配置（需 baseUrl + 账号密码，或兼容旧版直填 token） */
  get enabled(): boolean {
    return !!this.baseUrl && (!!this.username || !!this.token);
  }

  /** 登录 MaxKB 换取用户 token */
  private async login(): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const resp = await fetch(this.baseUrl + MAXKB_ADMIN_PREFIX + '/user/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: this.username, password: this.password }),
        signal: controller.signal,
      });
      const text = await resp.text().catch(() => '');
      let json: any = {};
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        /* 非 JSON 响应 */
      }
      if (!resp.ok) {
        throw new MaxkbException(
          `MaxKB 登录失败 ${resp.status}: ${(json.message || text).slice(0, 200)}`,
          resp.status,
        );
      }
      const data = (json.data ?? json) as { token?: string } | string;
      const token = typeof data === 'string' ? data : data?.token;
      if (!token) {
        throw new MaxkbException(
          `MaxKB 登录未返回 token: ${text.slice(0, 200)}`,
        );
      }
      this.token = token;
      return token;
    } catch (err) {
      if (err instanceof MaxkbException) throw err;
      throw new MaxkbException(`MaxKB 登录网络错误: ${(err as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  /** 获取可用 token（未登录则先登录） */
  private async ensureToken(): Promise<string> {
    if (this.token) return this.token;
    return this.login();
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    retry = true,
  ): Promise<T> {
    if (!this.enabled) {
      throw new MaxkbException('MAXKB 未配置（缺 MAXKB_BASE_URL / MAXKB_USERNAME / MAXKB_PASSWORD）');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const token = await this.ensureToken();
      const resp = await fetch(this.baseUrl + path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        // token 失效时重新登录重试一次
        if (retry && this.username && (resp.status === 401 || /login expired|未登录|登录已过期/i.test(text))) {
          this.token = null;
          return this.request<T>(method, path, body, false);
        }
        throw new MaxkbException(
          `MaxKB 请求失败 ${resp.status}: ${text.slice(0, 300)}`,
          resp.status,
        );
      }
      const data = (await resp.json().catch(() => ({}))) as {
        code?: number;
        message?: string;
        data?: T;
      };
      if (typeof data.code === 'number' && data.code !== 0 && data.code !== 200) {
        throw new MaxkbException(`MaxKB 业务错误 ${data.code}: ${data.message || ''}`);
      }
      return (data.data ?? data) as T;
    } catch (err) {
      if (err instanceof MaxkbException) throw err;
      throw new MaxkbException(`MaxKB 网络错误: ${(err as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  private async multipart<T>(
    path: string,
    file: EngineUploadFile,
    retry = true,
  ): Promise<T> {
    if (!this.enabled) {
      throw new MaxkbException('MAXKB 未配置（缺 MAXKB_BASE_URL / MAXKB_USERNAME / MAXKB_PASSWORD）');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const token = await this.ensureToken();
      const form = new FormData();
      form.append(
        'file',
        new Blob([file.buffer.buffer.slice(file.buffer.byteOffset, file.buffer.byteOffset + file.buffer.byteLength) as ArrayBuffer], { type: file.mimetype || 'application/octet-stream' }),
        file.originalname,
      );
      const resp = await fetch(this.baseUrl + path, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
        signal: controller.signal,
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        if (retry && this.username && (resp.status === 401 || /login expired|未登录|登录已过期/i.test(text))) {
          this.token = null;
          return this.multipart<T>(path, file, false);
        }
        throw new MaxkbException(
          `MaxKB 上传失败 ${resp.status}: ${text.slice(0, 300)}`,
          resp.status,
        );
      }
      const data = (await resp.json().catch(() => ({}))) as {
        code?: number;
        message?: string;
        data?: T;
      };
      if (typeof data.code === 'number' && data.code !== 0 && data.code !== 200) {
        throw new MaxkbException(`MaxKB 业务错误 ${data.code}: ${data.message || ''}`);
      }
      return (data.data ?? data) as T;
    } catch (err) {
      if (err instanceof MaxkbException) throw err;
      throw new MaxkbException(`MaxKB 上传网络错误: ${(err as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  async ping(): Promise<boolean> {
    if (!this.enabled) return false;
    try {
      await this.request<unknown>('GET', `${MAXKB_ADMIN_PREFIX}/workspace/${MAXKB_WORKSPACE_ID}/knowledge`);
      return true;
    } catch (err) {
      this.logger.warn(`MaxKB ping 失败: ${(err as Error).message}`);
      return false;
    }
  }

  /** 创建数据集，返回数据集 ID */
  async createKnowledgeBase(name: string, description?: string): Promise<string> {
    const res = await this.request<{
      knowledge_id?: string | number;
      id?: string | number;
    }>(
      'POST',
      `${MAXKB_ADMIN_PREFIX}/workspace/${MAXKB_WORKSPACE_ID}/knowledge/base`,
      {
        name,
        desc: description || undefined,
        folder_id: MAXKB_WORKSPACE_ID,
      },
    );
    const id = res?.knowledge_id ?? res?.id;
    return String(id);
  }

  async deleteKnowledgeBase(engineKbId: string): Promise<void> {
    await this.request<unknown>(
      'DELETE',
      `${MAXKB_ADMIN_PREFIX}/workspace/${MAXKB_WORKSPACE_ID}/knowledge/${encodeURIComponent(engineKbId)}`,
    );
  }

  /** 上传文档，返回文档 ID 与索引状态 */
  async uploadDocument(
    engineKbId: string,
    file: EngineUploadFile,
  ): Promise<EngineDocument> {
    const res = await this.multipart<Record<string, unknown>>(
      `${MAXKB_ADMIN_PREFIX}/workspace/${MAXKB_WORKSPACE_ID}/knowledge/${encodeURIComponent(engineKbId)}/document`,
      file,
    );
    const docId = (res?.id ?? (res as { document_id?: string | number })?.document_id) as
      | string
      | number
      | undefined;
    if (docId === undefined || docId === null) {
      throw new MaxkbException('MaxKB 上传文档未返回文档 ID');
    }
    const status = String(res?.status ?? 'pending') as EngineDocument['status'];
    return {
      engineDocumentId: String(docId),
      status: status === 'completed' || status === 'failed' ? status : 'pending',
      errorMessage: res?.error_message as string | undefined,
    };
  }

  async deleteDocument(
    engineKbId: string,
    engineDocumentId: string,
  ): Promise<void> {
    await this.request<unknown>(
      'DELETE',
      `${MAXKB_ADMIN_PREFIX}/workspace/${MAXKB_WORKSPACE_ID}/knowledge/${encodeURIComponent(engineKbId)}/document/${encodeURIComponent(engineDocumentId)}`,
    );
  }

  /** 语义检索，返回命中片段列表 */
  async retrieve(
    engineKbId: string,
    query: string,
    topK = 5,
  ): Promise<EngineRetrieveHit[]> {
    const raw = await this.request<Array<Record<string, unknown>> | { records?: Array<Record<string, unknown>> }>(
      'POST',
      `${MAXKB_ADMIN_PREFIX}/workspace/${MAXKB_WORKSPACE_ID}/knowledge/${encodeURIComponent(engineKbId)}/hit_test`,
      { query_text: query, top_number: topK, similarity: 0.3, search_mode: 'embedding' },
    );
    const records = Array.isArray(raw)
      ? raw
      : (raw as { records?: Array<Record<string, unknown>> })?.records ?? [];
    return records.map((rec) => {
      const doc = (rec.document ?? {}) as Record<string, unknown>;
      return {
        id: rec.id ? String(rec.id) : undefined,
        content: String(rec.content ?? rec.text ?? ''),
        score: Number(rec.similarity ?? rec.comprehensive_score ?? 0),
        documentId: rec.document_id ? String(rec.document_id) : undefined,
        documentName: typeof doc === 'object'
          ? String(doc.name ?? rec.document_name ?? '')
          : undefined,
        metadata: (rec.metadata as Record<string, unknown>) || undefined,
      };
    });
  }
}
