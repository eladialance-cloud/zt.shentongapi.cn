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
 * MaxKB 引擎 HTTP 适配（飞致云开源，Go 实现）
 *
 * ⚠️ 端点基于 MaxKB v1 API（Swagger 地址：http://<host>/swagger-ui.html）
 * 部署后请按实际版本核对：路径前缀 /api/dataset 与请求/响应字段（dataset_id / document_id 等）。
 * 若字段不同，只需修改本文件内的映射，不影响上层业务。
 */
const MAXKB_DATASET_BASE = '/api/dataset';

@Injectable()
export class MaxkbClient extends KnowledgeEngineClient {
  private readonly logger = new Logger(MaxkbClient.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    super();
    this.baseUrl = (configService.get<string>('MAXKB_BASE_URL') || '').replace(/\/+$/, '');
    this.apiKey = configService.get<string>('MAXKB_API_KEY') || '';
    this.timeoutMs = Number(configService.get<number>('MAXKB_TIMEOUT_MS', 15000));
  }

  /** 引擎是否已配置（部署后配 MAXKB_BASE_URL / MAXKB_API_KEY 即自动生效） */
  get enabled(): boolean {
    return !!this.baseUrl && !!this.apiKey;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    if (!this.enabled) {
      throw new MaxkbException('MAXKB 未配置（缺 MAXKB_BASE_URL / MAXKB_API_KEY）');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const resp = await fetch(this.baseUrl + path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
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
  ): Promise<T> {
    if (!this.enabled) {
      throw new MaxkbException('MAXKB 未配置（缺 MAXKB_BASE_URL / MAXKB_API_KEY）');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const form = new FormData();
      form.append(
        'file',
        new Blob([file.buffer.buffer.slice(file.buffer.byteOffset, file.buffer.byteOffset + file.buffer.byteLength) as ArrayBuffer], { type: file.mimetype || 'application/octet-stream' }),
        file.originalname,
      );
      const resp = await fetch(this.baseUrl + path, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}` },
        body: form,
        signal: controller.signal,
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
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
      await this.request<unknown>('GET', `${MAXKB_DATASET_BASE}?page=1&size=1`);
      return true;
    } catch (err) {
      this.logger.warn(`MaxKB ping 失败: ${(err as Error).message}`);
      return false;
    }
  }

  /** 创建数据集，返回数据集 ID（MaxKB 数据集列表接口返回 { id, name }） */
  async createKnowledgeBase(name: string, description?: string): Promise<string> {
    const res = await this.request<{ id?: string | number }>('POST', `${MAXKB_DATASET_BASE}`, {
      name,
      description: description || undefined,
    });
    const id = res?.id ?? (res as unknown as { dataset_id?: string | number })?.dataset_id;
    if (id === undefined || id === null) {
      throw new MaxkbException('MaxKB 创建数据集未返回 ID');
    }
    return String(id);
  }

  async deleteKnowledgeBase(engineKbId: string): Promise<void> {
    await this.request<unknown>('DELETE', `${MAXKB_DATASET_BASE}/${encodeURIComponent(engineKbId)}`);
  }

  /** 上传文档，返回文档 ID 与索引状态 */
  async uploadDocument(
    engineKbId: string,
    file: EngineUploadFile,
  ): Promise<EngineDocument> {
    const res = await this.multipart<Record<string, unknown>>(
      `${MAXKB_DATASET_BASE}/${encodeURIComponent(engineKbId)}/document`,
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
      `${MAXKB_DATASET_BASE}/${encodeURIComponent(engineKbId)}/document/${encodeURIComponent(engineDocumentId)}`,
    );
  }

  /** 语义检索，返回命中片段列表 */
  async retrieve(
    engineKbId: string,
    query: string,
    topK = 5,
  ): Promise<EngineRetrieveHit[]> {
    const res = await this.request<{ records?: Array<Record<string, unknown>> }>(
      'POST',
      `${MAXKB_DATASET_BASE}/${encodeURIComponent(engineKbId)}/retrieval`,
      { query, top_k: topK, topK },
    );
    const records = res?.records ?? [];
    return records.map((rec) => {
      const doc = (rec.document ?? rec.document_id ?? {}) as Record<string, unknown>;
      return {
        id: rec.id ? String(rec.id) : undefined,
        content: String(rec.content ?? rec.text ?? ''),
        score: Number(rec.score ?? rec.similarity ?? 0),
        documentId: rec.document_id ? String(rec.document_id) : undefined,
        documentName: typeof doc === 'object' ? String(doc.name ?? '') : undefined,
        metadata: (rec.metadata as Record<string, unknown>) || undefined,
      };
    });
  }
}
