'use client';

import { useState, useRef, useCallback, KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/common';
import { FileUpload, FileAttachButton, UploadedFile } from './file-upload';

interface ChatInputProps {
  onSend: (message: string, files?: UploadedFile[], rawFiles?: File[]) => void;
  onFilesChange?: (files: File[]) => void;
  chatId?: string;
  placeholder?: string;
  disabled?: boolean;
  showFileUpload?: boolean;
  className?: string;
}

export function ChatInput({
  onSend,
  onFilesChange,
  chatId,
  placeholder = 'Type a message...',
  disabled = false,
  showFileUpload = true,
  className,
}: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [showUploader, setShowUploader] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(() => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage && uploadedFiles.length === 0 && files.length === 0)
      return;

    // Pass uploaded files and raw files that haven't been uploaded yet
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

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [message, uploadedFiles, files, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    // Auto-resize textarea
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  };

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

      {/* Input area – no inner border when parent passes className (single bar look) */}
      <div
        className={cn(
          'flex items-end gap-2 p-2 bg-background',
          className ? 'rounded-2xl' : 'border rounded-lg shadow-sm'
        )}
      >
        {/* File attach button */}
        {showFileUpload && (
          <FileAttachButton
            onClick={() => setShowUploader(!showUploader)}
            fileCount={files.length}
            disabled={disabled}
          />
        )}

        {/* Text input */}
        <textarea
          ref={textareaRef}
          value={message}
          onChange={handleTextareaChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className={cn(
            'flex-1 resize-none border-0 bg-transparent focus:outline-none focus:ring-0',
            'text-sm min-h-[40px] max-h-[200px] py-2',
            'placeholder:text-muted-foreground'
          )}
        />

        {/* Send button */}
        <Button
          onClick={handleSubmit}
          disabled={
            disabled ||
            (!message.trim() &&
              uploadedFiles.length === 0 &&
              files.length === 0)
          }
          size="sm"
          className="h-8 px-3"
        >
          Send
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
}
