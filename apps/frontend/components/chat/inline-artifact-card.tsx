'use client';

import { useState } from 'react';
import { cn } from '@vivexy/ui/utils';
import { ArtifactContent } from './artifact-content';
import type { Artifact } from '@vivexy/core/services/chat.service';
import { useChat } from '@vivexy/core/hooks/useChat';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@vivexy/ui/dropdown-menu';
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
  PPTX: '📁',
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
  const isBinary = ['PDF', 'DOCX', 'XLSX', 'PPTX'].includes(
    artifact.type?.toUpperCase() ?? ''
  );
  const [expanded, setExpanded] = useState(!isBinary);
  const { exportArtifact, isExporting } = useChat(artifact.chatId);

  const handleExport = async (format: 'pdf' | 'docx') => {
    if (!artifact.chatId) return;
    try {
      const blob = await exportArtifact({ artifactId: artifact.id, format });
      const downloadUrl = URL.createObjectURL(blob as Blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      const baseName = (
        artifact.filename ||
        artifact.title ||
        `artifact-${artifact.seq}`
      ).replace(/\.[^/.]+$/, '');
      a.download = `${baseName}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
    } catch (e) {
      console.error(`Failed to export artifact to ${format}`, e);
      alert(`Failed to export artifact to ${format.toUpperCase()}`);
    }
  };

  const handleDownload = () => {
    if (onDownload) {
      onDownload(artifact);
      return;
    }

    // If we have a direct S3 URL, use it
    if (artifact.url) {
      window.open(artifact.url, '_blank');
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
          {artifact.type === 'MD' ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  disabled={isExporting}
                  className={cn(
                    'p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground outline-none',
                    isExporting && 'opacity-50 cursor-not-allowed'
                  )}
                  title="Download / Export"
                  aria-label="Download artifact options"
                >
                  <Download className="w-4 h-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={handleDownload}
                  className="cursor-pointer"
                >
                  Download .md
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleExport('pdf')}
                  className="cursor-pointer"
                >
                  Export to .pdf
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleExport('docx')}
                  className="cursor-pointer"
                >
                  Export to .docx
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <button
              type="button"
              onClick={handleDownload}
              className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              title="Download"
              aria-label="Download artifact"
            >
              <Download className="w-4 h-4" />
            </button>
          )}
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
