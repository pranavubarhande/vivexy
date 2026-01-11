import { Artifact } from '@prisma/client';
import ReactMarkdown from 'react-markdown';

export const ArtifactContent = ({ artifact }: { artifact: Artifact }) => {
  switch (artifact.type) {
    case 'MD':
      return (
        <div className="prose prose-sm max-w-none dark:prose-invert">
          <ReactMarkdown
            components={{
              h1: ({ children }) => (
                <h1 className="text-lg font-bold mb-3">{children}</h1>
              ),
              h2: ({ children }) => (
                <h2 className="text-base font-semibold mb-2">{children}</h2>
              ),
              h3: ({ children }) => (
                <h3 className="text-sm font-medium mb-2">{children}</h3>
              ),
              p: ({ children }) => <p className="mb-2">{children}</p>,
              ul: ({ children }) => (
                <ul className="list-disc list-inside mb-2 space-y-1">
                  {children}
                </ul>
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
                <pre className="bg-muted p-2 rounded text-xs font-mono overflow-x-auto mb-2">
                  {children}
                </pre>
              ),
            }}
          >
            {artifact.content}
          </ReactMarkdown>
        </div>
      );
    case 'HTML':
      return <div dangerouslySetInnerHTML={{ __html: artifact.content }} />;
    case 'JS':
    case 'JSON':
    case 'CSV':
    case 'TXT':
    default:
      return (
        <pre className="bg-muted p-2 rounded text-xs font-mono overflow-x-auto whitespace-pre-wrap">
          {artifact.content}
        </pre>
      );
  }
};
