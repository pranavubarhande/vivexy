'use client';

import { useRef, useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@vivexy/ui/sheet';
import { ArtifactsPanel } from '@vivexy/core/chat/artifacts-panel';
import { GithubReposPanel } from '@vivexy/core/chat/github-repos-panel';
import { useIsMobile } from '@vivexy/ui/hooks/use-mobile';
import { Maximize2, PanelRightClose, File, Github } from 'lucide-react';
import type { Artifact } from '@vivexy/core/services/chat.service';
import type { GitContext } from '@vivexy/core/types/chat';

export type PanelType = 'artifacts' | 'github' | null;

interface ChatPanelsProps {
  showSidePanel: PanelType;
  setShowSidePanel: (panel: PanelType) => void;
  artifacts: Artifact[];
  onSaveArtifact: (
    artifact: Artifact & { language?: string },
    newContent: string
  ) => void;
  activeGitContext: GitContext | null;
  onGitContextChange: (ctx: GitContext | null) => void;
  chatContextLocked?: boolean;
}

export const ChatPanels = ({
  showSidePanel,
  setShowSidePanel,
  artifacts,
  onSaveArtifact,
  activeGitContext,
  onGitContextChange,
  chatContextLocked = false,
}: ChatPanelsProps) => {
  const isMobile = useIsMobile();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [panelWidth, setPanelWidth] = useState(600);
  const isResizingRef = useRef(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return;
      let newWidth = window.innerWidth - e.clientX;
      if (newWidth < 300) newWidth = 300;
      if (newWidth > 800) newWidth = 800;
      if (newWidth > window.innerWidth - 300)
        newWidth = window.innerWidth - 300;
      setPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      isResizingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  if (!showSidePanel) return null;

  const panelContent =
    showSidePanel === 'github' ? (
      <GithubReposPanel
        activeContext={activeGitContext}
        onContextChange={onGitContextChange}
        locked={chatContextLocked}
      />
    ) : (
      <ArtifactsPanel artifacts={artifacts} onSave={onSaveArtifact} />
    );

  const panelHeader = (
    <div className="flex items-center justify-between px-4 py-3 border-b bg-background/95 backdrop-blur-sm shrink-0">
      <div className="flex items-center gap-2">
        {showSidePanel === 'github' ? (
          <Github size={15} className="text-primary" />
        ) : (
          <File size={15} className="text-primary" />
        )}
        <h3 className="font-semibold text-sm">
          {showSidePanel === 'github' ? 'GitHub' : 'Artifacts'}
        </h3>
        {showSidePanel === 'artifacts' && (
          <span className="text-xs px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
            {artifacts.length}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1">
        {!isMobile && (
          <button
            onClick={() => setIsFullscreen((f) => !f)}
            className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            <Maximize2 size={14} />
          </button>
        )}
        <button
          onClick={() => {
            setShowSidePanel(null);
            setIsFullscreen(false);
          }}
          className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground hidden sm:block"
          title="Close panel"
        >
          <PanelRightClose size={14} />
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Fullscreen overlay */}
      {isFullscreen && !isMobile && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col">
          {panelHeader}
          <div className="flex-1 min-h-0 overflow-hidden">{panelContent}</div>
        </div>
      )}

      {/* Desktop side panel */}
      {!isMobile && !isFullscreen && (
        <div
          className="relative flex flex-col bg-background shrink-0"
          style={{ width: panelWidth }}
        >
          <div
            className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/50 transition-colors z-50 -ml-[0.5px]"
            onMouseDown={handleMouseDown}
          />
          <div className="flex-1 flex flex-col border-l min-h-0 overflow-hidden">
            {panelHeader}
            <div className="flex-1 min-h-0 overflow-hidden">{panelContent}</div>
          </div>
        </div>
      )}

      {/* Mobile bottom sheet */}
      {isMobile && (
        <Sheet
          open={!!showSidePanel}
          onOpenChange={(open) => !open && setShowSidePanel(null)}
        >
          <SheetContent
            side="bottom"
            className="h-[80vh] flex flex-col p-0 rounded-t-2xl"
          >
            <SheetHeader className="sr-only">
              <SheetTitle>
                {showSidePanel === 'github' ? 'GitHub' : 'Artifacts'}
              </SheetTitle>
            </SheetHeader>
            {panelHeader}
            <div className="flex-1 min-h-0 overflow-hidden">{panelContent}</div>
          </SheetContent>
        </Sheet>
      )}
    </>
  );
};
