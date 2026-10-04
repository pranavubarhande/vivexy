'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';
import {
  Github,
  GitBranch,
  Lock,
  Unlock,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  File,
  Folder,
  Loader2,
  Search,
  Link2,
  Link2Off,
  GitCommit,
  RefreshCw,
  Check,
  Radio,
  GitMerge,
  Terminal,
  LockKeyhole,
  X,
  Save,
  ArrowLeft,
  Code2,
  FolderOpen,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { cn } from '@vivexy/ui/utils';
import { Skeleton } from '@vivexy/ui/skeleton';
import { Badge } from '@vivexy/ui/badge';
import { platform } from '@vivexy/core/lib/platform';

const MonacoEditor = dynamic(
  () => import('@monaco-editor/react').then((m) => m.default),
  { ssr: false }
);
import {
  useGithubStatus,
  useLinkedRepos,
  useGithubRepos,
  useLinkRepo,
  useUnlinkRepo,
  useRepoCommits,
  useRepoBranches,
  useRepoContents,
  useFileContent,
} from '@vivexy/core/hooks/useGithub';
import {
  githubService,
  GithubContent,
  GithubRepo,
} from '@vivexy/core/services/github.service';
import type { GitContext } from '@vivexy/core/types/chat';

// ---------------------------------------------------------------------------
// GitHub File Tree Node (web)
// ---------------------------------------------------------------------------

interface FileTreeNodeProps {
  item: GithubContent;
  fullName: string;
  branch?: string;
  depth?: number;
  onOpenFile?: (path: string) => void;
  selectedFile?: string | null;
}

function FileTreeNode({
  item,
  fullName,
  branch,
  depth = 0,
  onOpenFile,
  selectedFile,
}: FileTreeNodeProps) {
  const [expanded, setExpanded] = useState(false);

  const { data: children, isLoading } = useRepoContents(
    fullName,
    item.path,
    branch,
    item.type === 'dir' && expanded
  );

  const isDir = item.type === 'dir';
  const isSelected = !isDir && selectedFile === item.path;

  return (
    <div>
      <button
        onClick={() =>
          isDir ? setExpanded((e) => !e) : onOpenFile?.(item.path)
        }
        className={cn(
          'flex items-center gap-1.5 w-full text-left py-0.5 rounded transition-colors text-xs',
          isSelected ? 'bg-primary/15 text-primary' : 'hover:bg-muted/60'
        )}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
      >
        {isDir ? (
          <>
            {isLoading ? (
              <Loader2
                size={11}
                className="animate-spin text-muted-foreground shrink-0"
              />
            ) : expanded ? (
              <ChevronDown
                size={11}
                className="text-muted-foreground shrink-0"
              />
            ) : (
              <ChevronRight
                size={11}
                className="text-muted-foreground shrink-0"
              />
            )}
            {expanded ? (
              <FolderOpen size={12} className="text-blue-400 shrink-0" />
            ) : (
              <Folder size={12} className="text-blue-400 shrink-0" />
            )}
          </>
        ) : (
          <>
            <span className="w-[11px] shrink-0" />
            <File
              size={12}
              className={cn(
                'shrink-0',
                isSelected ? 'text-primary' : 'text-muted-foreground'
              )}
            />
          </>
        )}
        <span className="truncate">{item.name}</span>
      </button>
      {isDir && expanded && children && (
        <div>
          {children.map((child) => (
            <FileTreeNode
              key={child.sha + child.path}
              item={child}
              fullName={fullName}
              branch={branch}
              depth={depth + 1}
              onOpenFile={onOpenFile}
              selectedFile={selectedFile}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root file tree for a GitHub repo
// ---------------------------------------------------------------------------

interface RepoFileTreeProps {
  fullName: string;
  branch?: string;
  onOpenFile?: (path: string) => void;
  selectedFile?: string | null;
}

function RepoFileTree({
  fullName,
  branch,
  onOpenFile,
  selectedFile,
}: RepoFileTreeProps) {
  const [enabled, setEnabled] = useState(false);
  const { data: contents, isLoading } = useRepoContents(
    fullName,
    '',
    branch,
    enabled
  );

  if (!enabled) {
    return (
      <button
        onClick={() => setEnabled(true)}
        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors px-2"
      >
        <Folder size={12} />
        Browse files
      </button>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-1 pt-1">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-4 w-full" />
        ))}
      </div>
    );
  }

  if (!contents?.length) {
    return <p className="text-xs text-muted-foreground">Empty repository</p>;
  }

  return (
    <div className="py-1">
      {contents.map((item) => (
        <FileTreeNode
          key={item.sha + item.path}
          item={item}
          fullName={fullName}
          branch={branch}
          onOpenFile={onOpenFile}
          selectedFile={selectedFile}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// GitHub file viewer (web) — Monaco read-only + copy
// ---------------------------------------------------------------------------

interface GithubFileViewerProps {
  fullName: string;
  branch: string;
  filePath: string;
  onClose: () => void;
  compact?: boolean;
}

function GithubFileViewer({
  fullName,
  branch,
  filePath,
  onClose,
  compact,
}: GithubFileViewerProps) {
  const { data, isLoading, error } = useFileContent(
    fullName,
    filePath,
    branch,
    true
  );
  const [copied, setCopied] = useState(false);

  const decoded = (() => {
    if (!data?.content) return null;
    try {
      return atob(data.content.replace(/\n/g, ''));
    } catch {
      return data.content;
    }
  })();

  const handleCopy = () => {
    if (decoded) {
      navigator.clipboard.writeText(decoded).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
    }
  };

  const fileName = filePath.split('/').pop() ?? filePath;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-b bg-muted/30 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          {!compact && (
            <button
              onClick={onClose}
              className="p-0.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft size={13} />
            </button>
          )}
          <Code2 size={12} className="text-muted-foreground shrink-0" />
          <span className="text-xs font-medium truncate">{fileName}</span>
          <span className="text-[10px] text-muted-foreground/60 truncate hidden sm:block">
            {branch}
          </span>
        </div>
        <button
          onClick={handleCopy}
          disabled={!decoded}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border hover:bg-muted transition-colors disabled:opacity-40 shrink-0"
        >
          {copied ? (
            <Check size={11} className="text-green-500" />
          ) : (
            <File size={11} />
          )}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        ) : error || !decoded ? (
          <div className="p-4 text-xs text-destructive">
            {error ? 'Failed to load file' : 'No content available'}
          </div>
        ) : (
          <MonacoEditor
            height="100%"
            language={getLanguage(filePath)}
            value={decoded}
            theme="vs-dark"
            options={{
              readOnly: true,
              fontSize: 12,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              lineNumbers: 'on',
              wordWrap: 'on',
              automaticLayout: true,
              padding: { top: 8, bottom: 8 },
            }}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Linked repo card (expandable)
// ---------------------------------------------------------------------------

interface LinkedRepoCardProps {
  repo: GithubRepo;
  activeContext: GitContext | null;
  onSetActive: (ctx: GitContext | null) => void;
  locked?: boolean;
}

function LinkedRepoCard({
  repo,
  activeContext,
  onSetActive,
  locked = false,
}: LinkedRepoCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [commitsEnabled, setCommitsEnabled] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState(repo.defaultBranch);
  const [openFile, setOpenFile] = useState<string | null>(null);
  const [filesFullscreen, setFilesFullscreen] = useState(false);
  const [lastBranch, setLastBranch] = useState(selectedBranch);

  // Derived-state reset: clear open file when branch changes (during render, not in an effect)
  if (lastBranch !== selectedBranch) {
    setLastBranch(selectedBranch);
    setOpenFile(null);
  }

  const isActive =
    activeContext?.type === 'github' &&
    activeContext.fullName === repo.fullName;

  const { data: commits, isLoading: commitsLoading } = useRepoCommits(
    repo.fullName,
    commitsEnabled
  );
  const { data: branches, isLoading: branchesLoading } = useRepoBranches(
    repo.fullName,
    expanded
  );
  const unlinkMutation = useUnlinkRepo();

  const handleUnlink = (e: React.MouseEvent) => {
    e.stopPropagation();
    unlinkMutation.mutate(repo.fullName);
  };

  const handleSetActive = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isActive && activeContext?.branch === selectedBranch) {
      onSetActive(null);
    } else {
      onSetActive({
        type: 'github',
        fullName: repo.fullName,
        branch: selectedBranch,
        remote: repo.htmlUrl,
      });
    }
  };

  return (
    <div
      className={cn(
        'border rounded-xl bg-background overflow-hidden transition-colors',
        isActive && 'border-primary/40 ring-1 ring-primary/20'
      )}
    >
      {/* Card header */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-start justify-between p-3 hover:bg-muted/30 transition-colors text-left"
        aria-expanded={expanded}
      >
        <div className="flex items-start gap-2 min-w-0 flex-1">
          {expanded ? (
            <ChevronDown
              size={14}
              className="text-muted-foreground shrink-0 mt-0.5"
            />
          ) : (
            <ChevronRight
              size={14}
              className="text-muted-foreground shrink-0 mt-0.5"
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">{repo.name}</span>
              {repo.private ? (
                <Badge
                  variant="secondary"
                  className="text-[10px] px-1.5 py-0 gap-1"
                >
                  <Lock size={9} /> Private
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 py-0 gap-1"
                >
                  <Unlock size={9} /> Public
                </Badge>
              )}
              {isActive && (
                <Badge className="text-[10px] px-1.5 py-0 gap-1 bg-primary/15 text-primary border-primary/30">
                  <Radio size={8} /> Active
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <GitBranch size={10} className="text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                {isActive ? activeContext!.branch : repo.defaultBranch}
              </span>
            </div>
            {repo.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                {repo.description}
              </p>
            )}
          </div>
        </div>
      </button>

      {/* Expanded section */}
      {expanded && (
        <div className="border-t px-4 py-3 space-y-4 bg-muted/10">
          {/* Actions row */}
          <div className="flex items-center gap-2 flex-wrap">
            <a
              href={repo.htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ExternalLink size={12} />
              View on GitHub
            </a>
            <span className="text-border">·</span>
            <button
              onClick={handleUnlink}
              disabled={unlinkMutation.isPending}
              className="flex items-center gap-1.5 text-xs text-destructive/70 hover:text-destructive transition-colors disabled:opacity-50"
            >
              {unlinkMutation.isPending ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Link2Off size={12} />
              )}
              Unlink
            </button>
          </div>

          {/* Branch selector */}
          {branchesLoading ? (
            <Skeleton className="h-7 w-40" />
          ) : branches && branches.length > 0 ? (
            <div className="flex items-center gap-2">
              <GitBranch size={12} className="text-muted-foreground shrink-0" />
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="text-xs bg-background border rounded-md px-2 py-1 outline-none focus:ring-1 focus:ring-primary/40"
              >
                {branches.map((b) => (
                  <option key={b.name} value={b.name}>
                    {b.name}
                    {b.protected ? ' (protected)' : ''}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {/* Set as active */}
          {locked ? (
            <div className="w-full flex items-center justify-center gap-2 py-1.5 rounded-lg text-xs border bg-muted/20 text-muted-foreground border-border/50 cursor-not-allowed select-none">
              <LockKeyhole size={11} />
              {isActive ? 'Locked to this chat' : 'Chat already has a repo'}
            </div>
          ) : (
            <button
              onClick={handleSetActive}
              className={cn(
                'w-full flex items-center justify-center gap-2 py-1.5 rounded-lg text-xs font-medium border transition-all',
                isActive && activeContext?.branch === selectedBranch
                  ? 'bg-primary/10 text-primary border-primary/30 hover:bg-primary/20'
                  : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted hover:text-foreground'
              )}
            >
              {isActive && activeContext?.branch === selectedBranch ? (
                <>
                  <Check size={11} /> Active context — click to deactivate
                </>
              ) : (
                <>
                  <Radio size={11} /> Set as active context
                </>
              )}
            </button>
          )}

          {/* Recent commits */}
          <div>
            <button
              onClick={() => setCommitsEnabled((e) => !e)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2"
            >
              <GitCommit size={12} />
              {commitsEnabled ? 'Hide commits' : 'Show recent commits'}
            </button>
            {commitsEnabled &&
              (commitsLoading ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : commits && commits.length > 0 ? (
                <div className="space-y-1.5">
                  {commits.slice(0, 5).map((commit) => (
                    <div
                      key={commit.sha}
                      className="flex items-start gap-2 text-xs"
                    >
                      <span className="font-mono text-[10px] text-muted-foreground shrink-0 mt-0.5">
                        {commit.sha.slice(0, 7)}
                      </span>
                      <span className="text-foreground/80 line-clamp-1 flex-1">
                        {commit.commit.message.split('\n')[0]}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No commits found
                </p>
              ))}
          </div>

          {/* Files — split view when a file is open, fullscreen overlay option */}
          <div>
            {/* Fullscreen overlay */}
            {filesFullscreen && (
              <div className="fixed inset-0 z-[60] bg-background flex flex-col">
                <div className="flex items-center gap-2 px-3 py-2.5 border-b shrink-0">
                  <FolderOpen
                    size={13}
                    className="text-muted-foreground shrink-0"
                  />
                  <span className="text-xs font-medium">{repo.name}</span>
                  <span className="text-[10px] text-muted-foreground/60">
                    {selectedBranch}
                  </span>
                  <div className="ml-auto flex items-center gap-1.5">
                    {openFile && (
                      <>
                        <span className="text-[10px] text-muted-foreground truncate max-w-[140px]">
                          {openFile.split('/').pop()}
                        </span>
                        <button
                          onClick={() => setOpenFile(null)}
                          className="p-0.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                        >
                          <X size={11} />
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => setFilesFullscreen(false)}
                      className="p-0.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                      title="Exit fullscreen"
                    >
                      <Minimize2 size={11} />
                    </button>
                  </div>
                </div>
                <div className="flex flex-1 min-h-0">
                  <div className="w-64 border-r overflow-y-auto custom-scrollbar shrink-0">
                    <RepoFileTree
                      fullName={repo.fullName}
                      branch={selectedBranch}
                      onOpenFile={setOpenFile}
                      selectedFile={openFile}
                    />
                  </div>
                  <div className="flex-1 min-w-0 overflow-hidden">
                    {openFile ? (
                      <GithubFileViewer
                        fullName={repo.fullName}
                        branch={selectedBranch}
                        filePath={openFile}
                        onClose={() => setOpenFile(null)}
                        compact
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full text-xs text-muted-foreground/50 select-none">
                        Select a file to view
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-medium text-muted-foreground">Files</p>
              <div className="flex items-center gap-1.5">
                {openFile && (
                  <>
                    <span className="text-[10px] text-muted-foreground truncate max-w-[100px]">
                      {openFile.split('/').pop()}
                    </span>
                    <button
                      onClick={() => setOpenFile(null)}
                      className="p-0.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                    >
                      <X size={11} />
                    </button>
                  </>
                )}
                <button
                  onClick={() => setFilesFullscreen((f) => !f)}
                  className="p-0.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                  title="Expand to fullscreen"
                >
                  <Maximize2 size={11} />
                </button>
              </div>
            </div>
            <div
              className={cn(
                'rounded-md border overflow-hidden',
                openFile ? 'flex h-[380px]' : ''
              )}
            >
              <div
                className={cn(
                  'bg-muted/20',
                  openFile
                    ? 'w-44 border-r shrink-0 overflow-y-auto custom-scrollbar py-1'
                    : 'py-1'
                )}
              >
                <RepoFileTree
                  fullName={repo.fullName}
                  branch={selectedBranch}
                  onOpenFile={setOpenFile}
                  selectedFile={openFile}
                />
              </div>
              {openFile && (
                <div className="flex-1 min-w-0 overflow-hidden">
                  <GithubFileViewer
                    fullName={repo.fullName}
                    branch={selectedBranch}
                    filePath={openFile}
                    onClose={() => setOpenFile(null)}
                    compact
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// All repos tab row
// ---------------------------------------------------------------------------

interface AllRepoRowProps {
  repo: {
    id: number;
    fullName: string;
    name: string;
    private: boolean;
    description: string | null;
    htmlUrl: string;
    updatedAt: string;
    language: string | null;
  };
  isLinked: boolean;
}

function AllRepoRow({ repo, isLinked }: AllRepoRowProps) {
  const linkMutation = useLinkRepo();
  const unlinkMutation = useUnlinkRepo();

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-muted/30 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-medium truncate">{repo.name}</span>
          <Badge
            variant={repo.private ? 'secondary' : 'outline'}
            className="text-[10px] px-1.5 py-0"
          >
            {repo.private ? 'Private' : 'Public'}
          </Badge>
          {repo.language && (
            <span className="text-[10px] text-muted-foreground">
              {repo.language}
            </span>
          )}
        </div>
        {repo.description && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
            {repo.description}
          </p>
        )}
        <p className="text-[10px] text-muted-foreground/60 mt-0.5">
          Updated {formatDate(repo.updatedAt)}
        </p>
      </div>
      <div className="shrink-0">
        {isLinked ? (
          <button
            onClick={() => unlinkMutation.mutate(repo.fullName)}
            disabled={unlinkMutation.isPending}
            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-50"
          >
            {unlinkMutation.isPending ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <Link2Off size={11} />
            )}
            Unlink
          </button>
        ) : (
          <button
            onClick={() => linkMutation.mutate(repo.fullName)}
            disabled={linkMutation.isPending}
            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
          >
            {linkMutation.isPending ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <Link2 size={11} />
            )}
            Link
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

type TabType = 'linked' | 'all';

interface GithubReposPanelProps {
  activeContext: GitContext | null;
  onContextChange: (ctx: GitContext | null) => void;
  /** When true the context is locked to the current chat and cannot be changed. */
  locked?: boolean;
}

// ---------------------------------------------------------------------------
// Desktop: git-tree-based file browser (branch-aware)
// ---------------------------------------------------------------------------

type GitItem = { name: string; type: 'file' | 'dir' };

function parseLsTree(output: string): GitItem[] {
  return output
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const tab = line.indexOf('\t');
      const name = line.slice(tab + 1);
      const objType = line.slice(0, tab).split(' ')[1];
      return { name, type: objType === 'tree' ? 'dir' : 'file' };
    });
}

interface GitTreeNodeProps {
  workspacePath: string;
  treeish: string;
  name: string;
  fullPath: string;
  depth: number;
  onOpenFile: (filePath: string) => void;
  selectedFile?: string | null;
}

function GitTreeNode({
  workspacePath,
  treeish,
  name,
  fullPath,
  depth,
  onOpenFile,
  selectedFile,
}: GitTreeNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<GitItem[] | null>(null);
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    if (children === null && !loading) {
      setLoading(true);
      try {
        const api = window.electronAPI!;
        const out = await api.gitExecAt!(workspacePath, ['ls-tree', treeish]);
        setChildren(parseLsTree(out));
      } catch {
        setChildren([]);
      } finally {
        setLoading(false);
      }
    }
    setExpanded((e) => !e);
  };

  return (
    <div>
      <button
        onClick={toggle}
        className="flex items-center gap-1.5 w-full text-left py-0.5 rounded hover:bg-muted/60 transition-colors text-xs"
        style={{ paddingLeft: `${8 + depth * 14}px` }}
      >
        {loading ? (
          <Loader2
            size={11}
            className="animate-spin text-muted-foreground shrink-0"
          />
        ) : expanded ? (
          <ChevronDown size={11} className="text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight size={11} className="text-muted-foreground shrink-0" />
        )}
        {expanded ? (
          <FolderOpen size={12} className="text-blue-400 shrink-0" />
        ) : (
          <Folder size={12} className="text-blue-400 shrink-0" />
        )}
        <span className="truncate text-foreground/80">{name}</span>
      </button>
      {expanded && children && (
        <div>
          {children.map((item) => {
            const childPath = `${fullPath}/${item.name}`.replace(/^\//, '');
            const branch = treeish.split(':')[0];
            const isSelected = selectedFile === childPath;
            return item.type === 'dir' ? (
              <GitTreeNode
                key={item.name}
                workspacePath={workspacePath}
                treeish={`${branch}:${childPath}`}
                name={item.name}
                fullPath={childPath}
                depth={depth + 1}
                onOpenFile={onOpenFile}
                selectedFile={selectedFile}
              />
            ) : (
              <button
                key={item.name}
                onClick={() => onOpenFile(childPath)}
                className={cn(
                  'flex items-center gap-1.5 w-full text-left py-0.5 rounded transition-colors text-xs',
                  isSelected
                    ? 'bg-primary/15 text-primary'
                    : 'hover:bg-muted/60'
                )}
                style={{ paddingLeft: `${8 + (depth + 1) * 14}px` }}
              >
                <span className="w-[11px] shrink-0" />
                <File
                  size={12}
                  className={cn(
                    'shrink-0',
                    isSelected ? 'text-primary' : 'text-muted-foreground'
                  )}
                />
                <span className="truncate">{item.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface GitFileBrowserProps {
  workspacePath: string;
  branch: string;
  onOpenFile: (filePath: string) => void;
  selectedFile?: string | null;
}

function GitFileBrowser({
  workspacePath,
  branch,
  onOpenFile,
  selectedFile,
}: GitFileBrowserProps) {
  const currentKey = `${workspacePath}:${branch}`;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [rootItems, setRootItems] = useState<GitItem[] | null>(null);

  // Derived: loading whenever the loaded key is behind the current key
  const loading = loadedKey !== currentKey;

  useEffect(() => {
    let cancelled = false;
    const api = window.electronAPI;
    if (!api?.gitExecAt) return;
    api
      .gitExecAt(workspacePath, ['ls-tree', branch])
      .then((out) => {
        if (!cancelled) {
          setRootItems(parseLsTree(out));
          setLoadedKey(`${workspacePath}:${branch}`);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRootItems([]);
          setLoadedKey(`${workspacePath}:${branch}`);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [workspacePath, branch]);

  if (loading)
    return (
      <div className="p-2 space-y-1">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-4 w-full" />
        ))}
      </div>
    );
  if (!rootItems?.length)
    return (
      <p className="text-xs text-muted-foreground p-2">Empty repository</p>
    );

  return (
    <div className="py-1">
      {rootItems.map((item) => {
        const childPath = item.name;
        const isSelected = selectedFile === childPath;
        return item.type === 'dir' ? (
          <GitTreeNode
            key={item.name}
            workspacePath={workspacePath}
            treeish={`${branch}:${childPath}`}
            name={item.name}
            fullPath={childPath}
            depth={0}
            onOpenFile={onOpenFile}
            selectedFile={selectedFile}
          />
        ) : (
          <button
            key={item.name}
            onClick={() => onOpenFile(childPath)}
            className={cn(
              'flex items-center gap-1.5 w-full text-left py-0.5 px-2 rounded transition-colors text-xs',
              isSelected ? 'bg-primary/15 text-primary' : 'hover:bg-muted/60'
            )}
          >
            <span className="w-[11px] shrink-0" />
            <File
              size={12}
              className={cn(
                'shrink-0',
                isSelected ? 'text-primary' : 'text-muted-foreground'
              )}
            />
            <span className="truncate">{item.name}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Monaco-based file editor
// ---------------------------------------------------------------------------

function getLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    py: 'python',
    rs: 'rust',
    go: 'go',
    java: 'java',
    cs: 'csharp',
    cpp: 'cpp',
    c: 'c',
    h: 'c',
    hpp: 'cpp',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'ini',
    md: 'markdown',
    mdx: 'markdown',
    txt: 'plaintext',
    html: 'html',
    css: 'css',
    scss: 'scss',
    less: 'less',
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
    sql: 'sql',
    graphql: 'graphql',
    proto: 'proto',
    xml: 'xml',
    svg: 'xml',
    dockerfile: 'dockerfile',
    env: 'plaintext',
    gitignore: 'plaintext',
  };
  return map[ext] ?? 'plaintext';
}

interface FileEditorProps {
  workspacePath: string;
  branch: string;
  filePath: string;
  onClose: () => void;
  /** When true, hides the back-arrow (parent controls closing) */
  compact?: boolean;
}

function FileEditor({
  workspacePath,
  branch,
  filePath,
  onClose,
  compact,
}: FileEditorProps) {
  const [content, setContent] = useState<string | null>(null);
  const [editedContent, setEditedContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isDirty = content !== null && editedContent !== content;

  useEffect(() => {
    setLoading(true);
    setError(null);
    const api = window.electronAPI;
    if (!api?.gitExecAt) {
      setLoading(false);
      setError('Not available');
      return;
    }
    // Read file content from git at the selected branch
    api
      .gitExecAt(workspacePath, ['show', `${branch}:${filePath}`])
      .then((raw) => {
        try {
          const parsed = JSON.parse(raw);
          if (parsed.error) {
            setError(parsed.error);
            return;
          }
        } catch {
          /* not JSON, it's file content */
        }
        setContent(raw);
        setEditedContent(raw);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [workspacePath, branch, filePath]);

  const handleSave = async () => {
    const api = window.electronAPI;
    if (!api?.writeWorkspaceFile) return;
    setSaving(true);
    try {
      const result = await api.writeWorkspaceFile(
        workspacePath,
        filePath,
        editedContent
      );
      if (result.error) {
        toast.error(`Save failed: ${result.error}`);
      } else {
        setContent(editedContent);
        toast.success('File saved');
      }
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSaving(false);
    }
  };

  const fileName = filePath.split('/').pop() ?? filePath;

  return (
    <div className="flex flex-col h-full">
      {/* Editor toolbar */}
      <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-b bg-muted/30 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          {!compact && (
            <button
              onClick={onClose}
              className="p-0.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft size={13} />
            </button>
          )}
          <Code2 size={12} className="text-muted-foreground shrink-0" />
          <span className="text-xs font-medium truncate">{fileName}</span>
          {isDirty && (
            <span
              className="w-1.5 h-1.5 rounded-full bg-primary shrink-0"
              title="Unsaved changes"
            />
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={!isDirty || saving}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
        >
          {saving ? (
            <Loader2 size={11} className="animate-spin" />
          ) : (
            <Save size={11} />
          )}
          Save
        </button>
      </div>

      {/* Editor body */}
      <div className="flex-1 min-h-0">
        {loading ? (
          <div className="p-4 space-y-2">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        ) : error ? (
          <div className="p-4 text-xs text-destructive">{error}</div>
        ) : (
          <MonacoEditor
            height="100%"
            language={getLanguage(filePath)}
            value={editedContent}
            onChange={(v) => setEditedContent(v ?? '')}
            theme="vs-dark"
            options={{
              fontSize: 12,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              lineNumbers: 'on',
              wordWrap: 'on',
              automaticLayout: true,
              padding: { top: 8, bottom: 8 },
            }}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Collapsible files section
// ---------------------------------------------------------------------------

interface CollapsibleFilesProps {
  workspacePath: string;
  branch: string;
}

function CollapsibleFiles({ workspacePath, branch }: CollapsibleFilesProps) {
  const [expanded, setExpanded] = useState(false);
  const [openFile, setOpenFile] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

  const fileName = openFile ? openFile.split('/').pop() : null;

  const fileSectionContent = (isFs: boolean) => (
    <div className={cn('flex', isFs ? 'flex-1 min-h-0' : 'h-[420px]')}>
      <div
        className={cn(
          'overflow-y-auto custom-scrollbar border-r shrink-0',
          isFs ? 'w-64' : 'w-44'
        )}
      >
        <GitFileBrowser
          workspacePath={workspacePath}
          branch={branch}
          onOpenFile={setOpenFile}
          selectedFile={openFile}
        />
      </div>
      <div className="flex-1 min-w-0 overflow-hidden">
        {openFile ? (
          <FileEditor
            workspacePath={workspacePath}
            branch={branch}
            filePath={openFile}
            onClose={() => setOpenFile(null)}
            compact
          />
        ) : (
          <div className="flex items-center justify-center h-full text-xs text-muted-foreground/50 select-none">
            Select a file to view
          </div>
        )}
      </div>
    </div>
  );

  const headerButtons = (isFs: boolean) => (
    <div className="flex items-center gap-1 shrink-0">
      {fileName && (
        <>
          <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">
            {fileName}
          </span>
          <button
            onClick={() => setOpenFile(null)}
            className="p-0.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title="Close file"
          >
            <X size={11} />
          </button>
        </>
      )}
      <button
        onClick={() => setFullscreen((f) => !f)}
        className="p-0.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
        title={isFs ? 'Exit fullscreen' : 'Expand to fullscreen'}
      >
        {isFs ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
      </button>
    </div>
  );

  return (
    <>
      {/* Fullscreen overlay */}
      {fullscreen && (
        <div className="fixed inset-0 z-[60] bg-background flex flex-col">
          <div className="flex items-center gap-2 px-3 py-2.5 border-b shrink-0">
            <FolderOpen size={13} className="text-muted-foreground shrink-0" />
            <span className="text-xs font-medium">Files</span>
            <span className="text-[10px] text-muted-foreground/60">
              {branch}
            </span>
            <div className="ml-auto">{headerButtons(true)}</div>
          </div>
          {fileSectionContent(true)}
        </div>
      )}

      {/* Inline card */}
      <div className="rounded-xl border bg-background overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2.5 hover:bg-muted/20 transition-colors">
          <button
            onClick={() => {
              setExpanded((e) => !e);
              if (expanded) setOpenFile(null);
            }}
            className="flex items-center gap-2 flex-1 text-left min-w-0"
          >
            {expanded ? (
              <ChevronDown
                size={12}
                className="text-muted-foreground shrink-0"
              />
            ) : (
              <ChevronRight
                size={12}
                className="text-muted-foreground shrink-0"
              />
            )}
            <FolderOpen size={13} className="text-muted-foreground shrink-0" />
            <span className="text-xs font-medium">Files</span>
            <span className="text-[10px] text-muted-foreground/60">
              {branch}
            </span>
          </button>
          {expanded && headerButtons(false)}
        </div>

        {expanded && !fullscreen && (
          <div className={cn('border-t', openFile ? '' : '')}>
            {openFile ? (
              fileSectionContent(false)
            ) : (
              <div className="max-h-60 overflow-y-auto custom-scrollbar py-1">
                <GitFileBrowser
                  workspacePath={workspacePath}
                  branch={branch}
                  onOpenFile={setOpenFile}
                  selectedFile={openFile}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Desktop local git view
// ---------------------------------------------------------------------------

type RepoInfo = {
  isGit: boolean;
  branch?: string;
  remote?: string;
  repoName?: string;
  workspacePath?: string;
};

function LocalGitPanel({
  activeContext,
  onContextChange,
}: GithubReposPanelProps) {
  const [repos, setRepos] = useState<RepoInfo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<RepoInfo | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [status, setStatus] = useState<string>('');
  const [log, setLog] = useState<string>('');
  const [logVisible, setLogVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const activeContextRef = useRef(activeContext);
  activeContextRef.current = activeContext;

  const loadRepoDetails = useCallback(async (repo: RepoInfo) => {
    const api = window.electronAPI;
    if (!api || !repo.isGit || !repo.workspacePath) return;
    const execAt =
      api.gitExecAt ?? ((wp: string, args: string[]) => api.gitExec(args));
    try {
      const branchOut = await execAt(repo.workspacePath, ['branch', '-a']);
      setBranches(
        branchOut
          .split('\n')
          .map((b) => b.replace(/^\*?\s+/, '').trim())
          .filter(Boolean)
      );
    } catch {
      setBranches([]);
    }
  }, []);

  const runDetect = useCallback(async () => {
    const api = window.electronAPI;
    if (!api?.detectGit) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const info = await api.detectGit();
      const found: RepoInfo[] =
        info.repos ?? (info.isGit ? [info as RepoInfo] : []);
      setRepos(found);

      if (found.length === 0) {
        setSelectedRepo(null);
        return;
      }

      // Prefer repo matching current active context, else first
      const cur = activeContextRef.current;
      const match =
        found.find((r) => r.workspacePath === cur?.workspacePath) ?? found[0];
      setSelectedRepo(match);

      if (match.isGit && match.branch) {
        onContextChange({
          type: 'local',
          repoName: match.repoName,
          branch: match.branch,
          remote: match.remote,
          workspacePath: match.workspacePath,
        });
        await loadRepoDetails(match);
      }
    } finally {
      setLoading(false);
    }
  }, [loadRepoDetails, onContextChange]);

  // Initial detection
  useEffect(() => {
    runDetect();
  }, [runDetect]);

  // React to workspace changes
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onWorkspaceChanged) return;
    const unsub = api.onWorkspaceChanged(() => {
      runDetect();
    });
    return unsub;
  }, [runDetect]);

  // Derive current branch early so effects can depend on it
  const currentBranch =
    (activeContext?.workspacePath === selectedRepo?.workspacePath
      ? activeContext?.branch
      : null) ??
    selectedRepo?.branch ??
    '';

  // Re-fetch status and reset log whenever branch or repo changes
  useEffect(() => {
    if (!selectedRepo?.workspacePath || !currentBranch) return;
    const api = window.electronAPI;
    if (!api?.gitExecAt) return;
    setLog('');
    setLogVisible(false);
    api
      .gitExecAt(selectedRepo.workspacePath, ['status', '--short', '--branch'])
      .then(setStatus)
      .catch(() => setStatus(''));
  }, [currentBranch, selectedRepo?.workspacePath]);

  const handleRepoSelect = async (repo: RepoInfo) => {
    setSelectedRepo(repo);
    setBranches([]);
    setStatus('');
    setLog('');
    setLogVisible(false);
    if (repo.isGit && repo.workspacePath) {
      onContextChange({
        type: 'local',
        repoName: repo.repoName,
        branch: repo.branch ?? '',
        remote: repo.remote,
        workspacePath: repo.workspacePath,
      });
      await loadRepoDetails(repo);
    }
  };

  const loadLog = async () => {
    const api = window.electronAPI;
    if (!api || !selectedRepo?.workspacePath) return;
    setLogVisible(true);
    const execAt =
      api.gitExecAt ?? ((_: string, args: string[]) => api.gitExec(args));
    try {
      const out = await execAt(selectedRepo.workspacePath, [
        'log',
        '--oneline',
        '--max-count=15',
      ]);
      setLog(out);
    } catch {
      setLog('');
    }
  };

  if (loading)
    return (
      <div className="p-4 space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-56" />
        <Skeleton className="h-3 w-48" />
      </div>
    );

  if (repos.length === 0)
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center gap-3">
        <GitMerge size={28} className="text-muted-foreground/40" />
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            Not a git repository
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Open a folder containing a git project as your workspace
          </p>
        </div>
        <button
          onClick={runDetect}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>
    );

  const repo = selectedRepo;

  return (
    <div className="flex flex-col h-full">
      {/* Repo selector (shown only when multiple repos found) */}
      {repos.length > 1 && (
        <div className="px-3 py-2 border-b shrink-0">
          <select
            value={repo?.workspacePath ?? ''}
            onChange={(e) => {
              const found = repos.find(
                (r) => r.workspacePath === e.target.value
              );
              if (found) handleRepoSelect(found);
            }}
            className="w-full text-xs bg-background border rounded-lg px-2 py-1.5 outline-none focus:ring-1 focus:ring-primary/40"
          >
            {repos.map((r) => (
              <option key={r.workspacePath} value={r.workspacePath}>
                {r.repoName} ({r.branch})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Refresh button */}
      <div className="flex justify-end px-3 py-1.5 border-b shrink-0">
        <button
          onClick={runDetect}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="Refresh"
        >
          <RefreshCw size={11} />
        </button>
      </div>

      {/* Single scrollable view */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-3 space-y-3">
        {/* Repo info card */}
        <div className="rounded-xl border bg-background p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Terminal size={14} className="text-primary shrink-0" />
            <span className="font-medium text-sm truncate">
              {repo?.repoName}
            </span>
            <Badge className="text-[10px] px-1.5 py-0 bg-primary/15 text-primary border-primary/30 shrink-0">
              Local
            </Badge>
          </div>
          {repo?.remote && (
            <p className="text-[10px] text-muted-foreground truncate">
              {repo.remote}
            </p>
          )}

          {/* Branch selector */}
          <div className="flex items-center gap-2">
            <GitBranch size={12} className="text-muted-foreground shrink-0" />
            <select
              value={currentBranch}
              onChange={(e) => {
                const b = e.target.value;
                onContextChange({
                  type: 'local',
                  repoName: repo?.repoName,
                  branch: b,
                  remote: repo?.remote,
                  workspacePath: repo?.workspacePath,
                });
              }}
              className="flex-1 text-xs bg-background border rounded-md px-2 py-1 outline-none focus:ring-1 focus:ring-primary/40"
            >
              {branches.length > 0 ? (
                branches.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))
              ) : (
                <option value={currentBranch}>{currentBranch}</option>
              )}
            </select>
          </div>
        </div>

        {/* Git status */}
        {status && (
          <div className="rounded-xl border bg-background p-3 space-y-1.5">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              Status
            </p>
            <pre className="text-xs font-mono text-foreground/80 whitespace-pre-wrap break-all">
              {status}
            </pre>
          </div>
        )}

        {/* Commit log */}
        <div className="rounded-xl border bg-background p-3">
          {!logVisible ? (
            <button
              onClick={loadLog}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <GitCommit size={12} /> Show recent commits
            </button>
          ) : (
            <>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
                Recent commits
              </p>
              <div className="space-y-1">
                {log
                  .split('\n')
                  .filter(Boolean)
                  .map((line, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <span className="font-mono text-[10px] text-muted-foreground shrink-0 mt-0.5">
                        {line.slice(0, 7)}
                      </span>
                      <span className="text-foreground/80 line-clamp-1">
                        {line.slice(8)}
                      </span>
                    </div>
                  ))}
              </div>
            </>
          )}
        </div>

        {/* Files — collapsible, branch-aware; remount on branch change to reset open file */}
        {repo?.workspacePath && (
          <CollapsibleFiles
            key={currentBranch}
            workspacePath={repo.workspacePath}
            branch={currentBranch}
          />
        )}
      </div>
    </div>
  );
}

export function GithubReposPanel({
  activeContext,
  onContextChange,
  locked = false,
}: GithubReposPanelProps) {
  const [tab, setTab] = useState<TabType>('linked');
  const [search, setSearch] = useState('');
  const [allReposEnabled, setAllReposEnabled] = useState(false);

  const { data: status, isLoading: statusLoading } = useGithubStatus();
  const { data: linkedRepos = [], isLoading: linkedLoading } = useLinkedRepos();
  const { data: allRepos = [], isLoading: allReposLoading } =
    useGithubRepos(allReposEnabled);

  const isConnected = status?.connected;

  const filteredAllRepos = allRepos.filter((r) =>
    (r.fullName ?? r.name ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const linkedFullNames = new Set(linkedRepos.map((r) => r.fullName));

  // On desktop, show local git panel instead
  if (platform.isDesktop) {
    return (
      <LocalGitPanel
        activeContext={activeContext}
        onContextChange={onContextChange}
        locked={locked}
      />
    );
  }

  const handleTabChange = (t: TabType) => {
    setTab(t);
    if (t === 'all') setAllReposEnabled(true);
  };

  const handleConnect = async () => {
    try {
      const { url } = await githubService.getAuthUrl();
      window.location.href = url;
    } catch {
      toast.error('Failed to get GitHub auth URL');
    }
  };

  if (statusLoading) {
    return (
      <div className="flex flex-col h-full p-4 space-y-3">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
          <Github size={26} className="text-muted-foreground/60" />
        </div>
        <p className="text-sm font-medium mb-1">GitHub not connected</p>
        <p className="text-xs text-muted-foreground mb-4">
          Connect your GitHub account to browse and manage repositories
        </p>
        <button
          onClick={handleConnect}
          className="flex items-center gap-2 text-sm px-4 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Github size={15} />
          Connect GitHub
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Active context banner */}
      {activeContext?.type === 'github' && (
        <div
          className={cn(
            'flex items-center justify-between gap-2 px-3 py-2 border-b shrink-0',
            locked
              ? 'bg-muted/40 border-border/50'
              : 'bg-primary/8 border-primary/20'
          )}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            {locked ? (
              <LockKeyhole
                size={11}
                className="text-muted-foreground shrink-0"
              />
            ) : (
              <Radio size={11} className="text-primary shrink-0" />
            )}
            <span
              className={cn(
                'text-xs font-medium truncate',
                locked ? 'text-muted-foreground' : 'text-primary'
              )}
            >
              {activeContext.fullName}
              <span className="font-normal opacity-70">
                {' '}
                · {activeContext.branch}
              </span>
            </span>
          </div>
          {locked ? (
            <span className="text-[10px] text-muted-foreground shrink-0">
              Locked
            </span>
          ) : (
            <button
              onClick={() => onContextChange(null)}
              className="text-[10px] text-muted-foreground hover:text-destructive transition-colors shrink-0"
              title="Clear active context"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-2 border-b shrink-0">
        {(['linked', 'all'] as TabType[]).map((t) => (
          <button
            key={t}
            onClick={() => handleTabChange(t)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
              tab === t
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            )}
          >
            {t === 'linked' ? (
              <>
                <Link2 size={11} />
                Linked
                {linkedRepos.length > 0 && (
                  <span className="ml-0.5 px-1.5 py-0 rounded-full bg-primary/20 text-primary text-[9px] font-bold">
                    {linkedRepos.length}
                  </span>
                )}
              </>
            ) : (
              <>
                <Github size={11} />
                All Repos
              </>
            )}
          </button>
        ))}
      </div>

      {/* Locked hint */}
      {locked && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted/30 border-b border-border/40 shrink-0">
          <LockKeyhole
            size={10}
            className="text-muted-foreground/70 shrink-0"
          />
          <span className="text-[10px] text-muted-foreground/70">
            Repo locked for this chat. Start a new chat to switch.
          </span>
        </div>
      )}

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
        {tab === 'linked' ? (
          <div className="p-3 space-y-2">
            {linkedLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="border rounded-xl p-3 space-y-2">
                    <Skeleton className="h-4 w-36" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                ))}
              </div>
            ) : linkedRepos.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Link2 size={24} className="text-muted-foreground/40 mb-3" />
                <p className="text-sm font-medium text-muted-foreground">
                  No linked repositories
                </p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  Switch to "All Repos" to link your repositories
                </p>
              </div>
            ) : (
              linkedRepos.map((repo) => (
                <LinkedRepoCard
                  key={repo.id}
                  repo={repo}
                  activeContext={activeContext}
                  onSetActive={onContextChange}
                  locked={locked}
                />
              ))
            )}
          </div>
        ) : (
          <div className="p-3 space-y-2">
            {/* Search */}
            <div className="relative">
              <Search
                size={13}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <input
                type="text"
                placeholder="Search repositories…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full text-xs pl-8 pr-3 py-2 bg-muted/40 border rounded-lg outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/30 transition-all"
              />
            </div>

            {/* Refresh */}
            <div className="flex items-center justify-end">
              <button
                onClick={() => setAllReposEnabled(true)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <RefreshCw size={11} />
                Refresh
              </button>
            </div>

            {allReposLoading ? (
              <div className="space-y-1">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="py-2.5 px-3 space-y-1.5">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-64" />
                  </div>
                ))}
              </div>
            ) : filteredAllRepos.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-xs">
                {search
                  ? 'No repositories match your search'
                  : 'No repositories found'}
              </div>
            ) : (
              <div>
                {filteredAllRepos.map((repo) => (
                  <AllRepoRow
                    key={repo.id}
                    repo={repo}
                    isLinked={linkedFullNames.has(repo.fullName)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
