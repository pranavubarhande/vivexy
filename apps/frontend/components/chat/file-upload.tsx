'use client';

import { useState, useRef, useCallback } from 'react';
import { Button } from '@vivexy/ui/button';
import { cn } from '@vivexy/ui/utils';
import { useFileUpload } from '@/hooks/useChat';

interface FileUploadProps {
  onFilesSelected: (files: File[]) => void;
  onFilesUploaded?: (attachments: UploadedFile[]) => void;
  chatId?: string;
  maxFiles?: number;
  maxSizeMB?: number;
  acceptedTypes?: string[];
  disabled?: boolean;
}

export interface UploadedFile {
  id: string;
  filename: string;
  s3Key: string;
  mimeType: string;
  size: number;
}

interface UploadProgress {
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
  result?: UploadedFile;
}

export function FileUpload({
  onFilesSelected,
  onFilesUploaded,
  chatId,
  maxFiles = 5,
  maxSizeMB = 10,
  acceptedTypes = [
    'application/pdf',
    'text/plain',
    'text/csv',
    'application/json',
    'image/*',
  ],
  disabled = false,
}: FileUploadProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [uploads, setUploads] = useState<UploadProgress[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const maxSizeBytes = maxSizeMB * 1024 * 1024;

  const validateFile = useCallback(
    (file: File): string | null => {
      if (file.size > maxSizeBytes) {
        return `File too large (max ${maxSizeMB}MB)`;
      }
      const typeMatch = acceptedTypes.some((type) => {
        if (type.endsWith('/*')) {
          return file.type.startsWith(type.slice(0, -2));
        }
        return file.type === type;
      });
      if (!typeMatch) {
        return 'File type not supported';
      }
      return null;
    },
    [maxSizeBytes, maxSizeMB, acceptedTypes]
  );

  const handleFiles = useCallback(
    (newFiles: FileList | File[]) => {
      const fileArray = Array.from(newFiles);
      const validFiles: File[] = [];

      for (const file of fileArray) {
        if (files.length + validFiles.length >= maxFiles) {
          break;
        }
        const error = validateFile(file);
        if (!error) {
          validFiles.push(file);
        }
      }

      if (validFiles.length > 0) {
        const existingKeys = new Set(files.map((f) => `${f.name}:${f.size}`));
        const deduped = validFiles.filter(
          (f) => !existingKeys.has(`${f.name}:${f.size}`)
        );
        if (deduped.length > 0) {
          setFiles([...files, ...deduped]);
          onFilesSelected(deduped);
        }
      }
    },
    [files, maxFiles, validateFile, onFilesSelected]
  );

  const { uploadFile: apiUploadFile } = useFileUpload(chatId);

  const uploadAllFiles = async () => {
    if (!chatId || files.length === 0) return;

    const initialUploads: UploadProgress[] = files.map((file) => ({
      file,
      progress: 0,
      status: 'pending',
    }));
    setUploads(initialUploads);

    const results: UploadedFile[] = [];

    for (let i = 0; i < files.length; i++) {
      setUploads((prev) =>
        prev.map((u, idx) =>
          idx === i ? { ...u, status: 'uploading', progress: 50 } : u
        )
      );

      try {
        const result = await apiUploadFile(files[i]);

        setUploads((prev) =>
          prev.map((u, idx) =>
            idx === i
              ? {
                  ...u,
                  status: 'done',
                  progress: 100,
                  result: result,
                }
              : u
          )
        );
        results.push(result);
      } catch {
        setUploads((prev) =>
          prev.map((u, idx) =>
            idx === i
              ? {
                  ...u,
                  status: 'error',
                  progress: 100,
                  error: 'Upload failed',
                }
              : u
          )
        );
      }
    }

    if (onFilesUploaded && results.length > 0) {
      onFilesUploaded(results);
    }
  };

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setUploads((prev) => prev.filter((_, i) => i !== index));
  }, []);

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
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles]
  );

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          'border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer',
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/25 hover:border-muted-foreground/50',
          disabled && 'opacity-50 pointer-events-none'
        )}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={acceptedTypes.join(',')}
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
          className="hidden"
          disabled={disabled}
        />
        <div className="text-muted-foreground">
          <span className="text-2xl block mb-2">📎</span>
          <p className="text-sm">
            Drop files here or <span className="text-primary">browse</span>
          </p>
          <p className="text-xs mt-1">
            Max {maxFiles} files, {maxSizeMB}MB each
          </p>
        </div>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file, index) => {
            const upload = uploads[index];
            return (
              <div
                key={`${file.name}-${index}`}
                className="flex items-center gap-2 p-2 rounded-lg bg-muted/50"
              >
                <span className="text-lg">📄</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatSize(file.size)}
                    {upload?.status === 'uploading' && ' • Uploading...'}
                    {upload?.status === 'done' && ' • ✓ Uploaded'}
                    {upload?.status === 'error' && ` • ❌ ${upload.error}`}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeFile(index)}
                  className="h-6 w-6 p-0"
                  disabled={upload?.status === 'uploading'}
                >
                  ✕
                </Button>
              </div>
            );
          })}

          {/* Upload button */}
          {chatId &&
            files.length > 0 &&
            !uploads.some((u) => u.status === 'done') && (
              <Button
                onClick={uploadAllFiles}
                disabled={uploads.some((u) => u.status === 'uploading')}
                size="sm"
                className="w-full"
              >
                Upload {files.length} file{files.length > 1 ? 's' : ''}
              </Button>
            )}
        </div>
      )}
    </div>
  );
}

// Compact file attachment button for chat input
export function FileAttachButton({
  onClick,
  fileCount = 0,
  disabled = false,
}: {
  onClick: () => void;
  fileCount?: number;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      disabled={disabled}
      className="h-8 w-8 p-0 relative"
    >
      📎
      {fileCount > 0 && (
        <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-xs rounded-full h-4 w-4 flex items-center justify-center">
          {fileCount}
        </span>
      )}
    </Button>
  );
}
