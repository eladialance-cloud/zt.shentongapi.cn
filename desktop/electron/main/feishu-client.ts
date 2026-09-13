/**
 * 飞书开放平台客户端（feishu-client）
 *
 * 对标 RRClaw 的 FeishuClient：统一 Bearer 鉴权、tenant_access_token 自动获取与刷新、
 * code 99991663（token 失效）自动续期重试；封装多维表格（bitable）/云文档/云空间核心接口。
 *
 * 设计原则：
 * - 纯 TS、零第三方依赖（用全局 fetch，可注入便于单测）
 * - 不落盘密钥（密钥由 feishu-settings 走 credential-store 加密存储）
 * - 所有方法返回统一结果 { ok, data?, error?, code? }，不抛异常给调用方
 */

export interface FeishuResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  code?: number;
}

export interface FeishuClientOptions {
  appId: string;
  appSecret: string;
  /** 开放平台域名，默认 https://open.feishu.cn */
  baseUrl?: string;
  /** 可注入 fetch（单测用），默认全局 fetch */
  fetchImpl?: typeof fetch;
}

/** 飞书 token 失效错误码（需刷新后重试） */
const TOKEN_INVALID_CODE = 99991663;
const TOKEN_EXPIRED_CODES = new Set([99991663, 99991661, 99991664]);

interface TokenCache {
  token: string;
  expiresAt: number;
}

export class FeishuClient {
  private readonly appId: string;
  private readonly appSecret: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private tokenCache: TokenCache | null = null;

  constructor(opts: FeishuClientOptions) {
    this.appId = opts.appId || "";
    this.appSecret = opts.appSecret || "";
    this.baseUrl = (opts.baseUrl || "https://open.feishu.cn").replace(/\/+$/, "");
    // 绑定全局 fetch 上下文，避免 Node 下 this 丢失
    const injected = opts.fetchImpl;
    const f = injected || (globalThis.fetch ? globalThis.fetch.bind(globalThis) : undefined);
    this.fetchImpl = f as typeof fetch;
  }

  /** 是否已配置凭证 */
  isConfigured(): boolean {
    return !!this.appId && !!this.appSecret;
  }

  // ===== 鉴权 =====

