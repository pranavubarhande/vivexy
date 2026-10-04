'use client';

import { useState, useEffect } from 'react';
import type {
  McpServerConfig,
  McpTransport,
} from '@vivexy/core/types/electron';
import { Button } from '@vivexy/ui/button';
import { Input } from '@vivexy/ui/input';
import { Label } from '@vivexy/ui/label';
import { Switch } from '@vivexy/ui/switch';
import { Badge } from '@vivexy/ui/badge';
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
import { Textarea } from '@vivexy/ui/textarea';
import {
  Plus,
  Pencil,
  Trash2,
  FolderOpen,
  Server,
  Globe,
  Monitor,
} from 'lucide-react';

const WEB_MCP_KEY = 'vivexy-mcp-config';

const loadWebConfig = (): Record<string, McpServerConfig> => {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(WEB_MCP_KEY) ?? '{}');
  } catch {
    return {};
  }
};

const saveWebConfig = (cfg: Record<string, McpServerConfig>) => {
  localStorage.setItem(WEB_MCP_KEY, JSON.stringify(cfg));
};

type ServerFormState = {
  name: string;
  transport: McpTransport;
  command: string;
  args: string;
  url: string;
  env: string;
  enabled: boolean;
  description: string;
};

const EMPTY_FORM: ServerFormState = {
  name: '',
  transport: 'stdio',
  command: '',
  args: '',
  url: '',
  env: '',
  enabled: true,
  description: '',
};

