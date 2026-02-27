'use client';

import { useState } from 'react';
import { cn } from '@/utils/common';
import { ArtifactContent } from './artifact-content';
import {
  FileText,
  Globe,
  Code2,
  FileJson,
  Table2,
  File,
  Download,
} from 'lucide-react';

interface Artifact {
  id: string;
  title: string | null;
  type: string;
  seq: number;
  content: string;
  filename: string | null;
  createdAt: string;
}

interface ArtifactsPanelProps {
  artifacts: Artifact[];
  className?: string;
  onDownload?: (artifact: Artifact) => void;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  MD: <FileText size={13} />,
  HTML: <Globe size={13} />,
  JS: <Code2 size={13} />,
  TS: <Code2 size={13} />,
  TSX: <Code2 size={13} />,
  JSX: <Code2 size={13} />,
  JSON: <FileJson size={13} />,
  CSV: <Table2 size={13} />,
  TXT: <File size={13} />,
};

const TYPE_LABELS: Record<string, string> = {
  MD: 'Markdown',
  HTML: 'HTML',
  JS: 'JavaScript',
  TS: 'TypeScript',
  TSX: 'React TSX',
  JSX: 'React JSX',
  JSON: 'JSON',
  CSV: 'CSV',
  TXT: 'Text',
};

export function ArtifactsPanel({
  artifacts,
  className,
  onDownload,
}: ArtifactsPanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const effectiveSelectedId =
    selectedId && artifacts.some((a) => a.id === selectedId)
      ? selectedId
      : (artifacts[0]?.id ?? null);

  const selectedArtifact = artifacts.find((a) => a.id === effectiveSelectedId);

  if (artifacts.length === 0) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center p-8 text-center text-muted-foreground h-full',
          className
        )}
      >
        <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-3">
          <File size={22} className="text-muted-foreground/60" />
        </div>
        <p className="text-sm font-medium">No artifacts yet</p>
        <p className="text-xs mt-1 text-muted-foreground/70">
          The agent will create files and reports here
        </p>
      </div>
    );
  }

  const handleDownload = (artifact: Artifact) => {
    if (onDownload) {
      onDownload(artifact);
      return;
    }
    const extension = artifact.type.toLowerCase();
    const filename =
      artifact.filename || `artifact-${artifact.seq}.${extension}`;
    const blob = new Blob([artifact.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Tabs */}
      <div className="flex gap-1 p-2 border-b overflow-x-auto no-scrollbar shrink-0">
        {artifacts.map((artifact) => (
          <button
            key={artifact.id}
            onClick={() => setSelectedId(artifact.id)}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs whitespace-nowrap transition-all',
              effectiveSelectedId === artifact.id
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            )}
          >
            <span className="shrink-0">
              {TYPE_ICONS[artifact.type] || <File size={13} />}
            </span>
            <span className="max-w-[110px] truncate">
              {artifact.title || `Artifact ${artifact.seq}`}
            </span>
          </button>
        ))}
      </div>

      {/* Content area */}
      {selectedArtifact && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Artifact header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/20 shrink-0">
            <div className="min-w-0">
              <h3 className="font-medium text-sm truncate">
                {selectedArtifact.title || `Artifact ${selectedArtifact.seq}`}
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {TYPE_LABELS[selectedArtifact.type] || selectedArtifact.type}
                {selectedArtifact.filename && (
                  <>
                    {' '}
                    ·{' '}
                    <span className="font-mono">
                      {selectedArtifact.filename}
                    </span>
                  </>
                )}
              </p>
            </div>
            <button
              onClick={() => handleDownload(selectedArtifact)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-lg hover:bg-muted transition-colors shrink-0 ml-2"
            >
              <Download size={13} />
              Download
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto p-4 custom-scrollbar">
            <ArtifactContent artifact={selectedArtifact as never} />
          </div>
        </div>
      )}
    </div>
  );
}

// Compact artifact notification
export function ArtifactNotification({
  title,
  type,
  onClick,
}: {
  title: string;
  type: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors text-sm"
    >
      <span className="shrink-0">{TYPE_ICONS[type] || <File size={13} />}</span>
      <span className="font-medium">{title}</span>
      <span className="text-xs text-muted-foreground">View →</span>
    </button>
  );
}
