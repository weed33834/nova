'use client';

/**
 * MCP Settings panel (Phase D — consumer side).
 *
 * Lists configured MCP servers, lets the user add/edit/delete/test them, and
 * toggles per-server enablement. Server configs persist in the settings store
 * (`mcpServersConfig`); on the next agent turn the client forwards them to
 * `/api/agent/edit`, where the server-side `MCPClientManager` connects and
 * adapts the discovered tools into the editor agent's toolset.
 *
 * "Test connection" POSTs a single server to `/api/mcp/test`, which performs a
 * one-shot connect + listTools. A successful test means the next agent turn
 * already has the tools (the manager is idempotent).
 */
import { useState } from 'react';
import { nanoid } from 'nanoid';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Plus,
  Pencil,
  Trash2,
  Plug,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useSettingsStore } from '@/lib/store/settings';
import { toast } from 'sonner';
import type { MCPServerConfig, MCPTransport } from '@/lib/mcp/config';
import { isStdioTransportAvailable } from '@/lib/mcp/config';

/** Form state for the add/edit dialog. */
interface ServerForm {
  id: string;
  name: string;
  enabled: boolean;
  transport: MCPTransport;
  command: string;
  args: string;
  env: Array<{ key: string; value: string }>;
  url: string;
  authToken: string;
}

function emptyForm(): ServerForm {
  return {
    id: nanoid(),
    name: '',
    enabled: true,
    transport: 'http',
    command: '',
    args: '',
    env: [],
    url: '',
    authToken: '',
  };
}

function configToForm(c: MCPServerConfig): ServerForm {
  return {
    id: c.id,
    name: c.name,
    enabled: c.enabled,
    transport: c.transport,
    command: c.command ?? '',
    args: (c.args ?? []).join(' '),
    env: Object.entries(c.env ?? {}).map(([key, value]) => ({ key, value })),
    url: c.url ?? '',
    authToken: c.authToken ?? '',
  };
}

function formToConfig(f: ServerForm): MCPServerConfig {
  const args = f.args.trim().length > 0 ? f.args.trim().split(/\s+/) : undefined;
  const env: Record<string, string> = {};
  for (const e of f.env) {
    const key = e.key.trim();
    if (key) env[key] = e.value;
  }
  return {
    id: f.id,
    name: f.name.trim(),
    enabled: f.enabled,
    transport: f.transport,
    command: f.transport === 'stdio' ? f.command.trim() || undefined : undefined,
    args: f.transport === 'stdio' ? args : undefined,
    env: f.transport === 'stdio' && Object.keys(env).length > 0 ? env : undefined,
    url: f.transport === 'http' ? f.url.trim() || undefined : undefined,
    authToken: f.transport === 'http' ? f.authToken.trim() || undefined : undefined,
  };
}

type TestState = { status: 'idle' | 'testing' | 'ok' | 'error'; message?: string };

