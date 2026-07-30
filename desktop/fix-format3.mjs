// fix-format3.mjs - 删除乱码注释 + TS printer 格式化 + prettier
import { readFileSync, writeFileSync } from 'fs';
import ts from 'typescript';

const files = process.argv.slice(2);

for (const file of files) {
  let content = readFileSync(file, 'utf8');
  const lines = content.split('\n');
  
  if (lines.length > 10) {
    console.log(`SKIP: ${file} (${lines.length} lines)`);
    continue;
  }
  
  // 用 TS compiler 解析
  const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, 
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  
  // 遍历 AST，移除所有乱码注释（含非 ASCII 字符的注释）
  // 评论中的乱码特征：包含 閸 閻 鐎 鐟 瀹 绾 绁 等 GBK→UTF-8 双重编码字符
  
  function hasGarbledText(text) {
    // 检测 GBK→UTF-8 双重编码的乱码字符
    // 这些字符集中在 CJK 扩展区
    return /[\u{E000}-\u{F8FF}]|[\u{3400}-\u{4DBF}][\u{E000}-\u{FFFF}]/u.test(text) ||
           text.includes('閸') || text.includes('閻') || text.includes('鐎') || 
           text.includes('鐟') || text.includes('瀹') || text.includes('缁') ||
           text.includes('缂') || text.includes('绾') || text.includes('娑') ||
           text.includes('婵') || text.includes('濞') || text.includes('闁') ||
           text.includes('鐠') || text.includes('閺') || text.includes('缂');
  }
  
  // 收集要移除的注释范围
  const rangesToRemove = [];
  
  function visit(node) {
    // 检查前导注释
    const leadingComments = ts.getLeadingCommentRanges(content, node.getFullStart());
    if (leadingComments) {
      for (const c of leadingComments) {
        const text = content.substring(c.pos, c.end);
        if (hasGarbledText(text)) {
          rangesToRemove.push([c.pos, c.end]);
        }
      }
    }
    // 检查尾部注释
    const trailingComments = ts.getTrailingCommentRanges(content, node.getEnd());
    if (trailingComments) {
      for (const c of trailingComments) {
        const text = content.substring(c.pos, c.end);
        if (hasGarbledText(text)) {
          rangesToRemove.push([c.pos, c.end]);
        }
      }
    }
    node.forEachChild(visit);
  }
  visit(sourceFile);
  
  // 从后往前删除注释
  rangesToRemove.sort((a, b) => b[0] - a[0]);
  let modified = content;
  for (const [start, end] of rangesToRemove) {
    modified = modified.substring(0, start) + modified.substring(end);
  }
  
  // 重新解析并打印
  const newSource = ts.createSourceFile(file, modified, ts.ScriptTarget.Latest, true, 
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed, removeComments: false });
  const result = printer.printFile(newSource);
  
  writeFileSync(file, result, 'utf8');
  const newLines = result.split('\n').length;
  console.log(`OK: ${file} -> ${newLines} lines (removed ${rangesToRemove.length} comments)`);
}
