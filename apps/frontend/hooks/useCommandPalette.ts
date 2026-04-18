'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { SkillConfig } from '@/types/electron';

export type CommandType = 'skill' | 'file';

export interface CommandItem {
  type: CommandType;
  /** For skills: the skill name (without /). For files: filename. */
  id: string;
  label: string;
  description?: string;
  /** The text that will be inserted into the textarea when selected */
  insertText: string;
}

export interface PaletteState {
  open: boolean;
  trigger: '@' | '/' | null;
  /** The partial query the user has typed after the trigger character */
  query: string;
  /** Cursor position in the textarea where the trigger was typed */
  triggerIndex: number;
  items: CommandItem[];
  filteredItems: CommandItem[];
  selectedIndex: number;
}

const INITIAL_STATE: PaletteState = {
  open: false,
  trigger: null,
  query: '',
  triggerIndex: -1,
  items: [],
  filteredItems: [],
  selectedIndex: 0,
};

/**
 * Detects when the user types `/` or `@` in a textarea and manages a
 * command palette popup. Returns state and handlers to wire up to the input.
 *
 * `/` → shows skills picker (slash commands)
 * `@` → shows workspace file picker (context mentions)
 */
export const useCommandPalette = (
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
) => {
  const [palette, setPalette] = useState<PaletteState>(INITIAL_STATE);
  const skillsRef = useRef<CommandItem[]>([]);
  const filesRef = useRef<CommandItem[]>([]);
  const isDesktop = typeof window !== 'undefined' && !!window.electronAPI;

  // Load skills (desktop only), and refresh the open palette if it's showing skills.
  const loadSkills = useCallback(async () => {
    const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
    if (!api) return;
    try {
      const list = await api.getSkills();
      const items: CommandItem[] = list
        .filter((s: SkillConfig) => s.enabled)
        .map((s: SkillConfig) => ({
          type: 'skill' as CommandType,
          id: s.name,
          label: `/${s.name}`,
          description: s.description,
          insertText: `/${s.name} `,
        }));
      skillsRef.current = items;
      // If the palette is currently open on '/', refresh its items
      setPalette((prev) => {
        if (!prev.open || prev.trigger !== '/') return prev;
        const filtered = items.filter(
          (item) =>
            item.label.toLowerCase().includes(prev.query.toLowerCase()) ||
            (item.description ?? '')
              .toLowerCase()
              .includes(prev.query.toLowerCase())
        );
        return { ...prev, items, filteredItems: filtered };
      });
    } catch {
      // non-desktop, ignore
    }
  }, []);

  // Load workspace files (desktop only), and refresh the open palette if it's showing files.
  const loadFiles = useCallback(async () => {
    const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
    if (!api) return;
    try {
      const raw = await api.listWorkspaceFiles();
      const entries: Array<{ name: string; type: string; path: string }> =
        JSON.parse(raw);
      const items: CommandItem[] = entries
        .filter((e) => e.type === 'file')
        .map((e) => ({
          type: 'file' as CommandType,
          id: e.name,
          label: e.name,
          description: e.path,
          insertText: `@${e.name} `,
        }));
      filesRef.current = items;
      // If the palette is currently open on '@', refresh its items
      setPalette((prev) => {
        if (!prev.open || prev.trigger !== '@') return prev;
        const filtered = items.filter(
          (item) =>
            item.label.toLowerCase().includes(prev.query.toLowerCase()) ||
            (item.description ?? '')
              .toLowerCase()
              .includes(prev.query.toLowerCase())
        );
        return { ...prev, items, filteredItems: filtered };
      });
    } catch {
      // non-desktop or no workspace, ignore
    }
  }, []);

  useEffect(() => {
    loadSkills();
    loadFiles();
  }, [loadSkills, loadFiles]);

  const close = useCallback(() => {
    setPalette(INITIAL_STATE);
  }, []);

  const open = useCallback((trigger: '@' | '/', triggerIndex: number) => {
    const items = trigger === '/' ? skillsRef.current : filesRef.current;
    setPalette({
      open: true,
      trigger,
      query: '',
      triggerIndex,
      items,
      filteredItems: items,
      selectedIndex: 0,
    });
  }, []);

  // Refresh skills/files whenever the palette is triggered,
  // so newly installed skills appear without reloading the page.
  const refreshItems = useCallback(
    (trigger: '@' | '/') => {
      if (trigger === '/') loadSkills();
      else loadFiles();
    },
    [loadSkills, loadFiles]
  );

  const updateQuery = useCallback((query: string) => {
    setPalette((prev) => {
      if (!prev.open) return prev;
      const filtered = prev.items.filter(
        (item) =>
          item.label.toLowerCase().includes(query.toLowerCase()) ||
          (item.description ?? '').toLowerCase().includes(query.toLowerCase())
      );
      return { ...prev, query, filteredItems: filtered, selectedIndex: 0 };
    });
  }, []);

  const selectItem = useCallback(
    (item: CommandItem) => {
      const ta = textareaRef.current;
      if (!ta) return;

      setPalette((prev) => {
        if (!prev.open) return prev;
        const before = ta.value.slice(0, prev.triggerIndex);
        const after = ta.value.slice(ta.selectionStart);
        const newValue = before + item.insertText + after;

        // Update textarea value via native setter so React picks up the change
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype,
          'value'
        )?.set;
        nativeSetter?.call(ta, newValue);
        ta.dispatchEvent(new Event('input', { bubbles: true }));

        // Move cursor after the inserted text
        const newCursor = prev.triggerIndex + item.insertText.length;
        requestAnimationFrame(() => {
          ta.setSelectionRange(newCursor, newCursor);
          ta.focus();
        });

        return INITIAL_STATE;
      });
    },
    [textareaRef]
  );

  const moveSelection = useCallback((direction: 1 | -1) => {
    setPalette((prev) => {
      if (!prev.open || prev.filteredItems.length === 0) return prev;
      const next =
        (prev.selectedIndex + direction + prev.filteredItems.length) %
        prev.filteredItems.length;
      return { ...prev, selectedIndex: next };
    });
  }, []);

  /**
   * Call this from the textarea's onChange handler.
   * Detects trigger characters and updates the query.
   */
  const handleTextChange = useCallback(
    (value: string, cursorPos: number) => {
      // Find the trigger character before the cursor on the same "word"
      const textBeforeCursor = value.slice(0, cursorPos);
      const match = textBeforeCursor.match(/(?:^|[\s\n])([/@])(\S*)$/);

      if (!match) {
        if (palette.open) close();
        return;
      }

      const trigger = match[1] as '@' | '/';
      const query = match[2];
      // Calculate trigger position correctly: it's always (cursor - queryLength - 1)
      const triggerIndex = cursorPos - query.length - 1;

      if (!palette.open || palette.trigger !== trigger) {
        // Need to (re)open for this trigger.
        // On web (no electronAPI), skip if there will be nothing to show.
        const items = trigger === '/' ? skillsRef.current : filesRef.current;
        if (items.length === 0 && !isDesktop) return;

        // Kick off a background refresh so newly installed items appear
        refreshItems(trigger);

        const filtered = items.filter(
          (item) =>
            item.label.toLowerCase().includes(query.toLowerCase()) ||
            (item.description ?? '').toLowerCase().includes(query.toLowerCase())
        );
        setPalette({
          open: true,
          trigger,
          query,
          triggerIndex,
          items,
          filteredItems: filtered,
          selectedIndex: 0,
        });
      } else {
        updateQuery(query);
      }
    },
    [palette.open, palette.trigger, close, updateQuery, isDesktop, refreshItems]
  );

  return {
    palette,
    open,
    close,
    selectItem,
    moveSelection,
    handleTextChange,
    reloadSkills: loadSkills,
  };
};
