const fs=require('fs');
function editLines(file, fns){
  const text=fs.readFileSync(file,'utf8');
  const eol=text.includes('\r\n')?'\r\n':'\n';
  let lines=text.split(/\r?\n/);
  const strip=(s)=>s.replace(/\s+$/,'');
  for(const fn of fns){
    if(fn.type==='replace'){
      let hit=false;
      lines=lines.map((ln,i)=>{ if(!hit && strip(ln)===strip(fn.old)){ hit=true; return fn.newLines.slice(); } return ln; }).flat();
      if(!hit){ console.error('REPLACE_MISSING '+fn.old); process.exit(1);}
    } else if(fn.type==='insertAfter'){
      const idx=lines.findIndex((ln,i)=>strip(ln)===strip(fn.after));
      if(idx<0){ console.error('INSERT_MISSING '+fn.after); process.exit(1);}
      lines.splice(idx+1,0,...fn.newLines);
    } else if(fn.type==='blockReplace'){
      let hit=false; const n=fn.old.length;
      outer: for(let i=0;i+n<=lines.length;i++){
        for(let j=0;j<n;j++){ if(strip(lines[i+j])!==strip(fn.old[j])) continue outer; }
        lines.splice(i,n,...fn.newLines); hit=true; break;
      }
      if(!hit){ console.error('BLOCK_MISSING '+fn.old[0]); process.exit(1);}
    }
  }
  fs.writeFileSync(file,lines.join(eol),'utf8');
  console.log('OK '+file);
}
// ---------- types ----------
editLines('D:\\二次开发\\frontend\\admin\\src\\types\\admin-system.ts',[
 {type:'replace', old:"  /** 语音识别引擎：openai=whisper（默认）/ volcano=火山 ASR */",
  newLines:["  /** 语音识别引擎：dashscope=百炼 paraformer（推荐）/ openai=whisper / volcano=火山 ASR */"]},
 {type:'replace', old:"  sttProvider?: 'openai' | 'volcano'",
  newLines:["  sttProvider?: 'dashscope' | 'openai' | 'volcano'"]},
 {type:'insertAfter', after:"  sttApiKey?: string",
  newLines:["  /** 公网音频地址前缀（dashscope 百炼 paraformer 文件转写用，如 https://zt.shentongapi.cn） */","  sttFileBase?: string"]},
]);
// ---------- Config.tsx ----------
editLines('D:\\二次开发\\frontend\\admin\\src\\pages\\System\\Config.tsx',[
 {type:'insertAfter', after:"        sttApiKey: cfgv.sttApiKey || '',",
  newLines:["        sttFileBase: cfgv.sttFileBase || '',"]},
 {type:'insertAfter', after:"        sttApiKey: values.sttApiKey || '',",
  newLines:["        sttFileBase: values.sttFileBase || '',"]},
 {type:'replace', old:'                <Form.Item name="sttProvider" label="语音识别引擎" extra="openai=whisper（默认）；volcano=火山 ASR">',
  newLines:['                <Form.Item name="sttProvider" label="语音识别引擎" extra="dashscope=百炼 paraformer(推荐，复用现有百炼key)；openai=whisper；volcano=火山">']},
 {type:'insertAfter', after:"                    options={[",
  newLines:["                      { value: 'dashscope', label: '阿里百炼 paraformer（推荐）' },"]},
 {type:'replace', old:"                      { value: 'openai', label: 'OpenAI whisper' },",
  newLines:["                      { value: 'openai', label: 'OpenAI whisper（需填端点+Key）' },"]},
 {type:'replace', old:"                      { value: 'volcano', label: '火山方舟 ASR' }",
  newLines:["                      { value: 'volcano', label: '火山 ASR（需火山识别资源）' }"]},
 {type:'replace', old:'                <Form.Item name="sttModel" label="语音识别模型" extra="提取文案/字幕用；留空=whisper-1">',
  newLines:['                <Form.Item name="sttModel" label="语音识别模型" extra="dashscope 留空=paraformer-v2；openai 留空=whisper-1">']},
 {type:'replace', old:'                  <Input placeholder="如 whisper-1" allowClear />',
  newLines:['                  <Input placeholder="如 paraformer-v2 / whisper-1" allowClear />']},
 {type:'blockReplace', old:[
   '                <Form.Item name="sttApiKey" label="语音识别 API Key" extra="火山 ASR 专用密钥">',
   '                  <Input.Password placeholder="请输入语音识别密钥" allowClear />',
   '                </Form.Item>'],
  newLines:[
   '                <Form.Item name="sttApiKey" label="语音识别 API Key" extra="火山 ASR 专用密钥">',
   '                  <Input.Password placeholder="请输入语音识别密钥" allowClear />',
   '                </Form.Item>',
   '                <Form.Item name="sttFileBase" label="公网音频前缀(百炼用)" extra="选 dashscope 时必须填，如 https://zt.shentongapi.cn">',
   '                  <Input placeholder="https://zt.shentongapi.cn" allowClear />',
   '                </Form.Item>']},
]);
console.log('ADMIN_PATCH_OK_ALL');