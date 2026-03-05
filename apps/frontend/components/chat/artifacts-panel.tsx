'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { cn } from '@/utils/common';
import { ArtifactContent } from './artifact-content';
import { useChat } from '@/hooks/useChat';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const MarkdownEditor = dynamic(
  () => import('./markdown-editor').then((mod) => mod.MarkdownEditor),
  { ssr: false }
);
const SpreadsheetEditor = dynamic(
  () => import('./spreadsheet-editor').then((mod) => mod.SpreadsheetEditor),
  { ssr: false }
);
const MultiSheetEditor = dynamic(
  () => import('./multi-sheet-editor').then((mod) => mod.MultiSheetEditor),
  { ssr: false }
);
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
  version?: number;
  chatId?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: any;
}

interface ArtifactsPanelProps {
  artifacts: Artifact[];
  className?: string;
  onDownload?: (artifact: Artifact) => void;
  onSave?: (artifact: Artifact, newContent: string) => void;
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
  onSave,
}: ArtifactsPanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Determine an active chatId from the available artifacts.
  const activeChatId = artifacts.length > 0 ? artifacts[0].chatId : undefined;

  const { exportArtifact, isExporting } = useChat(activeChatId);

  // Group artifacts by filename or title
  const groupedArtifacts: Record<string, Artifact[]> = {};
  artifacts.forEach((a) => {
    const key = a.filename || a.title || `Untitled-${a.id}`;
    if (!groupedArtifacts[key]) groupedArtifacts[key] = [];
    groupedArtifacts[key].push(a);
  });

  const groups = Object.entries(groupedArtifacts).map(([key, list]) => {
    list.sort((a, b) => (a.version || 1) - (b.version || 1));
    return {
      key,
      latest: list[list.length - 1],
      versions: list,
    };
  });

  const effectiveSelectedId =
    selectedId && artifacts.some((a) => a.id === selectedId)
      ? selectedId
      : (groups[0]?.latest?.id ?? null);

  const selectedArtifact = artifacts.find((a) => a.id === effectiveSelectedId);
  const selectedGroup = groups.find((g) =>
    g.versions.some((v) => v.id === effectiveSelectedId)
  );

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
    if (artifact.type === 'XLSX' && artifact.metadata?.download_url) {
      window.open(artifact.metadata.download_url, '_blank');
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

  const handleExport = async (artifact: Artifact, format: 'pdf' | 'docx') => {
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

  const handleEditToggle = () => {
    if (isEditing) {
      setIsEditing(false);
    } else if (selectedArtifact) {
      setEditContent(selectedArtifact.content);
      setIsEditing(true);
    }
  };

  const handleSave = async () => {
    if (!selectedArtifact || !onSave) return;
    setIsSaving(true);
    try {
      await onSave(selectedArtifact, editContent);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Tabs */}
      <div className="flex gap-1 p-2 border-b overflow-x-auto no-scrollbar shrink-0">
        {groups.map((group) => {
          const isSelected = group.versions.some(
            (v) => v.id === effectiveSelectedId
          );
          return (
            <button
              key={group.key}
              onClick={() => {
                setSelectedId(group.latest.id);
                setIsEditing(false);
              }}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs whitespace-nowrap transition-all duration-300',
                isSelected
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
            >
              <span className="shrink-0">
                {TYPE_ICONS[group.latest.type] || <File size={13} />}
              </span>
              <span className="max-w-[110px] truncate">
                {group.latest.title || `Artifact ${group.latest.seq}`}
              </span>
            </button>
          );
        })}
      </div>

      {/* Content area */}
      {selectedArtifact && (
        <div className="flex-1 flex flex-col min-h-0 relative animate-in fade-in duration-300">
          {/* Artifact header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/20 shrink-0 transition-all flex-wrap gap-2">
            <div className="min-w-0 flex items-center gap-3">
              <div>
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

              {/* Version Selector */}
              {selectedGroup &&
                selectedGroup.versions.length > 1 &&
                !isEditing && (
                  <div className="flex items-center gap-1 bg-background border px-2 py-1 rounded-md shadow-sm opacity-90 hover:opacity-100 transition-opacity">
                    <select
                      value={selectedArtifact.id}
                      onChange={(e) => {
                        setSelectedId(e.target.value);
                        setIsEditing(false);
                      }}
                      className="text-[11px] font-medium bg-transparent border-none outline-none focus:ring-0 text-muted-foreground cursor-pointer"
                    >
                      {selectedGroup.versions.map((v) => (
                        <option key={v.id} value={v.id}>
                          Version {v.version || 1}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
            </div>

            <div className="flex items-center gap-1 shrink-0 ml-auto">
              {isEditing ? (
                <>
                  <button
                    onClick={handleEditToggle}
                    disabled={isSaving}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-lg hover:bg-muted transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90 px-2.5 py-1.5 rounded-lg transition-colors shadow-sm"
                  >
                    {isSaving ? 'Saving...' : 'Save'}
                  </button>
                </>
              ) : (
                <>
                  {onSave && (
                    <button
                      onClick={handleEditToggle}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-lg hover:bg-muted transition-colors"
                    >
                      Edit
                    </button>
                  )}
                  {selectedArtifact.type === 'MD' ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          disabled={isExporting}
                          className={cn(
                            'flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-lg hover:bg-muted transition-colors',
                            isExporting && 'opacity-50 cursor-not-allowed'
                          )}
                        >
                          <Download size={13} />
                          {isExporting ? 'Exporting...' : 'Download'}
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => handleDownload(selectedArtifact)}
                        >
                          Download .md
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleExport(selectedArtifact, 'pdf')}
                        >
                          Export to .pdf
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleExport(selectedArtifact, 'docx')}
                        >
                          Export to .docx
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <button
                      onClick={() => handleDownload(selectedArtifact)}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-lg hover:bg-muted transition-colors"
                    >
                      <Download size={13} />
                      Download
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto p-4 custom-scrollbar relative">
            {isEditing ? (
              selectedArtifact.type?.toUpperCase() === 'MD' ? (
                <MarkdownEditor
                  markdown={editContent}
                  onChange={setEditContent}
                />
              ) : selectedArtifact.type?.toUpperCase() === 'CSV' ? (
                <SpreadsheetEditor
                  csvData={editContent}
                  onChange={setEditContent}
                />
              ) : selectedArtifact.type?.toUpperCase() === 'XLSX' ? (
                <MultiSheetEditor
                  jsonData={editContent}
                  onChange={setEditContent}
                />
              ) : (
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full h-full min-h-[300px] resize-none outline-none border rounded-lg p-3 font-mono text-[13px] bg-background text-foreground focus:ring-1 focus:ring-primary/40 focus:border-primary/40 transition-colors custom-scrollbar"
                  placeholder="Edit artifact content..."
                />
              )
            ) : (
              <ArtifactContent artifact={selectedArtifact} />
            )}
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
