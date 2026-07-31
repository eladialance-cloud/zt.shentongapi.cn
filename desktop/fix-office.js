const fs = require("fs");
const path = require("path");
const file = path.join(process.cwd(), "src", "pages", "Office", "index.tsx");
let text = fs.readFileSync(file, "utf-8");

// Line 178: message.success with garbled text (start agent)
const idx1 = text.indexOf("message.success(");
// Find all message.success lines and fix them
let fixed = text;
// Fix by searching for the pattern: message.success(` ... `);
const pattern1 = /(message\.success\(\x60\x24\{agent\.name\} )(.*?)(\)\);)/g;
let match;
let changes = 0;
while ((match = pattern1.exec(text)) !== null) {
    const full = match[0];
    const prefix = match[1];
    const garbled = match[2];
    const suffix = match[3];
    if (garbled.length > 2 && !garbled.includes("宸插惎")) {
        fixed = fixed.replace(full, prefix + "\u5DF2\u505C\u6B62'" + suffix);
        changes++;
    } else if (garbled.length > 2) {
        fixed = fixed.replace(full, prefix + "\u5DF2\u542F\u52A8'" + suffix);
        changes++;
    }
}
console.log("message.success fixes:", changes);

// Fix message.warning line
const pattern2 = /message\.warning\('[^']*\?\)\(\);/g;
fixed = fixed.replace(pattern2, "message.warning('\u8BF7\u8F93\u5165\u4EFB\u52A1\u5185\u5BB9');");
console.log("message.warning fixed");

fs.writeFileSync(file, fixed, "utf-8");
