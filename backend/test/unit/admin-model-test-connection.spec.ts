/** 测试连接 URL 构造 / config 透传 / generationParams 合并（修复 DashScope 原生端点被强制拼 /v1）
 * 运行: node -r ts-node/register --test test/unit/admin-model-test-connection.spec.ts
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from 'class-validator';
import { AdminModelService } from '../../src/modules/admin-model/admin-model.service';
import { TestProviderDto } from '../../src/modules/admin-model/dto/test-provider.dto';
import { mergeGenerationAdapter } from '../../src/modules/media-generation/generation-client.service';

function buildAdminService() {
  const modelRepo: any = {
    findOne: async () => null,
    save: async (e: any) => e,
    count: async () => 0,
  };
  const providerRepo: any = { findOne: async () => null, save: async (e: any) => e };
  const encryption: any = { decryptAes: (s: string) => s };
  const generationClient: any = {
    submitVideo: async () => ({ taskId: 't1' }),
    generateImage: async () => ({ url: 'https://x/1.png' }),
  };
  const svc = new AdminModelService(modelRepo, providerRepo, encryption, generationClient);
  return { svc, modelRepo, providerRepo, generationClient };
}

describe('buildApiUrl 不再强制 /v1（修复 DashScope 原生端点被拼成畸形 URL）', () => {
  it('裸域名自动补 /v1（OpenAI 兼容）', () => {
    const { svc } = buildAdminService();
    assert.equal(
      (svc as any).buildApiUrl('https://api.openai.com', '/chat/completions'),
      'https://api.openai.com/v1/chat/completions',
    );
  });
  it('/v1 结尾端点原样保留', () => {
    const { svc } = buildAdminService();
    assert.equal(
      (svc as any).buildApiUrl('https://api.openai.com/v1', '/chat/completions'),
      'https://api.openai.com/v1/chat/completions',
    );
    assert.equal(
      (svc as any).buildApiUrl('https://dashscope.aliyuncs.com/compatible-mode/v1', '/chat/completions'),
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    );
  });
  it('DashScope 原生服务端点不被插入 /v1', () => {
    const { svc } = buildAdminService();
    const url = (svc as any).buildApiUrl(
      'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis',
      '/chat/completions',
    );
    assert.ok(!url.includes('video-synthesis/v1/chat'), url);
    assert.equal(
      url,
      'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis/chat/completions',
    );
  });
  it('DashScope compatible-mode 完整端点原样保留（chat/models）', () => {
    const { svc } = buildAdminService();
    assert.equal(
      (svc as any).buildApiUrl('https://dashscope.aliyuncs.com/compatible-mode/v1', '/chat/completions'),
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    );
    assert.equal(
      (svc as any).buildApiUrl('https://dashscope.aliyuncs.com/compatible-mode/v1', '/models'),
      'https://dashscope.aliyuncs.com/compatible-mode/v1/models',
    );
    assert.equal(
      (svc as any).buildApiUrl('https://dashscope.aliyuncs.com/compatible-mode/v1', '/embeddings'),
      'https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings',
    );
  });

  it('裸域名 + 路径已含版本段（DashScope compatible-mode）不再补 /v1', () => {
    const { svc } = buildAdminService();
    assert.equal(
      (svc as any).buildApiUrl('https://dashscope.aliyuncs.com', '/compatible-mode/v1/models'),
      'https://dashscope.aliyuncs.com/compatible-mode/v1/models',
    );
    assert.equal(
      (svc as any).buildApiUrl('https://dashscope.aliyuncs.com', '/compatible-mode/v1/chat/completions'),
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    );
  });

  it('绝对路径直接使用', () => {
    const { svc } = buildAdminService();
    assert.equal(
      (svc as any).buildApiUrl('https://host', 'https://cdn.example.com/v1/chat/completions'),
      'https://cdn.example.com/v1/chat/completions',
    );
  });
});

describe('testProvider 供应商连接测试（config 透传 + 兜底）', () => {
  it('保存供应商 config.chatPath 传递给 callModelApi', async () => {
    const { svc, providerRepo } = buildAdminService();
    providerRepo.findOne = async () => ({
      id: 1,
      baseUrl: 'https://dashscope.aliyuncs.com',
      apiKey: 'enc',
      config: { chatPath: '/compatible-mode/v1/chat/completions' },
    });
    (svc as any).encryption.decryptAes = () => 'sk-xxx';
    let captured: any = null;
    (svc as any).callModelApi = async (endpoint: string, _key: string, _m: string, _i: string, config: any) => {
      captured = { endpoint, config };
      return 'pong';
    };
    const r = await svc.testProvider({ providerId: 1 });
    assert.equal(r.success, true);
    assert.equal(captured.endpoint, 'https://dashscope.aliyuncs.com');
    assert.equal(captured.config.chatPath, '/compatible-mode/v1/chat/completions');
  });
  it('chat 探测遇 No static resource（无 chat 能力）时回退模型列表验证', async () => {
    const { svc, providerRepo } = buildAdminService();
    providerRepo.findOne = async () => ({
      id: 1,
      baseUrl: 'https://dashscope.aliyuncs.com',
      apiKey: 'enc',
      config: { modelsPath: '/compatible-mode/v1/models' },
    });
    (svc as any).encryption.decryptAes = () => 'sk-xxx';
    (svc as any).callModelApi = async () => {
      throw new Error(
        'HTTP 400 (https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions): {"code":"InvalidParameter","message":"No static resource api/v1/chat/completions."}',
      );
    };
    let listConfig: any = null;
    (svc as any).fetchModelList = async (_e: string, _k: string, config: any) => {
      listConfig = config;
      return { data: [{ id: 'qwen-plus' }] };
    };
    const r = await svc.testProvider({ providerId: 1 });
    assert.equal(r.success, true);
    assert.ok(String(r.response).includes('模型列表验证'));
    assert.equal(listConfig.modelsPath, '/compatible-mode/v1/models');
  });
  it('非回退类错误（HTTP 500）直接抛出连接失败', async () => {
    const { svc, providerRepo } = buildAdminService();
    providerRepo.findOne = async () => ({
      id: 1,
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'enc',
      config: null,
    });
    (svc as any).encryption.decryptAes = () => 'sk-xxx';
    (svc as any).callModelApi = async () => {
      throw new Error('HTTP 500 (url): boom');
    };
    await assert.rejects(
      () => svc.testProvider({ providerId: 1 }),
      (e: any) => e && /连接失败/.test(String(e.message ?? e)),
    );
  });
  it('未保存供应商支持 config 传入', async () => {
    const { svc } = buildAdminService();
    let captured: any = null;
    (svc as any).callModelApi = async (...args: any[]) => {
      captured = args;
      return 'ok';
    };
    const r = await svc.testProvider({
      baseUrl: 'https://dashscope.aliyuncs.com',
      apiKey: 'sk-xxx',
      config: { chatPath: '/compatible-mode/v1/chat/completions' },
    } as any);
    assert.equal(r.success, true);
    assert.equal(captured[4].chatPath, '/compatible-mode/v1/chat/completions');
  });
  it('TestProviderDto 接受可选 config 字段', async () => {
    const dto = Object.assign(new TestProviderDto(), { providerId: 1, config: { chatPath: '/x' } });
    const errs = await validate(dto);
    assert.equal(errs.length, 0);
  });
});

describe('模型级 test() 合并 generationParams 适配器', () => {
  it('video 模式合并 video_submit_path 与新适配键', async () => {
    const { svc, modelRepo, providerRepo, generationClient } = buildAdminService();
    modelRepo.findOne = async () => ({
      id: 1,
      providerId: 1,
      callMode: 'video',
      modelType: 'video',
      modelId: 'v',
      upstreamModelId: 'qwen-video-plus',
      generationParams: {
        video_submit_path: '/api/v1/services/aigc/video-generation/video-synthesis',
        request_template: { model: '{upstreamModelId}', input: { prompt: '{prompt}' } },
        extra_headers: { 'X-DashScope-Async': 'enable' },
        success_values: ['SUCCEEDED'],
        task_id_path: 'output.task_id',
      },
      isActive: true,
    });
    providerRepo.findOne = async () => ({
      id: 1,
      apiKey: 'enc',
      baseUrl: 'https://dashscope.aliyuncs.com',
      config: { generation: { taskIdPath: 'data.task_id' } },
    });
    (svc as any).encryption.decryptAes = () => 'sk-xxx';
    let cfg: any = null;
    generationClient.submitVideo = async (c: any) => {
      cfg = c;
      return { taskId: 't1' };
    };
    const r = await svc.test(1, { input: '一只猫' });
    assert.equal(r.success, true);
    assert.equal(cfg.adapter.videosPath, '/api/v1/services/aigc/video-generation/video-synthesis');
    assert.equal(cfg.adapter.taskIdPath, 'output.task_id');
    assert.deepEqual(cfg.adapter.extraHeaders, { 'X-DashScope-Async': 'enable' });
    assert.deepEqual(cfg.adapter.requestTemplate.input, { prompt: '{prompt}' });
    assert.deepEqual(cfg.adapter.successValues, ['SUCCEEDED']);
  });
  it('image 模式有适配配置时走 generateImage（适配 images_path）', async () => {
    const { svc, modelRepo, providerRepo, generationClient } = buildAdminService();
    modelRepo.findOne = async () => ({
      id: 1,
      providerId: 1,
      callMode: 'image',
      modelType: 'image',
      modelId: 'img',
      upstreamModelId: 'wanx',
      generationParams: { images_path: '/api/v1/services/aigc/text2image/image-synthesis' },
      isActive: true,
    });
    providerRepo.findOne = async () => ({
      id: 1,
      apiKey: 'enc',
      baseUrl: 'https://dashscope.aliyuncs.com',
      config: null,
    });
    (svc as any).encryption.decryptAes = () => 'sk-xxx';
    let cfg: any = null;
    generationClient.generateImage = async (c: any) => {
      cfg = c;
      return { url: 'https://x/1.png' };
    };
    const r = await svc.test(1, { input: '一只猫' });
    assert.equal(r.success, true);
    assert.equal(cfg.adapter.imagesPath, '/api/v1/services/aigc/text2image/image-synthesis');
    assert.equal(cfg.endpoint, 'https://dashscope.aliyuncs.com');
  });
  it('text_chat 非视频路径不再被插入畸形 /v1', async () => {
    const { svc, modelRepo, providerRepo } = buildAdminService();
    modelRepo.findOne = async () => ({
      id: 1,
      providerId: 1,
      callMode: 'text_chat',
      modelType: 'chat',
      modelId: 'm',
      upstreamModelId: 'qwen-plus',
      isActive: true,
    });
    providerRepo.findOne = async () => ({
      id: 1,
      apiKey: 'enc',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      config: null,
    });
    (svc as any).encryption.decryptAes = () => 'sk-xxx';
    let calledUrl = '';
    (svc as any).callUpstreamRaw = async (url: string) => {
      calledUrl = url;
      return { choices: [{ message: { content: 'hi' } }] };
    };
    const r = await svc.test(1, { input: 'hello' });
    assert.equal(r.success, true);
    assert.equal(calledUrl, 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions');
  });
});

describe('mergeGenerationAdapter 共享合并函数', () => {
  it('模型级 snake_case 键覆盖供应商级适配', () => {
    const merged = mergeGenerationAdapter(
      { taskIdPath: 'data.task_id', statusPath: 'data.task_status' },
      {
        video_submit_path: '/submit',
        success_values: ['SUCCEEDED'],
        poll_interval: 3000,
        images_style: 'multipart',
        image_fields: ['image'],
        extra_headers: { 'X-DashScope-Async': 'enable' },
        timeout_ms: 90000,
      },
    );
    assert.equal(merged.videosPath, '/submit');
    assert.equal(merged.taskIdPath, 'data.task_id');
    assert.deepEqual(merged.successValues, ['SUCCEEDED']);
    assert.equal(merged.pollInterval, 3000);
    assert.equal(merged.imagesStyle, 'multipart');
    assert.deepEqual(merged.imageFields, ['image']);
    assert.deepEqual(merged.extraHeaders, { 'X-DashScope-Async': 'enable' });
    assert.equal(merged.timeoutMs, 90000);
  });
});
