/** 口播工坊本地 TTS（Windows SAPI）单元测试 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildSapiTtsArgs, sapiTts, SAPI_TTS_PS1 } from '../../src/modules/oral-workshop/local-tts';

describe('local-tts（Windows SAPI 兜底）', () => {
  it('SAPI_TTS_PS1：包含 System.Speech 与 Speak 调用', () => {
    assert.ok(SAPI_TTS_PS1.includes('Add-Type -AssemblyName System.Speech'));
    assert.ok(SAPI_TTS_PS1.includes('$s.SetOutputToWaveFile($OutFile)'));
    assert.ok(SAPI_TTS_PS1.includes('$s.Speak($text)'));
  });

  it('buildSapiTtsArgs：包含 -File 与三个参数', () => {
    const args = buildSapiTtsArgs('C:/tmp/tts.ps1', 'C:/tmp/t.txt', 'C:/tmp/o.wav', 2);
    assert.deepEqual(args, [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
      'C:/tmp/tts.ps1', 'C:/tmp/t.txt', 'C:/tmp/o.wav', '2',
    ]);
  });

  it('sapiTts：注入 fake runner 产出 WAV 并返回路径（文案带 BOM）', async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ow-tts-'));
    const outFile = path.join(outputDir, 'voice.wav');
    let capturedText = '';
    await sapiTts('你好世界', outFile, {
      rate: 1,
      powershellPath: 'fake-ps',
      runner: async () => {
        capturedText = fs.readFileSync(outFile + '.txt', 'utf8');
        fs.writeFileSync(outFile, 'RIFF');
      },
    });
    assert.equal(capturedText, '\uFEFF你好世界');
    assert.equal(fs.readFileSync(outFile, 'utf8'), 'RIFF');
    assert.ok(fs.existsSync(outFile + '.ps1'));
    fs.rmSync(outputDir, { recursive: true, force: true });
  });

  it('sapiTts：runner 未产出文件时抛错', async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ow-tts-'));
    const outFile = path.join(outputDir, 'missing.wav');
    await assert.rejects(
      () => sapiTts('x', outFile, { runner: async () => { /* 不产出 */ } }),
      /SAPI TTS 未产出音频文件/,
    );
    fs.rmSync(outputDir, { recursive: true, force: true });
  });
});
