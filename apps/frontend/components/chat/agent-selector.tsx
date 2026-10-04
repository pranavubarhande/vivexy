'use client';

import { useState, useMemo, useCallback } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@vivexy/ui/dialog';
import { Button } from '@vivexy/ui/button';
import { Input } from '@vivexy/ui/input';
import { cn } from '@vivexy/ui/utils';
import { toast } from 'sonner';
import {
  Bot,
  ChevronDown,
  Check,
  Search,
  Plus,
  Loader2,
  X,
  Info,
  ArrowLeft,
  Wrench,
  Lightbulb,
  Tag,
  CheckCircle2,
} from 'lucide-react';

import { CATALOGUE_AGENTS } from '@/agents/catalogue';
import { AGENT_SUMMARIES } from '@/agents/client-config';
import {
  useDeployedAgents,
  useDeployAgent,
  useUndeployAgent,
} from '@/hooks/useAgents';
import type {
  AgentSummary,
  AgentCategory,
  CatalogueAgent,
} from '@/types/agent';

const CATEGORIES: (AgentCategory | 'All')[] = [
  'All',
  'Finance',
  'Legal',
  'Compliance',
  'Cross-functional',
];

const CATEGORY_COLOR: Record<string, string> = {
  Finance: '#6366f1',
  Legal: '#0891b2',
  Compliance: '#dc2626',
  'Cross-functional': '#059669',
};

const baseAgentsAsCatalogue: CatalogueAgent[] = AGENT_SUMMARIES.map((b) => ({
  id: b.id,
  name: b.name,
  description: b.description,
  icon: b.icon,
  color: b.color,
  category: 'Cross-functional',
  tools: [],
  useCases: [],
  tags: ['default', 'always-available'],
}));

interface AgentSelectorProps {
  agents: AgentSummary[];
  selectedAgentId: string;
  onSelect: (agentId: string) => void;
  disabled?: boolean;
}

