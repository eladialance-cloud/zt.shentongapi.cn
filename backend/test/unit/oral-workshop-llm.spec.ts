/** 口播工坊 LLM 链路单元测试
 * 运行: node -r ts-node/register --test test/unit/oral-workshop-llm.spec.ts
 *
 * 覆盖：
 * - extractJson 容错（纯 JSON / 代码块包裹 / 前后缀文本 / 非法输出抛 LlmOutputError）
 * - 提示词渲染与 260 字约束
 * - 各功能函数解析（选题/关键词选题/风格分析/法务审核）
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  OralWorkshopLlmService,
  extractJson,
  LlmOutputError,
  TARGET_LANGS,
  targetLangName,
  type LlmCaller,
} from '../../src/modules/oral-workshop/llm';

/** 用 ASCII 反引号拼接代码块包裹的输入（避免源码内反引号转义问题） */
const BT = String.fromCharCode(96);

function fakeCaller(respond: (content: string) => string): LlmCaller {
  return {
    chat: async (messages) => respond(messages.map((m) => m.content).join('\n')),
  };
}

describe('extractJson 容错', () => {
  it('纯 JSON 对象直接解析', () => {
    const out = extractJson('{"topics": ["a"]}');
    assert.deepEqual(out, { topics: ['a'] });
  });

  it('代码块包裹可解析', () => {
    const out = extractJson(BT + BT + BT + 'json\n{"a": 1}\n' + BT + BT + BT);
    assert.deepEqual(out, { a: 1 });
  });

  it('带前后缀解释文本时提取首个 JSON 对象', () => {
    const out = extractJson('好的，以下是结果：\n{"ok": true}\n希望对你有帮助');
    assert.deepEqual(out, { ok: true });
  });

  it('非法输出抛 LlmOutputError', () => {
    assert.throws(() => extractJson('不是 JSON 的内容'), LlmOutputError);
  });
});

