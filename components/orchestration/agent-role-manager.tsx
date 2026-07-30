'use client';

/**
 * AgentRoleManager
 *
 * Manages custom agents through the `/api/agents` backend (DB-backed) instead of
 * the old client-side `useRoleStore` localStorage overrides. Every mutation —
 * create, update, delete, enable/disable toggle — is persisted server-side via
 * the REST API, and an AI-generation + import/export flow is layered on top.
 *
 * API surface used:
 *   GET    /api/agents            list agents
 *   POST   /api/agents            create an agent
 *   PUT    /api/agents/[id]       replace/update an agent
 *   PATCH  /api/agents/[id]       partial update (used for the enabled toggle)
 *   DELETE /api/agents/[id]       delete an agent
 *   POST   /api/agents/generate   AI-generate a draft agent profile (not persisted)
 *   POST   /api/agents/import     bulk-import agents from JSON
 *
 * The agent shape mirrors the server-side `CustomAgent`
 * (lib/server/agent-storage.ts) and the `{ success, ... }` response envelope
 * (lib/server/api-response.ts). Those types are duplicated locally so this
 * client component never imports server-only modules.
 */
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { EmptyState } from '@/components/ui/empty-state';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';
import {
  Pencil,
  Save,
  X,
  Brain,
  Shield,
  UserCheck,
  Users,
  BookOpen,
  MessageSquare,
  BarChart3,
  Plus,
  Sparkles,
  Download,
  Upload,
  Trash2,
  Loader2,
  RefreshCw,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A persisted custom agent (mirrors server `CustomAgent`). */
interface Agent {
  id: string;
  ownerId: string | null;
  name: string;
  role: string;
  systemPrompt: string;
  voice: string | null;
  avatar: string | null;
  allowedActions: string[];
  enabled: boolean;
  category: string | null;
  createdAt: number;
  updatedAt: number;
  source?: 'custom';
}

/** Editable subset shared by the create + edit forms. */
type EditableAgent = Partial<
  Pick<
    Agent,
    'id' | 'name' | 'role' | 'systemPrompt' | 'voice' | 'avatar' | 'allowedActions' | 'enabled' | 'category'
  >
>;

interface ListResponse {
  success: true;
  agents: Agent[];
  total: number;
  enabledCount: number;
}
interface AgentResponse {
  success: true;
  agent: Agent;
}
interface GeneratedAgent {
  id?: string;
  name?: string;
  role?: string;
  systemPrompt?: string;
  voice?: string | null;
  avatar?: string | null;
  category?: string | null;
  allowedActions?: string[];
}
interface GenerateResponse {
  success: true;
  agent: GeneratedAgent;
}
interface ImportResponse {
  success: true;
  created: string[];
  updated: string[];
  skipped: Array<{ id: string; reason: string }>;
}
interface DeleteResponse {
  success: true;
  deleted: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Custom agent id validation rule (mirrors server `CUSTOM_AGENT_ID_PATTERN`). */
const ID_PATTERN = /^[a-z0-9_-]+$/;

/** Selectable roles for the create/edit form. */
const ROLE_OPTIONS: string[] = [
  'teacher',
  'assistant',
  'student',
  'tutor',
  'evaluator',
  'mentor',
  'facilitator',
  'critic',
  'summarizer',
  'researcher',
];

const ROLE_ICONS: Record<string, React.ReactNode> = {
  teacher: <Brain className="h-4 w-4" />,
  assistant: <UserCheck className="h-4 w-4" />,
  student: <Users className="h-4 w-4" />,
  tutor: <BookOpen className="h-4 w-4" />,
  evaluator: <BarChart3 className="h-4 w-4" />,
  mentor: <Shield className="h-4 w-4" />,
  facilitator: <MessageSquare className="h-4 w-4" />,
};

/** Known classroom actions (mirrors the generate endpoint's vocabulary). */
const KNOWN_ACTIONS: string[] = [
  'spotlight',
  'laser',
  'play_video',
  'wb_open',
  'wb_close',
  'wb_draw_text',
  'wb_draw_shape',
  'wb_draw_chart',
  'wb_draw_latex',
  'wb_draw_table',
  'wb_draw_line',
  'wb_draw_code',
  'wb_edit_code',
  'wb_clear',
  'wb_delete',
];

type NoticeType = 'success' | 'error' | 'info';
interface Notice {
  type: NoticeType;
  message: string;
}

// ---------------------------------------------------------------------------
// API helper — unwraps the `{ success, ... }` envelope and throws an Error
// carrying the server's `error` (+ `details`) text for the UI to display.
// ---------------------------------------------------------------------------

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const raw = await res.text();
  let body: unknown;
  if (raw) {
    try {
      body = JSON.parse(raw);
    } catch {
      body = undefined;
    }
  }
  if (!res.ok || (isObject(body) && body.success === false)) {
    const b = isObject(body) ? body : {};
    const error =
      typeof b.error === 'string' ? b.error : `Request failed (status ${res.status})`;
    const details = typeof b.details === 'string' ? ` — ${b.details}` : '';
    throw new Error(`${error}${details}`);
  }
  return body as T;
}

/** Toggle a string value in/out of an array (immutable). */
function toggleString(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AgentRoleManager() {
  const { t } = useI18n();

  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  // Per-action busy flags, keyed by `create` | `generate` | `import` |
  // `save:<id>` | `delete:<id>` | `toggle:<id>`. Drives button spinners/disabled.
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  // Edit mode.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditableAgent>({});

  // Create form.
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<EditableAgent>({});

  // Generate-with-AI panel.
  const [showGenerate, setShowGenerate] = useState(false);
  const [genDescription, setGenDescription] = useState('');

  // Hidden file input for import.
  const fileInputRef = useRef<HTMLInputElement>(null);

  const setBusyKey = useCallback((key: string, value: boolean) => {
    setBusy((b) => ({ ...b, [key]: value }));
  }, []);

  // ---- load agents on mount ----
  const loadAgents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<ListResponse>('/api/agents');
      setAgents(Array.isArray(data.agents) ? data.agents : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load agents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAgents();
  }, [loadAgents]);

  const resetCreateForm = useCallback(() => {
    setCreateForm({ role: 'assistant', enabled: true, allowedActions: [] });
  }, []);

  // ---- create (POST /api/agents) ----
  const handleCreate = useCallback(async () => {
    const id = (createForm.id ?? '').trim();
    const name = (createForm.name ?? '').trim();
    const role = (createForm.role ?? '').trim();
    const systemPrompt = (createForm.systemPrompt ?? '').trim();

    if (!id || !ID_PATTERN.test(id) || id.length > 64) {
      setNotice({
        type: 'error',
        message: 'ID is required and must match /^[a-z0-9_-]+$/ (max 64 chars).',
      });
      return;
    }
    if (!name) {
      setNotice({ type: 'error', message: 'Name is required.' });
      return;
    }
    if (!role) {
      setNotice({ type: 'error', message: 'Role is required.' });
      return;
    }
    if (!systemPrompt) {
      setNotice({ type: 'error', message: 'System prompt is required.' });
      return;
    }

    const payload = {
      id,
      name,
      role,
      systemPrompt,
      allowedActions: createForm.allowedActions ?? [],
      enabled: createForm.enabled ?? true,
      category: createForm.category && createForm.category.trim() ? createForm.category.trim() : null,
      voice: createForm.voice ?? null,
      avatar: createForm.avatar ?? null,
    };

    setBusyKey('create', true);
    setNotice(null);
    try {
      const data = await apiFetch<AgentResponse>('/api/agents', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setAgents((prev) =>
        [...prev, data.agent].sort((a, b) => a.name.localeCompare(b.name)),
      );
      resetCreateForm();
      setShowCreate(false);
      setNotice({ type: 'success', message: `Created agent "${data.agent.name}".` });
    } catch (e) {
      setNotice({
        type: 'error',
        message: e instanceof Error ? e.message : 'Failed to create agent.',
      });
    } finally {
      setBusyKey('create', false);
    }
  }, [createForm, resetCreateForm, setBusyKey]);

  // ---- edit (PUT /api/agents/[id]) ----
  const handleEdit = useCallback((agent: Agent) => {
    setEditingId(agent.id);
    setEditForm({
      name: agent.name,
      role: agent.role,
      systemPrompt: agent.systemPrompt,
      allowedActions: [...agent.allowedActions],
      enabled: agent.enabled,
      category: agent.category,
      voice: agent.voice,
      avatar: agent.avatar,
    });
    setNotice(null);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setEditForm({});
  }, []);

  const handleSave = useCallback(async () => {
    if (!editingId) return;
    const name = (editForm.name ?? '').trim();
    const role = (editForm.role ?? '').trim();
    const systemPrompt = (editForm.systemPrompt ?? '').trim();
    if (!name) {
      setNotice({ type: 'error', message: 'Name is required.' });
      return;
    }
    if (!role) {
      setNotice({ type: 'error', message: 'Role is required.' });
      return;
    }
    if (!systemPrompt) {
      setNotice({ type: 'error', message: 'System prompt is required.' });
      return;
    }

    const payload = {
      name,
      role,
      systemPrompt,
      allowedActions: editForm.allowedActions ?? [],
      enabled: editForm.enabled ?? true,
      category: editForm.category && editForm.category.trim() ? editForm.category.trim() : null,
    };

    const key = `save:${editingId}`;
    setBusyKey(key, true);
    setNotice(null);
    try {
      const data = await apiFetch<AgentResponse>(
        `/api/agents/${encodeURIComponent(editingId)}`,
        { method: 'PUT', body: JSON.stringify(payload) },
      );
      setAgents((prev) =>
        prev
          .map((a) => (a.id === editingId ? data.agent : a))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      setEditingId(null);
      setEditForm({});
      setNotice({ type: 'success', message: `Updated agent "${data.agent.name}".` });
    } catch (e) {
      setNotice({
        type: 'error',
        message: e instanceof Error ? e.message : 'Failed to update agent.',
      });
    } finally {
      setBusyKey(key, false);
    }
  }, [editingId, editForm, setBusyKey]);

  // ---- delete (DELETE /api/agents/[id]) ----
  const handleDelete = useCallback(
    async (id: string) => {
      const key = `delete:${id}`;
      setBusyKey(key, true);
      setNotice(null);
      try {
        await apiFetch<DeleteResponse>(`/api/agents/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        });
        setAgents((prev) => prev.filter((a) => a.id !== id));
        if (editingId === id) {
          setEditingId(null);
          setEditForm({});
        }
        setNotice({ type: 'success', message: 'Agent deleted.' });
      } catch (e) {
        setNotice({
          type: 'error',
          message: e instanceof Error ? e.message : 'Failed to delete agent.',
        });
      } finally {
        setBusyKey(key, false);
      }
    },
    [editingId, setBusyKey],
  );

  // ---- toggle enabled (PATCH /api/agents/[id]) ----
  const handleToggleEnabled = useCallback(
    async (agent: Agent) => {
      const next = !agent.enabled;
      // Optimistic update for a snappy toggle; revert on failure.
      setAgents((prev) =>
        prev.map((a) => (a.id === agent.id ? { ...a, enabled: next } : a)),
      );
      const key = `toggle:${agent.id}`;
      setBusyKey(key, true);
      setNotice(null);
      try {
        const data = await apiFetch<AgentResponse>(
          `/api/agents/${encodeURIComponent(agent.id)}`,
          { method: 'PATCH', body: JSON.stringify({ enabled: next }) },
        );
        setAgents((prev) => prev.map((a) => (a.id === agent.id ? data.agent : a)));
      } catch (e) {
        setAgents((prev) =>
          prev.map((a) => (a.id === agent.id ? { ...a, enabled: agent.enabled } : a)),
        );
        setNotice({
          type: 'error',
          message: e instanceof Error ? e.message : 'Failed to update agent.',
        });
      } finally {
        setBusyKey(key, false);
      }
    },
    [setBusyKey],
  );

  // ---- generate with AI (POST /api/agents/generate) ----
  // Returns a draft (not persisted); populate the create form for review.
  const handleGenerate = useCallback(async () => {
    const description = genDescription.trim();
    if (!description) {
      setNotice({
        type: 'error',
        message: 'Please describe the agent you want to generate.',
      });
      return;
    }
    if (description.length > 1000) {
      setNotice({ type: 'error', message: 'Description must be 1000 characters or fewer.' });
      return;
    }
    setBusyKey('generate', true);
    setNotice(null);
    try {
      const data = await apiFetch<GenerateResponse>('/api/agents/generate', {
        method: 'POST',
        body: JSON.stringify({ description }),
      });
      const draft = data.agent ?? {};
      setCreateForm({
        id: typeof draft.id === 'string' ? draft.id : '',
        name: typeof draft.name === 'string' ? draft.name : '',
        role: typeof draft.role === 'string' ? draft.role : 'assistant',
        systemPrompt: typeof draft.systemPrompt === 'string' ? draft.systemPrompt : '',
        voice: typeof draft.voice === 'string' ? draft.voice : null,
        avatar: typeof draft.avatar === 'string' ? draft.avatar : null,
        category: typeof draft.category === 'string' ? draft.category : null,
        allowedActions: Array.isArray(draft.allowedActions)
          ? draft.allowedActions.filter((v): v is string => typeof v === 'string')
          : [],
        enabled: true,
      });
      setShowCreate(true);
      setGenDescription('');
      setNotice({
        type: 'success',
        message: 'AI generated a draft — review and save to persist.',
      });
    } catch (e) {
      setNotice({
        type: 'error',
        message: e instanceof Error ? e.message : 'Agent generation failed.',
      });
    } finally {
      setBusyKey('generate', false);
    }
  }, [genDescription, setBusyKey]);

  // ---- export (download current agents as JSON) ----
  const handleExport = useCallback(() => {
    if (agents.length === 0) return;
    const json = JSON.stringify(agents, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nova-agents-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [agents]);

  // ---- import (upload JSON → POST /api/agents/import) ----
  const handleImportFile = useCallback(
    async (file: File) => {
      setBusyKey('import', true);
      setNotice(null);
      try {
        const text = await file.text();
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          throw new Error('Invalid JSON file.');
        }
        const payload: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
        const data = await apiFetch<ImportResponse>('/api/agents/import', {
          method: 'POST',
          body: JSON.stringify({ agents: payload, overwrite: true }),
        });
        const parts: string[] = [];
        if (data.created.length) parts.push(`${data.created.length} created`);
        if (data.updated.length) parts.push(`${data.updated.length} updated`);
        if (data.skipped.length) parts.push(`${data.skipped.length} skipped`);
        const skippedDetail = data.skipped.length
          ? ` (${data.skipped.map((s) => s.id).join(', ')})`
          : '';
        setNotice({
          type: data.skipped.length ? 'info' : 'success',
          message: `Import complete: ${parts.join(', ') || 'no changes'}${skippedDetail}`,
        });
        await loadAgents();
      } catch (e) {
        setNotice({ type: 'error', message: e instanceof Error ? e.message : 'Import failed.' });
      } finally {
        setBusyKey('import', false);
      }
    },
    [loadAgents, setBusyKey],
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void handleImportFile(file);
      // Reset so selecting the same file again still fires `change`.
      e.target.value = '';
    },
    [handleImportFile],
  );

  const openCreate = useCallback(() => {
    setShowGenerate(false);
    setShowCreate(true);
  }, []);

  const openGenerate = useCallback(() => {
    setShowGenerate((s) => !s);
  }, []);

  // ---- derived: action options (known set + any custom actions on the form) ----
  const createActionOptions = useMemo(() => {
    const set = new Set<string>(KNOWN_ACTIONS);
    (createForm.allowedActions ?? []).forEach((a) => set.add(a));
    return Array.from(set);
  }, [createForm.allowedActions]);

  const editActionOptions = useMemo(() => {
    const set = new Set<string>(KNOWN_ACTIONS);
    (editForm.allowedActions ?? []).forEach((a) => set.add(a));
    return Array.from(set);
  }, [editForm.allowedActions]);

  // Include the agent's current role in the select if it isn't a standard one.
  const editRoleOptions = useMemo(() => {
    const r = editForm.role;
    if (r && !ROLE_OPTIONS.includes(r)) return [...ROLE_OPTIONS, r];
    return ROLE_OPTIONS;
  }, [editForm.role]);

  const isBusy = useCallback((key: string) => !!busy[key], [busy]);

  // ---- render ----
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold">{t('settings.agentRoles.title')}</h3>
          <p className="text-sm text-muted-foreground">{t('agentRoles.subtitle')}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void loadAgents()} disabled={loading}>
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="default" size="sm" onClick={openCreate}>
          <Plus className="h-3.5 w-3.5" />
          New agent
        </Button>
        <Button variant="outline" size="sm" onClick={openGenerate}>
          <Sparkles className="h-3.5 w-3.5" />
          Generate with AI
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={isBusy('import')}
        >
          <Upload className="h-3.5 w-3.5" />
          Import
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={agents.length === 0}
        >
          <Download className="h-3.5 w-3.5" />
          Export
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* Notice banner */}
      {notice && (
        <div
          className={cn(
            'flex items-start gap-2 rounded-md border px-3 py-2 text-sm',
            notice.type === 'error'
              ? 'border-destructive/30 bg-destructive/5 text-destructive'
              : notice.type === 'success'
                ? 'border-emerald-300/40 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
                : 'border-border bg-muted text-muted-foreground',
          )}
        >
          <span className="flex-1">{notice.message}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="shrink-0 opacity-70 hover:opacity-100"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Generate-with-AI panel */}
      {showGenerate && (
        <Card className="p-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-medium">
                <Sparkles className="h-4 w-4" />
                Generate with AI
              </span>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => setShowGenerate(false)}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div>
              <Label className="text-xs">Describe the agent to generate</Label>
              <Textarea
                value={genDescription}
                onChange={(e) => setGenDescription(e.target.value)}
                className="mt-1 text-sm"
                placeholder="e.g. A patient biology tutor who asks checking-for-understanding questions and draws diagrams on the whiteboard."
              />
            </div>
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={() => void handleGenerate()}
                disabled={isBusy('generate')}
              >
                {isBusy('generate') ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                Generate
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Create form */}
      {showCreate && (
        <Card className="p-4 ring-2 ring-primary">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">New agent</span>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => {
                  setShowCreate(false);
                  resetCreateForm();
                }}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">ID</Label>
                <Input
                  value={createForm.id ?? ''}
                  onChange={(e) => setCreateForm((f) => ({ ...f, id: e.target.value }))}
                  placeholder="e.g. biology-tutor"
                  className="mt-1 h-8 font-mono text-sm"
                />
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Lowercase letters, digits, _ or - only (max 64).
                </p>
              </div>
              <div>
                <Label className="text-xs">Name</Label>
                <Input
                  value={createForm.name ?? ''}
                  onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                  className="mt-1 h-8 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Role</Label>
                <Select
                  value={createForm.role ?? 'assistant'}
                  onValueChange={(v) => setCreateForm((f) => ({ ...f, role: v }))}
                >
                  <SelectTrigger className="mt-1 h-8 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Category</Label>
                <Input
                  value={createForm.category ?? ''}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, category: e.target.value }))
                  }
                  placeholder="optional"
                  className="mt-1 h-8 text-sm"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">System prompt</Label>
              <Textarea
                value={createForm.systemPrompt ?? ''}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, systemPrompt: e.target.value }))
                }
                className="mt-1 text-sm"
                placeholder="Describe the agent's persona, teaching style, tone, and behavior."
              />
            </div>

            <div>
              <Label className="text-xs">
                {t('agentRoles.permissions', { n: createForm.allowedActions?.length ?? 0 })}
              </Label>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {createActionOptions.map((action) => (
                  <Badge
                    key={action}
                    variant={createForm.allowedActions?.includes(action) ? 'default' : 'outline'}
                    className="cursor-pointer text-xs"
                    onClick={() =>
                      setCreateForm((f) => ({
                        ...f,
                        allowedActions: toggleString(f.allowedActions ?? [], action),
                      }))
                    }
                  >
                    {action}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch
                  checked={createForm.enabled ?? true}
                  onCheckedChange={(v) => setCreateForm((f) => ({ ...f, enabled: v }))}
                />
                <Label className="text-xs">Enabled</Label>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowCreate(false);
                    resetCreateForm();
                  }}
                >
                  Cancel
                </Button>
                <Button size="sm" onClick={() => void handleCreate()} disabled={isBusy('create')}>
                  {isBusy('create') ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  Create agent
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* List / loading / error / empty states */}
      {loading && agents.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading agents…
        </div>
      ) : agents.length === 0 ? (
        error ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="mb-3 text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={() => void loadAgents()}>
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </Button>
          </div>
        ) : (
          <EmptyState
            icon={Users}
            title="No agents yet"
            description="Create a custom agent to manage its role and permissions, or generate one from a natural-language description."
            action={
              <Button size="sm" onClick={openCreate}>
                <Plus className="h-3.5 w-3.5" />
                New agent
              </Button>
            }
            secondaryAction={
              <Button variant="outline" size="sm" onClick={openGenerate}>
                <Sparkles className="h-3.5 w-3.5" />
                Generate with AI
              </Button>
            }
          />
        )
      ) : (
        <div className="space-y-2">
          {error && (
            <div className="flex items-center justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              <span>{error}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void loadAgents()}
                disabled={loading}
              >
                <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
                Retry
              </Button>
            </div>
          )}
          <ScrollArea className="h-[400px]">
            <div className="space-y-3 pr-4">
              {agents.map((agent) => (
                <Card
                  key={agent.id}
                  className={cn('p-4', editingId === agent.id && 'ring-2 ring-primary')}
                >
                  {editingId === agent.id ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {ROLE_ICONS[editForm.role ?? ''] || <Users className="h-4 w-4" />}
                          <Input
                            value={editForm.name ?? ''}
                            onChange={(e) =>
                              setEditForm((f) => ({ ...f, name: e.target.value }))
                            }
                            className="h-8 w-40 text-sm font-medium"
                          />
                        </div>
                        <div className="flex gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => void handleSave()}
                            disabled={isBusy(`save:${agent.id}`)}
                            aria-label="Save"
                          >
                            {isBusy(`save:${agent.id}`) ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Save className="h-4 w-4 text-green-500" />
                            )}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={handleCancelEdit}
                            aria-label="Cancel"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <Label className="text-xs">Role</Label>
                          <Select
                            value={editForm.role ?? 'assistant'}
                            onValueChange={(v) => setEditForm((f) => ({ ...f, role: v }))}
                          >
                            <SelectTrigger className="mt-1 h-8 w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {editRoleOptions.map((r) => (
                                <SelectItem key={r} value={r}>
                                  {r}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">Category</Label>
                          <Input
                            value={editForm.category ?? ''}
                            onChange={(e) =>
                              setEditForm((f) => ({ ...f, category: e.target.value }))
                            }
                            placeholder="optional"
                            className="mt-1 h-8 text-sm"
                          />
                        </div>
                      </div>

                      <div>
                        <Label className="text-xs">System prompt</Label>
                        <Textarea
                          value={editForm.systemPrompt ?? ''}
                          onChange={(e) =>
                            setEditForm((f) => ({ ...f, systemPrompt: e.target.value }))
                          }
                          className="mt-1 text-sm"
                        />
                      </div>

                      <div>
                        <Label className="text-xs">
                          {t('agentRoles.permissions', {
                            n: editForm.allowedActions?.length ?? 0,
                          })}
                        </Label>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {editActionOptions.map((action) => (
                            <Badge
                              key={action}
                              variant={
                                editForm.allowedActions?.includes(action) ? 'default' : 'outline'
                              }
                              className="cursor-pointer text-xs"
                              onClick={() =>
                                setEditForm((f) => ({
                                  ...f,
                                  allowedActions: toggleString(f.allowedActions ?? [], action),
                                }))
                              }
                            >
                              {action}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Switch
                          checked={editForm.enabled ?? true}
                          onCheckedChange={(v) => setEditForm((f) => ({ ...f, enabled: v }))}
                        />
                        <Label className="text-xs">Enabled</Label>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3">
                      <div className="rounded-lg bg-primary/5 p-2">
                        {ROLE_ICONS[agent.role] || <Users className="h-5 w-5" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{agent.name}</span>
                          <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                            {agent.role}
                          </Badge>
                          <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                            {agent.id}
                          </Badge>
                          {!agent.enabled && (
                            <Badge
                              variant="outline"
                              className="px-1.5 py-0 text-[10px] text-muted-foreground"
                            >
                              disabled
                            </Badge>
                          )}
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {agent.systemPrompt}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {agent.allowedActions.slice(0, 5).map((action) => (
                            <Badge
                              key={action}
                              variant="outline"
                              className="px-1.5 py-0 text-[10px]"
                            >
                              {action}
                            </Badge>
                          ))}
                          {agent.allowedActions.length > 5 && (
                            <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                              +{agent.allowedActions.length - 5}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <Switch
                          checked={agent.enabled}
                          disabled={isBusy(`toggle:${agent.id}`)}
                          onCheckedChange={() => void handleToggleEnabled(agent)}
                        />
                        <div className="flex gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => handleEdit(agent)}
                            aria-label="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive"
                            disabled={isBusy(`delete:${agent.id}`)}
                            onClick={() => void handleDelete(agent.id)}
                            aria-label="Delete"
                          >
                            {isBusy(`delete:${agent.id}`) ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
