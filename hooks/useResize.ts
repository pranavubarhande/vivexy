import { useRef, useState, useCallback, useEffect } from 'react';

const DEFAULT_RIGHT_PANEL_PERCENT = 40;
const MIN_RIGHT_PANEL_PERCENT = 25;
const MAX_RIGHT_PANEL_PERCENT = 70;

export const useResize = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [rightPanelPercent, setRightPanelPercent] = useState<number>(
    DEFAULT_RIGHT_PANEL_PERCENT
  );
  const [isResizing, setIsResizing] = useState<boolean>(false);

  const startResize = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;
    const onMove = (e: MouseEvent) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const leftWidthPx = Math.max(
        0,
        Math.min(e.clientX - rect.left, rect.width)
      );
      const leftPercent = (leftWidthPx / rect.width) * 100;
      const newRight = 100 - leftPercent;
      const clamped = Math.max(
        MIN_RIGHT_PANEL_PERCENT,
        Math.min(newRight, MAX_RIGHT_PANEL_PERCENT)
      );
      setRightPanelPercent(clamped);
    };
    const onUp = () => setIsResizing(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isResizing]);

  return { rightPanelPercent, isResizing, startResize, containerRef };
};
