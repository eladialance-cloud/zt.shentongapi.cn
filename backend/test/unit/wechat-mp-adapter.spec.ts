/** 公众号图文草稿箱+发布（M6）单元测试 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WechatMpAdapter } from '../../src/modules/channel/adapters/wechat-mp.adapter';

type FetchResp = {
  ok?: boolean;
  status?: number;
  json: () => Promise<unknown>;
  headers?: { get: (name: string) => string | null };
  arrayBuffer?: () => Promise<ArrayBuffer>;
};

/** 按 URL 子串返回 mock 响应；不存在则抛错 */
function installFetchByUrl(handlers: Record<string, FetchResp>) {
  global.fetch = (async (url: string) => {
    for (const [key, resp] of Object.entries(handlers)) {
      if (url.includes(key)) return resp;
    }
    throw new Error('no mock for ' + url);
  }) as unknown as typeof fetch;
}

function resp(body: unknown): FetchResp {
  return { ok: true, status: 200, json: async () => body };
}

/** F4：封面图下载用的二进制响应（带 content-type 头 + arrayBuffer） */
function binaryResp(bytes: number[], contentType: string): FetchResp {
  return {
    ok: true,
    status: 200,
    json: async () => ({}),
    headers: { get: () => contentType },
    arrayBuffer: async () => new Uint8Array(bytes).buffer,
  };
}

/** 记录请求顺序与 JSON 请求体的 fetch 桩 */
function installRecordingFetch(handlers: Record<string, FetchResp>) {
  const calls: string[] = [];
  const bodies: Record<string, any> = {};
  global.fetch = (async (url: string, init?: { body?: unknown }) => {
    const u = String(url);
    calls.push(u);
    if (typeof init?.body === 'string') {
      try {
        bodies[u] = JSON.parse(init.body);
      } catch {
        bodies[u] = init.body;
      }
    }
    for (const [key, r] of Object.entries(handlers)) {
      if (u.includes(key)) return r;
    }
    throw new Error('no mock for ' + u);
  }) as unknown as typeof fetch;
  const find = (key: string) => calls.findIndex((u) => u.includes(key));
  const bodyOf = (key: string) => {
    const u = calls.find((x) => x.includes(key));
    return u ? bodies[u] : undefined;
  };
  return { calls, find, bodyOf };
}

function makeAdapter() {
  return new WechatMpAdapter();
}

