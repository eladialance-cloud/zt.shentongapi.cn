/** 口播工坊执行器单元测试
 * 覆盖：
 * - extract / rewrite / publishReady 步骤推进（markStepRunning → dispatch → markStepDone）
 * - rewrite 失败 → markStepFailed
 * - 未实现步骤（voiceClone/digitalHuman）标记 done(skipped) 推进流水线
 * - videoEdit：composePlan 生成 ffmpeg 命令并执行（fake runner），产出 video_url + ASS 落盘
 * - titleCover：buildCoverCommand 渲染封面，产出 cover_url + h1/h2
 * - processBatch 批量处理与计数
 */
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { OralWorkshopExecutor, type FfmpegRunner } from '../../src/modules/oral-workshop/oral-workshop.executor';
import { OralWorkshopLlmService, type LlmCaller } from '../../src/modules/oral-workshop/llm';

interface FakeServiceCalls {
  running: string[];
  done: Array<{ step: string; result?: Record<string, unknown> }>;
  failed: Array<{ step: string; error: string }>;
}

function makeFakeService() {
  const calls: FakeServiceCalls = { running: [], done: [], failed: [] };
  const service: any = {
    findExecutableJobs: async () => [],
    nextPendingStepOf: async () => null,
    getStepResults: async () => ({}),
    markStepRunning: async (_jobId: number, step: string) => { calls.running.push(step); },
    markStepDone: async (_jobId: number, step: string, result?: Record<string, unknown>) => { calls.done.push({ step, result }); },
    markStepFailed: async (_jobId: number, step: string, error: string) => { calls.failed.push({ step, error }); },
  };
  return { service, calls };
}

