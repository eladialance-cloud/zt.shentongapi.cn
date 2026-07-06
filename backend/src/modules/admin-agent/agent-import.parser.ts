import matter from 'gray-matter';

/**
 * Agent Markdown 解析结果
 */
export interface ParsedAgentMarkdown {
  /** Agent 名称（来自 frontmatter.name，无则取文件名） */
  name: string;
  /** 描述（frontmatter.description） */
  description: string;
  /** 头像（frontmatter.emoji） */
  avatar: string;
  /** 系统提示词（Markdown 正文，已 trim） */
  systemPrompt: string;
  /** 颜色（frontmatter.color，可选） */
  color?: string;
  /** 解析失败原因（如 frontmatter 缺失） */
  error?: string;
}

/**
 * 解析单个 Agent Markdown 文件
 * @param filePath 文件相对路径（用于错误提示与默认 name）
 * @param content 文件内容
 */
export function parseAgentMarkdown(
  filePath: string,
  content: string,
): ParsedAgentMarkdown {
  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = matter(content);
  } catch (e) {
    return {
      name: filePath,
      description: '',
      avatar: '',
      systemPrompt: '',
      error: `frontmatter 解析失败: ${(e as Error).message}`,
    };
  }

  const fm = parsed.data || {};
  const body = (parsed.content || '').trim();
  const name =
    (fm.name as string) ||
    filePath.split('/').pop()?.replace(/\.md$/i, '') ||
    filePath;

  if (!body) {
    return {
      name,
      description: (fm.description as string) || '',
      avatar: (fm.emoji as string) || '',
      systemPrompt: '',
      error: '正文为空',
    };
  }

  return {
    name,
    description: (fm.description as string) || '',
    avatar: (fm.emoji as string) || '',
    systemPrompt: body,
    color: fm.color as string | undefined,
  };
}
