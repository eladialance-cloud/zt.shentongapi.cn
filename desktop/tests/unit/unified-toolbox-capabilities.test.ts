import { executeFeishu, resolveFeishuConfig, resetFeishuTokenCache, feishuApi } from '../../scripts/unified-toolbox/capabilities/feishu'
import { executeMysql, resolveMysqlConfig, validateSql } from '../../scripts/unified-toolbox/capabilities/mysql'

/** 构造一个记录调用的假 fetch */
function fakeFetch(handler: (url: string, init?: RequestInit) => unknown) {
  const calls: Array<{ url: string; method?: string; body?: unknown }> = []
  const f = (async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    const out = handler(url, init) as { status?: number; json: unknown }
    return {
      status: out.status ?? 200,
      json: async () => out.json,
    } as unknown as Response
  }) as unknown as typeof fetch
  return { f, calls }
}

const tokenOk = { code: 0, tenant_access_token: 'tk-1', expire: 7200 }

describe('unified-toolbox feishu capability (real)', () => {
  beforeEach(() => resetFeishuTokenCache())

  it('resolveFeishuConfig：env 直读优先', () => {
    expect(resolveFeishuConfig({ FEISHU_APP_ID: 'a', FEISHU_APP_SECRET: 'b' } as NodeJS.ProcessEnv)).toEqual({
      appId: 'a',
      appSecret: 'b',
    })
    expect(resolveFeishuConfig({} as NodeJS.ProcessEnv)).toBeNull()
  })

  it('resolveFeishuConfig：回退 JSON 文件', () => {
    const env = { ST_FEISHU_CREDENTIALS: '/tmp/x.json' } as NodeJS.ProcessEnv
    const cfg = resolveFeishuConfig(env, () => JSON.stringify({ appId: 'fa', appSecret: 'fs' }))
    expect(cfg).toEqual({ appId: 'fa', appSecret: 'fs' })
    const bad = resolveFeishuConfig(env, () => 'not json')
    expect(bad).toBeNull()
  })

  it('未配置凭证返回明确错误', async () => {
    const r = await executeFeishu({ app_token: 'x', table_name: 'y' }, { env: {} as NodeJS.ProcessEnv })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('飞书凭证未配置')
  })

  it('create_table：建表并透传字段定义', async () => {
    const { f, calls } = fakeFetch((url) => {
      if (url.includes('tenant_access_token')) return { json: tokenOk }
      if (/\/bitable\/v1\/apps\/app1\/tables$/.test(url)) return { json: { code: 0, data: { table_id: 'tbl1' } } }
      return { json: { code: 0, data: {} } }
    })
    const r = await executeFeishu(
      { action: 'create_table', app_token: 'app1', table_name: '军机处·任务主表', fields: [{ name: '标题', type: 'TEXT' }, { name: '状态', type: 'SELECT' }] },
      { fetchImpl: f, env: { FEISHU_APP_ID: 'a', FEISHU_APP_SECRET: 'b' } as NodeJS.ProcessEnv, baseUrl: 'https://x' },
    )
    expect(r.ok).toBe(true)
    const create = calls.find((c) => c.url.endsWith('/bitable/v1/apps/app1/tables'))
    expect(create?.method).toBe('POST')
    expect((create?.body as any).table.name).toBe('军机处·任务主表')
    expect((create?.body as any).table.fields[0]).toEqual({ field_name: '标题', type: 1 })
  })

  it('缺少 app_token / table_name 报错', async () => {
    const r1 = await executeFeishu({ action: 'create_table', table_name: 'x' }, { env: { FEISHU_APP_ID: 'a', FEISHU_APP_SECRET: 'b' } as NodeJS.ProcessEnv })
    expect(r1.error).toContain('app_token')
    const r2 = await executeFeishu({ action: 'create_table', app_token: 'x' }, { env: { FEISHU_APP_ID: 'a', FEISHU_APP_SECRET: 'b' } as NodeJS.ProcessEnv })
    expect(r2.error).toContain('table_name')
  })

  it('add_records：records 支持 JSON 字符串入参', async () => {
    const { f, calls } = fakeFetch((url) => {
      if (url.includes('tenant_access_token')) return { json: tokenOk }
      return { json: { code: 0, data: { records: [{ record_id: 'rec1' }] } } }
    })
    const r = await executeFeishu(
      { action: 'add_records', app_token: 'a', table_id: 't', records: JSON.stringify([{ 标题: 'hello' }]) },
      { fetchImpl: f, env: { FEISHU_APP_ID: 'x', FEISHU_APP_SECRET: 'y' } as NodeJS.ProcessEnv, baseUrl: 'https://x' },
    )
    expect(r.ok).toBe(true)
    const call = calls.find((c) => c.url.includes('batch_create'))
    expect((call?.body as any).records[0]).toEqual({ fields: { 标题: 'hello' } })
  })

  it('list_records：分页参数透传', async () => {
    const { f, calls } = fakeFetch((url) => {
      if (url.includes('tenant_access_token')) return { json: tokenOk }
      return { json: { code: 0, data: { items: [] } } }
    })
    await executeFeishu(
      { action: 'list_records', app_token: 'a', table_id: 't', page_size: 50, page_token: 'pt' },
      { fetchImpl: f, env: { FEISHU_APP_ID: 'x', FEISHU_APP_SECRET: 'y' } as NodeJS.ProcessEnv, baseUrl: 'https://x' },
    )
    const call = calls.find((c) => c.url.includes('/records?'))
    expect(call?.url).toContain('page_size=50')
    expect(call?.url).toContain('page_token=pt')
  })

  it('token 失效（99991663）自动刷新并重试一次', async () => {
    let tableCalls = 0
    const { f } = fakeFetch((url) => {
      if (url.includes('tenant_access_token')) return { json: tokenOk }
      tableCalls++
      if (tableCalls === 1) return { json: { code: 99991663, msg: 'token expired' } }
      return { json: { code: 0, data: { ok: true } } }
    })
    const r = await feishuApi({ appId: 'a', appSecret: 'b' }, 'GET', '/bitable/v1/apps/x/tables', undefined, {
      fetchImpl: f,
      baseUrl: 'https://x',
    })
    expect(r.ok).toBe(true)
    expect(tableCalls).toBe(2)
  })

  it('不支持的动作报错', async () => {
    const r = await executeFeishu({ action: 'nope' }, { env: { FEISHU_APP_ID: 'a', FEISHU_APP_SECRET: 'b' } as NodeJS.ProcessEnv })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('不支持的动作')
  })
})

