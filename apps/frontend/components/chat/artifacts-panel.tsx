'use client';

import { useState } from 'react';
import { cn } from '@/utils/common';
import { ArtifactContent } from './artifact-content';

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

const TYPE_ICONS: Record<string, string> = {
  MD: '📝',
  HTML: '🌐',
  JS: '📜',
  JSON: '📋',
  CSV: '📊',
  TXT: '📄',
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
          'flex flex-col items-center justify-center p-6 text-center text-muted-foreground',
          className
        )}
      >
        <span className="text-4xl mb-2">📂</span>
        <p className="text-sm">No artifacts yet</p>
        <p className="text-xs mt-1">
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

    // Default download behavior
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
      {/* Artifact tabs */}
      <div className="flex gap-1 p-2 border-b overflow-x-auto">
        {artifacts.map((artifact) => (
          <button
            key={artifact.id}
            onClick={() => setSelectedId(artifact.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors',
              effectiveSelectedId === artifact.id
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-muted'
            )}
          >
            <span>{TYPE_ICONS[artifact.type] || '📄'}</span>
            <span className="max-w-[100px] truncate">
              {artifact.title || `Artifact ${artifact.seq}`}
            </span>
          </button>
        ))}
      </div>

      {/* Selected artifact content */}
      {selectedArtifact && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b bg-muted/30">
            <div>
              <h3 className="font-medium">
                {selectedArtifact.title || `Artifact ${selectedArtifact.seq}`}
              </h3>
              <p className="text-xs text-muted-foreground">
                {selectedArtifact.type} •{' '}
                {selectedArtifact.filename || 'untitled'}
              </p>
            </div>
            <button
              onClick={() => handleDownload(selectedArtifact)}
              className="text-xs px-2 py-1 rounded hover:bg-muted transition-colors"
            >
              ⬇ Download
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto p-4">
            <ArtifactContent artifact={selectedArtifact as never} />
          </div>
        </div>
      )}
    </div>
  );
}

// Compact artifact notification for inline display
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
      <span>{TYPE_ICONS[type] || '📄'}</span>
      <span className="font-medium">{title}</span>
      <span className="text-xs text-muted-foreground">View →</span>
    </button>
  );
}