export function AgentSelector({
  agents,
  selectedAgentId,
  onSelect,
  disabled = false,
}: AgentSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<AgentCategory | 'All'>(
    'All'
  );
  const [detailAgent, setDetailAgent] = useState<CatalogueAgent | null>(null);

  const { data: deployed = [] } = useDeployedAgents();
  const deployMutation = useDeployAgent();
  const undeployMutation = useUndeployAgent();

  const deployedIds = useMemo(
    () => new Set(deployed.map((d) => d.agentId)),
    [deployed]
  );
  const baseIds = useMemo(() => new Set(AGENT_SUMMARIES.map((b) => b.id)), []);

  const selectedAgent = agents.find((a) => a.id === selectedAgentId);

  const handleSelect = useCallback(
    (agentId: string) => {
      onSelect(agentId);
      setOpen(false);
      setDetailAgent(null);
    },
    [onSelect]
  );

  const handleClose = useCallback(() => {
    setOpen(false);
    setDetailAgent(null);
    setSearch('');
    setActiveCategory('All');
  }, []);

  const handleAdd = async (agentId: string) => {
    try {
      await deployMutation.mutateAsync(agentId);
      toast.success('Agent added to workspace.');
    } catch {
      toast.error('Failed to add agent.');
    }
  };

  const handleRemove = async (agentId: string) => {
    try {
      await undeployMutation.mutateAsync(agentId);
      toast.success('Agent removed.');
    } catch {
      toast.error('Failed to remove agent.');
    }
  };

  const matchesFilter = (a: CatalogueAgent) => {
    const matchCat = activeCategory === 'All' || a.category === activeCategory;
    const q = search.toLowerCase().trim();
    const matchQ =
      !q ||
      a.name.toLowerCase().includes(q) ||
      a.description.toLowerCase().includes(q) ||
      a.tags.some((t) => t.includes(q));
    return matchCat && matchQ;
  };

  const deployedCatalogueAgents = useMemo(
    () => CATALOGUE_AGENTS.filter((a) => deployedIds.has(a.id)),
    [deployedIds]
  );

  const activeAgents = useMemo(
    () => [...baseAgentsAsCatalogue, ...deployedCatalogueAgents],
    [deployedCatalogueAgents]
  );

  const activeAgentsFiltered = useMemo(
    () => activeAgents.filter(matchesFilter),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeAgents, search, activeCategory]
  );

  const availableCatalogueAgents = useMemo(
    () =>
      CATALOGUE_AGENTS.filter(
        (a) => !deployedIds.has(a.id) && matchesFilter(a)
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deployedIds, search, activeCategory]
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => (v ? setOpen(true) : handleClose())}
    >
      {/* Trigger */}
      <button
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[12px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:pointer-events-none"
      >
        {selectedAgent?.icon && (
          <selectedAgent.icon size={13} className="shrink-0" />
        )}
        <span className="hidden sm:inline truncate max-w-[110px]">
          {selectedAgent?.name ?? 'Agent'}
        </span>
        <ChevronDown size={11} className="opacity-40 shrink-0" />
      </button>

      <DialogContent className="max-w-3xl w-[95vw] p-0 gap-0 overflow-hidden border-border/70 shadow-xl">
        <DialogTitle className="sr-only">Agent Workspace</DialogTitle>

        {/* ── Detail panel ── */}
        {detailAgent ? (
          <AgentDetailPanel
            agent={detailAgent}
            isDeployed={deployedIds.has(detailAgent.id)}
            isBase={baseIds.has(detailAgent.id)}
            isAdding={
              deployMutation.isPending &&
              deployMutation.variables === detailAgent.id
            }
            isSelected={selectedAgentId === detailAgent.id}
            onBack={() => setDetailAgent(null)}
            onAdd={() => handleAdd(detailAgent.id)}
            onSelect={() => handleSelect(detailAgent.id)}
          />
        ) : (
          /* ── Main list view ── */
          <div className="flex flex-col">
            {/* Header */}
            <div className="flex items-center gap-3 px-5 pt-4 pb-3.5 border-b border-border/50">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Bot size={16} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-[13px] font-semibold tracking-tight">
                  Agent Workspace
                </h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {activeAgents.length - 1} active &middot;{' '}
                  {CATALOGUE_AGENTS.length} in catalogue
                </p>
              </div>
            </div>

            {/* Search + category filter */}
            <div className="px-5 pt-3 pb-3 border-b border-border/40 flex flex-col gap-2.5 sm:flex-row sm:items-center">
              <div className="relative shrink-0 w-full sm:w-56">
                <Search
                  size={13}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50"
                />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search agents…"
                  className="pl-8 h-8 text-[13px] bg-muted/30 border-border/50 focus-visible:bg-background"
                />
              </div>
              <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-none">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={cn(
                      'px-3 py-1.5 rounded-md text-[11px] font-medium whitespace-nowrap transition-all',
                      activeCategory === cat
                        ? 'bg-foreground text-background'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Scrollable content */}
            <div className="overflow-y-auto max-h-[58vh]">
              {/* Active agents — compact pill strip */}
              {activeAgentsFiltered.length > 0 && (
                <div className="px-5 pt-4 pb-3">
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                      Active
                    </span>
                    <span className="text-[10px] text-muted-foreground/40">
                      {activeAgentsFiltered.length}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {activeAgentsFiltered.map((agent) => {
                      const isSelected = selectedAgentId === agent.id;
                      const isBase = baseIds.has(agent.id);
                      const isUndeploying =
                        undeployMutation.isPending &&
                        undeployMutation.variables === agent.id;

                      return (
                        <button
                          key={agent.id}
                          onClick={() => handleSelect(agent.id)}
                          className={cn(
                            'group relative flex items-center gap-2 pl-2.5 pr-2.5 py-1.5 rounded-lg border text-left transition-all',
                            isSelected
                              ? 'bg-foreground text-background border-transparent'
                              : 'border-border/50 bg-muted/20 hover:bg-muted/50 hover:border-border/70'
                          )}
                        >
                          <span
                            className="w-4 h-4 flex items-center justify-center shrink-0"
                            style={
                              !isSelected ? { color: agent.color } : undefined
                            }
                          >
                            <agent.icon size={12} strokeWidth={1.75} />
                          </span>
                          <span className="text-[12px] font-medium leading-none">
                            {agent.name}
                          </span>
                          {isSelected && (
                            <Check size={10} className="shrink-0 opacity-70" />
                          )}
                          {!isBase && !isSelected && (
                            <span
                              role="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemove(agent.id);
                              }}
                              className="opacity-0 group-hover:opacity-100 text-muted-foreground/40 hover:text-muted-foreground transition-all ml-0.5"
                            >
                              {isUndeploying ? (
                                <Loader2 size={10} className="animate-spin" />
                              ) : (
                                <X size={10} />
                              )}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {activeAgentsFiltered.length > 0 &&
                availableCatalogueAgents.length > 0 && (
                  <div className="mx-5 border-t border-border/30 my-1" />
                )}

              {/* Catalogue grid */}
              {availableCatalogueAgents.length > 0 && (
                <div className="px-5 pt-3 pb-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                      Catalogue
                    </span>
                    <span className="text-[10px] text-muted-foreground/40">
                      {availableCatalogueAgents.length} available
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {availableCatalogueAgents.map((agent) => {
                      const isAdding =
                        deployMutation.isPending &&
                        deployMutation.variables === agent.id;
                      return (
                        <CatalogueCard
                          key={agent.id}
                          agent={agent}
                          isAdding={isAdding}
                          onAdd={() => handleAdd(agent.id)}
                          onInfo={() => setDetailAgent(agent)}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {activeAgentsFiltered.length === 0 &&
                availableCatalogueAgents.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-16 gap-2.5">
                    <Bot size={28} className="text-muted-foreground/20" />
                    <p className="text-[12px] text-muted-foreground">
                      No agents match your search.
                    </p>
                  </div>
                )}
            </div>

            {/* Footer */}
            <div className="px-5 py-2 border-t border-border/40 bg-muted/10">
              <p className="text-[10px] text-muted-foreground/50">
                {deployed.length} of {CATALOGUE_AGENTS.length} catalogue agents
                active in workspace
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────────────────────── CatalogueCard ───────────────────────────── */

function CatalogueCard({
  agent,
  isAdding,
  onAdd,
  onInfo,
}: {
  agent: CatalogueAgent;
  isAdding: boolean;
  onAdd: () => void;
  onInfo: () => void;
}) {
  return (
    <div className="group relative flex flex-col p-3.5 rounded-lg border border-border/50 bg-card hover:bg-muted/30 transition-colors">
      <div className="flex items-start gap-2.5">
        <div
          className="w-8 h-8 flex items-center justify-center rounded-md shrink-0"
          style={{ backgroundColor: `${agent.color}18`, color: agent.color }}
        >
          <agent.icon size={15} strokeWidth={1.75} />
        </div>
        <div className="flex-1 min-w-0 pr-5">
          <div className="text-[13px] font-medium leading-snug line-clamp-1">
            {agent.name}
          </div>
          <div className="text-[10px] text-muted-foreground/60 mt-0.5 font-medium">
            {agent.category}
          </div>
        </div>

        <button
          type="button"
          onClick={onInfo}
          className="absolute top-2.5 right-2.5 p-1 rounded text-muted-foreground/30 hover:text-muted-foreground hover:bg-muted/50 transition-all"
        >
          <Info size={12} />
        </button>
      </div>

      <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2 mt-2.5">
        {agent.description}
      </p>

      {agent.tools.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {agent.tools.slice(0, 2).map((tool) => (
            <span
              key={tool}
              className="text-[9px] px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground/70 font-medium tracking-tight"
            >
              {tool}
            </span>
          ))}
          {agent.tools.length > 2 && (
            <span className="text-[9px] px-1 py-0.5 text-muted-foreground/40">
              +{agent.tools.length - 2}
            </span>
          )}
        </div>
      )}

      <div className="flex items-center justify-end mt-3">
        <Button
          size="sm"
          variant="outline"
          className="h-6 px-2.5 text-[11px] gap-1 font-medium border-border/60 hover:bg-muted/60"
          disabled={isAdding}
          onClick={onAdd}
        >
          {isAdding ? (
            <Loader2 size={10} className="animate-spin" />
          ) : (
            <Plus size={10} />
          )}
          {isAdding ? 'Adding…' : 'Add'}
        </Button>
      </div>
    </div>
  );
}

/* ──────────────────────────── AgentDetailPanel ───────────────────────────── */

function AgentDetailPanel({
  agent,
  isDeployed,
  isBase,
  isAdding,
  isSelected,
  onBack,
  onAdd,
  onSelect,
}: {
  agent: CatalogueAgent;
  isDeployed: boolean;
  isBase: boolean;
  isAdding: boolean;
  isSelected: boolean;
  onBack: () => void;
  onAdd: () => void;
  onSelect: () => void;
}) {
  const categoryColor = CATEGORY_COLOR[agent.category] ?? '#6366f1';

  return (
    <div className="flex flex-col">
      {/* Back bar */}
      <div className="flex items-center gap-3 px-5 pt-3.5 pb-3 border-b border-border/50">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={13} />
          Back
        </button>
        <div className="h-3.5 w-px bg-border/50" />
        <span className="text-[12px] text-muted-foreground/60 truncate">
          {agent.name}
        </span>
      </div>

      {/* Scrollable detail body */}
      <div className="overflow-y-auto max-h-[65vh] px-6 py-5 flex flex-col gap-6">
        {/* Agent identity */}
        <div className="flex items-center gap-4">
          <div
            className="w-14 h-14 flex items-center justify-center rounded-xl shrink-0"
            style={{ backgroundColor: `${agent.color}18`, color: agent.color }}
          >
            <agent.icon size={24} strokeWidth={1.5} />
          </div>
          <div>
            <h2 className="text-[15px] font-semibold leading-tight">
              {agent.name}
            </h2>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{
                  backgroundColor: `${categoryColor}18`,
                  color: categoryColor,
                }}
              >
                {agent.category}
              </span>
              {(isDeployed || isBase) && (
                <span className="text-[10px] text-emerald-600 dark:text-emerald-500 flex items-center gap-1 font-medium">
                  <CheckCircle2 size={10} />
                  Active in workspace
                </span>
              )}
              {agent.tools.length > 0 && (
                <span className="text-[10px] text-muted-foreground/50">
                  {agent.tools.length} tools
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Description */}
        <p className="text-[13px] text-muted-foreground leading-relaxed -mt-2">
          {agent.description}
        </p>

        {/* Use cases */}
        {agent.useCases.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Lightbulb size={13} className="text-muted-foreground/60" />
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                Capabilities
              </span>
            </div>
            <ul className="flex flex-col gap-2">
              {agent.useCases.map((uc) => (
                <li
                  key={uc}
                  className="flex items-start gap-2.5 text-[12px] text-muted-foreground leading-relaxed"
                >
                  <span
                    className="mt-2 w-1 h-1 rounded-full shrink-0"
                    style={{ backgroundColor: agent.color }}
                  />
                  {uc}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Tools */}
        {agent.tools.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Wrench size={13} className="text-muted-foreground/60" />
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                Tools & integrations
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {agent.tools.map((tool) => (
                <span
                  key={tool}
                  className="text-[11px] px-2.5 py-1 rounded-md bg-muted border border-border/50 text-foreground/60 font-medium"
                >
                  {tool}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Tags */}
        {agent.tags.filter((t) => !['default', 'always-available'].includes(t))
          .length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Tag size={13} className="text-muted-foreground/60" />
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                Topics
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {agent.tags
                .filter((t) => !['default', 'always-available'].includes(t))
                .map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-muted/60 text-muted-foreground/60 font-medium"
                  >
                    {tag}
                  </span>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* Action footer */}
      <div className="px-6 py-3.5 border-t border-border/50 bg-muted/10 flex items-center gap-2.5">
        {isDeployed || isBase ? (
          <Button
            className="flex-1 h-8 text-[12px] gap-1.5"
            variant={isSelected ? 'secondary' : 'default'}
            onClick={onSelect}
            disabled={isSelected}
          >
            {isSelected ? (
              <>
                <Check size={12} />
                Currently active
              </>
            ) : (
              'Switch to this agent'
            )}
          </Button>
        ) : (
          <Button
            className="flex-1 h-8 text-[12px] gap-1.5"
            disabled={isAdding}
            onClick={onAdd}
          >
            {isAdding ? (
              <>
                <Loader2 size={12} className="animate-spin" />
                Adding…
              </>
            ) : (
              <>
                <Plus size={12} />
                Add to workspace
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
