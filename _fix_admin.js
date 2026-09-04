const fs=require('fs');
const C='D:\\二次开发\\frontend\\admin\\src\\pages\\System\\Config.tsx';
const text=fs.readFileSync(C,'utf8');
const eol=text.includes('\r\n')?'\r\n':'\n';
let lines=text.split(/\r?\n/);
const strip=(s)=>s.replace(/\s+$/,'');
const stray="                      { value: 'dashscope', label: '阿里百炼 paraformer（推荐）' },";
// 1) remove stray dashscope line only if followed by volcano(云端) row
let removed=false;
for(let i=0;i<lines.length;i++){
  if(strip(lines[i])===strip(stray) && i+1<lines.length && lines[i+1].includes('火山方舟（volcano，云端）')){
    lines.splice(i,1); removed=true; break;
  }
}
if(!removed){ console.error('STRAY_NOT_FOUND'); process.exit(1);}
// 2) insert dashscope option into the correct sttProvider Select block
const a="                      { value: 'openai', label: 'OpenAI whisper（需填端点+Key）' },";
const b="                      { value: 'volcano', label: '火山 ASR（需火山识别资源）' }";
let hit=false;
for(let i=0;i+1<lines.length;i++){
  if(strip(lines[i])===strip(a) && strip(lines[i+1])===strip(b)){
    lines.splice(i,0,stray); hit=true; break;
  }
}
if(!hit){ console.error('STT_BLOCK_NOT_FOUND'); process.exit(1);}
fs.writeFileSync(C,lines.join(eol),'utf8');
console.log('FIXED');