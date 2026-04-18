'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/utils/common';
import { Zap, FileText } from 'lucide-react';
import type { PaletteState, CommandItem } from '@/hooks/useCommandPalette';

interface CommandPaletteProps {
  palette: PaletteState;
  onSelect: (item: CommandItem) => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}

export const CommandPalette = ({
  palette,
  onSelect,
  anchorRef,
}: CommandPaletteProps) => {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${palette.selectedIndex}"]`
    );
    el?.scrollIntoView({ block: 'nearest' });
  }, [palette.selectedIndex]);

  if (!palette.open || typeof window === 'undefined') return null;

  const isSkill = palette.trigger === '/';

  // Header label
  const label = isSkill
    ? palette.query
      ? `Skills matching "/${palette.query}"`
      : 'Skills'
    : palette.query
      ? `Files matching "${palette.query}"`
      : 'Workspace files';

  // Empty-state hint
  const emptyHint = isSkill
    ? {
        icon: <Zap className="h-4 w-4 text-muted-foreground/50" />,
        line1: 'No skills installed',
        line2: (
          <>
            Go to{' '}
            <strong className="font-medium text-foreground/80">
              Settings → Extensions → Skills
            </strong>{' '}
            to install skills.
          </>
        ),
      }
    : {
        icon: <FileText className="h-4 w-4 text-muted-foreground/50" />,
        line1: 'No workspace files found',
        line2: 'Select a project folder in the workspace picker.',
      };

  // Calculate fixed position from the anchor element so the portal renders
  // above the chat input regardless of any overflow:hidden ancestors.
  let fixedStyle: React.CSSProperties = { display: 'none' };
  if (anchorRef.current) {
    const rect = anchorRef.current.getBoundingClientRect();
    fixedStyle = {
      position: 'fixed',
      bottom: window.innerHeight - rect.top + 8,
      left: rect.left,
      width: Math.min(rect.width, 448),
      zIndex: 9999,
    };
  }

  return createPortal(
    <div
      style={fixedStyle}
      className={cn(
        'rounded-xl border bg-popover text-popover-foreground shadow-lg',
        'overflow-hidden'
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b bg-muted/40">
        {isSkill ? (
          <Zap className="h-3.5 w-3.5 text-primary" />
        ) : (
          <FileText className="h-3.5 w-3.5 text-primary" />
        )}
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
        {palette.filteredItems.length > 0 && (
          <span className="ml-auto text-[10px] text-muted-foreground/60">
            ↑↓ navigate · Enter select · Esc close
          </span>
        )}
      </div>

      {palette.filteredItems.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center gap-1.5 px-4 py-5 text-center">
          {emptyHint.icon}
          <p className="text-xs font-medium text-muted-foreground">
            {emptyHint.line1}
          </p>
          <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
            {emptyHint.line2}
          </p>
        </div>
      ) : (
        /* Items list */
        <div ref={listRef} className="max-h-52 overflow-y-auto py-1">
          {palette.filteredItems.map((item, idx) => (
            <button
              key={item.id}
              data-index={idx}
              className={cn(
                'w-full flex items-start gap-2.5 px-3 py-2 text-left hover:bg-accent hover:text-accent-foreground transition-colors',
                idx === palette.selectedIndex &&
                  'bg-accent text-accent-foreground'
              )}
              onMouseDown={(e) => {
                e.preventDefault(); // prevent textarea blur
                onSelect(item);
              }}
            >
              <span className="shrink-0 mt-0.5">
                {item.type === 'skill' ? (
                  <Zap className="h-3.5 w-3.5 text-primary" />
                ) : (
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </span>
              <div className="min-w-0">
                <span className="text-sm font-mono font-medium truncate block">
                  {item.label}
                </span>
                {item.description && (
                  <span className="text-xs text-muted-foreground truncate block">
                    {item.description}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body
  );
};
