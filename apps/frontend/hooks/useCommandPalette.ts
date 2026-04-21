'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { SkillConfig } from '@/types/electron';
import { skillsService } from '@/services/skills.service';

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

  // Pure fetch helpers — no setState, safe to call from effects.
  const fetchSkillItems = useCallback(async (): Promise<CommandItem[]> => {
    const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
    if (api) {
      const list = await api.getSkills();
      return list
        .filter((s: SkillConfig) => s.enabled)
        .map((s: SkillConfig) => ({
          type: 'skill' as CommandType,
          id: s.name,
          label: `/${s.name}`,
          description: s.description,
          insertText: `/${s.name} `,
        }));
    }
    // Web: official + user skills allowed on web
    const [official, user] = await Promise.all([
      skillsService.getOfficialSkills(),
      skillsService.getUserSkills(),
    ]);
    const officialItems: CommandItem[] = official.map((s) => ({
      type: 'skill' as CommandType,
      id: s.name,
      label: `/${s.name}`,
      description: s.description,
      insertText: `/${s.name} `,
    }));
    const userItems: CommandItem[] = user
      .filter((s) => s.enabled && s.platform !== 'desktop')
      .map((s) => ({
        type: 'skill' as CommandType,
        id: s.name,
        label: `/${s.name}`,
        description: s.description,
        insertText: `/${s.name} `,
      }));
    const seen = new Set(userItems.map((i) => i.id));
    return [...userItems, ...officialItems.filter((i) => !seen.has(i.id))];
  }, []);

  const fetchFileItems = useCallback(async (): Promise<CommandItem[]> => {
    const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
    if (!api) return [];
    const raw = await api.listWorkspaceFiles();
    const entries: Array<{ name: string; type: string; path: string }> =
      JSON.parse(raw);
    return entries
      .filter((e) => e.type === 'file')
      .map((e) => ({
        type: 'file' as CommandType,
        id: e.name,
        label: e.name,
        description: e.path,
        insertText: `@${e.name} `,
      }));
  }, []);

  // Populate refs on mount — no setState, satisfies react-hooks/set-state-in-effect.
  useEffect(() => {
    fetchSkillItems()
      .then((items) => {
        skillsRef.current = items;
      })
      .catch(() => {});
    fetchFileItems()
      .then((items) => {
        filesRef.current = items;
      })
      .catch(() => {});
  }, [fetchSkillItems, fetchFileItems]);

  // Used by refreshItems: fetch + update ref + refresh open palette.
  const loadSkills = useCallback(async () => {
    try {
      const items = await fetchSkillItems();
      skillsRef.current = items;
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
    } catch {}
  }, [fetchSkillItems]);

  const loadFiles = useCallback(async () => {
    try {
      const items = await fetchFileItems();
      filesRef.current = items;
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
    } catch {}
  }, [fetchFileItems]);

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
        const items = trigger === '/' ? skillsRef.current : filesRef.current;

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
    [palette.open, palette.trigger, close, updateQuery, refreshItems]
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
