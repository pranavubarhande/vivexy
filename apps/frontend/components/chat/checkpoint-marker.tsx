'use client';

import { Clock, RotateCcw } from 'lucide-react';
import { cn } from '@/utils/common';

interface CheckpointMarkerProps {
  checkpoint: {
    id: string;
    label: string;
    createdAt: string;
    messageId: string;
  };
  onRestore: (checkpointId: string) => void;
  isRestoring?: boolean;
}

export function CheckpointMarker({
  checkpoint,
  onRestore,
  isRestoring,
}: CheckpointMarkerProps) {
  const formatTime = (iso: string) => {
    const d = iso.endsWith('Z') ? iso : `${iso}Z`;
    return new Date(d).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="group flex items-center gap-2 my-3 px-1">
      <div className="flex-1 border-t border-dashed border-border/50" />
      <div className="flex items-center gap-1.5 shrink-0">
        <Clock size={11} className="text-muted-foreground/60" />
        <span className="text-[10px] text-muted-foreground/70 font-medium">
          {checkpoint.label}
        </span>
        <span className="text-[9px] text-muted-foreground/50">
          {formatTime(checkpoint.createdAt)}
        </span>
        <button
          onClick={() => onRestore(checkpoint.id)}
          disabled={isRestoring}
          className={cn(
            'flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-md border border-border/50',
            'text-muted-foreground hover:text-foreground hover:bg-muted hover:border-primary/30 transition-all',
            'opacity-0 group-hover:opacity-100',
            isRestoring && 'opacity-50 cursor-not-allowed'
          )}
          title="Restore to this checkpoint"
        >
          <RotateCcw size={9} />
          Restore
        </button>
      </div>
      <div className="flex-1 border-t border-dashed border-border/50" />
    </div>
  );
}
