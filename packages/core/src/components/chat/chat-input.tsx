'use client';

import { useState, useRef, useCallback, useEffect, KeyboardEvent } from 'react';
import { Button } from '@vivexy/ui/button';
import { cn } from '@vivexy/ui/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@vivexy/ui/dropdown-menu';
import {
  Plus,
  Paperclip,
  Blocks,
  Settings,
  SendHorizontal,
  Square,
  X,
  Loader2,
  FileText,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { ROUTES } from '@vivexy/core/constants/routes';
import { UploadedFile } from './file-upload';
import { CommandPalette } from './command-palette';
import { useCommandPalette } from '@vivexy/core/hooks/useCommandPalette';
import { useFileUpload } from '@vivexy/core/hooks/useChat';

// ---------------------------------------------------------------------------
// Per-file state while chips live inside the input
// ---------------------------------------------------------------------------

interface PendingFile {
  id: string; // temp id before upload, replaced by server id after
  file: File;
  previewUrl?: string; // objectUrl for images
  status: 'uploading' | 'done' | 'error';
  uploaded?: UploadedFile; // set once upload completes
}

// ---------------------------------------------------------------------------

const ACCEPTED = [
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/json',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
];

const MAX_SIZE_MB = 10;
const MAX_FILES = 5;

// ---------------------------------------------------------------------------

interface ChatInputProps {
  onSend: (message: string, files?: UploadedFile[], rawFiles?: File[]) => void;
  onStop?: () => void;
  onFilesChange?: (files: File[]) => void;
  chatId?: string;
  placeholder?: string;
  disabled?: boolean;
  isGenerating?: boolean;
  showFileUpload?: boolean;
  className?: string;
  fillValue?: string;
}

export const ChatInput = ({
  onSend,
  onStop,
  onFilesChange,
  chatId,
  placeholder = 'Type a message... (/ for skills, @ for files)',
  disabled = false,
  isGenerating = false,
  showFileUpload = true,
  className,
  fillValue,
}: ChatInputProps) => {
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const { uploadFile } = useFileUpload(chatId);

  useEffect(() => {
    if (!fillValue) return;
    setTimeout(() => {
      setMessage(fillValue);
      const ta = textareaRef.current;
      if (!ta) return;
      ta.style.height = 'auto';
      ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
      ta.focus();
      ta.setSelectionRange(fillValue.length, fillValue.length);
    }, 0);
  }, [fillValue]);

  const { palette, selectItem, moveSelection, close, handleTextChange } =
    useCommandPalette(textareaRef);

  // ── File handling ──────────────────────────────────────────────────────────

  const addFiles = useCallback(
    async (rawFiles: File[]) => {
      const toAdd = rawFiles
        .filter((f) => {
          if (f.size > MAX_SIZE_MB * 1024 * 1024) return false;
          return ACCEPTED.some((t) =>
            t.endsWith('/*') ? f.type.startsWith(t.slice(0, -2)) : f.type === t
          );
        })
        .slice(0, MAX_FILES - pending.length);

      if (!toAdd.length) return;

      const newPending: PendingFile[] = toAdd.map((file) => ({
        id: `pending-${Date.now()}-${Math.random()}`,
        file,
        previewUrl: file.type.startsWith('image/')
          ? URL.createObjectURL(file)
          : undefined,
        status: 'uploading' as const,
      }));

      setPending((prev) => [...prev, ...newPending]);
      onFilesChange?.(toAdd);

      if (chatId) {
        // Auto-upload when chatId is known
        for (const item of newPending) {
          try {
            const result = await uploadFile(item.file);
            setPending((prev) =>
              prev.map((p) =>
                p.id === item.id
                  ? { ...p, status: 'done', uploaded: result }
                  : p
              )
            );
          } catch {
            setPending((prev) =>
              prev.map((p) =>
                p.id === item.id ? { ...p, status: 'error' } : p
              )
            );
          }
        }
      } else {
        // No chatId yet — mark done immediately (will be sent as rawFiles)
        setPending((prev) =>
          prev.map((p) =>
            newPending.find((n) => n.id === p.id) ? { ...p, status: 'done' } : p
          )
        );
      }
    },
    [pending.length, chatId, uploadFile, onFilesChange]
  );

  const removeFile = useCallback((id: string) => {
    setPending((prev) => {
      const removed = prev.find((p) => p.id === id);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  }, []);

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(() => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage && pending.length === 0) return;

    const uploadedFiles = pending
      .filter((p) => p.status === 'done' && p.uploaded)
      .map((p) => p.uploaded!);

    const rawFiles = pending
      .filter((p) => p.status === 'done' && !p.uploaded)
      .map((p) => p.file);

    onSend(
      trimmedMessage,
      uploadedFiles.length > 0 ? uploadedFiles : undefined,
      rawFiles.length > 0 ? rawFiles : undefined
    );

    setMessage('');
    setPending((prev) => {
      prev.forEach((p) => {
        if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
      });
      return [];
    });
    close();

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [message, pending, onSend, close]);

  // ── Keyboard ───────────────────────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (palette.open) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          moveSelection(1);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          moveSelection(-1);
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          const item = palette.filteredItems[palette.selectedIndex];
          if (item) selectItem(item);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          close();
          return;
        }
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [palette, moveSelection, selectItem, close, handleSubmit]
  );

  const handleTextareaChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setMessage(value);
      const cursor = e.target.selectionStart ?? value.length;
      handleTextChange(value, cursor);
      const textarea = e.target;
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    },
    [handleTextChange]
  );

  const handleNativeInput = useCallback(
    (e: React.FormEvent<HTMLTextAreaElement>) => {
      const ta = e.currentTarget;
      setMessage(ta.value);
      ta.style.height = 'auto';
      ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
    },
    []
  );

  // ── Drag-and-drop on the whole input area ──────────────────────────────────

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files.length > 0) {
        addFiles(Array.from(e.dataTransfer.files));
      }
    },
    [addFiles]
  );

  const canSend = isGenerating || !!message.trim() || pending.length > 0;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className={cn('relative', className)}
      onDragOver={showFileUpload ? handleDragOver : undefined}
      onDragLeave={showFileUpload ? handleDragLeave : undefined}
      onDrop={showFileUpload ? handleDrop : undefined}
    >
      {/* Hidden file input */}
      {showFileUpload && (
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED.join(',')}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) {
              addFiles(Array.from(e.target.files));
              e.target.value = '';
            }
          }}
        />
      )}

      <div
        ref={containerRef}
        className={cn(
          'relative flex flex-col bg-background transition-colors',
          className ? 'rounded-2xl' : 'border rounded-lg shadow-sm',
          isDragging && 'ring-2 ring-primary/40 border-primary/40'
        )}
      >
        {/* Drag overlay hint */}
        {isDragging && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-inherit bg-primary/5 pointer-events-none">
            <p className="text-sm font-medium text-ink">Drop files here</p>
          </div>
        )}

        {/* Command palette */}
        <CommandPalette
          palette={palette}
          onSelect={selectItem}
          anchorRef={containerRef}
        />

        {/* ── Inline file chips ── */}
        {pending.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto px-3 pt-2.5 pb-1 no-scrollbar">
            {pending.map((item) => {
              const isImage = item.file.type.startsWith('image/');
              return (
                <div
                  key={item.id}
                  className={cn(
                    'group relative flex shrink-0 items-center gap-1.5 rounded-md border text-[11px] transition-colors',
                    isImage
                      ? 'h-8 w-8 overflow-hidden border-border/50 bg-muted p-0'
                      : 'h-8 max-w-[150px] border-border/50 bg-muted/60 px-2'
                  )}
                  title={item.file.name}
                >
                  {/* Image chip */}
                  {isImage && item.previewUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.previewUrl}
                      alt={item.file.name}
                      className="h-full w-full object-cover"
                    />
                  )}

                  {/* Document chip */}
                  {!isImage && (
                    <>
                      {item.status === 'uploading' ? (
                        <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
                      ) : (
                        <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
                      )}
                      <span className="min-w-0 truncate text-foreground/80">
                        {item.file.name}
                      </span>
                    </>
                  )}

                  {/* Upload spinner overlay for images */}
                  {isImage && item.status === 'uploading' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/25 rounded-md">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-white" />
                    </div>
                  )}

                  {/* Remove button — always visible on hover */}
                  <button
                    type="button"
                    onClick={() => removeFile(item.id)}
                    className={cn(
                      'absolute flex items-center justify-center rounded-full bg-background border border-border/60 shadow-sm',
                      'opacity-0 group-hover:opacity-100 transition-opacity',
                      isImage
                        ? 'h-3.5 w-3.5 -top-1 -right-1'
                        : 'h-3.5 w-3.5 -top-1 -right-1'
                    )}
                  >
                    <X className="h-2 w-2" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Textarea row ── */}
        <div className="flex items-end gap-2 p-2">
          {/* Plus menu */}
          {showFileUpload && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  className="relative h-9 w-9 shrink-0 rounded-full p-0 text-muted-foreground hover:text-foreground hover:bg-muted"
                  aria-label="Add attachment or file"
                >
                  <Plus className="h-5 w-5" />
                  {pending.length > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
                      {pending.length}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="top">
                <DropdownMenuItem
                  onSelect={() => fileInputRef.current?.click()}
                  className="gap-2"
                >
                  <Paperclip className="h-4 w-4" />
                  Attach files
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => router.push(ROUTES.connectors)}
                  className="gap-2"
                >
                  <Blocks className="h-4 w-4" />
                  Connect Integrations
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() =>
                    router.push(`${ROUTES.settings}?tab=extensions`)
                  }
                  className="gap-2"
                >
                  <Settings className="h-4 w-4" />
                  Extensions & Skills
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <textarea
            ref={textareaRef}
            value={message}
            onChange={handleTextareaChange}
            onInput={handleNativeInput}
            onKeyDown={handleKeyDown}
            placeholder={isDragging ? 'Drop files here…' : placeholder}
            disabled={disabled}
            rows={1}
            className={cn(
              'flex-1 min-w-0 resize-none border-0 bg-transparent focus:outline-none focus:ring-0',
              'text-sm min-h-[40px] max-h-[200px] py-2 px-1',
              'placeholder:text-muted-foreground'
            )}
          />

          <Button
            onClick={isGenerating ? onStop : handleSubmit}
            disabled={!isGenerating && (disabled || !canSend)}
            variant="ghost"
            size="sm"
            className="h-9 w-9 shrink-0 rounded-full p-0 text-muted-foreground hover:text-foreground"
          >
            {isGenerating ? (
              <Square className="h-4 w-4 fill-current" />
            ) : (
              <SendHorizontal className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};
