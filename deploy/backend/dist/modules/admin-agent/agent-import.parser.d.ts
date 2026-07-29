export interface ParsedAgentMarkdown {
    name: string;
    description: string;
    avatar: string;
    systemPrompt: string;
    color?: string;
    error?: string;
}
export declare function parseAgentMarkdown(filePath: string, content: string): ParsedAgentMarkdown;