export function McpSettings() {
  const { t } = useI18n();
  const mcpServersConfig = useSettingsStore((s) => s.mcpServersConfig);
  const setMCPServersConfig = useSettingsStore((s) => s.setMCPServersConfig);

  const [showDialog, setShowDialog] = useState(false);
  const [editingForm, setEditingForm] = useState<ServerForm | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MCPServerConfig | null>(null);
  // Per-server test state, keyed by server id.
  const [testState, setTestState] = useState<Record<string, TestState>>({});
  const stdioAvailable = isStdioTransportAvailable();

  const servers = Object.values(mcpServersConfig);

  const openAdd = () => {
    setEditingForm(emptyForm());
    setShowDialog(true);
  };

  const openEdit = (c: MCPServerConfig) => {
    setEditingForm(configToForm(c));
    setShowDialog(true);
  };

  const saveForm = () => {
    if (!editingForm) return;
    if (!editingForm.name.trim()) {
      toast.error(t('settings.mcpServerRequired'));
      return;
    }
    if (editingForm.transport === 'stdio' && !editingForm.command.trim()) {
      toast.error(t('settings.mcpStdioCommandRequired'));
      return;
    }
    if (editingForm.transport === 'http' && !editingForm.url.trim()) {
      toast.error(t('settings.mcpHttpUrlRequired'));
      return;
    }
    const cfg = formToConfig(editingForm);
    setMCPServersConfig({ ...mcpServersConfig, [cfg.id]: cfg });
    setShowDialog(false);
    setEditingForm(null);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    const next = { ...mcpServersConfig };
    delete next[deleteTarget.id];
    setMCPServersConfig(next);
    setTestState((prev) => {
      const copy = { ...prev };
      delete copy[deleteTarget.id];
      return copy;
    });
    setDeleteTarget(null);
  };

  const toggleEnabled = (c: MCPServerConfig, enabled: boolean) => {
    setMCPServersConfig({
      ...mcpServersConfig,
      [c.id]: { ...c, enabled },
    });
  };

  const testConnection = async (c: MCPServerConfig) => {
    setTestState((prev) => ({ ...prev, [c.id]: { status: 'testing' } }));
    try {
      const res = await fetch('/api/mcp/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ server: { ...c, enabled: true } }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        connected?: boolean;
        toolCount?: number;
        error?: string;
      };
      if (data.success && data.connected) {
        const count = data.toolCount ?? 0;
        const message = t('settings.mcpTestSuccess').replace('{count}', String(count));
        setTestState((prev) => ({
          ...prev,
          [c.id]: { status: 'ok', message },
        }));
        // Persist status into the stored config so it survives a re-render.
        setMCPServersConfig({
          ...mcpServersConfig,
          [c.id]: {
            ...c,
            lastStatus: 'connected',
            lastStatusMessage: `${count} tools`,
            lastCheckedAt: new Date().toISOString(),
          },
        });
        toast.success(message);
      } else {
        const msg = data.error ?? t('settings.mcpTestFailed');
        setTestState((prev) => ({ ...prev, [c.id]: { status: 'error', message: msg } }));
        setMCPServersConfig({
          ...mcpServersConfig,
          [c.id]: {
            ...c,
            lastStatus: 'error',
            lastStatusMessage: msg,
            lastCheckedAt: new Date().toISOString(),
          },
        });
        toast.error(msg);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setTestState((prev) => ({ ...prev, [c.id]: { status: 'error', message: msg } }));
      toast.error(msg);
    }
  };

  const statusBadge = (c: MCPServerConfig) => {
    // Prefer live test state, fall back to persisted lastStatus.
    const live = testState[c.id];
    if (live?.status === 'testing') {
      return (
        <Badge variant="secondary" className="gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          {t('settings.mcpTesting')}
        </Badge>
      );
    }
    if (live?.status === 'ok' || (!live && c.lastStatus === 'connected')) {
      return (
        <Badge variant="default" className="gap-1 bg-emerald-600 hover:bg-emerald-600">
          <CheckCircle2 className="h-3 w-3" />
          {t('settings.mcpStatusConnected')}
        </Badge>
      );
    }
    if (live?.status === 'error' || (!live && c.lastStatus === 'error')) {
      return (
        <Badge variant="destructive" className="gap-1">
          <XCircle className="h-3 w-3" />
          {t('settings.mcpStatusError')}
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="gap-1">
        {t('settings.mcpStatusUnknown')}
      </Badge>
    );
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
        {t('settings.mcpSettingsDescription')}
      </div>

      {servers.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {t('settings.mcpEmpty')}
        </div>
      ) : (
        <div className="space-y-3">
          {servers.map((c) => {
            const live = testState[c.id];
            const errorMsg =
              live?.status === 'error'
                ? live.message
                : c.lastStatus === 'error'
                  ? c.lastStatusMessage
                  : undefined;
            return (
              <div key={c.id} className="rounded-lg border p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">{c.name}</span>
                      {statusBadge(c)}
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {c.transport}
                      </Badge>
                      {!c.enabled && (
                        <Badge variant="secondary">{t('settings.mcpStatusUnknown')}</Badge>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground truncate">
                      {c.transport === 'stdio'
                        ? `${c.command ?? ''} ${(c.args ?? []).join(' ')}`
                        : (c.url ?? '')}
                    </div>
                    {errorMsg && (
                      <div className="mt-1.5 flex items-start gap-1.5 text-xs text-destructive">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        <span className="break-all">{errorMsg}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => testConnection(c)}
                      disabled={live?.status === 'testing'}
                    >
                      {live?.status === 'testing' ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Plug className="h-3.5 w-3.5" />
                      )}
                      {t('settings.mcpTestConnection')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openEdit(c)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setDeleteTarget(c)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm">{t('settings.mcpEnabled')}</Label>
                    <p className="text-xs text-muted-foreground">{t('settings.mcpEnabledHint')}</p>
                  </div>
                  <Switch checked={c.enabled} onCheckedChange={(v) => toggleEnabled(c, v)} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Button onClick={openAdd} className="gap-1.5">
        <Plus className="h-4 w-4" />
        {t('settings.mcpAddServer')}
      </Button>

      {/* Add / Edit dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingForm && mcpServersConfig[editingForm.id]
                ? t('settings.mcpEditServerTitle')
                : t('settings.mcpAddServerTitle')}
            </DialogTitle>
            <DialogDescription>{t('settings.mcpSettingsDescription')}</DialogDescription>
          </DialogHeader>

          {editingForm && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm">{t('settings.mcpServerName')}</Label>
                <Input
                  value={editingForm.name}
                  onChange={(e) => setEditingForm({ ...editingForm, name: e.target.value })}
                  placeholder={t('settings.mcpServerNamePlaceholder')}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm">{t('settings.mcpTransport')}</Label>
                <Select
                  value={editingForm.transport}
                  onValueChange={(v: MCPTransport) =>
                    setEditingForm({ ...editingForm, transport: v })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="http">{t('settings.mcpTransportHttp')}</SelectItem>
                    <SelectItem value="stdio" disabled={!stdioAvailable}>
                      {t('settings.mcpTransportStdio')}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {editingForm.transport === 'stdio'
                    ? stdioAvailable
                      ? t('settings.mcpTransportStdioHint')
                      : t('settings.mcpStdioUnavailable')
                    : t('settings.mcpTransportHttpHint')}
                </p>
              </div>

              {editingForm.transport === 'stdio' ? (
                <>
                  <div className="space-y-2">
                    <Label className="text-sm">{t('settings.mcpCommand')}</Label>
                    <Input
                      value={editingForm.command}
                      onChange={(e) => setEditingForm({ ...editingForm, command: e.target.value })}
                      placeholder={t('settings.mcpCommandPlaceholder')}
                      disabled={!stdioAvailable}
                      className="font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">{t('settings.mcpArgs')}</Label>
                    <Input
                      value={editingForm.args}
                      onChange={(e) => setEditingForm({ ...editingForm, args: e.target.value })}
                      placeholder={t('settings.mcpArgsPlaceholder')}
                      disabled={!stdioAvailable}
                      className="font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">{t('settings.mcpEnv')}</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 text-xs"
                        onClick={() =>
                          setEditingForm({
                            ...editingForm,
                            env: [...editingForm.env, { key: '', value: '' }],
                          })
                        }
                        disabled={!stdioAvailable}
                      >
                        <Plus className="h-3 w-3" />
                        {t('settings.mcpAddEnv')}
                      </Button>
                    </div>
                    {editingForm.env.length === 0 ? (
                      <p className="text-xs text-muted-foreground">{t('settings.optional')}</p>
                    ) : (
                      <div className="space-y-2">
                        {editingForm.env.map((e, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <Input
                              value={e.key}
                              onChange={(ev) => {
                                const env = [...editingForm.env];
                                env[i] = { ...env[i], key: ev.target.value };
                                setEditingForm({ ...editingForm, env });
                              }}
                              placeholder={t('settings.mcpEnvKeyPlaceholder')}
                              className="font-mono text-sm"
                            />
                            <Input
                              value={e.value}
                              onChange={(ev) => {
                                const env = [...editingForm.env];
                                env[i] = { ...env[i], value: ev.target.value };
                                setEditingForm({ ...editingForm, env });
                              }}
                              placeholder={t('settings.mcpEnvValuePlaceholder')}
                              className="font-mono text-sm"
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                              onClick={() => {
                                const env = editingForm.env.filter((_, j) => j !== i);
                                setEditingForm({ ...editingForm, env });
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label className="text-sm">{t('settings.mcpUrl')}</Label>
                    <Input
                      value={editingForm.url}
                      onChange={(e) => setEditingForm({ ...editingForm, url: e.target.value })}
                      placeholder={t('settings.mcpUrlPlaceholder')}
                      className="font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">{t('settings.mcpAuthToken')}</Label>
                    <Input
                      type="password"
                      value={editingForm.authToken}
                      onChange={(e) =>
                        setEditingForm({ ...editingForm, authToken: e.target.value })
                      }
                      placeholder={t('settings.mcpAuthTokenPlaceholder')}
                      className="font-mono text-sm"
                      autoComplete="new-password"
                    />
                  </div>
                </>
              )}

              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm">{t('settings.mcpEnabled')}</Label>
                  <p className="text-xs text-muted-foreground">{t('settings.mcpEnabledHint')}</p>
                </div>
                <Switch
                  checked={editingForm.enabled}
                  onCheckedChange={(v) => setEditingForm({ ...editingForm, enabled: v })}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              {t('settings.cancelEdit')}
            </Button>
            <Button onClick={saveForm}>{t('settings.saveModel')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('settings.mcpDeleteServer')}</AlertDialogTitle>
            <AlertDialogDescription>{t('settings.mcpDeleteServerConfirm')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('settings.cancelEdit')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>
              {t('settings.mcpDeleteServer')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
