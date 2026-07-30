// fix-format.mjs - 修复被 Set-Content 破坏格式的 TS/TSX 文件
// 策略：将单行内容按 TS 语法规则重新添加换行
import { readFileSync, writeFileSync } from 'fs';

const files = process.argv.slice(2);

for (const file of files) {
  let content = readFileSync(file, 'utf8');
  
  // 检查是否需要修复（行数少于5且内容较长）
  const lines = content.split('\n');
  if (lines.length > 5) {
    console.log(`SKIP: ${file} (${lines.length} lines)`);
    continue;
  }
  
  // 策略：用正则在特定位置插入换行
  // 1. import 语句前
  content = content.replace(/(\s)(import\s)/g, '\n$2');
  // 2. export 语句前
  content = content.replace(/(\s)(export\s)/g, '\n$2');
  // 3. 分号后（但不在字符串/注释内）
  // 简单方法：按 ; 分割但保留注释中的 ;
  // 更好的方法：逐字符处理
  
  let result = '';
  let inString = false;
  let stringChar = '';
  let inLineComment = false;
  let inBlockComment = false;
  let inTemplateLiteral = false;
  
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    const next = content[i + 1] || '';
    
    if (inLineComment) {
      result += ch;
      if (ch === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      result += ch;
      if (ch === '*' && next === '/') {
        result += '/';
        i++;
        inBlockComment = false;
      }
      continue;
    }
    if (inString) {
      result += ch;
      if (ch === '\\') {
        result += next;
        i++;
        continue;
      }
      if (ch === stringChar) {
        inString = false;
      }
      continue;
    }
    if (inTemplateLiteral) {
      result += ch;
      if (ch === '\\') {
        result += next;
        i++;
        continue;
      }
      if (ch === '`') {
        inTemplateLiteral = false;
      }
      continue;
    }
    
    // 检查注释开始
    if (ch === '/' && next === '/') {
      inLineComment = true;
      result += ch;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      result += ch;
      continue;
    }
    // 检查字符串开始
    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
      result += ch;
      continue;
    }
    // 检查模板字符串开始
    if (ch === '`') {
      inTemplateLiteral = true;
      result += ch;
      continue;
    }
    
    // 在分号后加换行
    if (ch === ';') {
      result += ';\n';
      continue;
    }
    // 在 { 后加换行
    if (ch === '{') {
      result += ' {\n';
      continue;
    }
    // 在 } 前加换行
    if (ch === '}') {
      result += '\n}\n';
      continue;
    }
    
    result += ch;
  }
  
  // 清理多余空行
  result = result.replace(/\n{3,}/g, '\n\n');
  // 清理行首多余空格
  result = result.split('\n').map(line => line.trim()).join('\n');
  
  writeFileSync(file, result, 'utf8');
  const newLines = result.split('\n').length;
  console.log(`OK: ${file} -> ${newLines} lines`);
}
