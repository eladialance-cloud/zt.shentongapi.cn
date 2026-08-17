/** llm-proxy 多模态网关单元测试（分类路由 / 模型解析 / 按次预扣）
 * 运行: node -r ts-node/register --test test/unit/llm-proxy-gateway.spec.ts
 */
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestException } from '@nestjs/common';
import { LlmProxyService } from '../../src/modules/chat/services/llm-proxy.service';
import { LlmProxyController } from '../../src/modules/chat/controllers/llm-proxy.controller';

function buildService() {
  const modelRepo: any = {
    find: async () => [],
    findOne: async () => null,
  };
  const llmFileRepo: any = {
    findOne: async () => null,
    save: async (e: any) => e,
    create: (e: any) => e,
  };
  const svc = new LlmProxyService(
    {} as any,
    modelRepo,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    { getUserLevel: async () => 0, applyDiscount: (p: number) => p } as any,
    {
      freezeCredits: async () => ({ id: 777 }),
      settleCredits: async () => undefined,
      refundCredits: async () => undefined,
    } as any,
    {} as any,
    { generateImage: async () => ({ url: 'https://img.example.com/a.png' }) } as any,
    llmFileRepo,
  );
  return { svc, modelRepo, llmFileRepo };
}

describe('LlmProxyService.typeMatches 分类匹配', () => {
  it('image 匹配 image 与 image_edit', () => {
    const { svc } = buildService();
    assert.equal((svc as any).typeMatches('image', 'image'), true);
    assert.equal((svc as any).typeMatches('image_edit', 'image'), true);
    assert.equal((svc as any).typeMatches('video', 'image'), false);
  });
  it('video / tts 严格匹配', () => {
    const { svc } = buildService();
    assert.equal((svc as any).typeMatches('video', 'video'), true);
    assert.equal((svc as any).typeMatches('tts', 'tts'), true);
    assert.equal((svc as any).typeMatches('chat', 'tts'), false);
  });
});

describe('LlmProxyService.resolveMediaModel 模型解析', () => {
  it('显式 custom/<id> 命中启用模型', async () => {
    const { svc, modelRepo } = buildService();
    modelRepo.findOne = async () => ({ modelId: 'tts-1', modelType: 'tts', isActive: true });
    const m = await (svc as any).resolveMediaModel('tts', 'custom/tts-1');
    assert.equal(m.modelId, 'tts-1');
  });
  it('显式 image/<id> 前缀同样命中', async () => {
    const { svc, modelRepo } = buildService();
    modelRepo.findOne = async () => ({ modelId: 'img-1', modelType: 'image', isActive: true });
    const m = await (svc as any).resolveMediaModel('image', 'image/img-1');
    assert.equal(m.modelId, 'img-1');
  });
  it('未指定时取该类型 sortOrder 最小模型', async () => {
    const { svc, modelRepo } = buildService();
    modelRepo.find = async () => [
      { modelId: 'a', modelType: 'chat', sortOrder: 0 },
      { modelId: 'c', modelType: 'image_edit', sortOrder: 1 },
      { modelId: 'b', modelType: 'image', sortOrder: 5 },
    ];
    const m = await (svc as any).resolveMediaModel('image');
    assert.equal(m.modelId, 'c');
  });
  it('显式指定但类型不匹配报错', async () => {
    const { svc, modelRepo } = buildService();
    modelRepo.findOne = async () => ({ modelId: 'x', modelType: 'chat', isActive: true });
    await assert.rejects(
      (svc as any).resolveMediaModel('tts', 'x'),
      (e: any) => e instanceof BadRequestException,
    );
  });
  it('该类型无可用模型报错', async () => {
    const { svc } = buildService();
    await assert.rejects(
      (svc as any).resolveMediaModel('video'),
      (e: any) => e instanceof BadRequestException,
    );
  });
});

