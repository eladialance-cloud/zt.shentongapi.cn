import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseCurl } from '../../src/modules/admin-model/utils/curl-parser';

describe('parseCurl', () => {
  it('解析 DashScope 图生视频 curl（happyhorse）', () => {
    const r = parseCurl(`curl --location 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis' \
    -H 'X-DashScope-Async: enable' \
    -H "Authorization: Bearer $DASHSCOPE_API_KEY" \
    -H 'Content-Type: application/json' \
    -d '{
    "model": "happyhorse-1.1-i2v",
    "input": {
        "prompt": "一只猫在草地上奔跑",
        "media": [
            {
                "type": "first_frame",
                "url": "https://cdn.translate.alibaba.com/r/wanx-demo-1.png"
            }
        ]
    },
    "parameters": {
        "resolution": "720P",
        "duration": 5
    }
}'`);
    assert.equal(r.submitUrl, 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis');
    assert.equal(r.method, 'POST');
    assert.equal(r.modelId, 'happyhorse-1.1-i2v');
    assert.equal(r.async, true);
    assert.equal(r.taskQueryUrl, 'https://dashscope.aliyuncs.com/api/v1/tasks/{id}');
    assert.equal(r.extraHeaders['X-DashScope-Async'], 'enable');
    assert.deepEqual(r.requestTemplate, {
      model: '{upstreamModelId}',
      input: { prompt: '{prompt}', media: [{ type: 'first_frame', url: '{imageUrl0}' }] },
      parameters: { resolution: '{resolution}', duration: '{duration}' },
    });
    assert.ok(r.warnings.some((w) => w.includes('Authorization')));
  });

  it('解析 OpenAI 文生图 curl', () => {
    const r = parseCurl(`curl https://api.openai.com/v1/images/generations \
  -H 'Authorization: Bearer OPENAI_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
  "model": "dall-e-3",
  "prompt": "a cat",
  "size": "1024x1024",
  "n": 1
}'`);
    assert.equal(r.submitUrl, 'https://api.openai.com/v1/images/generations');
    assert.equal(r.modelId, 'dall-e-3');
    assert.equal(r.async, false);
    assert.deepEqual(r.requestTemplate, {
      model: '{upstreamModelId}',
      prompt: '{prompt}',
      size: '{size}',
      n: '{n}',
    });
  });

  it('无 URL 时报错', () => {
    assert.throws(() => parseCurl('not a curl'), /无法从 curl/);
  });

  it('解析火山方舟（Volcengine）异步视频 curl → 任务查询URL自动兜底为 提交端点+/{id}', () => {
    const r = parseCurl(`curl --location 'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks' \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer $ARK_API_KEY' \\
  -d '{
    "model": "doubao-seedance-1-0-pro-250528",
    "content": [
      { "type": "text", "text": "一只猫在草地上奔跑" }
    ]
  }'`);
    assert.equal(r.submitUrl, 'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks');
    assert.equal(r.modelId, 'doubao-seedance-1-0-pro-250528');
    assert.equal(r.async, true);
    assert.equal(r.taskQueryUrl, 'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/{id}');
    assert.deepEqual(r.requestTemplate, {
      model: '{upstreamModelId}',
      content: [{ type: 'text', text: '{prompt}' }],
    });
  });

  it('任意 async 相关请求头都能识别异步（不限于 DashScope）', () => {
    const r = parseCurl(`curl --location 'https://api.example-vendor.com/v1/video/jobs' \\
  -H 'X-Async-Task: 1' \\
  -H 'Authorization: Bearer KEY' \\
  -d '{"model":"my-video-model","input":{"prompt":"hello"}}'`);
    assert.equal(r.async, true);
    assert.equal(r.taskQueryUrl, 'https://api.example-vendor.com/v1/video/jobs/{id}');
    assert.deepEqual(r.extraHeaders, { 'X-Async-Task': '1' });
  });

  it('同步请求不生成任务查询URL', () => {
    const r = parseCurl(`curl --location 'https://api.example.com/v1/images/generations' \\
  -H 'Authorization: Bearer KEY' \\
  -d '{"model":"dall-e-3","prompt":"a cat","size":"1024x1024"}'`);
    assert.equal(r.async, false);
    assert.equal(r.taskQueryUrl, undefined);
  });
});
