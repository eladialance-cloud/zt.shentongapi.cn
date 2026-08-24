/** 口播工坊模板加载器单元测试
 * 运行: node -r ts-node/register --test test/unit/oral-workshop-template-loader.spec.ts
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  loadTemplate,
  listTemplates,
  resolveTemplatesDir,
  TemplateLoadError,
  type OralWorkshopTemplate,
} from '../../src/modules/oral-workshop/template-loader';

const DEFAULT_DIR = process.env.ORAL_WORKSHOP_TEMPLATES_DIR;

function withTemplatesDir(dir: string, fn: () => void): void {
  process.env.ORAL_WORKSHOP_TEMPLATES_DIR = dir;
  try {
    fn();
  } finally {
    if (DEFAULT_DIR === undefined) delete process.env.ORAL_WORKSHOP_TEMPLATES_DIR;
    else process.env.ORAL_WORKSHOP_TEMPLATES_DIR = DEFAULT_DIR;
  }
}

describe('oral-workshop template-loader', () => {
  it('默认目录指向模块 templates/', () => {
    assert.ok(resolveTemplatesDir().endsWith(path.join('modules', 'oral-workshop', 'templates')));
  });

  it('loadTemplate：t1 返回完整模板 schema', () => {
    const t = loadTemplate('t1');
    assert.equal(t.template_id, 't1');
    assert.equal(typeof t.name, 'string');
    assert.ok(t.project_settings.width > 0 && t.project_settings.height > 0);
    assert.equal(t.project_settings.fps, 30);
    assert.ok(t.global_elements.h1);
    assert.ok(t.global_elements.h2);
    assert.ok(Array.isArray(t.subtitle_config.position));
    assert.equal(t.subtitle_config.style.fontFamily, '思源黑体');
  });

  it('listTemplates：返回 10 套并按 t1..t10 排序', () => {
    const list = listTemplates();
    assert.equal(list.length, 10);
    assert.deepEqual(
      list.map((t) => t.template_id),
      ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 't9', 't10'],
    );
  });

  it('listTemplates：每套都有全局元素与字幕配置', () => {
    for (const t of listTemplates()) {
      assert.ok(t.global_elements.h1, `${t.template_id} 缺 h1`);
      assert.ok(t.global_elements.h2, `${t.template_id} 缺 h2`);
      assert.ok(t.subtitle_config.animation_options?.length, `${t.template_id} 缺字幕动画选项`);
    }
  });

  it('loadTemplate：不存在的模板抛 TemplateLoadError', () => {
    assert.throws(() => loadTemplate('t99'), TemplateLoadError);
  });

  it('loadTemplate：非法 ID 抛 TemplateLoadError', () => {
    assert.throws(() => loadTemplate('../etc/passwd'), TemplateLoadError);
    assert.throws(() => loadTemplate('x1'), TemplateLoadError);
  });

  it('loadTemplate：目录可被 ORAL_WORKSHOP_TEMPLATES_DIR 覆盖', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ow-tpl-'));
    fs.writeFileSync(
      path.join(tmp, 't1.json'),
      JSON.stringify({
        template_id: 't1',
        name: '测试模板',
        version: '1.0',
        project_settings: { width: 720, height: 1280, fps: 24, duration: 15, background: '#000' },
        subtitle_config: { position: [360, 1000], style: { fontSize: 60, fontFamily: '思源黑体', color: '#FFF' } },
      }),
    );
    withTemplatesDir(tmp, () => {
      const t = loadTemplate('t1');
      assert.equal(t.name, '测试模板');
      assert.equal(t.project_settings.width, 720);
    });
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('loadTemplate：模板目录中 JSON 非法时抛 TemplateLoadError', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ow-tpl-'));
    fs.writeFileSync(path.join(tmp, 't1.json'), '{ bad json');
    withTemplatesDir(tmp, () => {
      assert.throws(() => loadTemplate('t1'), TemplateLoadError);
    });
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('loadTemplate：template_id 与文件名不一致抛 TemplateLoadError', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ow-tpl-'));
    fs.writeFileSync(
      path.join(tmp, 't1.json'),
      JSON.stringify({ template_id: 't2', name: 'x', version: '1.0' }),
    );
    withTemplatesDir(tmp, () => {
      assert.throws(() => loadTemplate('t1'), TemplateLoadError);
    });
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