describe('LlmProxyService.freezePerCall 按次预扣', () => {
  it('0 价为免费，不冻结', async () => {
    const { svc } = buildService();
    let freezeCalled = false;
    (svc as any).creditsService.freezeCredits = async () => { freezeCalled = true; return { id: 1 }; };
    const r = await (svc as any).freezePerCall(1, 0, 'src');
    assert.equal(r.price, 0);
    assert.equal(r.frozenTxnId, null);
    assert.equal(freezeCalled, false);
  });
  it('正价按会员折扣后冻结', async () => {
    const { svc } = buildService();
    (svc as any).pricingService = {
      getUserLevel: async () => 1,
      applyDiscount: (p: number) => Math.round(p * 0.9),
    };
    const r = await (svc as any).freezePerCall(1, 10, 'src');
    assert.equal(r.price, 9);
    assert.equal(r.frozenTxnId, 777);
  });
});

describe('LlmProxyService.embeddings / rerank 端点', () => {
  it('embeddings 解析 embedding 模型并直连上游', async () => {
    const { svc, modelRepo } = buildService();
    const captured: any = {};
    modelRepo.findOne = async () => ({ modelId: 'emb-1', modelType: 'embedding', callMode: 'embedding', isActive: true });
    (svc as any).resolveUpstreamTarget = async () => ({ endpoint: 'https://api.example.com/v1', upstreamModelId: 'emb-1', apiKey: 'k', providerSlug: 't' });
    (svc as any).callUpstreamJson = async (url: string, key: string, body: unknown) => { captured.url = url; captured.body = body; return { data: [[0.1, 0.2]] }; };
    const out = await svc.embeddings('sk-shentong-test', { model: 'emb-1', input: ['hi'] });
    assert.deepEqual(out.data, [[0.1, 0.2]]);
    assert.ok(captured.url.includes('/embeddings'));
    assert.equal(captured.body.model, 'emb-1');
  });
  it('rerank 解析 rerank 模型并直连上游', async () => {
    const { svc, modelRepo } = buildService();
    const captured: any = {};
    modelRepo.findOne = async () => ({ modelId: 'rr-1', modelType: 'rerank', callMode: 'rerank', isActive: true });
    (svc as any).resolveUpstreamTarget = async () => ({ endpoint: 'https://api.example.com/v1', upstreamModelId: 'rr-1', apiKey: 'k', providerSlug: 't' });
    (svc as any).callUpstreamJson = async (url: string, key: string, body: unknown) => { captured.body = body; return { results: [{ index: 1, score: 0.9 }] }; };
    const out = await svc.rerank('sk-shentong-test', { model: 'rr-1', query: 'q', documents: ['a', 'b'] });
    assert.equal(out.results[0].index, 1);
    assert.equal(captured.body.query, 'q');
  });
});

describe('LlmProxyService 专用端点（ocr/stt/voice-conversion/music）', () => {
  it('ocr 转发到专用路径并返回文本', async () => {
    const { svc } = buildService();
    const captured: any = {};
    (svc as any).callUpstreamJson = async (url: string, key: string, body: unknown) => { captured.url = url; captured.body = body; return { text: '提取结果' }; };
    const out = await svc.ocr('sk-shentong-test', { model: 'ocr-1', imageUrl: 'https://x.com/a.png' });
    assert.equal(out.text, '提取结果');
    assert.ok(captured.url.includes('/ocr'));
    assert.equal(captured.body.imageUrl, 'https://x.com/a.png');
  });
  it('stt 转发到 transcriptions 路径', async () => {
    const { svc } = buildService();
    const captured: any = {};
    (svc as any).callUpstreamJson = async (url: string, key: string, body: unknown) => { captured.url = url; captured.body = body; return { text: '识别文本' }; };
    const out = await svc.stt('sk-shentong-test', { model: 'asr-1', audioUrl: 'https://x.com/a.mp3', language: 'zh' });
    assert.equal(out.text, '识别文本');
    assert.ok(captured.url.includes('/audio/transcriptions'));
    assert.equal(captured.body.audioUrl, 'https://x.com/a.mp3');
    assert.equal(captured.body.language, 'zh');
  });
  it('voiceConversion 转发到 voice-conversion 路径', async () => {
    const { svc } = buildService();
    const captured: any = {};
    (svc as any).callUpstreamJson = async (url: string, key: string, body: unknown) => { captured.url = url; captured.body = body; return { url: 'https://x.com/out.wav' }; };
    const out = await svc.voiceConversion('sk-shentong-test', { model: 'vc-1', audioUrl: 'https://x.com/in.wav', referenceUrl: 'https://x.com/ref.wav' });
    assert.equal(out.url, 'https://x.com/out.wav');
    assert.ok(captured.url.includes('/audio/voice-conversion'));
    assert.equal(captured.body.audioUrl, 'https://x.com/in.wav');
    assert.equal(captured.body.referenceUrl, 'https://x.com/ref.wav');
  });
  it('musicGeneration 转发到 music/generations 路径', async () => {
    const { svc } = buildService();
    const captured: any = {};
    (svc as any).callUpstreamJson = async (url: string, key: string, body: unknown) => { captured.url = url; captured.body = body; return { url: 'https://x.com/music.mp3' }; };
    const out = await svc.musicGeneration('sk-shentong-test', { model: 'music-1', prompt: 'lofi piano', duration: 30 });
    assert.equal(out.url, 'https://x.com/music.mp3');
    assert.ok(captured.url.includes('/music/generations'));
    assert.equal(captured.body.prompt, 'lofi piano');
    assert.equal(captured.body.duration, 30);
  });
});

