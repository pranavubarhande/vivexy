'use client';

import React, { useState } from 'react';
import type { SkillConfig } from '@vivexy/core/types/electron';
import { useAppConfig } from '@vivexy/core/shared/app-config-provider';
import type { OfficialSkill } from '@vivexy/core/services/skills.service';
import { useInstalledSkills } from '@vivexy/core/hooks/useInstalledSkills';
import { useOfficialSkills } from '@vivexy/core/hooks/useOfficialSkills';
import {
  listSkillsInRepo,
  parseGithubUrl,
  githubSkillToInstallable,
  type GithubSkill,
} from '@vivexy/core/lib/github-skills';
import { FileTreeEditor } from './file-tree-editor';
import { Button } from '@vivexy/ui/button';
import { Input } from '@vivexy/ui/input';
import { Label } from '@vivexy/ui/label';
import { Switch } from '@vivexy/ui/switch';
import { Badge } from '@vivexy/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@vivexy/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@vivexy/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@vivexy/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@vivexy/ui/select';
import {
  Plus,
  Pencil,
  Trash2,
  FolderOpen,
  Zap,
  Store,
  CheckCircle2,
  Download,
  FileText,
  Search,
  Loader2,
  Github,
  Shield,
  AlertCircle,
  Monitor,
  Globe,
  Layers,
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import type { SkillPlatform } from '@vivexy/core/types/electron';

// ── Constants ─────────────────────────────────────────────────────────

const EMPTY_FORM = {
  name: '',
  description: '',
  enabled: true,
  platform: 'both' as SkillPlatform,
};

const PLATFORM_LABELS: Record<
  SkillPlatform,
  { label: string; icon: React.ElementType }
> = {
  both: { label: 'Desktop + Web', icon: Layers },
  desktop: { label: 'Desktop only', icon: Monitor },
  web: { label: 'Web only', icon: Globe },
};

const CATEGORY_LABELS: Record<string, string> = {
  analysis: 'Analysis',
  reporting: 'Reporting',
  research: 'Research',
  automation: 'Automation',
  data: 'Data',
  general: 'General',
};

// ── Official skill card ────────────────────────────────────────────────

const OfficialSkillCard = ({
  skill,
  isInstalled,
  onInstall,
  installing,
}: {
  skill: OfficialSkill;
  isInstalled: boolean;
  onInstall: (skill: OfficialSkill) => void;
  installing: boolean;
}) => (
  <div className="border rounded-lg p-4 bg-background hover:bg-muted/20 transition-colors flex flex-col gap-3">
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm">{skill.displayName}</span>
          <span className="font-mono text-xs text-muted-foreground">
            /{skill.name}
          </span>
          <Badge
            variant="secondary"
            className="text-[10px] px-1.5 py-0 gap-1 text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800"
          >
            <Shield className="h-2.5 w-2.5" />
            Official
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          {skill.description}
        </p>
      </div>
      {isInstalled ? (
        <Badge
          variant="secondary"
          className="shrink-0 gap-1 text-green-600 bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800"
        >
          <CheckCircle2 className="h-3 w-3" />
          Installed
        </Badge>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 gap-1.5 h-7 px-2.5 text-xs"
          onClick={() => onInstall(skill)}
          disabled={installing}
        >
          {installing ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Download className="h-3 w-3" />
          )}
          Install
        </Button>
      )}
    </div>
    <div className="flex flex-wrap gap-1">
      {skill.category && (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
          {CATEGORY_LABELS[skill.category] ?? skill.category}
        </Badge>
      )}
      {skill.tags?.map((tag) => (
        <Badge
          key={tag}
          variant="secondary"
          className="text-[10px] px-1.5 py-0"
        >
          {tag}
        </Badge>
      ))}
    </div>
  </div>
);

// ── GitHub skill card ──────────────────────────────────────────────────

const GithubSkillCard = ({
  skill,
  isInstalled,
  onInstall,
  installing,
}: {
  skill: GithubSkill;
  isInstalled: boolean;
  onInstall: (skill: GithubSkill) => void;
  installing: boolean;
}) => (
  <div className="border rounded-lg p-4 bg-background hover:bg-muted/20 transition-colors flex flex-col gap-2">
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm">{skill.name}</span>
          <span className="font-mono text-xs text-muted-foreground">
            /{skill.name}
          </span>
        </div>
        {skill.description && (
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            {skill.description}
          </p>
        )}
        <p className="text-[11px] text-muted-foreground/60 mt-0.5 font-mono">
          {skill.owner}/{skill.repo}
          {skill.dirPath ? `/${skill.dirPath}` : ''}
        </p>
      </div>
      {isInstalled ? (
        <Badge
          variant="secondary"
          className="shrink-0 gap-1 text-green-600 bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800"
        >
          <CheckCircle2 className="h-3 w-3" />
          Installed
        </Badge>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 gap-1.5 h-7 px-2.5 text-xs"
          onClick={() => onInstall(skill)}
          disabled={installing}
        >
          {installing ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Download className="h-3 w-3" />
          )}
          Install
        </Button>
      )}
    </div>
    {skill.files && Object.keys(skill.files).length > 0 && (
      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <FileText className="h-3 w-3" />
        {Object.keys(skill.files).length + 1} files included
      </div>
    )}
  </div>
);