describe('unified-toolbox mysql capability (real)', () => {
  it('resolveMysqlConfig：缺 host/user 返回 null', () => {
    expect(resolveMysqlConfig({} as NodeJS.ProcessEnv)).toBeNull()
    const c = resolveMysqlConfig({ ST_MYSQL_HOST: 'h', ST_MYSQL_USER: 'u', ST_MYSQL_DB: 'd' } as NodeJS.ProcessEnv)
    expect(c).toEqual({ host: 'h', port: 3306, user: 'u', password: '', database: 'd', allowWrite: false })
  })

  it('validateSql：只读模式拒绝写操作与多语句', () => {
    expect(validateSql('SELECT 1', false)).toBeNull()
    expect(validateSql('DELETE FROM t', false)).toContain('只读模式')
    expect(validateSql('SELECT 1; SELECT 2', false)).toContain('多条')
    expect(validateSql('DELETE FROM t', true)).toBeNull()
    expect(validateSql('', false)).toContain('sql')
  })

  it('未配置返回明确错误', async () => {
    const r = await executeMysql({ sql: 'SELECT 1' }, { env: {} as NodeJS.ProcessEnv })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('MySQL 未配置')
  })

  it('注入 pool：执行查询返回 rows', async () => {
    const pool = {
      query: async () => [[{ id: 1 }], []] as [unknown, unknown],
      end: async () => undefined,
    }
    const r = await executeMysql({ sql: 'SELECT id FROM t' }, { pool })
    expect(r.ok).toBe(true)
    expect((r.data as { rows: unknown[] }).rows).toEqual([{ id: 1 }])
  })

  it('注入 pool：写操作被拦截', async () => {
    const pool = { query: async () => [[], []] as [unknown, unknown], end: async () => undefined }
    const r = await executeMysql({ sql: 'DELETE FROM t' }, { pool })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('只读模式')
  })

  it('query 抛错被包装为 ok:false', async () => {
    const pool = {
      query: async (): Promise<[unknown, unknown]> => {
        throw new Error('boom')
      },
      end: async () => undefined,
    }
    const r = await executeMysql({ sql: 'SELECT 1' }, { pool })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('boom')
  })
})