describe('LlmProxyService.uploadLlmFile 两步式文件上传', () => {
  const originalFetch = globalThis.fetch;

  after(() => {
    (globalThis as any).fetch = originalFetch;
  });

  function stubFetch(handler: (url: string, opts: any) => any) {
    (globalThis as any).fetch = async (url: string, opts: any) => handler(url, opts);
  }

  const dummyFile = () => ({
    buffer: Buffer.from('hello'), originalname: 'a.pdf',
    size: 5, mimetype: 'application/pdf',
  }) as Express.Multer.File;

  it('按模型 submit_path 代理上传并落映射表，返回上游 file_id', async () => {
    const { svc, modelRepo, llmFileRepo } = buildService();
    modelRepo.findOne = async () => ({
      modelId: 'qwen-long', modelType: 'chat', callMode: 'text_chat', isActive: true,
      generationParams: { file_id_required: true, submit_path: '/compatible-mode/v1/file-uploads', file_id_path: 'file_id' },
    });
    (svc as any).resolveModelId = async () => 'qwen-long';
    (svc as any).resolveUpstreamTarget = async () => ({ endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1', upstreamModelId: 'qwen-long', apiKey: 'k', providerSlug: 'qwen' });
    const saved: any[] = [];
    llmFileRepo.save = async (e: any) => { saved.push(e); return e; };
    llmFileRepo.create = (e: any) => e;
    let capturedUrl = '';
    stubFetch((url: string, opts: any) => {
      capturedUrl = url;
      assert.ok(opts.body instanceof FormData, '请求体应为 multipart FormData');
      assert.equal(opts.headers.Authorization, 'Bearer k');
      assert.ok(!opts.headers['Content-Type'], 'multipart 不应手动设置 Content-Type');
      return { ok: true, status: 200, text: async () => JSON.stringify({ file_id: 'file-fe-abc', name: 'a.pdf' }), json: async () => ({ file_id: 'file-fe-abc' }), headers: new Headers() };
    });
    const out = await (svc as any).uploadLlmFile(1, 'qwen-long', dummyFile());
    assert.equal(out.id, 'file-fe-abc');
    assert.equal(out.object, 'file');
    assert.equal(capturedUrl, 'https://dashscope.aliyuncs.com/compatible-mode/v1/file-uploads');
    assert.equal(saved[0].userId, 1);
    assert.equal(saved[0].upstreamFileId, 'file-fe-abc');
  });

  it('模型未配置 submit_path 时明确报错', async () => {
    const { svc, modelRepo } = buildService();
    modelRepo.findOne = async () => ({ modelId: 'qwen-plus', generationParams: {}, isActive: true });
    (svc as any).resolveModelId = async () => 'qwen-plus';
    await assert.rejects(
      (svc as any).uploadLlmFile(1, 'qwen-plus', dummyFile()),
      (e: any) => e instanceof BadRequestException && /submit_path/.test(e.message),
    );
  });

  it('上游未返回 file_id 时报错', async () => {
    const { svc, modelRepo } = buildService();
    modelRepo.findOne = async () => ({ modelId: 'qwen-long', generationParams: { submit_path: '/file-uploads' }, isActive: true });
    (svc as any).resolveModelId = async () => 'qwen-long';
    (svc as any).resolveUpstreamTarget = async () => ({ endpoint: 'https://x.com', upstreamModelId: 'qwen-long', apiKey: 'k', providerSlug: 'qwen' });
    stubFetch(() => ({ ok: true, status: 200, text: async () => '{"name":"a.pdf"}', json: async () => ({ name: 'a.pdf' }), headers: new Headers() }));
    await assert.rejects(
      (svc as any).uploadLlmFile(1, 'qwen-long', dummyFile()),
      (e: any) => e instanceof BadRequestException && /文件 ID/.test(e.message),
    );
  });
});

describe('LlmProxyController.uploadFile 路由', () => {
  it('解析 Bearer token 并转发到 service', async () => {
    const svc = {
      uploadLlmFileByToken: async (token: string, model: string | undefined, file: Express.Multer.File) => {
        assert.equal(token, 'sk-shentong-valid');
        assert.equal(model, 'qwen-long');
        assert.equal(file.size, 5);
        return { id: 'file-fe-1', object: 'file' as const, bytes: 5, filename: 'a.pdf', created_at: 1 };
      },
    };
    const ctrl = new LlmProxyController(svc as any);
    const out = await ctrl.uploadFile(
      'Bearer sk-shentong-valid',
      'qwen-long',
      { buffer: Buffer.from('x'), originalname: 'a.pdf', size: 5, mimetype: 'application/pdf' } as any,
    );
    assert.equal(out.id, 'file-fe-1');
  });

  it('缺少 Authorization 报错', async () => {
    const ctrl = new LlmProxyController({ uploadLlmFileByToken: async () => ({}) } as any);
    await assert.rejects(
      (ctrl as any).uploadFile(undefined, 'qwen-long', {} as any),
      (e: any) => e instanceof BadRequestException,
    );
  });
});
describe('LlmProxyService.chatCompletions 专用参数注入', () => {
  function buildChatService() {
    const modelRepo: any = {
      findOne: async () => null,
      find: async () => [],
    };
    const llmFileRepo: any = {
      findOne: async () => null,
      save: async (e: any) => e,
      create: (e: any) => e,
    };
    const llmClient: any = {
      streamChat: async () => ({ fullResponse: '', usage: { input: 0, output: 0, total: 0 } }),
    };
    const svc = new LlmProxyService(
      {
        findOne: async () => ({ id: 1, status: 'active', llmProxyKey: 'sk-shentong-test', defaultChatModel: null }),
      } as any,
      modelRepo,
      {} as any,
      {} as any,
      {} as any,
      llmClient,
      { getUserLevel: async () => 0, applyDiscount: (p: number) => p } as any,
      {
        freezeCredits: async () => ({ id: 777 }),
        settleCredits: async () => undefined,
        refundCredits: async () => undefined,
      } as any,
      {} as any,
      { generateImage: async () => ({ url: 'https://img.example.com/a.png' }) } as any,
      llmFileRepo,
    );
    return { svc, modelRepo, llmFileRepo, llmClient };
  }

  it('files 校验归属后按 chat_files_field 注入，chat_body_extra 合并', async () => {
    const { svc, modelRepo, llmFileRepo, llmClient } = buildChatService();
    modelRepo.findOne = async ({ where }: any) => {
      if (where.modelId === 'qwen-long') {
        return {
          modelId: 'qwen-long', modelType: 'chat', isActive: true, supportsVision: false,
          generationParams: { file_id_required: true, chat_files_field: 'files', chat_body_extra: { target_lang: 'zh' } },
        };
      }
      if (where.id === 1) return { id: 1, status: 'active', llmProxyKey: 'sk-shentong-test' };
      return null;
    };
    (svc as any).resolveModelId = async () => 'qwen-long';
    (svc as any).resolveUpstreamTarget = async () => ({ endpoint: 'https://x.com', upstreamModelId: 'qwen-long', apiKey: 'k', providerSlug: 'qwen' });
    (svc as any).pricingService.calculateModelCost = async () => 5;
    llmFileRepo.findOne = async ({ where }: any) =>
      where.upstreamFileId === 'file-fe-1' && where.userId === 1
        ? { userId: 1, modelId: 'qwen-long', upstreamFileId: 'file-fe-1' }
        : null;
    const captured: any = {};
    llmClient.streamChat = async (opts: any, callbacks: any) => {
      captured.extraBody = opts.extraBody;
      callbacks.onDone?.({ input: 1, output: 1, total: 2 }, {});
      return { fullResponse: 'ok', usage: { input: 1, output: 1, total: 2 } };
    };
    const result = await svc.chatCompletions('sk-shentong-test', {
      model: 'qwen-long',
      messages: [{ role: 'user', content: 'hi' }],
      files: ['file-fe-1'],
    });
    for await (const chunk of result.iterator) { assert.ok(typeof chunk === 'string'); }
    assert.deepEqual(captured.extraBody.files, ['file-fe-1']);
    assert.equal(captured.extraBody.target_lang, 'zh');
  });

  it('他人文件 ID 报错', async () => {
    const { svc, modelRepo, llmFileRepo } = buildChatService();
    modelRepo.findOne = async ({ where }: any) => {
      if (where.modelId === 'qwen-long') {
        return { modelId: 'qwen-long', modelType: 'chat', isActive: true, supportsVision: false, generationParams: {} };
      }
      if (where.id === 1) return { id: 1, status: 'active', llmProxyKey: 'sk-shentong-test' };
      return null;
    };
    (svc as any).resolveModelId = async () => 'qwen-long';
    llmFileRepo.findOne = async () => null;
    await assert.rejects(
      svc.chatCompletions('sk-shentong-test', {
        model: 'qwen-long',
        messages: [{ role: 'user', content: 'hi' }],
        files: ['file-fe-9'],
      }),
      (e: any) => e instanceof BadRequestException && /不属于当前用户|不存在/.test(e.message),
    );
  });

  it('file_id_required 且未带 files 时报错', async () => {
    const { svc, modelRepo } = buildChatService();
    modelRepo.findOne = async ({ where }: any) => {
      if (where.modelId === 'qwen-long') {
        return { modelId: 'qwen-long', modelType: 'chat', isActive: true, supportsVision: false, generationParams: { file_id_required: true } };
      }
      if (where.id === 1) return { id: 1, status: 'active', llmProxyKey: 'sk-shentong-test' };
      return null;
    };
    (svc as any).resolveModelId = async () => 'qwen-long';
    await assert.rejects(
      svc.chatCompletions('sk-shentong-test', {
        model: 'qwen-long',
        messages: [{ role: 'user', content: 'hi' }],
      }),
      (e: any) => e instanceof BadRequestException && /该模型要求先上传文件/.test(e.message),
    );
  });

  it('file_id_required 且带 files 正常放行', async () => {
    const { svc, modelRepo, llmFileRepo, llmClient } = buildChatService();
    modelRepo.findOne = async ({ where }: any) => {
      if (where.modelId === 'qwen-long') {
        return { modelId: 'qwen-long', modelType: 'chat', isActive: true, supportsVision: false, generationParams: { file_id_required: true, chat_files_field: 'files' } };
      }
      if (where.id === 1) return { id: 1, status: 'active', llmProxyKey: 'sk-shentong-test' };
      return null;
    };
    (svc as any).resolveModelId = async () => 'qwen-long';
    (svc as any).resolveUpstreamTarget = async () => ({ endpoint: 'https://x.com', upstreamModelId: 'qwen-long', apiKey: 'k', providerSlug: 'qwen' });
    (svc as any).pricingService.calculateModelCost = async () => 5;
    llmFileRepo.findOne = async ({ where }: any) =>
      where.upstreamFileId === 'file-fe-1' && where.userId === 1
        ? { userId: 1, modelId: 'qwen-long', upstreamFileId: 'file-fe-1' }
        : null;
    const captured: any = {};
    llmClient.streamChat = async (opts: any, callbacks: any) => {
      captured.extraBody = opts.extraBody;
      callbacks.onDone?.({ input: 1, output: 1, total: 2 }, {});
      return { fullResponse: 'ok', usage: { input: 1, output: 1, total: 2 } };
    };
    const result = await svc.chatCompletions('sk-shentong-test', {
      model: 'qwen-long',
      messages: [{ role: 'user', content: 'hi' }],
      files: ['file-fe-1'],
    });
    for await (const chunk of result.iterator) { assert.ok(typeof chunk === 'string'); }
    assert.deepEqual(captured.extraBody.files, ['file-fe-1']);
  });

  it('files 非数组（字符串）时报错', async () => {
    const { svc, modelRepo } = buildChatService();
    modelRepo.findOne = async ({ where }: any) => {
      if (where.modelId === 'qwen-long') {
        return { modelId: 'qwen-long', modelType: 'chat', isActive: true, supportsVision: false, generationParams: {} };
      }
      if (where.id === 1) return { id: 1, status: 'active', llmProxyKey: 'sk-shentong-test' };
      return null;
    };
    (svc as any).resolveModelId = async () => 'qwen-long';
    await assert.rejects(
      svc.chatCompletions('sk-shentong-test', {
        model: 'qwen-long',
        messages: [{ role: 'user', content: 'hi' }],
        files: 'file-fe-1' as any,
      }),
      (e: any) => e instanceof BadRequestException && /files 必须为数组/.test(e.message),
    );
  });
});

describe('LlmProxyService.getByPathValue 路径取值', () => {
  it('data.file_id 嵌套路径取值', () => {
    const { svc } = buildService();
    assert.equal((svc as any).getByPathValue({ data: { file_id: 'file-a' } }, 'data.file_id'), 'file-a');
    assert.equal((svc as any).getByPathValue({ data: { other: 1 } }, 'data.file_id'), undefined);
  });
  it('files[0].id 数组下标路径取值', () => {
    const { svc } = buildService();
    assert.equal((svc as any).getByPathValue({ files: [{ id: 'file-b' }, { id: 'file-c' }] }, 'files[0].id'), 'file-b');
    assert.equal((svc as any).getByPathValue({ files: [] }, 'files[0].id'), undefined);
  });
});
describe('LlmProxyService.resolveModelId 用户选择优先于 OpenClaw 内部默认', () => {
  function buildUserRepo(defaultChatModel: string | null) {
    return { findOne: async () => ({ id: 1, defaultChatModel }) };
  }
  function buildSvc(userRepo: any) {
    return new LlmProxyService(
      userRepo,
      { find: async () => [], findOne: async () => null } as any,
      {} as any, {} as any, {} as any, {} as any,
      { getUserLevel: async () => 0, applyDiscount: (p: number) => p } as any,
      {} as any, {} as any, { generateImage: async () => ({ url: 'https://img.example.com/a.png' }) } as any, {} as any,
    );
  }
  it('OpenClaw 内部别名 openai/gpt-5.5（后台存在同名启用模型）→ 优先用户默认对话模型', async () => {
    const svc = buildSvc(buildUserRepo('deepseek-chat'));
    (svc as any).modelRepository.findOne = async () => ({ modelId: 'openai/gpt-5.5', isActive: true });
    assert.equal(await (svc as any).resolveModelId('openai/gpt-5.5', 1), 'deepseek-chat');
  });
  it('OpenClaw 内部别名 openclaw/default → 用户默认对话模型', async () => {
    const svc = buildSvc(buildUserRepo('qwen-max'));
    assert.equal(await (svc as any).resolveModelId('openclaw/default', 1), 'qwen-max');
  });
  it('后台已上线模型（非内部别名）→ 原样使用（第三方客户端显式指定）', async () => {
    const svc = buildSvc(buildUserRepo('deepseek-chat'));
    (svc as any).modelRepository.findOne = async () => ({ modelId: 'qwen-max', isActive: true });
    assert.equal(await (svc as any).resolveModelId('qwen-max', 1), 'qwen-max');
  });
  it('未知模型且无默认 → 兜底 DEFAULT_LLM_MODEL / deepseek-chat', async () => {
    const svc = buildSvc(buildUserRepo(null));
    assert.equal(await (svc as any).resolveModelId('unknown-model', 1), process.env.DEFAULT_LLM_MODEL || 'deepseek-chat');
  });
});
describe('LlmProxyService.imagesGeneration 网关图片生成（适配模板路由）', () => {
  function buildImageService() {
    const genClient: any = {
      generateImage: async () => ({ url: 'https://img.example.com/a.png' }),
    };
    const svc = new LlmProxyService(
      { findOne: async () => ({ id: 1, status: 'active', llmProxyKey: 'sk-shentong-test' }) } as any,
      {
        findOne: async () => ({
          modelId: 'qwen-image-3.0',
          modelType: 'image',
          isActive: true,
          providerId: 12,
          upstreamModelId: 'qwen-image-3.0',
          pricePerImage: 10,
          generationParams: {},
        }),
      } as any,
      {
        findOne: async () => ({
          id: 12,
          baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
          apiKey: 'enc-key',
          slug: 'dashscope',
          status: 'active',
          config: { vendorKey: 'aliyun-dashscope' },
        }),
      } as any,
      {} as any,
      { decryptAes: () => 'sk-real-key' } as any,
      {} as any,
      { getUserLevel: async () => 0, applyDiscount: (p: number) => p } as any,
      {
        freezeCredits: async () => ({ id: 9 }),
        settleCredits: async () => undefined,
        refundCredits: async () => undefined,
      } as any,
      {} as any,
      genClient,
      { findOne: async () => null, save: async (e: any) => e, create: (e: any) => e } as any,
    );
    return { svc, genClient };
  }

  it('DashScope 图片模型走适配模板（endpoint=供应商 baseUrl + 解密 Key + 上游模型）并返回 OpenAI 兼容 url', async () => {
    const { svc, genClient } = buildImageService();
    const captured: any = {};
    genClient.generateImage = async (cfg: any) => {
      captured.cfg = cfg;
      return { url: 'https://img.example.com/out.png' };
    };
    const out = await svc.imagesGeneration('sk-shentong-test', {
      model: 'qwen-image-3.0',
      prompt: '一只猫',
      size: '1024x1024',
    });
    assert.equal(out.data.length, 1);
    assert.equal((out.data[0] as any).url, 'https://img.example.com/out.png');
    assert.equal(captured.cfg.endpoint, 'https://dashscope.aliyuncs.com/compatible-mode/v1');
    assert.equal(captured.cfg.apiKey, 'sk-real-key');
    assert.equal(captured.cfg.model, 'qwen-image-3.0');
    assert.equal(captured.cfg.size, '1024x1024');
    assert.ok(captured.cfg.adapter && captured.cfg.adapter.imagesPath);
  });

  it('b64 结果映射为 OpenAI 兼容 b64_json', async () => {
    const { svc, genClient } = buildImageService();
    genClient.generateImage = async () => ({ b64: 'QUJD' });
    const out = await svc.imagesGeneration('sk-shentong-test', { model: 'qwen-image-3.0', prompt: 'x' });
    assert.equal((out.data[0] as any).b64_json, 'QUJD');
  });

  it('模型无可用供应商凭据时报错（不静默 401）', async () => {
    const svc = new LlmProxyService(
      { findOne: async () => ({ id: 1, status: 'active', llmProxyKey: 'sk-shentong-test' }) } as any,
      {
        findOne: async () => ({
          modelId: 'qwen-image-3.0',
          modelType: 'image',
          isActive: true,
          providerId: null,
          pricePerImage: 10,
          generationParams: {},
        }),
      } as any,
      { findOne: async () => null } as any,
      {} as any,
      { decryptAes: () => 'k' } as any,
      {} as any,
      { getUserLevel: async () => 0, applyDiscount: (p: number) => p } as any,
      {
        freezeCredits: async () => ({ id: 9 }),
        settleCredits: async () => undefined,
        refundCredits: async () => undefined,
      } as any,
      {} as any,
      { generateImage: async () => ({ url: 'x' }) } as any,
      { findOne: async () => null, save: async (e: any) => e, create: (e: any) => e } as any,
    );
    await assert.rejects(
      svc.imagesGeneration('sk-shentong-test', { model: 'qwen-image-3.0', prompt: 'x' }),
      (e: any) => e instanceof BadRequestException,
    );
  });
});
