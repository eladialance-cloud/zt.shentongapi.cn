const fs=require('fs');
const file='D:\\二次开发\\backend\\src\\modules\\oral-workshop\\system-llm.service.ts';
const newText=fs.readFileSync('D:\\二次开发\\_stt_new.txt','utf8');
let s=fs.readFileSync(file,'utf8');
const importOld="import { readFileSync } from 'fs';";
if(!s.includes(importOld)){console.error('IMPORT_MARKER_MISSING');process.exit(1);}
s=s.split(importOld).join("import { copyFileSync, mkdirSync, readFileSync } from 'fs';");
const startMarker="  /** 语音识别（audio -> 文本）：直连 OpenAI 兼容 /audio/transcriptions（multipart），不计费（任务预扣已覆盖） */";
const endMarker="  /** 非流式调用 OpenAI 兼容 /chat/completions，返回完整文本 */";
const i=s.indexOf(startMarker), j=s.indexOf(endMarker);
if(i<0||j<0||j<=i){console.error('REGION_MARKERS_MISSING',i,j);process.exit(1);}
s=s.slice(0,i)+newText.replace(/\s+$/,'')+'\n\n'+s.slice(j);
const caseMarker="        case 'stt': {";
if(!s.includes(caseMarker)){console.error('CASE_MARKER_MISSING');process.exit(1);}
const ins="        case 'stt': {\n          if (str(cfg.sttProvider) === 'dashscope') {\n            const fBase = str(cfg.sttFileBase) || process.env.ORAL_WORKSHOP_PUBLIC_BASE || '';\n            return { success: !!fBase, message: fBase ? '语音识别配置为百炼 paraformer（sttFileBase=' + fBase + '），保存后请到桌面端用「上传文件提取文案」实测一次' : '语音识别(dashscope)缺少 sttFileBase 公网音频前缀，请先填写' };\n          }\n";
s=s.replace(caseMarker,ins);
fs.writeFileSync(file,s,'utf8');
console.log('PATCHED_OK oldLen='+s.length);