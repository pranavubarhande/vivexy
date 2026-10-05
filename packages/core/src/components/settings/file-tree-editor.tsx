'use client';

import { useState } from 'react';
import { Input } from '@vivexy/ui/input';
import { Textarea } from '@vivexy/ui/textarea';
import { Plus, FileText, X, ChevronRight } from 'lucide-react';

const CONTENT_PLACEHOLDER = `When the user asks to /my-skill, do the following:

1. Step one...
2. Step two...

Return the result as...`;

interface FileTreeEditorProps {
  skillName: string;
  files: Record<string, string>;
  onFilesChange: (files: Record<string, string>) => void;
}

export const FileTreeEditor = ({
  skillName,
  files,
  onFilesChange,
}: FileTreeEditorProps) => {
  const [selectedFile, setSelectedFile] = useState<string>('SKILL.md');
  const [newFileName, setNewFileName] = useState('');
  const [showNewFileInput, setShowNewFileInput] = useState(false);

  const allFiles: Record<string, string> = {
    'SKILL.md': files['SKILL.md'] ?? '',
    ...files,
  };
  const fileList = [
    'SKILL.md',
    ...Object.keys(files).filter((f) => f !== 'SKILL.md'),
  ];

  const handleContentChange = (content: string) => {
    onFilesChange({ ...files, [selectedFile]: content });
  };

  const addFile = () => {
    const name = newFileName.trim();
    if (!name) return;
    const safeName = name.endsWith('.md') ? name : `${name}.md`;
    if (allFiles[safeName] !== undefined) return;
    onFilesChange({ ...files, [safeName]: '' });
    setSelectedFile(safeName);
    setNewFileName('');
    setShowNewFileInput(false);
  };

  const removeFile = (filename: string) => {
    if (filename === 'SKILL.md') return;
    const next = { ...files };
    delete next[filename];
    onFilesChange(next);
    if (selectedFile === filename) setSelectedFile('SKILL.md');
  };

  return (
    <div className="flex h-[360px] border rounded-lg overflow-hidden">
      {/* Sidebar */}
      <div className="w-44 shrink-0 border-r bg-muted/30 flex flex-col">
        <div className="px-3 py-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wide border-b">
          Files
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {fileList.map((filename) => (
            <div
              key={filename}
              onClick={() => setSelectedFile(filename)}
              className={`group flex items-center gap-1.5 px-2 py-1.5 cursor-pointer text-xs rounded mx-1 ${
                selectedFile === filename
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'hover:bg-muted/60 text-foreground/80'
              }`}
            >
              <FileText className="h-3 w-3 shrink-0 opacity-60" />
              <span className="flex-1 truncate">{filename}</span>
              {filename !== 'SKILL.md' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(filename);
                  }}
                  className="opacity-0 group-hover:opacity-60 hover:opacity-100 h-3.5 w-3.5"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="border-t p-1.5">
          {showNewFileInput ? (
            <div className="flex gap-1">
              <Input
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addFile();
                  if (e.key === 'Escape') setShowNewFileInput(false);
                }}
                placeholder="filename.md"
                className="h-6 text-xs px-1.5"
                autoFocus
              />
              <button
                onClick={addFile}
                className="text-primary hover:text-primary/80"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowNewFileInput(true)}
              className="w-full flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-1 py-0.5"
            >
              <Plus className="h-3 w-3" />
              New file
            </button>
          )}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 flex flex-col">
        <div className="px-3 py-1.5 border-b bg-muted/20 text-xs text-muted-foreground font-mono">
          {skillName || 'my-skill'}/{selectedFile}
        </div>
        <Textarea
          value={allFiles[selectedFile] ?? ''}
          onChange={(e) => handleContentChange(e.target.value)}
          className="flex-1 border-0 rounded-none resize-none font-mono text-xs focus-visible:ring-0"
          placeholder={
            selectedFile === 'SKILL.md'
              ? CONTENT_PLACEHOLDER
              : `# ${selectedFile}\n\nAdd reference content here...`
          }
        />
      </div>
    </div>
  );
};
