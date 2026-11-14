'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import { Checkbox } from '@vivexy/ui/checkbox';
import { Input } from '@vivexy/ui/input';
import type { StoredDocument } from '../../types/document';

interface DocumentPickerProps {
  documents: StoredDocument[];
  selectedIds: string[];
  onChange: (documentIds: string[]) => void;
  emptyMessage?: string;
}

/** A searchable checklist of ready documents. */
export const DocumentPicker = ({
  documents,
  selectedIds,
  onChange,
  emptyMessage = 'No documents are ready yet. Upload some first.',
}: DocumentPickerProps) => {
  const [filter, setFilter] = useState('');
  const ready = documents.filter((document) => document.status === 'ready');
  const shown = ready.filter((document) =>
    document.filename.toLowerCase().includes(filter.toLowerCase())
  );
  const allShownSelected =
    shown.length > 0 &&
    shown.every((document) => selectedIds.includes(document.id));

  const toggle = (documentId: string, checked: boolean) =>
    onChange(
      checked
        ? [...selectedIds, documentId]
        : selectedIds.filter((id) => id !== documentId)
    );

  const toggleAllShown = () => {
    const shownIds = shown.map((document) => document.id);
    onChange(
      allShownSelected
        ? selectedIds.filter((id) => !shownIds.includes(id))
        : [...new Set([...selectedIds, ...shownIds])]
    );
  };

  if (ready.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="rounded-md border border-border">
      <div className="flex items-center gap-2 border-b border-border p-2">
        <Checkbox
          checked={allShownSelected}
          onCheckedChange={toggleAllShown}
          aria-label="Select all shown documents"
        />
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Find a document"
            className="h-7 pl-7 text-sm"
          />
        </div>
      </div>
      <ul className="max-h-48 overflow-y-auto p-1">
        {shown.map((document) => (
          <li key={document.id}>
            <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
              <Checkbox
                checked={selectedIds.includes(document.id)}
                onCheckedChange={(checked) =>
                  toggle(document.id, checked === true)
                }
              />
              <span className="truncate">{document.filename}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
};