// ── Main Component ────────────────────────────────────────────────────

export const SkillsSettings = ({
  appName: appNameProp,
}: {
  appName?: string;
}) => {
  const { appName: configAppName } = useAppConfig();
  const appName = appNameProp ?? configAppName;
  const { skills, skillsDir, saveSkill, toggleSkill, deleteSkill } =
    useInstalledSkills();
  const { data: officialSkills = [], isLoading: officialLoading } =
    useOfficialSkills();

  const [activeTab, setActiveTab] = useState<
    'installed' | 'official' | 'registry'
  >('installed');

  // Official tab
  const [officialSearch, setOfficialSearch] = useState('');
  const [installingOfficial, setInstallingOfficial] = useState<string | null>(
    null
  );

  // Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [skillFiles, setSkillFiles] = useState<Record<string, string>>({
    'SKILL.md': '',
  });
  const [formError, setFormError] = useState('');

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // Registry tab
  const [repoInput, setRepoInput] = useState('vercel-labs/agent-skills');
  const [browsingRepo, setBrowsingRepo] = useState(false);
  const [browseError, setBrowseError] = useState('');
  const [githubSkills, setGithubSkills] = useState<GithubSkill[]>([]);
  const [githubSearch, setGithubSearch] = useState('');
  const [installingGithub, setInstallingGithub] = useState<string | null>(null);

  const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
  const installedNames = new Set(skills.map((s) => s.name));

  // ── Installed actions ──────────────────────────────────────────────

  const openAdd = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setSkillFiles({ 'SKILL.md': '' });
    setFormError('');
    setDialogOpen(true);
  };

  const openEdit = (skill: SkillConfig) => {
    setEditingId(skill.id);
    setForm({
      name: skill.name,
      description: skill.description,
      enabled: skill.enabled,
      platform: skill.platform ?? 'both',
    });
    const files: Record<string, string> = { 'SKILL.md': skill.content };
    if (skill.files) Object.assign(files, skill.files);
    setSkillFiles(files);
    setFormError('');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const trimmedName = form.name.trim().replace(/\s+/g, '-').toLowerCase();
    if (!trimmedName) {
      setFormError('Skill name is required.');
      return;
    }
    const mainContent = skillFiles['SKILL.md'] ?? '';
    if (!mainContent.trim()) {
      setFormError('SKILL.md instructions are required.');
      return;
    }
    if (skills.find((s) => s.name === trimmedName && s.id !== editingId)) {
      setFormError('A skill with this name already exists.');
      return;
    }
    const { 'SKILL.md': _main, ...supporting } = skillFiles;
    await saveSkill({
      id: editingId ?? uuidv4(),
      name: trimmedName,
      description: form.description.trim(),
      content: mainContent.trim(),
      files: Object.keys(supporting).length > 0 ? supporting : undefined,
      enabled: form.enabled,
      platform: form.platform,
    });
    setDialogOpen(false);
  };

  // ── Official actions ───────────────────────────────────────────────

  const handleInstallOfficial = async (skill: OfficialSkill) => {
    setInstallingOfficial(skill.name);
    try {
      await saveSkill({
        id: uuidv4(),
        name: skill.name,
        description: skill.description,
        content: skill.content,
        files: skill.files ?? undefined,
        enabled: true,
        platform: 'both',
      });
    } finally {
      setInstallingOfficial(null);
    }
  };

  const filteredOfficial = officialSkills.filter((s) => {
    const q = officialSearch.toLowerCase();
    return (
      !q ||
      s.name.includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.displayName.toLowerCase().includes(q)
    );
  });

  // ── Registry actions ───────────────────────────────────────────────

  const handleBrowse = async () => {
    const ref = parseGithubUrl(repoInput.trim());
    if (!ref) {
      setBrowseError(
        'Could not parse the repository URL. Use "owner/repo" or a full GitHub URL.'
      );
      return;
    }
    setBrowsingRepo(true);
    setBrowseError('');
    setGithubSkills([]);
    try {
      const found = await listSkillsInRepo(ref);
      setGithubSkills(found);
      if (found.length === 0)
        setBrowseError('No SKILL.md files found in this repository.');
    } catch (e) {
      setBrowseError(
        e instanceof Error ? e.message : 'Failed to fetch from GitHub.'
      );
    } finally {
      setBrowsingRepo(false);
    }
  };

  const handleInstallGithub = async (skill: GithubSkill) => {
    setInstallingGithub(skill.name);
    try {
      await saveSkill({
        id: uuidv4(),
        ...githubSkillToInstallable(skill),
        platform: 'both',
      });
    } finally {
      setInstallingGithub(null);
    }
  };

  const filteredGithub = githubSkills.filter((s) => {
    const q = githubSearch.toLowerCase();
    return !q || s.name.includes(q) || s.description.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      {skillsDir && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-3 py-2 rounded-md">
          <FolderOpen className="h-3.5 w-3.5 shrink-0" />
          <span className="font-mono truncate">{skillsDir}</span>
        </div>
      )}

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as typeof activeTab)}
      >
        <div className="flex items-center justify-between gap-2">
          <TabsList className="h-8">
            <TabsTrigger value="installed" className="text-xs gap-1.5 h-7 px-3">
              <Zap className="h-3.5 w-3.5" />
              Installed
              {skills.length > 0 && (
                <Badge
                  variant="secondary"
                  className="ml-1 text-[10px] px-1.5 py-0 h-4"
                >
                  {skills.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="official" className="text-xs gap-1.5 h-7 px-3">
              <Store className="h-3.5 w-3.5" />
              Official
            </TabsTrigger>
            <TabsTrigger value="registry" className="text-xs gap-1.5 h-7 px-3">
              <Github className="h-3.5 w-3.5" />
              Registry
            </TabsTrigger>
          </TabsList>
          {activeTab === 'installed' && (
            <Button
              onClick={openAdd}
              size="sm"
              variant="outline"
              className="gap-2 h-8 text-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              Custom Skill
            </Button>
          )}
        </div>

        {/* ── Installed ── */}
        <TabsContent value="installed" className="mt-3">
          {skills.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm border rounded-lg bg-muted/20">
              <Zap className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p>No skills installed yet.</p>
              <p className="text-xs mt-1 mb-4">
                Browse{' '}
                <button
                  onClick={() => setActiveTab('official')}
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  Official Skills
                </button>{' '}
                or install from the{' '}
                <button
                  onClick={() => setActiveTab('registry')}
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  Registry
                </button>
                .
              </p>
              <p className="text-xs text-muted-foreground/70">
                Invoke skills with{' '}
                <kbd className="px-1 py-0.5 bg-muted border rounded text-[11px]">
                  /
                </kbd>{' '}
                in the chat.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {skills.map((skill) => (
                <div
                  key={skill.id}
                  className="flex items-center gap-3 p-3 border rounded-lg bg-background hover:bg-muted/30 transition-colors"
                >
                  <Switch
                    checked={skill.enabled}
                    onCheckedChange={() => toggleSkill(skill.id)}
                    aria-label={`Toggle ${skill.name}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-medium text-sm truncate">
                        /{skill.name}
                      </span>
                      {!skill.enabled && (
                        <Badge
                          variant="secondary"
                          className="text-[10px] px-1.5 py-0"
                        >
                          disabled
                        </Badge>
                      )}
                      {skill.files && Object.keys(skill.files).length > 0 && (
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0 gap-1"
                        >
                          <FileText className="h-2.5 w-2.5" />
                          {Object.keys(skill.files).length + 1} files
                        </Badge>
                      )}
                      {skill.platform && skill.platform !== 'both' && (
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0 gap-1"
                        >
                          {skill.platform === 'desktop' ? (
                            <Monitor className="h-2.5 w-2.5" />
                          ) : (
                            <Globe className="h-2.5 w-2.5" />
                          )}
                          {PLATFORM_LABELS[skill.platform as SkillPlatform]
                            ?.label ?? skill.platform}
                        </Badge>
                      )}
                    </div>
                    {skill.description && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {skill.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => openEdit(skill)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                      onClick={() => setDeleteTarget(skill.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Official Skills ── */}
        <TabsContent value="official" className="mt-3 space-y-3">
          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 px-3 py-2 rounded-md">
            <Shield className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
            <span>
              Official skills are maintained by {appName} and always available
              to the agent. Install a copy to your local profile to customize or
              override them.
            </span>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search official skills..."
              value={officialSearch}
              onChange={(e) => setOfficialSearch(e.target.value)}
              className="h-8 text-sm pl-8"
            />
          </div>
          {officialLoading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <Loader2 className="h-5 w-5 mx-auto mb-2 animate-spin opacity-40" />
              <p>Loading official skills...</p>
            </div>
          ) : filteredOfficial.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {officialSearch
                ? `No skills match "${officialSearch}".`
                : 'No official skills available.'}
            </p>
          ) : (
            <div className="grid gap-2.5">
              {filteredOfficial.map((skill) => (
                <OfficialSkillCard
                  key={skill.name}
                  skill={skill}
                  isInstalled={installedNames.has(skill.name)}
                  onInstall={handleInstallOfficial}
                  installing={installingOfficial === skill.name}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Registry ── */}
        <TabsContent value="registry" className="mt-3 space-y-4">
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Browse any GitHub repository containing{' '}
              <code className="px-1 py-0.5 bg-muted rounded text-[11px]">
                SKILL.md
              </code>{' '}
              files. Compatible with the{' '}
              <a
                href="https://skills.sh"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
              >
                skills.sh
              </a>{' '}
              ecosystem and the{' '}
              <code className="px-1 py-0.5 bg-muted rounded text-[11px]">
                npx skills
              </code>{' '}
              CLI format.
            </p>
            <div className="flex gap-2">
              <Input
                placeholder="vercel-labs/agent-skills  or  https://github.com/owner/repo"
                value={repoInput}
                onChange={(e) => setRepoInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleBrowse()}
                className="h-9 text-sm font-mono"
              />
              <Button
                onClick={handleBrowse}
                disabled={browsingRepo}
                className="h-9 gap-2 shrink-0"
              >
                {browsingRepo ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Search className="h-3.5 w-3.5" />
                )}
                Browse
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Try:{' '}
              {[
                'vercel-labs/agent-skills',
                'anthropics/skills',
                'microsoft/azure-skills',
              ].map((ex) => (
                <button
                  key={ex}
                  onClick={() => setRepoInput(ex)}
                  className="font-mono bg-muted px-1 rounded hover:bg-muted/80 mr-1.5"
                >
                  {ex}
                </button>
              ))}
            </p>
          </div>

          {browseError && (
            <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2 rounded-md">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              {browseError}
            </div>
          )}

          {githubSkills.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Found <strong>{githubSkills.length}</strong> skill
                  {githubSkills.length !== 1 ? 's' : ''}
                </p>
                <div className="relative">
                  <Search className="absolute left-2 top-1.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Filter..."
                    value={githubSearch}
                    onChange={(e) => setGithubSearch(e.target.value)}
                    className="h-7 text-xs pl-7 w-40"
                  />
                </div>
              </div>
              <div className="grid gap-2.5">
                {filteredGithub.map((skill) => (
                  <GithubSkillCard
                    key={`${skill.owner}/${skill.repo}/${skill.dirPath}`}
                    skill={skill}
                    isInstalled={installedNames.has(skill.name)}
                    onInstall={handleInstallGithub}
                    installing={installingGithub === skill.name}
                  />
                ))}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Add / Edit Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId !== null ? 'Edit Skill' : 'Create Custom Skill'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="skill-name">
                  Skill Name{' '}
                  <span className="text-muted-foreground text-xs">
                    (becomes /name)
                  </span>
                </Label>
                <Input
                  id="skill-name"
                  placeholder="e.g. analyze-portfolio"
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="skill-desc">Description</Label>
                <Input
                  id="skill-desc"
                  placeholder="Short description shown in picker"
                  value={form.description}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, description: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>
                Skill Files{' '}
                <span className="text-muted-foreground text-xs">
                  — SKILL.md is the main entry; add supporting .md files for
                  reference
                </span>
              </Label>
              <FileTreeEditor
                skillName={form.name}
                files={skillFiles}
                onFilesChange={setSkillFiles}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  id="skill-enabled"
                  checked={form.enabled}
                  onCheckedChange={(v) =>
                    setForm((f) => ({ ...f, enabled: v }))
                  }
                />
                <Label htmlFor="skill-enabled">Enabled</Label>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="skill-platform">Available on</Label>
                <Select
                  value={form.platform}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, platform: v as SkillPlatform }))
                  }
                >
                  <SelectTrigger id="skill-platform" className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(
                      Object.entries(PLATFORM_LABELS) as [
                        SkillPlatform,
                        { label: string; icon: React.ElementType },
                      ][]
                    ).map(([value, { label, icon: Icon }]) => (
                      <SelectItem key={value} value={value}>
                        <span className="flex items-center gap-2">
                          <Icon className="h-3.5 w-3.5" />
                          {label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {formError && (
              <p className="text-sm text-destructive">{formError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>Save Skill</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ── */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Skill</AlertDialogTitle>
            <AlertDialogDescription>
              Delete{' '}
              <strong>
                /{skills.find((s) => s.id === deleteTarget)?.name}
              </strong>
              ? This also removes the skill folder from disk.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deleteTarget &&
                deleteSkill(deleteTarget).then(() => setDeleteTarget(null))
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
