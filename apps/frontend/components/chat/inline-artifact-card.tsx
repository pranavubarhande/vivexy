'use client';

import { useState } from 'react';
import { cn } from '@/utils/common';
import { ArtifactContent } from './artifact-content';
import type { Artifact } from '@/services/chat.service';
import { ChevronDown, ChevronUp, Download, Sparkles } from 'lucide-react';

const TYPE_ICONS: Record<string, string> = {
  MD: '📝',
  MARKDOWN: '📝',
  HTML: '🌐',
  JS: '📜',
  JSON: '📋',
  CSV: '📊',
  TXT: '📄',
  PDF: '📕',
  DOCX: '📘',
  XLSX: '📗',
};

interface InlineArtifactCardProps {
  artifact: Artifact;
  onDownload?: (artifact: Artifact) => void;
  className?: string;
}

export function InlineArtifactCard({
  artifact,
  onDownload,
  className,
}: InlineArtifactCardProps) {
  const [expanded, setExpanded] = useState(true);

  const handleDownload = () => {
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
    <div
      className={cn(
        'rounded-xl border border-border bg-card text-card-foreground shadow-sm overflow-hidden',
        'animate-in fade-in slide-in-from-bottom-2 duration-300',
        className
      )}
    >
      {/* Header – reference style: title + "Interactive artifact" */}
      <div className="flex items-start justify-between gap-2 p-4 pb-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-foreground truncate">
            {artifact.title || `Artifact ${artifact.seq}`}
          </h3>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
            <Sparkles className="w-3.5 h-3.5" aria-hidden />
            Interactive artifact
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={handleDownload}
            className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title="Download"
            aria-label="Download artifact"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title={expanded ? 'Collapse' : 'Expand'}
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Content – collapsible, scrollable */}
      {expanded && (
        <div className="px-4 pb-4 pt-3 max-h-[360px] overflow-auto border-t border-border/50 mt-2 custom-scrollbar">
          <ArtifactContent artifact={artifact} />
        </div>
      )}

      {!expanded && (
        <div className="px-4 pb-3 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {TYPE_ICONS[artifact.type?.toUpperCase() ?? ''] || '📄'}{' '}
            {artifact.type || 'File'}
            {artifact.filename && ` · ${artifact.filename}`}
          </span>
        </div>
      )}
    </div>
  );
}