describe('OralWorkshopLlmService', () => {
  it('rewriteScript：渲染改写模板并返回文案', async () => {
    let called = 0;
    const svc = new OralWorkshopLlmService(fakeCaller((content) => {
      called += 1;
      assert.ok(content.includes('改写专家'));
      assert.ok(content.includes('这是原文'));
      assert.ok(content.includes('职场教练'));
      return '改写后的文案';
    }));
    const out = await svc.rewriteScript('这是原文', { persona: '职场教练', style: '犀利' });
    assert.equal(out, '改写后的文案');
    assert.equal(called, 1);
  });

  it('createScript：渲染创作模板且包含 260 字约束', async () => {
    const svc = new OralWorkshopLlmService(fakeCaller((content) => {
      assert.ok(content.includes('为什么越努力越焦虑'));
      assert.ok(content.includes('参考范文内容'));
      assert.ok(content.includes('200-300 字'));
      return '这是一段足够长的口播文案正文。今天我们要聊一个很多人都在关心的话题，为什么越努力越焦虑。其实答案很简单，就是方向不对。只要你找到了正确的方法，并且坚持下去，就一定能看到改变。记住，慢就是快，少就是多。不要和别人比较，只和昨天的自己比较。每天进步一点点，一年之后就是天壤之别。';
    }));
    const out = await svc.createScript('为什么越努力越焦虑', '参考范文内容', '职场教练');
    assert.equal(out, '这是一段足够长的口播文案正文。今天我们要聊一个很多人都在关心的话题，为什么越努力越焦虑。其实答案很简单，就是方向不对。只要你找到了正确的方法，并且坚持下去，就一定能看到改变。记住，慢就是快，少就是多。不要和别人比较，只和昨天的自己比较。每天进步一点点，一年之后就是天壤之别。');
  });

  it('generateTopics：解析 topics 数组（含代码块包裹）', async () => {
    const payload = JSON.stringify({ topics: [{ title: '选题1', persona_angle: '角度1' }, { title: '选题2' }] });
    const svc = new OralWorkshopLlmService(fakeCaller(() => BT + BT + BT + 'json\n' + payload + '\n' + BT + BT + BT));
    const out = await svc.generateTopics('副业', { persona: '职场人', count: 2, excludedTopics: [] });
    assert.equal(out.length, 2);
    assert.equal(out[0].title, '选题1');
    assert.equal(out[0].persona_angle, '角度1');
  });

  it('generateTopics：兼容字符串数组并归一化为 title', async () => {
    const payload = JSON.stringify({ topics: ['选题A', '选题B', ''] });
    const svc = new OralWorkshopLlmService(fakeCaller(() => payload));
    const out = await svc.generateTopics('副业', { count: 3 });
    assert.equal(out.length, 2);
    assert.equal(out[0].title, '选题A');
    assert.equal(out[1].title, '选题B');
  });

  it('generateTopics：非法 JSON 抛 LlmOutputError', async () => {
    const svc = new OralWorkshopLlmService(fakeCaller(() => '抱歉，我无法生成'));
    await assert.rejects(() => svc.generateTopics('副业', { count: 3 }), LlmOutputError);
  });

  it('keywordTopics：解析 keyword_analysis + topics', async () => {
    const svc = new OralWorkshopLlmService(fakeCaller(() => JSON.stringify({
      keyword_analysis: '机会分析',
      topics: [{ title: 't1', hook: 'h1', persona_angle: 'p1', viral_logic: 'v1' }],
    })));
    const out = await svc.keywordTopics('赚钱', { count: 1 });
    assert.equal(out.keyword_analysis, '机会分析');
    assert.equal(out.topics[0].viral_logic, 'v1');
  });

  it('styleAnalysis：解析 style_analysis + 字符串选题数组', async () => {
    const svc = new OralWorkshopLlmService(fakeCaller(() => JSON.stringify({
      style_analysis: '风格分析内容',
      topics: ['选题A', '选题B'],
    })));
    const out = await svc.styleAnalysis('对标内容', ['已生成选题1']);
    assert.equal(out.style_analysis, '风格分析内容');
    assert.equal(out.topics.length, 2);
  });

  it('legalReview：解析 risk_level / issues / safe_script', async () => {
    const svc = new OralWorkshopLlmService(fakeCaller(() => JSON.stringify({
      risk_level: 'medium',
      issues: [{ type: '绝对化用语', quote: '最有效', suggestion: '改为：比较有效' }],
      safe_script: '合规文案',
    })));
    const out = await svc.legalReview('这是最有效的方案');
    assert.equal(out.risk_level, 'medium');
    assert.equal(out.issues[0].suggestion, '改为：比较有效');
    assert.equal(out.safe_script, '合规文案');
  });

  it('generateTitle：直接返回 LLM 文本', async () => {
    const svc = new OralWorkshopLlmService(fakeCaller(() => '主标题：别焦虑\n副标题：方法在这'));
    const out = await svc.generateTitle('文案内容', '抖音');
    assert.ok(out.includes('主标题'));
  });
});

  it('translateBilingual：解析中英对照行并过滤空行', async () => {
    const llm = new OralWorkshopLlmService(
      fakeCaller(() => '{"lines":[{"zh":"你好世界","en":"Hello world"},{"zh":"","en":""},{"zh":"再见","en":"Bye"}]}'),
    );
    const pairs = await llm.translateBilingual('你好世界。再见');
    assert.equal(pairs.length, 2);
    assert.deepEqual(pairs[0], { zh: '你好世界', en: 'Hello world' });
    assert.deepEqual(pairs[1], { zh: '再见', en: 'Bye' });
  });

  it('translateBilingual：缺少 lines 抛 LlmOutputError', async () => {
    const llm = new OralWorkshopLlmService(fakeCaller(() => '{"foo":1}'));
    await assert.rejects(() => llm.translateBilingual('x'), LlmOutputError);
  });

  it('translateSubtitles：指定目标语言（粤语）渲染语言名并解析 zh+translated', async () => {
    const llm = new OralWorkshopLlmService(
      fakeCaller((content) => {
        assert.ok(content.includes('粤语'));
        assert.ok(content.includes('你好世界'));
        return '{"lines":[{"zh":"你好世界","translated":"你好世界（粤）"},{"zh":"","translated":""},{"zh":"再见","translated":"再见（粤）"}]}';
      }),
    );
    const lines = await llm.translateSubtitles('你好世界。再见', 'zh-HK');
    assert.equal(lines.length, 2);
    assert.deepEqual(lines[0], { zh: '你好世界', translated: '你好世界（粤）' });
    assert.deepEqual(lines[1], { zh: '再见', translated: '再见（粤）' });
  });

  it('translateSubtitles：空结果不抛错返回空数组；无 lines 结构抛错', async () => {
    const llm = new OralWorkshopLlmService(fakeCaller(() => '{"lines":[{"zh":"","translated":""}]}'));
    const lines = await llm.translateSubtitles('x', 'en');
    assert.equal(lines.length, 0);
    const llm2 = new OralWorkshopLlmService(fakeCaller(() => '{"foo":1}'));
    await assert.rejects(() => llm2.translateSubtitles('x', 'ja'), LlmOutputError);
  });

  it('TARGET_LANGS：30 种国际语言 + 9 种方言，targetLangName 兜底', () => {
    assert.equal(Object.keys(TARGET_LANGS).length, 38);
    assert.equal(TARGET_LANGS['zh-HK'], '粤语');
    assert.equal(TARGET_LANGS['zh-WU'], '吴语');
    assert.equal(TARGET_LANGS.en, '英语');
    assert.equal(TARGET_LANGS.vi, '越南语');
    assert.equal(targetLangName('zh-HK'), '粤语');
    assert.equal(targetLangName('xx-unknown'), 'xx-unknown');
  });
