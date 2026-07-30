// fix-format2.mjs - 使用 TypeScript compiler 正确格式化
import { readFileSync, writeFileSync } from 'fs';
import ts from 'typescript';

const files = process.argv.slice(2);

for (const file of files) {
  const content = readFileSync(file, 'utf8');
  const lines = content.split('\n');
  
  if (lines.length > 10) {
    console.log(`SKIP: ${file} (${lines.length} lines)`);
    continue;
  }
  
  // 用 TS compiler 解析
  const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, 
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  
  // 使用 printer 重新打印
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  const result = printer.printFile(sourceFile);
  
  writeFileSync(file, result, 'utf8');
  const newLines = result.split('\n').length;
  console.log(`OK: ${file} -> ${newLines} lines`);
}
