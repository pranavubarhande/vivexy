import React from 'react';
import ReactMarkdown from 'react-markdown';

export const MarkdownRenderer = React.memo<{ children: string }>(
  ({ children }) => (
    <ReactMarkdown
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        ul: ({ children }) => (
          <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal list-inside mb-2 space-y-1">
            {children}
          </ol>
        ),
        li: ({ children }) => <li className="ml-4">{children}</li>,
        strong: ({ children }) => (
          <strong className="font-semibold">{children}</strong>
        ),
        em: ({ children }) => <em className="italic">{children}</em>,
        code: ({ children }) => (
          <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">
            {children}
          </code>
        ),
        pre: ({ children }) => (
          <pre className="bg-muted p-2 rounded text-xs font-mono overflow-x-auto">
            {children}
          </pre>
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  )
);

MarkdownRenderer.displayName = 'MarkdownRenderer';