const tempDirs: string[] = [];
function makeOutputDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ow-exec-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  delete process.env.ORAL_WORKSHOP_OUTPUT_DIR;
  delete process.env.ORAL_WORKSHOP_BADGE_IMAGE;
  delete process.env.ORAL_WORKSHOP_VOICE_ENGINE;
  delete process.env.ORAL_WORKSHOP_DIGITAL_HUMAN_ENGINE;
  delete process.env.ORAL_WORKSHOP_WATERMARK_ENABLED;
  delete process.env.VOLCANO_ARK_API_KEY;
  delete process.env.VOLCANO_VOICE_MODEL;
  delete process.env.VOLCANO_DIGITAL_HUMAN_ENDPOINT;
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('OralWorkshopExecutor', () => {
  it('processJob：extract 步骤写入脚本产物并标记 done', async () => {
    const { service, calls } = makeFakeService();
    service.nextPendingStepOf = async () => 'extract';
    const exec = new OralWorkshopExecutor(service, null as unknown as OralWorkshopLlmService);
    const job = { id: 1, scriptInput: '你好世界', persona: null } as any;
    const ok = await exec.processJob(job);
    assert.equal(ok, true);
    assert.deepEqual(calls.running, ['extract']);
    assert.equal(calls.done.length, 1);
    assert.equal(calls.done[0].step, 'extract');
    assert.equal(calls.done[0].result?.chars, 4);
    assert.equal(calls.failed.length, 0);
  });

  it('processJob：rewrite 步骤调用 LLM 改写并标记 done（产物含 rewritten_script）', async () => {
    const { service, calls } = makeFakeService();
    service.nextPendingStepOf = async () => 'rewrite';
    let calledWith: string[] = [];
    const caller: LlmCaller = { chat: async (messages) => { calledWith = messages.map((m) => m.content); return '改写后文案'; } };
    const llm = new OralWorkshopLlmService(caller);
    const exec = new OralWorkshopExecutor(service, llm);
    const job = { id: 2, scriptInput: '原始文案', persona: '专家人设' } as any;
    const ok = await exec.processJob(job);
    assert.equal(ok, true);
    assert.deepEqual(calls.running, ['rewrite']);
    assert.equal(calls.done[0].step, 'rewrite');
    assert.equal(calls.done[0].result?.rewritten_script, '改写后文案');
    assert.ok(calledWith.some((c) => c.includes('原始文案')));
    assert.ok(calledWith.some((c) => c.includes('专家人设')));
  });

  it('processJob：rewrite LLM 异常 → markStepFailed', async () => {
    const { service, calls } = makeFakeService();
    service.nextPendingStepOf = async () => 'rewrite';
    const caller: LlmCaller = { chat: async () => { throw new Error('上游超时'); } };
    const llm = new OralWorkshopLlmService(caller);
    const exec = new OralWorkshopExecutor(service, llm);
    const job = { id: 3, scriptInput: 'x', persona: null } as any;
    const ok = await exec.processJob(job);
    assert.equal(ok, true);
    assert.equal(calls.failed.length, 1);
    assert.equal(calls.failed[0].step, 'rewrite');
    assert.equal(calls.failed[0].error, '上游超时');
  });

  it('processJob：voiceClone 采用用户音频作为人声轨（audioUrl 本地文件）', async () => {
    const { service, calls } = makeFakeService();
    service.nextPendingStepOf = async () => 'voiceClone';
    const audioSrc = path.join(makeOutputDir(), 'user-voice.mp3');
    fs.writeFileSync(audioSrc, 'fake-mp3');
    const exec = new OralWorkshopExecutor(service, null as unknown as OralWorkshopLlmService);
    const ok = await exec.processJob({ id: 4, audioUrl: audioSrc } as any);
    assert.equal(ok, true);
    assert.equal(calls.running[0], 'voiceClone');
    assert.equal(calls.done[0].step, 'voiceClone');
    const result = calls.done[0].result!;
    assert.equal(result.source, 'uploaded');
    assert.ok(typeof result.audio_path === 'string' && fs.existsSync(result.audio_path as string));
    assert.equal(calls.failed.length, 0);
  });

  it('processJob：voiceClone 引擎配置为 volcano 但未配密钥 → markStepFailed（可读错误）', async () => {
    process.env.ORAL_WORKSHOP_VOICE_ENGINE = 'volcano';
    delete process.env.VOLCANO_ARK_API_KEY;
    delete process.env.VOLCANO_VOICE_MODEL;
    const { service, calls } = makeFakeService();
    service.nextPendingStepOf = async () => 'voiceClone';
    const exec = new OralWorkshopExecutor(service, null as unknown as OralWorkshopLlmService);
    const ok = await exec.processJob({ id: 4, scriptInput: 'x' } as any);
    assert.equal(ok, true);
    assert.equal(calls.failed.length, 1);
    assert.equal(calls.failed[0].step, 'voiceClone');
    assert.ok(calls.failed[0].error.includes('volcano'));
  });

  it('processJob：digitalHuman 采用用户视频（videoUrl 本地文件）', async () => {
    const { service, calls } = makeFakeService();
    service.nextPendingStepOf = async () => 'digitalHuman';
    const videoSrc = path.join(makeOutputDir(), 'user-human.mp4');
    fs.writeFileSync(videoSrc, 'fake-mp4');
    const exec = new OralWorkshopExecutor(service, null as unknown as OralWorkshopLlmService);
    const ok = await exec.processJob({ id: 4, videoUrl: videoSrc } as any);
    assert.equal(ok, true);
    assert.equal(calls.done[0].step, 'digitalHuman');
    const result = calls.done[0].result!;
    assert.equal(result.source, 'uploaded');
    assert.ok(typeof result.video_path === 'string' && fs.existsSync(result.video_path as string));
  });

  it('processJob：digitalHuman 本地卡片视频兜底（模板背景色 + 语音轨，ffmpeg 命令）', async () => {
    process.env.ORAL_WORKSHOP_DIGITAL_HUMAN_ENGINE = 'local';
    delete process.env.VOLCANO_ARK_API_KEY;
    delete process.env.VOLCANO_DIGITAL_HUMAN_ENDPOINT;
    const { service, calls } = makeFakeService();
    service.nextPendingStepOf = async () => 'digitalHuman';
    service.getStepResults = async () => ({ voiceClone: { audio_path: 'voice.wav' } });
    const runCommands: string[][] = [];
    const runner: FfmpegRunner = async (cmd) => { runCommands.push(cmd); };
    const outputDir = makeOutputDir();
    process.env.ORAL_WORKSHOP_OUTPUT_DIR = outputDir;
    const exec = new OralWorkshopExecutor(service, null as unknown as OralWorkshopLlmService, runner);
    const ok = await exec.processJob({ id: 4, templateId: 't1' } as any);
    assert.equal(ok, true);
    assert.equal(calls.done[0].step, 'digitalHuman');
    const result = calls.done[0].result!;
    assert.equal(result.source, 'card');
    assert.equal(result.video_path, path.join(outputDir, 'human.mp4'));
    assert.equal(runCommands.length, 1);
    assert.ok(runCommands[0].some((a) => a.includes('color=c=')));
    assert.ok(runCommands[0].some((a) => a.includes('-shortest')));
  });

  it('processJob：digitalHuman 未配置引擎且无语音 → markStepFailed（可读错误）', async () => {
    process.env.ORAL_WORKSHOP_DIGITAL_HUMAN_ENGINE = 'volcano';
    delete process.env.VOLCANO_ARK_API_KEY;
    delete process.env.VOLCANO_DIGITAL_HUMAN_ENDPOINT;
    const { service, calls } = makeFakeService();
    service.nextPendingStepOf = async () => 'digitalHuman';
    service.getStepResults = async () => ({});
    const exec = new OralWorkshopExecutor(service, null as unknown as OralWorkshopLlmService);
    const ok = await exec.processJob({ id: 4 } as any);
    assert.equal(ok, true);
    assert.equal(calls.failed.length, 1);
    assert.equal(calls.failed[0].step, 'digitalHuman');
    assert.ok(calls.failed[0].error.includes('数字人'));
  });

  it('processJob：publishReady 终态直接完成', async () => {
    const { service, calls } = makeFakeService();
    service.nextPendingStepOf = async () => 'publishReady';
    const exec = new OralWorkshopExecutor(service, null as unknown as OralWorkshopLlmService);
    const ok = await exec.processJob({ id: 5 } as any);
    assert.equal(ok, true);
    assert.equal(calls.done[0].step, 'publishReady');
    assert.equal(calls.done[0].result?.ready, true);
  });

  it('processJob：videoEdit 组装合成计划并执行 ffmpeg（产物含 video_url，ASS 已落盘）', async () => {
    const { service, calls } = makeFakeService();
    service.nextPendingStepOf = async () => 'videoEdit';
    service.getStepResults = async () => ({
      voiceClone: { audio_path: 'voice.mp3' },
      digitalHuman: { video_path: 'human.mp4' },
    });
    const runCommands: string[][] = [];
    const runner: FfmpegRunner = async (cmd) => { runCommands.push(cmd); };
    const outputDir = makeOutputDir();
    process.env.ORAL_WORKSHOP_OUTPUT_DIR = outputDir;
    const exec = new OralWorkshopExecutor(service, null as unknown as OralWorkshopLlmService, runner);
    const job = { id: 6, templateId: 't1', rewrittenScript: '第一句。第二句！', audioUrl: null, videoUrl: null } as any;
    const ok = await exec.processJob(job);
    assert.equal(ok, true);
    assert.equal(calls.done[0].step, 'videoEdit');
    const result = calls.done[0].result!;
    // 归一化路径分隔符比较（composer 产物路径可能混用 / 与 \）
    const normalizeSep = (p: unknown) => String(p).split('\\').join('/');
    assert.equal(normalizeSep(result.video_url), normalizeSep(path.join(outputDir, 'final.mp4')));
    assert.equal(result.audio_url, 'voice.mp3');
    assert.ok(runCommands.length >= 1);
    assert.equal(runCommands[0][0], 'ffmpeg');
    // 角标合规：最终视频命令包含 overlay 叠加（不可关闭）
    const finalCmd = runCommands[runCommands.length - 1];
    assert.ok(finalCmd.some((a) => a.includes('overlay=')));
    // ASS 字幕文件已写入
    const assFile = path.join(outputDir, 'subs.ass');
    assert.ok(fs.existsSync(assFile));
    const assText = fs.readFileSync(assFile, 'utf8');
    assert.ok(assText.includes('[Events]'));
    assert.ok(assText.includes('Dialogue:'));
    assert.ok(assText.includes('第一句。'));
  });

  it('processJob：videoEdit 缺少上游产物时失败并回退 markStepFailed', async () => {
    const { service, calls } = makeFakeService();
    service.nextPendingStepOf = async () => 'videoEdit';
    service.getStepResults = async () => ({});
    const exec = new OralWorkshopExecutor(service, null as unknown as OralWorkshopLlmService);
    const job = { id: 7, templateId: 't1', rewrittenScript: 'x' } as any;
    const ok = await exec.processJob(job);
    assert.equal(ok, true);
    assert.equal(calls.failed.length, 1);
    assert.equal(calls.failed[0].step, 'videoEdit');
    assert.ok(calls.failed[0].error.includes('缺少合成输入'));
  });

  it('processJob：titleCover 渲染封面并产出 cover_url 与标题', async () => {
    const { service, calls } = makeFakeService();
    service.nextPendingStepOf = async () => 'titleCover';
    service.getStepResults = async () => ({ videoEdit: { video_url: 'final.mp4' } });
    const runCommands: string[][] = [];
    const runner: FfmpegRunner = async (cmd) => { runCommands.push(cmd); };
    const outputDir = makeOutputDir();
    process.env.ORAL_WORKSHOP_OUTPUT_DIR = outputDir;
    const exec = new OralWorkshopExecutor(service, null as unknown as OralWorkshopLlmService, runner);
    const job = { id: 8, templateId: 't1', rewrittenScript: '这是一段用于生成视频标题的口播文案。', audioUrl: null, videoUrl: 'final.mp4' } as any;
    const ok = await exec.processJob(job);
    assert.equal(ok, true);
    assert.equal(calls.done[0].step, 'titleCover');
    const result = calls.done[0].result!;
    assert.equal(result.cover_url, path.join(outputDir, 'cover.png'));
    assert.ok(typeof result.title_h1 === 'string' && result.title_h1.length > 0);
    assert.ok(runCommands.length === 1);
    assert.equal(runCommands[0][0], 'ffmpeg');
    assert.ok(runCommands[0].includes('-frames:v'));
  });

  it('processBatch：只处理待执行任务并返回推进数量', async () => {
    const { service, calls } = makeFakeService();
    service.findExecutableJobs = async () => [{ id: 1 }, { id: 2 }, { id: 3 }];
    let called = 0;
    service.nextPendingStepOf = async () => { called += 1; return called === 2 ? null : 'extract'; };
    const exec = new OralWorkshopExecutor(service, null as unknown as OralWorkshopLlmService);
    const count = await exec.processBatch();
    assert.equal(count, 2);
    assert.equal(calls.done.length, 2);
  });
});

  it('processJob：videoEdit 双语字幕调用 LLM 翻译并渲染中英双行', async () => {
    const { service, calls } = makeFakeService();
    service.nextPendingStepOf = async () => 'videoEdit';
    service.getStepResults = async () => ({
      voiceClone: { audio_path: 'voice.mp3' },
      digitalHuman: { video_path: 'human.mp4' },
    });
    const runCommands: string[][] = [];
    const runner: FfmpegRunner = async (cmd) => { runCommands.push(cmd); };
    const outputDir = makeOutputDir();
    process.env.ORAL_WORKSHOP_OUTPUT_DIR = outputDir;
    let translated = '';
    const fakeLlm = {
      translateBilingual: async (script: string) => {
        translated = script;
        return [
          { zh: '第一句。', en: 'First sentence.' },
          { zh: '第二句！', en: 'Second sentence!' },
        ];
      },
    } as unknown as OralWorkshopLlmService;
    const exec = new OralWorkshopExecutor(service, fakeLlm, runner);
    const job = { id: 66, templateId: 't1', rewrittenScript: '第一句。第二句！', bilingual: true } as any;
    const ok = await exec.processJob(job);
    assert.equal(ok, true);
    assert.equal(calls.done[0].step, 'videoEdit');
    assert.equal(calls.done[0].result?.bilingual, true);
    assert.equal(translated, '第一句。第二句！');
    const assFile = path.join(outputDir, 'subs.ass');
    const assText = fs.readFileSync(assFile, 'utf8');
    assert.ok(assText.includes('第一句。\\NFirst sentence.'));
    assert.ok(assText.includes('第二句！\\NSecond sentence!'));
    assert.ok(runCommands.length >= 1);
  });
