// Markdown 渲染组件
// 对齐开发文档-前端开发指南.md 6.3 聊天模块 Markdown 渲染
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import styles from './styles.module.css';

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className={styles.markdown}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const text = String(children);
            // 行内代码：无语言标记且无换行
            if (!match && !text.includes('\n')) {
              return (
                <code className={styles.inlineCode} {...props}>
                  {children}
                </code>
              );
            }
            return (
              <SyntaxHighlighter
                language={match?.[1] || 'text'}
                style={oneDark}
                PreTag="div"
                customStyle={{ borderRadius: 8, fontSize: 13 }}
              >
                {text.replace(/\n$/, '')}
              </SyntaxHighlighter>
            );
          },
          a({ children, ...props }) {
            return (
              <a target="_blank" rel="noopener noreferrer" {...props}>
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export default MarkdownRenderer;