describe('WechatMpAdapter.publishContent', () => {
  it('成功：draft/add + freepublish/submit 返回 publish_id', async () => {
    installFetchByUrl({
      '/cgi-bin/token': resp({ access_token: 'TOK', expires_in: 7200 }),
      '/cgi-bin/draft/add': resp({ media_id: 'MEDIA_1', errcode: 0 }),
      '/cgi-bin/freepublish/submit': resp({ publish_id: 987654, errcode: 0 }),
    });
    const adapter = makeAdapter();
    const res = await adapter.publishContent(
      JSON.stringify({ appId: 'wx01', appSecret: 'secret' }),
      { title: '标题', content: '<p>正文</p>', mediaUrls: ['outer-cover-id'], tags: ['干货'] },
    );
    assert.equal(res.platform, 'wechat_mp');
    assert.equal(res.success, true);
    assert.match(String(res.externalId), /987654/);
  });

  it('缺凭证时返回错误', async () => {
    const adapter = makeAdapter();
    const res = await adapter.publishContent(
      JSON.stringify({}),
      { title: '标题', content: 'x', mediaUrls: ['cover'] },
    );
    assert.equal(res.success, false);
    assert.match(String(res.error), /凭证/);
  });

  it('缺文章标题时返回错误', async () => {
    installFetchByUrl({ '/cgi-bin/token': resp({ access_token: 'TOK', expires_in: 7200 }) });
    const adapter = makeAdapter();
    const res = await adapter.publishContent(
      JSON.stringify({ appId: 'wx01', appSecret: 'secret' }),
      { title: '', content: 'x', mediaUrls: ['cover'] },
    );
    assert.equal(res.success, false);
    assert.match(String(res.error), /标题/);
  });

  it('缺封面 media_id 时返回错误', async () => {
    installFetchByUrl({ '/cgi-bin/token': resp({ access_token: 'TOK', expires_in: 7200 }) });
    const adapter = makeAdapter();
    const res = await adapter.publishContent(
      JSON.stringify({ appId: 'wx01', appSecret: 'secret' }),
      { title: '标题', content: 'x', mediaUrls: [] },
    );
    assert.equal(res.success, false);
    assert.match(String(res.error), /封面/);
  });

  it('建草稿失败（errcode!=0）时返回错误', async () => {
    installFetchByUrl({
      '/cgi-bin/token': resp({ access_token: 'TOK', expires_in: 7200 }),
      '/cgi-bin/draft/add': resp({ errcode: 40001, errmsg: 'invalid credential' }),
    });
    const adapter = makeAdapter();
    const res = await adapter.publishContent(
      JSON.stringify({ appId: 'wx01', appSecret: 'secret' }),
      { title: '标题', content: 'x', mediaUrls: ['cover'] },
    );
    assert.equal(res.success, false);
    assert.match(String(res.error), /建草稿失败/);
  });

  it('access_token 获取失败时返回错误', async () => {
    installFetchByUrl({ '/cgi-bin/token': resp({ errcode: 40013, errmsg: 'invalid appid' }) });
    const adapter = makeAdapter();
    const res = await adapter.publishContent(
      JSON.stringify({ appId: 'wx01', appSecret: 'secret' }),
      { title: '标题', content: 'x', mediaUrls: ['cover'] },
    );
    assert.equal(res.success, false);
    assert.match(String(res.error), /access_token/);
  });

  // ———— F4：封面外链 → 永久素材（material/add_material）————

  it('外链封面：先上传永久素材换 thumb_media_id，再建草稿发布', async () => {
    const rec = installRecordingFetch({
      '/cgi-bin/token': resp({ access_token: 'TOK', expires_in: 7200 }),
      'cdn.example.com': binaryResp([137, 80, 78, 71], 'image/png'),
      '/cgi-bin/material/add_material': resp({ media_id: 'THUMB_9', errcode: 0 }),
      '/cgi-bin/draft/add': resp({ media_id: 'MEDIA_9', errcode: 0 }),
      '/cgi-bin/freepublish/submit': resp({ publish_id: 555, errcode: 0 }),
    });
    const adapter = makeAdapter();
    const res = await adapter.publishContent(
      JSON.stringify({ appId: 'wx01', appSecret: 'secret', author: '作者' }),
      { title: '标题', content: '<p>正文</p>', mediaUrls: ['https://cdn.example.com/cover.png'] },
    );
    assert.equal(res.success, true);
    assert.match(String(res.externalId), /555/);

    // 上传必须先于建草稿，且带 type=image
    const uploadIdx = rec.find('material/add_material');
    const draftIdx = rec.find('draft/add');
    assert.ok(uploadIdx >= 0, '应调用 material/add_material');
    assert.ok(draftIdx > uploadIdx, '上传素材应在建草稿之前');
    assert.match(rec.calls[uploadIdx], /type=image/);

    // 草稿里带的是上传换来的 thumb_media_id，而不是外链
    const draftBody = rec.bodyOf('draft/add');
    assert.equal(draftBody?.articles?.[0]?.thumb_media_id, 'THUMB_9');
  });

  it('外链封面：素材上传失败时不建草稿，直接返回失败', async () => {
    const rec = installRecordingFetch({
      '/cgi-bin/token': resp({ access_token: 'TOK', expires_in: 7200 }),
      'cdn.example.com': binaryResp([1, 2, 3], 'image/jpeg'),
      '/cgi-bin/material/add_material': resp({ errcode: 40007, errmsg: 'invalid media' }),
      '/cgi-bin/draft/add': resp({ media_id: 'MEDIA_9', errcode: 0 }),
    });
    const adapter = makeAdapter();
    const res = await adapter.publishContent(
      JSON.stringify({ appId: 'wx01', appSecret: 'secret' }),
      { title: '标题', content: 'x', mediaUrls: ['https://cdn.example.com/cover.jpg'] },
    );
    assert.equal(res.success, false);
    assert.match(String(res.error), /上传封面素材失败/);
    assert.equal(rec.find('draft/add'), -1, '上传失败后不应再建草稿');
  });

  it('外链封面：图片下载失败时返回失败', async () => {
    const rec = installRecordingFetch({
      '/cgi-bin/token': resp({ access_token: 'TOK', expires_in: 7200 }),
      'cdn.example.com': { ok: false, status: 404, json: async () => ({}) },
    });
    const adapter = makeAdapter();
    const res = await adapter.publishContent(
      JSON.stringify({ appId: 'wx01', appSecret: 'secret' }),
      { title: '标题', content: 'x', mediaUrls: ['https://cdn.example.com/missing.jpg'] },
    );
    assert.equal(res.success, false);
    assert.match(String(res.error), /封面图下载失败/);
    assert.equal(rec.find('material/add_material'), -1, '下载失败后不应上传素材');
  });

  it('封面已是 media_id 时直达，不触发素材上传', async () => {
    const rec = installRecordingFetch({
      '/cgi-bin/token': resp({ access_token: 'TOK', expires_in: 7200 }),
      '/cgi-bin/draft/add': resp({ media_id: 'MEDIA_1', errcode: 0 }),
      '/cgi-bin/freepublish/submit': resp({ publish_id: 42, errcode: 0 }),
    });
    const adapter = makeAdapter();
    const res = await adapter.publishContent(
      JSON.stringify({ appId: 'wx01', appSecret: 'secret' }),
      { title: '标题', content: 'x', mediaUrls: ['PERM_MEDIA_ID'] },
    );
    assert.equal(res.success, true);
    assert.equal(rec.find('material/add_material'), -1, 'media_id 不应触发上传');
    assert.equal(rec.bodyOf('draft/add')?.articles?.[0]?.thumb_media_id, 'PERM_MEDIA_ID');
  });
});
