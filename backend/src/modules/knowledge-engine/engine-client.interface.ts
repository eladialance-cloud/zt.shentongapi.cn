/**
 * 知识库引擎统一接口
 * 当前实现：MaxKB；后续可替换 Dify / RAGFlow，只需新增适配类并切换 Provider
 */
export interface EngineUploadFile {
  originalname: string;
  buffer: Buffer;
  mimetype?: string;
}

export interface EngineDocument {
  /** 引擎侧文档 ID */
  engineDocumentId: string;
  /** 引擎索引状态：pending / processing / completed / failed */
  status: 'pending' | 'processing' | 'completed' | 'failed';
  errorMessage?: string;
}

export interface EngineRetrieveHit {
  id?: string;
  content: string;
  score: number;
  documentId?: string;
  documentName?: string;
  metadata?: Record<string, unknown>;
}

export abstract class KnowledgeEngineClient {
  /** 引擎是否已配置 */
  abstract readonly enabled: boolean;
  /** 引擎是否已配置并可达 */
  abstract ping(): Promise<boolean>;
  /** 创建知识库（数据集），返回引擎侧 ID */
  abstract createKnowledgeBase(name: string, description?: string): Promise<string>;
  /** 删除知识库（数据集） */
  abstract deleteKnowledgeBase(engineKbId: string): Promise<void>;
  /** 上传文档，返回引擎文档状态 */
  abstract uploadDocument(engineKbId: string, file: EngineUploadFile): Promise<EngineDocument>;
  /** 删除文档 */
  abstract deleteDocument(engineKbId: string, engineDocumentId: string): Promise<void>;
  /** 语义检索 */
  abstract retrieve(engineKbId: string, query: string, topK?: number): Promise<EngineRetrieveHit[]>;
}
