"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseAgentMarkdown = parseAgentMarkdown;
const gray_matter_1 = __importDefault(require("gray-matter"));
function parseAgentMarkdown(filePath, content) {
    let parsed;
    try {
        parsed = (0, gray_matter_1.default)(content);
    }
    catch (e) {
        return {
            name: filePath,
            description: '',
            avatar: '',
            systemPrompt: '',
            error: `frontmatter 解析失败: ${e.message}`,
        };
    }
    const fm = parsed.data || {};
    const body = (parsed.content || '').trim();
    const name = fm.name ||
        filePath.split('/').pop()?.replace(/\.md$/i, '') ||
        filePath;
    if (!body) {
        return {
            name,
            description: fm.description || '',
            avatar: fm.emoji || '',
            systemPrompt: '',
            error: '正文为空',
        };
    }
    return {
        name,
        description: fm.description || '',
        avatar: fm.emoji || '',
        systemPrompt: body,
        color: fm.color,
    };
}
//# sourceMappingURL=agent-import.parser.js.map