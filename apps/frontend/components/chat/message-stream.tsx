'use client';

import { memo, useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/utils/common';

const THINKING_WORDS = [
  'Thinking...',
  'Reasoning...',
  'Analyzing...',
  'Processing...',
  'Considering...',
  'Working on it...',
];

function ThinkingIndicator() {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const fade = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex((i) => (i + 1) % THINKING_WORDS.length);
        setVisible(true);
      }, 300);
    }, 1800);
    return () => clearInterval(fade);
  }, []);

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block w-2 h-4 bg-primary animate-pulse" />
      <span
        className="text-sm text-muted-foreground transition-opacity duration-300"
        style={{ opacity: visible ? 1 : 0 }}
      >
        {THINKING_WORDS[index]}
      </span>
    </span>
  );
}

interface MessageStreamProps {
  content: string;
  isStreaming?: boolean;
  role: 'user' | 'assistant';
  className?: string;
}

export const MessageStream = memo(function MessageStream({
  content,
  isStreaming = false,
  role,
  className,
}: MessageStreamProps) {
  return (
    <div
      className={cn(
        'prose prose-sm max-w-none dark:prose-invert',
        role === 'user' && 'rounded-lg p-1',
        role === 'assistant' && 'py-2',
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-lg font-bold mb-3 mt-4 first:mt-0">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-base font-semibold mb-2 mt-3">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm font-medium mb-2 mt-2">{children}</h3>
          ),
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          ul: ({ children }) => (
            <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside mb-2 space-y-1">
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="ml-2">{children}</li>,
          strong: ({ children }) => (
            <strong className="font-semibold">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          code: ({ className, children, ...props }) => {
            const isInline = !className;
            if (isInline) {
              return (
                <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">
                  {children}
                </code>
              );
            }
            return (
              <code className={cn('text-xs', className)} {...props}>
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="bg-muted p-3 rounded-lg text-xs font-mono overflow-x-auto mb-2 whitespace-pre-wrap">
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto mb-2">
              <table className="min-w-full border-collapse text-sm">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-muted-foreground/20 px-3 py-2 bg-muted text-left font-medium">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-muted-foreground/20 px-3 py-2">
              {children}
            </td>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-primary/50 pl-4 italic text-muted-foreground my-2">
              {children}
            </blockquote>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
      {isStreaming && <ThinkingIndicator />}
    </div>
  );
});
