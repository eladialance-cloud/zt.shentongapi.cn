/** 多模态内容组装单元测试
 * 运行: node -r ts-node/register --test test/unit/media-content.spec.ts
 *
 * 覆盖 MediaContentService.buildUserContent：
 * - 图片附件 → image_url data URL
 * - 视频附件 → 抽帧多图 + 文本说明
 * - 模型不支持视觉 → 降级纯文本
 * - 无附件 → 原文返回
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MediaContentService } from '../../src/modules/chat/services/media-content.service';

/** 构造一个只有最少方法可用的 VideoFrameService mock */
function makeVideoFrameMock(overrides: Record<string, (...a: any[]) => any> = {}): any {
  return {
    downscaleImage: async (p: string) => p,
    extractFrames: async (_p: string, n: number) =>
      Array.from({ length: n }, (_, i) => `/uploads/files/frames/f-${i}.jpg`),
    toDataUrl: (_p: string, mime: string) => `data:${mime};base64,AAAA`,
    ...overrides,
  };
}

function createService(overrides: Record<string, (...a: any[]) => any> = {}): MediaContentService {
  const fileRepo: any = {
    findOne: async ({ where }: any) => {
      const id = Number(where?.id ?? 0);
      return {
        id,
        name: `file-${id}.png`,
        size: 1234,
        mimeType: id === 8 ? 'video/mp4' : 'image/png',
        path: `/uploads/files/${id}.png`,
        userId: where?.userId,
      };
    },
  };
  const modelRepo: any = { findOne: async () => ({ supportsVision: true }) };
  return new MediaContentService(fileRepo, modelRepo, makeVideoFrameMock(overrides));
}

describe('MediaContentService.buildUserContent', () => {
  it('无附件返回原文', async () => {
    const svc = createService();
    assert.equal(await svc.buildUserContent(1, 'hello', null, { vision: true }), 'hello');
  });

  it('图片附件 → image_url data URL', async () => {
    const svc = createService();
    const content = await svc.buildUserContent(1, '看图', ['7'], { vision: true });
    assert.ok(Array.isArray(content));
    const arr = content as Array<Record<string, unknown>>;
    assert.equal(arr[0].type, 'text');
    assert.equal(arr[1].type, 'image_url');
    const url = String((arr[1].image_url as any).url);
    assert.ok(url.startsWith('data:image/jpeg;base64,'), '应为 jpeg data URL，实际: ' + url.slice(0, 40));
  });

  it('视频附件 → 抽 4 帧 + 文本说明', async () => {
    const svc = createService({
      extractFrames: async (_p: string, n: number) =>
        Array.from({ length: 4 }, (_, i) => `/uploads/files/frames/f-${i}.jpg`),
    });
    const content = await svc.buildUserContent(1, '看视频', ['8'], { vision: true });
    const arr = content as Array<Record<string, unknown>>;
    const imageParts = arr.filter((p) => p.type === 'image_url');
    assert.equal(imageParts.length, 4);
    const notePart = arr.find((p) => p.type === 'text' && typeof p.text === 'string' && p.text.includes('抽取'));
    assert.ok(notePart, '应有抽帧说明文本');
  });

  it('模型不支持视觉 → 降级纯文本（不报错）', async () => {
    const svc = createService();
    const content = await svc.buildUserContent(1, '看图', ['7'], { vision: false });
    assert.equal(typeof content, 'string');
    assert.ok((content as string).includes('附件'));
  });

  it('附件处理失败 → 文本说明降级', async () => {
    const svc = createService({
      toDataUrl: () => { throw new Error('boom'); },
    });
    const content = await svc.buildUserContent(1, '看图', ['7'], { vision: true });
    assert.equal(typeof content, 'string');
    assert.ok((content as string).includes('处理失败'));
  });
});

describe('MediaContentService.modelSupportsVision', () => {
  it('模型 supportsVision=true → true', async () => {
    const fileRepo: any = { findOne: async () => null };
    const modelRepo: any = { findOne: async () => ({ supportsVision: true }) };
    const svc = new MediaContentService(fileRepo, modelRepo, makeVideoFrameMock());
    assert.equal(await svc.modelSupportsVision('gpt-4o'), true);
  });
  it('模型不存在/异常 → false', async () => {
    const fileRepo: any = { findOne: async () => null };
    const modelRepo: any = {
      findOne: async () => { throw new Error('db down'); },
    };
    const svc = new MediaContentService(fileRepo, modelRepo, makeVideoFrameMock());
    assert.equal(await svc.modelSupportsVision('x'), false);
  });
});
