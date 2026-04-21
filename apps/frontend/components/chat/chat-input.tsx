'use client';

import { useState, useRef, useCallback, useEffect, KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/common';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Plus,
  Paperclip,
  Blocks,
  Settings,
  SendHorizontal,
  Square,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { ROUTES } from '@/constants/routes';
import { FileUpload, UploadedFile } from './file-upload';
import { CommandPalette } from './command-palette';
import { useCommandPalette } from '@/hooks/useCommandPalette';

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
  const [files, setFiles] = useState<File[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [showUploader, setShowUploader] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

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

  const handleSubmit = useCallback(() => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage && uploadedFiles.length === 0 && files.length === 0)
      return;

    const unuploadedFiles = files.filter(
      (f) => !uploadedFiles.some((u) => u.filename === f.name)
    );
    onSend(
      trimmedMessage,
      uploadedFiles.length > 0 ? uploadedFiles : undefined,
      unuploadedFiles.length > 0 ? unuploadedFiles : undefined
    );
    setMessage('');
    setFiles([]);
    setUploadedFiles([]);
    setShowUploader(false);
    close();

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [message, uploadedFiles, files, onSend, close]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Command palette navigation takes priority
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

      // Detect / and @ triggers
      const cursor = e.target.selectionStart ?? value.length;
      handleTextChange(value, cursor);

      // Auto-resize
      const textarea = e.target;
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    },
    [handleTextChange]
  );

  // When message is updated externally (via selectItem's native setter dispatch),
  // we sync state by listening to the input event
  const handleNativeInput = useCallback(
    (e: React.FormEvent<HTMLTextAreaElement>) => {
      const ta = e.currentTarget;
      setMessage(ta.value);
      ta.style.height = 'auto';
      ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
    },
    []
  );

  const handleFilesSelected = useCallback(
    (newFiles: File[]) => {
      setFiles((prev) => [...prev, ...newFiles]);
      onFilesChange?.(files);
    },
    [files, onFilesChange]
  );

  const handleFilesUploaded = useCallback((uploaded: UploadedFile[]) => {
    setUploadedFiles((prev) => [...prev, ...uploaded]);
  }, []);

  return (
    <div className={cn('relative', className)}>
      {/* File upload panel */}
      {showUploader && showFileUpload && (
        <div className="mb-3 p-3 border rounded-lg bg-background">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Attach Files</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowUploader(false)}
              className="h-6 w-6 p-0"
            >
              ✕
            </Button>
          </div>
          <FileUpload
            onFilesSelected={handleFilesSelected}
            onFilesUploaded={handleFilesUploaded}
            chatId={chatId}
            disabled={disabled}
          />
        </div>
      )}

      {/* Input area */}
      <div
        ref={containerRef}
        className={cn(
          'relative flex items-end gap-2 p-2 bg-background',
          className ? 'rounded-2xl' : 'border rounded-lg shadow-sm'
        )}
      >
        {/* Command palette popup — rendered inside the relative container */}
        <CommandPalette
          palette={palette}
          onSelect={selectItem}
          anchorRef={containerRef}
        />

        {/* Plus menu */}
        {showFileUpload && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                className="relative h-9 w-9 p-0 shrink-0 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted"
                aria-label="Add attachment or file"
              >
                <Plus className="h-5 w-5" />
                {files.length + uploadedFiles.length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-primary text-primary-foreground text-[10px] font-medium rounded-full h-4 min-w-4 flex items-center justify-center">
                    {files.length + uploadedFiles.length}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top">
              <DropdownMenuItem
                onSelect={() => setShowUploader(true)}
                className="gap-2"
              >
                <Paperclip className="h-4 w-4" />
                Add files
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

        {/* Text input */}
        <textarea
          ref={textareaRef}
          value={message}
          onChange={handleTextareaChange}
          onInput={handleNativeInput}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className={cn(
            'flex-1 min-w-0 resize-none border-0 bg-transparent focus:outline-none focus:ring-0',
            'text-sm min-h-[40px] max-h-[200px] py-2 px-1',
            'placeholder:text-muted-foreground'
          )}
        />

        {/* Send / Stop button */}
        <Button
          onClick={isGenerating ? onStop : handleSubmit}
          disabled={
            !isGenerating &&
            (disabled ||
              (!message.trim() &&
                uploadedFiles.length === 0 &&
                files.length === 0))
          }
          variant="ghost"
          size="sm"
          className="h-9 w-9 p-0 shrink-0 rounded-full text-muted-foreground hover:text-foreground self-end"
        >
          {isGenerating ? (
            <Square className="h-4 w-4 fill-current" />
          ) : (
            <SendHorizontal className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Uploaded files indicator */}
      {uploadedFiles.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {uploadedFiles.map((file) => (
            <span
              key={file.id}
              className="inline-flex items-center gap-1 text-xs bg-muted px-2 py-1 rounded"
            >
              📎 {file.filename}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