  /** 获取 tenant_access_token（带缓存，提前 60s 过期） */
  async getTenantAccessToken(force = false): Promise<FeishuResult<string>> {
    if (!this.isConfigured()) {
      return { ok: false, error: "飞书应用凭证未配置（App ID / App Secret）" };
    }
    const now = Date.now();
    if (!force && this.tokenCache && this.tokenCache.expiresAt > now + 60_000) {
      return { ok: true, data: this.tokenCache.token };
    }
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/open-apis/auth/v3/tenant_access_token/internal`, {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ app_id: this.appId, app_secret: this.appSecret }),
      });
      const json = (await res.json()) as {
        code?: number;
        msg?: string;
        tenant_access_token?: string;
        expire?: number;
      };
      if (json.code !== 0 || !json.tenant_access_token) {
        return { ok: false, error: json.msg || `获取 tenant_access_token 失败（code=${json.code}）`, code: json.code };
      }
      const expire = typeof json.expire === "number" && json.expire > 0 ? json.expire : 7200;
      this.tokenCache = { token: json.tenant_access_token, expiresAt: now + expire * 1000 };
      return { ok: true, data: json.tenant_access_token };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /** 通用请求：自动注入 Bearer、token 失效（99991663 等）自动刷新重试一次 */
  private async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    attempt = 0,
  ): Promise<FeishuResult<T>> {
    const tokenRes = await this.getTenantAccessToken(attempt > 0);
    if (!tokenRes.ok || !tokenRes.data) {
      return { ok: false, error: tokenRes.error, code: tokenRes.code };
    }
    try {
      const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: {
          "content-type": "application/json; charset=utf-8",
          authorization: `Bearer ${tokenRes.data}`,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const json = (await res.json()) as { code?: number; msg?: string; data?: T };
      if (json.code === 0) {
        return { ok: true, data: json.data };
      }
      // token 失效 → 强制刷新后重试一次
      if (attempt === 0 && json.code !== undefined && TOKEN_EXPIRED_CODES.has(json.code)) {
        this.tokenCache = null;
        return this.request<T>(method, path, body, attempt + 1);
      }
      return { ok: false, error: json.msg || `飞书接口错误（code=${json.code}）`, code: json.code };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // ===== 多维表格（bitable） =====

  /** 创建多维表格应用，返回 app_token */
  async createBitableApp(name: string, folderToken?: string): Promise<FeishuResult<{ app_token: string; url: string }>> {
    const body: Record<string, unknown> = { name };
    if (folderToken) body.folder_token = folderToken;
    const res = await this.request<{ app?: { app_token?: string; url?: string } }>(
      "POST",
      "/open-apis/bitable/v1/apps",
      body,
    );
    if (!res.ok) return { ok: false, error: res.error, code: res.code };
    const app = res.data?.app;
    if (!app?.app_token) return { ok: false, error: "创建多维表格成功但未返回 app_token" };
    return { ok: true, data: { app_token: app.app_token, url: app.url || "" } };
  }

  /** 列出多维表格中的数据表 */
  async listTables(appToken: string): Promise<FeishuResult<Array<{ table_id: string; name: string }>>> {
    const res = await this.request<{ items?: Array<{ table_id?: string; name?: string }> }>(
      "GET",
      `/open-apis/bitable/v1/apps/${encodeURIComponent(appToken)}/tables?page_size=100`,
    );
    if (!res.ok) return { ok: false, error: res.error, code: res.code };
    const items = (res.data?.items ?? []).map((t) => ({ table_id: t.table_id || "", name: t.name || "" }));
    return { ok: true, data: items };
  }

  /**
   * 在多维表格中创建数据表。
   * fields：飞书字段定义数组（如 [{ field_name: "标题", type: 1 }]）；
   * type 见飞书文档：1=文本 2=数字 3=单选 4=多选 5=日期 7=复选框 11=人员 15=超链接 17=附件 18=关联 20=公式 1001=创建时间。
   */
  async createTable(
    appToken: string,
    name: string,
    fields?: Array<{ field_name: string; type: number; property?: unknown }>,
  ): Promise<FeishuResult<{ table_id: string }>> {
    const body: Record<string, unknown> = { table: { name, default_view_name: "表格", fields: fields ?? [] } };
    const res = await this.request<{ table_id?: string }>(
      "POST",
      `/open-apis/bitable/v1/apps/${encodeURIComponent(appToken)}/tables`,
      body,
    );
    if (!res.ok) return { ok: false, error: res.error, code: res.code };
    const tableId = res.data?.table_id;
    if (!tableId) return { ok: false, error: "建表成功但未返回 table_id" };
    return { ok: true, data: { table_id: tableId } };
  }

  /**
   * 在多维表格中新增单个字段。
   * 用途：某个字段被飞书拒绝时只丢该字段，不连累整张表（字段级兜底）。
   */
  async createField(
    appToken: string,
    tableId: string,
    field: { field_name: string; type: number; property?: unknown },
  ): Promise<FeishuResult<{ field_id: string }>> {
    const body: Record<string, unknown> = { field_name: field.field_name, type: field.type };
    if (field.property !== undefined) body.property = field.property;
    const res = await this.request<{ field?: { field_id?: string } }>(
      "POST",
      `/open-apis/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/fields`,
      body,
    );
    if (!res.ok) return { ok: false, error: res.error, code: res.code };
    return { ok: true, data: { field_id: res.data?.field?.field_id || "" } };
  }

  /** 列出数据表字段（复用已有表时据此补齐规范新增字段） */
  async listFields(
    appToken: string,
    tableId: string,
  ): Promise<FeishuResult<Array<{ field_id?: string; field_name?: string; type?: number }>>> {
    const res = await this.request<{ items?: Array<{ field_id?: string; field_name?: string; type?: number }> }>(
      "GET",
      `/open-apis/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/fields?page_size=100`,
    );
    if (!res.ok) return { ok: false, error: res.error, code: res.code };
    return { ok: true, data: res.data?.items ?? [] };
  }

  /** 批量新增记录（fields 为字段名→值的对象数组） */
  async batchAddRecords(
    appToken: string,
    tableId: string,
    records: Array<Record<string, unknown>>,
  ): Promise<FeishuResult<{ records: unknown[] }>> {
    const body = { records: records.map((fields) => ({ fields })) };
    const res = await this.request<{ records?: unknown[] }>(
      "POST",
      `/open-apis/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/records/batch_create`,
      body,
    );
    if (!res.ok) return { ok: false, error: res.error, code: res.code };
    return { ok: true, data: { records: res.data?.records ?? [] } };
  }

  /** 查询记录（POST 检索，支持 filter/sort/page_size） */
  async listRecords(
    appToken: string,
    tableId: string,
    opts: { pageSize?: number; filter?: unknown } = {},
  ): Promise<FeishuResult<{ items: unknown[]; total?: number }>> {
    const body: Record<string, unknown> = { page_size: opts.pageSize ?? 100 };
    if (opts.filter) body.filter = opts.filter;
    const res = await this.request<{ items?: unknown[]; total?: number }>(
      "POST",
      `/open-apis/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/records/search`,
      body,
    );
    if (!res.ok) return { ok: false, error: res.error, code: res.code };
    return { ok: true, data: { items: res.data?.items ?? [], total: res.data?.total } };
  }

  // ===== 云空间 / 云文档 =====

  /** 获取根文件夹 token */
  async getRootFolderToken(): Promise<FeishuResult<string>> {
    const res = await this.request<{ token?: string }>(
      "GET",
      "/open-apis/drive/explorer/v2/root_folder/meta",
    );
    if (!res.ok) return { ok: false, error: res.error, code: res.code };
    if (!res.data?.token) return { ok: false, error: "未返回根文件夹 token" };
    return { ok: true, data: res.data.token };
  }

  /** 在指定文件夹下创建子文件夹 */
  async createFolder(name: string, folderToken: string): Promise<FeishuResult<{ token: string }>> {
    const res = await this.request<{ token?: string }>(
      "POST",
      "/open-apis/drive/v1/files/create_folder",
      { name, folder_token: folderToken },
    );
    if (!res.ok) return { ok: false, error: res.error, code: res.code };
    if (!res.data?.token) return { ok: false, error: "创建文件夹成功但未返回 token" };
    return { ok: true, data: { token: res.data.token } };
  }

  /** 创建云文档（docx） */
  async createDocx(title: string, folderToken?: string): Promise<FeishuResult<{ document_id: string; url?: string }>> {
    const body: Record<string, unknown> = { title };
    if (folderToken) body.folder_token = folderToken;
    const res = await this.request<{ document?: { document_id?: string; url?: string } }>(
      "POST",
      "/open-apis/docx/v1/documents",
      body,
    );
    if (!res.ok) return { ok: false, error: res.error, code: res.code };
    const doc = res.data?.document;
    if (!doc?.document_id) return { ok: false, error: "创建文档成功但未返回 document_id" };
    return { ok: true, data: { document_id: doc.document_id, url: doc.url } };
  }

  /**
   * 在云文档末尾追加一段纯文本（block_type=2 文本段落）。
   * 用于给「战略方向文档」写入初始提纲，避免只建出一个空文档。
   */
  async appendDocxText(documentId: string, text: string): Promise<FeishuResult<unknown>> {
    const res = await this.request<unknown>(
      "POST",
      `/open-apis/docx/v1/documents/${encodeURIComponent(documentId)}/blocks/${encodeURIComponent(documentId)}/children`,
      {
        children: [
          {
            block_type: 2,
            text: { elements: [{ text_run: { content: text } }] },
          },
        ],
      },
    );
    if (!res.ok) return { ok: false, error: res.error, code: res.code };
    return { ok: true, data: res.data };
  }

  /**
   * 读取云文档纯文本全文（docx raw_content）。
   * 用于「战略方向文档」运行时读取：编排器在中书省/尚书省节点前注入战略上下文。
   */
  async getDocxRawContent(documentId: string): Promise<FeishuResult<{ content: string }>> {
    const res = await this.request<{ content?: string }>(
      "GET",
      `/open-apis/docx/v1/documents/${encodeURIComponent(documentId)}/raw_content`,
    );
    if (!res.ok) return { ok: false, error: res.error, code: res.code };
    return { ok: true, data: { content: typeof res.data?.content === "string" ? res.data.content : "" } };
  }

  /** 生成多维表格访问链接（前端展示用） */
  static bitableUrl(appToken: string): string {
    return `https://feishu.cn/base/${appToken}`;
  }
}
