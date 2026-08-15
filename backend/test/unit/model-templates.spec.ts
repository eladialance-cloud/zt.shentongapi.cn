/** 模板库 seed 不变量测试
 * 运行: node -r ts-node/register --test test/unit/model-templates.spec.ts
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MODEL_TEMPLATES, PROVIDER_TEMPLATES } from '../../src/modules/admin-model/constants/model-templates';
import { CALL_MODES, SCENARIO_TAGS } from '../../src/modules/admin-model/constants/call-modes';

describe('模板库 seed', () => {
  it('key 唯一', () => {
    const keys = MODEL_TEMPLATES.map((t) => t.key);
    assert.equal(new Set(keys).size, keys.length);
  });
  it('callMode 均在字典内且 specValues 不超 specFields', () => {
    for (const t of MODEL_TEMPLATES) {
      const def = CALL_MODES.find((m) => m.key === t.callMode);
      assert.ok(def, `${t.key} callMode 非法`);
      for (const k of Object.keys(t.specValues ?? {})) {
        assert.ok(def.specFields.includes(k), `${t.key} 规格 ${k} 不在 ${t.callMode}.specFields`);
      }
    }
  });
  it('覆盖主要千问系列', () => {
    for (const key of ['qwen-plus', 'qwen-flash', 'qwen-long', 'qwen-vl-plus', 'qwen-ocr', 'qwen-image', 'wanx-sketch', 'wan2.2-t2v', 'qwen-audio-asr', 'qwen-tts', 'text-embedding-v3', 'text-rerank-v1']) {
      assert.ok(MODEL_TEMPLATES.some((t) => t.key === key), `缺少模板 ${key}`);
    }
  });
  it('recommendedScenarioTags 均属于 SCENARIO_TAGS', () => {
    const tags: Set<string> = new Set(SCENARIO_TAGS);
    for (const t of MODEL_TEMPLATES) {
      for (const tag of t.recommendedScenarioTags) {
        assert.ok(tags.has(tag), `${t.key} 场景标签非法: ${tag}`);
      }
    }
  });
});
describe('模板库 generationParams 专用配置契约', () => {
  const long = MODEL_TEMPLATES.find((t) => t.key === 'qwen-long')!;
  const mt = MODEL_TEMPLATES.find((t) => t.key === 'qwen-mt-flash')!;
  const research = MODEL_TEMPLATES.find((t) => t.key === 'qwen-deep-research')!;

  it('qwen-long 配置两步式：submit_path + file_id_required + file_id_path', () => {
    assert.equal(long.generationParams.file_id_required, true);
    assert.ok(String(long.generationParams.submit_path).includes('file-uploads'));
    assert.equal(long.generationParams.file_id_path, 'file_id');
    assert.equal(long.generationParams.chat_files_field, 'files');
  });
  it('qwen-mt-flash 配置翻译参数 chat_body_extra.target_lang', () => {
    const extra = mt.generationParams.chat_body_extra as Record<string, unknown>;
    assert.equal(extra.target_lang, 'zh');
  });
  it('qwen-deep-research 配置联网参数 chat_body_extra.enable_search', () => {
    const extra = research.generationParams.chat_body_extra as Record<string, unknown>;
    assert.equal(extra.enable_search, true);
  });
});
describe('模板库 image_edit 创意工具模板契约', () => {
  it('wanx-sketch 为 image_edit 且 generationParams 配置合法', () => {
    const t = MODEL_TEMPLATES.find((x) => x.key === 'wanx-sketch');
    assert.ok(t, '缺少 wanx-sketch 模板');
    assert.equal(t.callMode, 'image_edit');
    const gen = t.generationParams as Record<string, unknown>;
    assert.equal(gen.images_style, 'json');
    assert.ok(String(gen.images_path).includes('/api/v1/services/aigc/image2image/image-synthesis'), '线稿生图应指向原生 image2image 端点');
    assert.deepEqual((gen.image_request_template as Record<string, unknown>).input, { prompt: '{prompt}', base_image_url: '{imageUrl0}' });
    assert.ok(/^(\/|https?:\/\/)/.test(String(gen.images_path)));
  });
});

describe('模型市场预设库不变量', () => {
  const vendors = new Set(PROVIDER_TEMPLATES.map((p) => p.vendor));
  it('每个模板都有合法 vendor / 非空 upstreamModelId / boolean verified', () => {
    for (const t of MODEL_TEMPLATES) {
      assert.ok(vendors.has(t.vendor), `${t.key} vendor 非法: ${t.vendor}`);
      assert.ok(t.upstreamModelId && t.upstreamModelId.trim().length > 0, `${t.key} 缺 upstreamModelId`);
      assert.equal(typeof t.verified, 'boolean', `${t.key} verified 应为 boolean`);
    }
  });
  it('厂商预设 URL/路径合法（relay 除外）', () => {
    for (const p of PROVIDER_TEMPLATES) {
      if (p.vendor === 'relay') continue;
      assert.ok(p.baseUrl.startsWith('http'), `${p.vendor} baseUrl 非法`);
      assert.ok(p.chatPath.startsWith('/'), `${p.vendor} chatPath 非法`);
      assert.ok(p.modelsPath.startsWith('/'), `${p.vendor} modelsPath 非法`);
      assert.ok(typeof p.apiStyle === 'string' && p.apiStyle.length > 0, `${p.vendor} 缺 apiStyle`);
    }
  });
  it('DashScope 预设：baseUrl 为完整 OpenAI 兼容端点，视频/图片生成路径为绝对 URL', () => {
    const dash = PROVIDER_TEMPLATES.find((p) => p.vendor === 'aliyun-dashscope')!;
    assert.equal(dash.baseUrl, 'https://dashscope.aliyuncs.com/compatible-mode/v1');
    assert.equal(dash.chatPath, '/chat/completions');
    assert.equal(dash.modelsPath, '/models');
    const g = dash.generation as Record<string, unknown>;
    assert.match(
      String(g.videosPath),
      /^https:\/\/dashscope\.aliyuncs\.com\/api\/v1\/services\/aigc\/video-generation\/video-synthesis$/,
    );
    assert.match(String(g.taskPath), /^https:\/\/dashscope\.aliyuncs\.com\/api\/v1\/services\/aigc\/video-generation\/tasks\/\{id\}$/);
    assert.match(String(g.imagesPath), /^https:\/\/dashscope\.aliyuncs\.com\/api\/v1\/services\/aigc\/text2image\/image-synthesis$/);
    assert.equal(String(g.imageTaskPath), 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/task/{id}');
    assert.equal(String(g.imageResultUrlPath), 'output.results[0].url');
  });

  it('openai / deepseek 预设已加入', () => {
    for (const key of ['openai-gpt-4o', 'openai-gpt-4o-mini', 'openai-gpt-4.1', 'openai-dall-e-3', 'openai-whisper-1', 'openai-tts-1', 'deepseek-chat', 'deepseek-reasoner']) {
      assert.ok(MODEL_TEMPLATES.some((t) => t.key === key), `缺少预设 ${key}`);
    }
  });

  it('DashScope generation 模板与运行时适配器契约一致', () => {
    const p = PROVIDER_TEMPLATES.find((x) => x.vendor === 'aliyun-dashscope')!;
    const gen = p.generation as Record<string, unknown>;
    const allowed = new Set(['imagesPath', 'videosPath', 'taskPath', 'extraHeaders', 'async', 'pollInterval', 'requestTemplate', 'taskIdPath', 'statusPath', 'successValues', 'failedValues', 'resultUrlPath', 'resultB64Path', 'timeoutMs', 'imagesStyle', 'imageFields', 'promptField', 'modelField', 'sizeField', 'multipartFields', 'imageRequestTemplate', 'imageTaskPath', 'imageResultUrlPath']);
    for (const k of Object.keys(gen)) {
      assert.ok(allowed.has(k), `generation 键 ${k} 不在 GenerationAdapterConfig 中`);
    }
    assert.ok(String(gen.taskPath).includes('{id}') || String(gen.taskPath).includes('{task_id}'), 'taskPath 必须含 {id}/{task_id} 占位符');
    const rt = gen.requestTemplate as Record<string, unknown>;
    assert.equal(rt.model, '{upstreamModelId}');
    assert.ok((rt.input as Record<string, unknown>).prompt === '{prompt}', 'requestTemplate.input.prompt 缺失');
    // DashScope 原生异步视频：parameters 必须在顶层（不在 input 里），且含分辨率/时长/帧率占位
    const params = rt.parameters as Record<string, unknown>;
    assert.equal(params.resolution, '{resolution}', '视频 parameters.resolution 占位缺失');
    assert.equal(params.duration, '{duration}', '视频 parameters.duration 占位缺失');
    assert.equal(params.fps, '{fps}', '视频 parameters.fps 占位缺失');
    assert.equal((rt.input as Record<string, unknown>).parameters, undefined, 'parameters 不应嵌套在 input 内');
    // 图片模板：size 占位 + 原生异步端点
    const irt = gen.imageRequestTemplate as Record<string, unknown>;
    assert.equal(irt.model, '{upstreamModelId}');
    assert.equal((irt.parameters as Record<string, unknown>).size, '{size}');
    assert.ok(String(gen.imagesPath).startsWith('https://'), 'imagesPath 必须是绝对 URL');
    assert.ok(String(gen.videosPath).startsWith('https://'), 'videosPath 必须是绝对 URL');
  });
});