export const McpSettings = () => {
  const [servers, setServers] = useState<Record<string, McpServerConfig>>(() =>
    typeof window !== 'undefined' && !window.electronAPI ? loadWebConfig() : {}
  );
  const [configDir, setConfigDir] = useState<string>('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [form, setForm] = useState<ServerFormState>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [formError, setFormError] = useState('');

  const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
  const isDesktop = !!api;

  useEffect(() => {
    if (!isDesktop) return;
    (async () => {
      const [cfg, paths] = await Promise.all([
        api!.getMcpConfig(),
        api!.getExtensionsPaths(),
      ]);
      setServers(cfg);
      setConfigDir(paths.configDir);
    })();
  }, [isDesktop, api]);

  const persistServers = async (updated: Record<string, McpServerConfig>) => {
    if (isDesktop) {
      await api!.saveMcpConfig(updated);
    } else {
      saveWebConfig(updated);
    }
    setServers(updated);
  };

  const openAdd = () => {
    setEditingName(null);
    setForm({ ...EMPTY_FORM, transport: isDesktop ? 'stdio' : 'http' });
    setFormError('');
    setDialogOpen(true);
  };

  const openEdit = (name: string) => {
    const s = servers[name];
    setEditingName(name);
    setForm({
      name,
      transport: s.transport ?? 'stdio',
      command: s.command ?? '',
      args: (s.args ?? []).join(' '),
      url: s.url ?? '',
      env: s.env ? JSON.stringify(s.env, null, 2) : '',
      enabled: s.enabled,
      description: s.description ?? '',
    });
    setFormError('');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const trimmedName = form.name.trim();
    if (!trimmedName) {
      setFormError('Server name is required.');
      return;
    }

    if (form.transport === 'stdio' && !form.command.trim()) {
      setFormError('Command is required for stdio transport.');
      return;
    }
    if (form.transport === 'http' && !form.url.trim()) {
      setFormError('URL is required for HTTP transport.');
      return;
    }
    if (editingName === null && trimmedName in servers) {
      setFormError('A server with this name already exists.');
      return;
    }

    let env: Record<string, string> | undefined;
    if (form.env.trim()) {
      try {
        env = JSON.parse(form.env);
      } catch {
        setFormError('Environment variables must be valid JSON.');
        return;
      }
    }

    const args =
      form.transport === 'stdio' && form.args.trim()
        ? form.args
            .trim()
            .split(/\s+/)
            .filter((a) => a.length > 0)
        : undefined;

    const updated = { ...servers };
    if (editingName !== null && editingName !== trimmedName)
      delete updated[editingName];
    updated[trimmedName] = {
      transport: form.transport,
      command: form.transport === 'stdio' ? form.command.trim() : '',
      args,
      url: form.transport === 'http' ? form.url.trim() : undefined,
      env,
      enabled: form.enabled,
      description: form.description.trim() || undefined,
    };

    await persistServers(updated);
    setDialogOpen(false);
  };

  const handleToggle = async (name: string) => {
    await persistServers({
      ...servers,
      [name]: { ...servers[name], enabled: !servers[name].enabled },
    });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const updated = { ...servers };
    delete updated[deleteTarget];
    await persistServers(updated);
    setDeleteTarget(null);
  };

  const entries = Object.entries(servers);

  return (
    <div className="space-y-4">
      {/* Desktop: show config path; Web: show info banner */}
      {isDesktop && configDir && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-3 py-2 rounded-md">
          <FolderOpen className="h-3.5 w-3.5 shrink-0" />
          <span className="font-mono truncate">
            {configDir}/.vivexy-config.json
          </span>
        </div>
      )}
      {!isDesktop && (
        <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 border px-3 py-2 rounded-md">
          <Globe className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            HTTP/SSE servers work on web and are saved locally in your browser.{' '}
            <span className="inline-flex items-center gap-1">
              <Monitor className="h-3 w-3" /> stdio servers require the desktop
              app.
            </span>
          </span>
        </div>
      )}

      {entries.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm border rounded-lg bg-muted/20">
          <Server className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p>No MCP servers configured.</p>
          <p className="text-xs mt-1">
            Add a server to extend the agent with external tools.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map(([name, cfg]) => (
            <div
              key={name}
              className="flex items-center gap-3 p-3 border rounded-lg bg-background hover:bg-muted/30 transition-colors"
            >
              <Switch
                checked={cfg.enabled}
                onCheckedChange={() => handleToggle(name)}
                aria-label={`Toggle ${name}`}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm truncate">{name}</span>
                  {!cfg.enabled && (
                    <Badge
                      variant="secondary"
                      className="text-[10px] px-1.5 py-0"
                    >
                      disabled
                    </Badge>
                  )}
                  {cfg.transport === 'http' ? (
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 gap-1"
                    >
                      <Globe className="h-2.5 w-2.5" />
                      HTTP
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 gap-1"
                    >
                      <Monitor className="h-2.5 w-2.5" />
                      stdio
                    </Badge>
                  )}
                </div>
                {cfg.description && (
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {cfg.description}
                  </p>
                )}
                <p className="text-xs font-mono text-muted-foreground/70 truncate mt-0.5">
                  {cfg.transport === 'http'
                    ? cfg.url
                    : `${cfg.command} ${(cfg.args ?? []).join(' ')}`}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => openEdit(name)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                  onClick={() => setDeleteTarget(name)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Button onClick={openAdd} size="sm" className="gap-2">
        <Plus className="h-4 w-4" />
        Add MCP Server
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingName !== null ? 'Edit MCP Server' : 'Add MCP Server'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="mcp-name">Server Name</Label>
              <Input
                id="mcp-name"
                placeholder="e.g. filesystem"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                disabled={editingName !== null}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Transport</Label>
              <div className="flex gap-2">
                {(isDesktop
                  ? ['stdio', 'http']
                  : (['http'] as McpTransport[])
                ).map((t) => (
                  <Button
                    key={t}
                    type="button"
                    size="sm"
                    variant={form.transport === t ? 'default' : 'outline'}
                    className="flex-1 h-8 text-xs"
                    onClick={() =>
                      setForm((f) => ({ ...f, transport: t as McpTransport }))
                    }
                  >
                    {t === 'stdio' ? (
                      <span className="flex items-center gap-1.5">
                        <Monitor className="h-3 w-3" />
                        stdio (Desktop)
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5">
                        <Globe className="h-3 w-3" />
                        HTTP / SSE
                      </span>
                    )}
                  </Button>
                ))}
              </div>
            </div>

            {form.transport === 'stdio' ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="mcp-command">Command</Label>
                  <Input
                    id="mcp-command"
                    placeholder="e.g. npx"
                    value={form.command}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, command: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mcp-args">
                    Arguments{' '}
                    <span className="text-muted-foreground text-xs">
                      (space-separated)
                    </span>
                  </Label>
                  <Input
                    id="mcp-args"
                    placeholder="e.g. -y @modelcontextprotocol/server-filesystem /path"
                    value={form.args}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, args: e.target.value }))
                    }
                  />
                </div>
              </>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="mcp-url">URL</Label>
                <Input
                  id="mcp-url"
                  placeholder="e.g. https://my-mcp-server.com/sse"
                  value={form.url}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, url: e.target.value }))
                  }
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="mcp-env">
                Environment Variables{' '}
                <span className="text-muted-foreground text-xs">(JSON)</span>
              </Label>
              <Textarea
                id="mcp-env"
                placeholder={'{\n  "API_KEY": "your-key"\n}'}
                value={form.env}
                onChange={(e) =>
                  setForm((f) => ({ ...f, env: e.target.value }))
                }
                rows={3}
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mcp-desc">Description</Label>
              <Input
                id="mcp-desc"
                placeholder="Optional description"
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="mcp-enabled"
                checked={form.enabled}
                onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
              />
              <Label htmlFor="mcp-enabled">Enabled</Label>
            </div>
            {formError && (
              <p className="text-sm text-destructive">{formError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove MCP Server</AlertDialogTitle>
            <AlertDialogDescription>
              Remove <strong>{deleteTarget}</strong>? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
