'use client';

/**
 * Skill management panel (Phase 2A — Agent skill layer UI).
 *
 * Lists every agent skill — built-in (read-only) + custom (user-defined
 * prompt-based tools) — and provides the full CRUD lifecycle plus the three
 * enterprise affordances the user requested:
 *
 *   • AI auto-generate — describe a capability in plain language, the resolved
 *     LLM drafts a complete skill spec for review.
 *   • Import / Export — transfer skill packs between deployments as JSON.
 *   • In-place test — invoke a skill with sample args and inspect the model
 *     output before enabling it.
 *
 * Custom skills persist server-side via `/api/skills` (flat-file store); on
 * the next agent turn `/api/agent/edit` reloads them and adapts each into an
 * `AgentTool`, so toggling "enabled" here takes effect immediately.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  Sparkles,
  Upload,
  Download,
  Play,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Wand2,
  Copy,
} from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { getCurrentModelConfig } from '@/lib/utils/model-config';
import { toast } from 'sonner';
import type {
  CustomSkill,
  CustomSkillParam,
  CustomSkillParamType,
} from '@/lib/agent/tools/custom-skill';
import type { SkillCategory } from '@/lib/agent/tools/registry';

// ─── API shapes ─────────────────────────────────────────────────────────────

/** A skill row as returned by GET /api/skills (built-in or custom). */
interface SkillListItem {
  id: string;
  displayName: string;
  category: SkillCategory;
  summary: string;
  source: 'builtin' | 'custom';
  enabled: boolean;
  // Custom-only fields (present on `source: 'custom'`):
  description?: string;
  promptTemplate?: string;
  parameters?: CustomSkillParam[];
  version?: string;
  dependencies?: string[];
  createdAt?: string;
  updatedAt?: string;
}

interface SkillsListResponse {
  success: true;
  skills: SkillListItem[];
  total: number;
  enabledCount: number;
}

interface ApiErrorBody {
  success: false;
  errorCode: string;
  error: string;
  details?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Send x-model/* headers so /api/skills/generate and /test can resolve a model. */
function modelHeaders(): HeadersInit {
  const cfg = getCurrentModelConfig();
  return {
    'Content-Type': 'application/json',
    'x-model': cfg.modelString || '',
    'x-api-key': cfg.apiKey || '',
    'x-base-url': cfg.baseUrl || '',
    'x-provider-type': cfg.providerType || '',
  };
}

async function readApi<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & Partial<ApiErrorBody>;
  if (!res.ok || (data as { success?: boolean }).success === false) {
    const err = data as Partial<ApiErrorBody>;
    const msg = err.details ? `${err.error}: ${err.details}` : err.error || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}

const CATEGORY_OPTIONS: SkillCategory[] = ['read', 'regenerate', 'edit', 'custom'];

function categoryLabel(c: SkillCategory, t: (k: string) => string): string {
  return t(`settings.skillCategory.${c}`);
}

function newParam(): CustomSkillParam {
  return { name: '', type: 'string', description: '', required: true };
}

/** Form state for the create/edit dialog. */
interface SkillForm {
  id: string;
  displayName: string;
  category: SkillCategory;
  summary: string;
  description: string;
  promptTemplate: string;
  parameters: CustomSkillParam[];
  enabled: boolean;
  version: string;
  dependencies: string[];
}

function emptyForm(): SkillForm {
  return {
    id: '',
    displayName: '',
    category: 'custom',
    summary: '',
    description: '',
    promptTemplate: '',
    parameters: [],
    enabled: true,
    version: '1.0.0',
    dependencies: [],
  };
}

function skillToForm(s: SkillListItem): SkillForm {
  return {
    id: s.id,
    displayName: s.displayName,
    category: s.category,
    summary: s.summary,
    description: s.description ?? '',
    promptTemplate: s.promptTemplate ?? '',
    parameters: Array.isArray(s.parameters) ? s.parameters.map((p) => ({ ...p })) : [],
    enabled: s.enabled,
    version: s.version ?? '1.0.0',
    dependencies: Array.isArray(s.dependencies) ? s.dependencies : [],
  };
}

function formToCustomSkill(f: SkillForm, now: string): CustomSkill {
  return {
    id: f.id.trim(),
    displayName: f.displayName.trim(),
    category: f.category,
    summary: f.summary.trim(),
    description: f.description.trim(),
    promptTemplate: f.promptTemplate,
    parameters: f.parameters
      .filter((p) => p.name.trim().length > 0)
      .map((p) => ({
        name: p.name.trim(),
        type: p.type,
        description: p.description,
        required: p.required,
      })),
    enabled: f.enabled,
    version: f.version || '1.0.0',
    dependencies: f.dependencies || [],
    createdAt: now,
    updatedAt: now,
  };
}

/** Trigger a client-side JSON download. */
function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Main panel ─────────────────────────────────────────────────────────────

type TestState = { status: 'idle' | 'testing' | 'ok' | 'error'; message?: string };

export function SkillSettings() {
  const { t } = useI18n();
  const [skills, setSkills] = useState<SkillListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Dialogs
  const [showEdit, setShowEdit] = useState(false);
  const [editingForm, setEditingForm] = useState<SkillForm | null>(null);
  const [editingIsNew, setEditingIsNew] = useState(true);
  const [saving, setSaving] = useState(false);

  const [showGenerate, setShowGenerate] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [showImport, setShowImport] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [importOverwrite, setImportOverwrite] = useState(false);
  const [importing, setImporting] = useState(false);

  const [testTarget, setTestTarget] = useState<SkillListItem | null>(null);
  const [testArgs, setTestArgs] = useState<Record<string, string>>({});
  const [testOutput, setTestOutput] = useState<string>('');
  const [testing, setTesting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<SkillListItem | null>(null);

  // Per-skill test status (for the small badge on the list). Stored separately
  // from the modal test so closing the modal doesn't clear the badge.
  const [badgeState, setBadgeState] = useState<Record<string, TestState>>({});

  // Track the inflight reload so a stale response after a fast double-action
  // can't overwrite a fresher one.
  const reloadNonce = useRef(0);

  const refresh = useCallback(async () => {
    const nonce = ++reloadNonce.current;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/skills', { method: 'GET' });
      const data = await readApi<SkillsListResponse>(res);
      if (reloadNonce.current !== nonce) return;
      setSkills(data.skills);
    } catch (e) {
      if (reloadNonce.current !== nonce) return;
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      if (reloadNonce.current === nonce) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial load: fetch the skill list from the server. `refresh` is stable
    // (empty deps) so this only runs once on mount; subsequent actions call
    // `refresh()` directly.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot mount fetch, setState is in async callback not sync effect body
    void refresh();
  }, [refresh]);

  const customSkills = useMemo(() => skills.filter((s) => s.source === 'custom'), [skills]);
  const builtinSkills = useMemo(() => skills.filter((s) => s.source === 'builtin'), [skills]);

  // ─── Actions ────────────────────────────────────────────────────────────

  const openAdd = () => {
    setEditingForm(emptyForm());
    setEditingIsNew(true);
    setShowEdit(true);
  };

  const openEdit = (s: SkillListItem) => {
    setEditingForm(skillToForm(s));
    setEditingIsNew(false);
    setShowEdit(true);
  };

  const openGenerate = () => {
    setShowGenerate(true);
  };

  const openImport = () => {
    setImportJson('');
    setImportOverwrite(false);
    setShowImport(true);
  };

  const saveForm = async () => {
    if (!editingForm) return;
    if (!editingForm.id.trim() || !/^[a-z0-9_-]+$/.test(editingForm.id.trim())) {
      toast.error(t('settings.skillErrId'));
      return;
    }
    if (!editingForm.displayName.trim()) {
      toast.error(t('settings.skillErrName'));
      return;
    }
    if (!editingForm.promptTemplate.trim()) {
      toast.error(t('settings.skillErrPrompt'));
      return;
    }
    const now = new Date().toISOString();
    const skill = formToCustomSkill(editingForm, now);
    setSaving(true);
    try {
      const res = await fetch('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(skill),
      });
      if (res.status === 409) {
        toast.error(t('settings.skillErrExists'));
        return;
      }
      await readApi<{ success: true; skill: CustomSkill }>(res);
      toast.success(t('settings.skillSaved'));
      setShowEdit(false);
      setEditingForm(null);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const updateSkill = async (id: string, patch: Partial<CustomSkill>) => {
    try {
      const res = await fetch(`/api/skills/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      await readApi<{ success: true; skill: CustomSkill }>(res);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const toggleEnabled = (s: SkillListItem, enabled: boolean) => {
    // Optimistic local update so the switch feels instant.
    setSkills((prev) =>
      prev.map((x) => (x.id === s.id && x.source === s.source ? { ...x, enabled } : x)),
    );
    void updateSkill(s.id, { enabled });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/skills/${deleteTarget.id}`, { method: 'DELETE' });
      await readApi<{ success: true; deleted: boolean }>(res);
      toast.success(t('settings.skillDeleted'));
      setBadgeState((prev) => {
        const copy = { ...prev };
        delete copy[deleteTarget.id];
        return copy;
      });
      setDeleteTarget(null);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const exportSkill = (s: SkillListItem) => {
    const spec: Record<string, unknown> = {
      id: s.id,
      displayName: s.displayName,
      category: s.category,
      summary: s.summary,
      description: s.description ?? '',
      promptTemplate: s.promptTemplate ?? '',
      parameters: s.parameters ?? [],
      enabled: s.enabled,
    };
    downloadJson(`${s.id}.json`, spec);
  };

  const exportAll = () => {
    if (customSkills.length === 0) {
      toast.error(t('settings.skillExportEmpty'));
      return;
    }
    downloadJson('nova-skills.json', customSkills);
  };

  const runGenerate = async (description: string) => {
    setGenerating(true);
    try {
      const res = await fetch('/api/skills/generate', {
        method: 'POST',
        headers: modelHeaders(),
        body: JSON.stringify({ description }),
      });
      const data = await readApi<{ success: true; skill: Partial<CustomSkill> }>(res);
      const gen = data.skill;
      // Pre-fill the edit form with the generated spec — the user reviews &
      // tweaks before saving. Generated id is a suggestion; the user can change.
      setEditingForm({
        id: typeof gen.id === 'string' ? gen.id : '',
        displayName: typeof gen.displayName === 'string' ? gen.displayName : '',
        category: (gen.category as SkillCategory) ?? 'custom',
        summary: typeof gen.summary === 'string' ? gen.summary : '',
        description: typeof gen.description === 'string' ? gen.description : '',
        promptTemplate: typeof gen.promptTemplate === 'string' ? gen.promptTemplate : '',
        parameters: Array.isArray(gen.parameters) ? gen.parameters.map((p) => ({ ...p })) : [],
        enabled: true,
        version: typeof gen.version === 'string' ? gen.version : '1.0.0',
        dependencies: Array.isArray(gen.dependencies) ? gen.dependencies : [],
      });
      setEditingIsNew(true);
      setShowGenerate(false);
      setShowEdit(true);
      toast.success(t('settings.skillGenerated'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  };

  const runImport = async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(importJson);
    } catch {
      toast.error(t('settings.skillImportParseError'));
      return;
    }
    setImporting(true);
    try {
      const res = await fetch('/api/skills/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skills: parsed, overwrite: importOverwrite }),
      });
      const data = await readApi<{
        success: true;
        created: string[];
        updated: string[];
        skipped: Array<{ id: string; reason: string }>;
      }>(res);
      toast.success(
        t('settings.skillImportResult')
          .replace('{created}', String(data.created.length))
          .replace('{updated}', String(data.updated.length))
          .replace('{skipped}', String(data.skipped.length)),
      );
      setShowImport(false);
      setImportJson('');
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
    }
  };

  const openTest = (s: SkillListItem) => {
    setTestTarget(s);
    const initialArgs: Record<string, string> = {};
    for (const p of s.parameters ?? []) {
      initialArgs[p.name] = p.type === 'boolean' ? 'false' : '';
    }
    setTestArgs(initialArgs);
    setTestOutput('');
  };

  const runTest = async () => {
    if (!testTarget) return;
    setTesting(true);
    setTestOutput('');
    setBadgeState((prev) => ({ ...prev, [testTarget.id]: { status: 'testing' } }));
    try {
      // Coerce args according to parameter types.
      const args: Record<string, unknown> = {};
      for (const p of testTarget.parameters ?? []) {
        const raw = testArgs[p.name];
        if (raw === undefined || raw === '') continue;
        args[p.name] =
          p.type === 'number' ? Number(raw) : p.type === 'boolean' ? raw === 'true' : raw;
      }
      const res = await fetch(`/api/skills/${testTarget.id}/test`, {
        method: 'POST',
        headers: modelHeaders(),
        body: JSON.stringify({ args }),
      });
      const data = await readApi<{ success: true; output: string }>(res);
      setTestOutput(data.output || t('settings.skillTestEmpty'));
      setBadgeState((prev) => ({ ...prev, [testTarget.id]: { status: 'ok' } }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setTestOutput(`⚠ ${msg}`);
      setBadgeState((prev) => ({ ...prev, [testTarget.id]: { status: 'error', message: msg } }));
    } finally {
      setTesting(false);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  const renderSkillCard = (s: SkillListItem) => {
    const isCustom = s.source === 'custom';
    const live = badgeState[s.id];
    return (
      <div key={`${s.source}:${s.id}`} className="rounded-lg border p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium truncate">{s.displayName}</span>
              <Badge variant="outline" className="font-mono text-[10px]">
                {categoryLabel(s.category, t)}
              </Badge>
              <Badge
                variant={isCustom ? 'secondary' : 'default'}
                className="text-[10px]"
                title={isCustom ? t('settings.skillSourceCustom') : t('settings.skillSourceBuiltin')}
              >
                {isCustom ? t('settings.skillSourceCustom') : t('settings.skillSourceBuiltin')}
              </Badge>
              {!s.enabled && (
                <Badge variant="outline" className="text-[10px]">
                  {t('settings.skillDisabled')}
                </Badge>
              )}
              {live?.status === 'testing' && (
                <Badge variant="secondary" className="gap-1 text-[10px]">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {t('settings.skillTesting')}
                </Badge>
              )}
              {live?.status === 'ok' && (
                <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600 text-[10px]">
                  <CheckCircle2 className="h-3 w-3" />
                  {t('settings.skillTestOk')}
                </Badge>
              )}
              {live?.status === 'error' && (
                <Badge variant="destructive" className="gap-1 text-[10px]">
                  <XCircle className="h-3 w-3" />
                  {t('settings.skillTestFailed')}
                </Badge>
              )}
            </div>
            <div className="mt-1 text-xs text-muted-foreground truncate">{s.summary}</div>
            <div className="mt-1 font-mono text-[10px] text-muted-foreground/70 truncate">
              {s.id}
              {isCustom && s.parameters && s.parameters.length > 0 && (
                <span className="ml-2">· {s.parameters.length} param(s)</span>
              )}
            </div>
            {live?.status === 'error' && live.message && (
              <div className="mt-1.5 flex items-start gap-1.5 text-xs text-destructive">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span className="break-all">{live.message}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {isCustom && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => openTest(s)}
                disabled={live?.status === 'testing'}
              >
                <Play className="h-3.5 w-3.5" />
                {t('settings.skillTest')}
              </Button>
            )}
            {isCustom && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => openEdit(s)}
                title={t('settings.skillEdit')}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            {isCustom && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => exportSkill(s)}
                title={t('settings.skillExport')}
              >
                <Download className="h-4 w-4" />
              </Button>
            )}
            {isCustom && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => setDeleteTarget(s)}
                title={t('settings.skillDelete')}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {isCustom && (
          <>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">{t('settings.skillEnabled')}</Label>
                <p className="text-xs text-muted-foreground">{t('settings.skillEnabledHint')}</p>
              </div>
              <Switch checked={s.enabled} onCheckedChange={(v) => toggleEnabled(s, v)} />
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
        {t('settings.skillSettingsDescription')}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={openAdd} className="gap-1.5">
          <Plus className="h-4 w-4" />
          {t('settings.skillAdd')}
        </Button>
        <Button variant="outline" onClick={openGenerate} className="gap-1.5">
          <Sparkles className="h-4 w-4" />
          {t('settings.skillGenerate')}
        </Button>
        <Button variant="outline" onClick={openImport} className="gap-1.5">
          <Upload className="h-4 w-4" />
          {t('settings.skillImport')}
        </Button>
        <Button
          variant="ghost"
          onClick={exportAll}
          className="gap-1.5 ml-auto"
          disabled={customSkills.length === 0}
        >
          <Download className="h-4 w-4" />
          {t('settings.skillExportAll')}
        </Button>
      </div>

      {loading && (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
          {t('settings.skillLoading')}
        </div>
      )}
      {!loading && loadError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive">
          {t('settings.skillLoadFailed')}: {loadError}
        </div>
      )}
      {!loading && !loadError && skills.length === 0 && (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {t('settings.skillEmpty')}
        </div>
      )}

      {/* Custom skills */}
      {!loading && customSkills.length > 0 && (
        <div className="space-y-3">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {t('settings.skillGroupCustom')} ({customSkills.length})
          </div>
          {customSkills.map(renderSkillCard)}
        </div>
      )}

      {/* Built-in skills */}
      {!loading && builtinSkills.length > 0 && (
        <div className="space-y-3">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {t('settings.skillGroupBuiltin')} ({builtinSkills.length})
          </div>
          {builtinSkills.map(renderSkillCard)}
        </div>
      )}

      {/* ─── Edit / Create dialog ─── */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingIsNew ? t('settings.skillAddTitle') : t('settings.skillEditTitle')}
            </DialogTitle>
            <DialogDescription>{t('settings.skillEditDescription')}</DialogDescription>
          </DialogHeader>

          {editingForm && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-sm">
                    {t('settings.skillId')}
                    {!editingIsNew && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({t('settings.skillIdImmutable')})
                      </span>
                    )}
                  </Label>
                  <Input
                    value={editingForm.id}
                    disabled={!editingIsNew}
                    onChange={(e) => setEditingForm({ ...editingForm, id: e.target.value })}
                    placeholder="my_skill"
                    className="font-mono text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">{t('settings.skillName')}</Label>
                  <Input
                    value={editingForm.displayName}
                    onChange={(e) =>
                      setEditingForm({ ...editingForm, displayName: e.target.value })
                    }
                    placeholder={t('settings.skillNamePlaceholder')}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-sm">{t('settings.skillCategory')}</Label>
                  <Select
                    value={editingForm.category}
                    onValueChange={(v) =>
                      setEditingForm({ ...editingForm, category: v as SkillCategory })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORY_OPTIONS.map((c) => (
                        <SelectItem key={c} value={c}>
                          {categoryLabel(c, t)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">{t('settings.skillEnabled')}</Label>
                  <div className="flex items-center h-9">
                    <Switch
                      checked={editingForm.enabled}
                      onCheckedChange={(v) => setEditingForm({ ...editingForm, enabled: v })}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm">{t('settings.skillSummary')}</Label>
                <Input
                  value={editingForm.summary}
                  onChange={(e) => setEditingForm({ ...editingForm, summary: e.target.value })}
                  placeholder={t('settings.skillSummaryPlaceholder')}
                  maxLength={200}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm">{t('settings.skillDescription')}</Label>
                <Textarea
                  value={editingForm.description}
                  onChange={(e) =>
                    setEditingForm({ ...editingForm, description: e.target.value })
                  }
                  placeholder={t('settings.skillDescriptionPlaceholder')}
                  className="min-h-20"
                />
                <p className="text-xs text-muted-foreground">
                  {t('settings.skillDescriptionHint')}
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-sm">{t('settings.skillPromptTemplate')}</Label>
                <Textarea
                  value={editingForm.promptTemplate}
                  onChange={(e) =>
                    setEditingForm({ ...editingForm, promptTemplate: e.target.value })
                  }
                  placeholder={t('settings.skillPromptPlaceholder')}
                  className="min-h-32 font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  {t('settings.skillPromptHint')}
                </p>
              </div>

              {/* Parameters editor */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">{t('settings.skillParameters')}</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={() =>
                      setEditingForm({
                        ...editingForm,
                        parameters: [...editingForm.parameters, newParam()],
                      })
                    }
                  >
                    <Plus className="h-3 w-3" />
                    {t('settings.skillAddParam')}
                  </Button>
                </div>
                {editingForm.parameters.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t('settings.skillNoParams')}</p>
                ) : (
                  <div className="space-y-2">
                    {editingForm.parameters.map((p, i) => (
                      <div
                        key={i}
                        className="grid grid-cols-[1fr_120px_1fr_auto_auto] gap-2 items-start"
                      >
                        <Input
                          value={p.name}
                          onChange={(e) => {
                            const next = [...editingForm.parameters];
                            next[i] = { ...p, name: e.target.value };
                            setEditingForm({ ...editingForm, parameters: next });
                          }}
                          placeholder="param_name"
                          className="font-mono text-sm"
                        />
                        <Select
                          value={p.type}
                          onValueChange={(v) => {
                            const next = [...editingForm.parameters];
                            next[i] = { ...p, type: v as CustomSkillParamType };
                            setEditingForm({ ...editingForm, parameters: next });
                          }}
                        >
                          <SelectTrigger className="text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="string">string</SelectItem>
                            <SelectItem value="number">number</SelectItem>
                            <SelectItem value="boolean">boolean</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          value={p.description}
                          onChange={(e) => {
                            const next = [...editingForm.parameters];
                            next[i] = { ...p, description: e.target.value };
                            setEditingForm({ ...editingForm, parameters: next });
                          }}
                          placeholder={t('settings.skillParamDescPlaceholder')}
                          className="text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const next = [...editingForm.parameters];
                            next[i] = { ...p, required: !p.required };
                            setEditingForm({ ...editingForm, parameters: next });
                          }}
                          className={`shrink-0 h-9 px-2 rounded-md border text-xs ${
                            p.required
                              ? 'bg-primary/10 text-primary border-primary/30'
                              : 'text-muted-foreground'
                          }`}
                          title={t('settings.skillParamRequired')}
                        >
                          {p.required ? 'req' : 'opt'}
                        </button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                          onClick={() => {
                            const next = editingForm.parameters.filter((_, j) => j !== i);
                            setEditingForm({ ...editingForm, parameters: next });
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowEdit(false)}>
              {t('settings.skillCancel')}
            </Button>
            <Button onClick={saveForm} disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('settings.skillSave')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── AI generate dialog ─── */}
      <GenerateDialog
        open={showGenerate}
        onOpenChange={setShowGenerate}
        generating={generating}
        onGenerate={runGenerate}
        t={t}
      />

      {/* ─── Import dialog ─── */}
      <Dialog open={showImport} onOpenChange={setShowImport}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('settings.skillImportTitle')}</DialogTitle>
            <DialogDescription>{t('settings.skillImportDescription')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              placeholder={t('settings.skillImportPlaceholder')}
              className="min-h-48 font-mono text-sm"
            />
            <div className="flex items-center gap-2">
              <Switch
                checked={importOverwrite}
                onCheckedChange={setImportOverwrite}
                id="skill-import-overwrite"
              />
              <Label htmlFor="skill-import-overwrite" className="text-sm">
                {t('settings.skillImportOverwrite')}
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowImport(false)}>
              {t('settings.skillCancel')}
            </Button>
            <Button onClick={runImport} disabled={importing} className="gap-1.5">
              {importing && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('settings.skillImportConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Test dialog ─── */}
      <Dialog
        open={!!testTarget}
        onOpenChange={(o) => {
          if (!o) setTestTarget(null);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {t('settings.skillTestTitle')} · {testTarget?.displayName}
            </DialogTitle>
            <DialogDescription>{t('settings.skillTestDescription')}</DialogDescription>
          </DialogHeader>
          {testTarget && (
            <div className="space-y-3">
              {testTarget.parameters && testTarget.parameters.length > 0 ? (
                <div className="space-y-2">
                  <Label className="text-sm">{t('settings.skillTestArgs')}</Label>
                  {testTarget.parameters.map((p) => (
                    <div key={p.name} className="grid grid-cols-[160px_1fr] gap-2 items-center">
                      <div className="min-w-0">
                        <div className="font-mono text-sm truncate">{p.name}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {p.type}
                          {p.required ? ' · required' : ' · optional'}
                        </div>
                      </div>
                      {p.type === 'boolean' ? (
                        <Select
                          value={testArgs[p.name] ?? 'false'}
                          onValueChange={(v) =>
                            setTestArgs((prev) => ({ ...prev, [p.name]: v }))
                          }
                        >
                          <SelectTrigger className="text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="true">true</SelectItem>
                            <SelectItem value="false">false</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          value={testArgs[p.name] ?? ''}
                          onChange={(e) =>
                            setTestArgs((prev) => ({ ...prev, [p.name]: e.target.value }))
                          }
                          placeholder={p.description || ''}
                          className="text-sm"
                        />
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">{t('settings.skillTestNoArgs')}</p>
              )}

              <div className="space-y-2">
                <Label className="text-sm">{t('settings.skillTestOutput')}</Label>
                <pre className="min-h-32 max-h-64 overflow-auto rounded-md border bg-muted/30 p-3 text-xs whitespace-pre-wrap font-mono">
                  {testOutput || t('settings.skillTestOutputPlaceholder')}
                </pre>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                if (testOutput) {
                  void navigator.clipboard?.writeText(testOutput);
                  toast.success(t('settings.skillCopied'));
                }
              }}
              disabled={!testOutput || testing}
              className="gap-1.5 mr-auto"
            >
              <Copy className="h-4 w-4" />
              {t('settings.skillCopy')}
            </Button>
            <Button variant="ghost" onClick={() => setTestTarget(null)}>
              {t('settings.skillClose')}
            </Button>
            <Button onClick={runTest} disabled={testing} className="gap-1.5">
              {testing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              {t('settings.skillRunTest')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete confirmation ─── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('settings.skillDeleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('settings.skillDeleteConfirm')
                .replace('{name}', deleteTarget?.displayName ?? '')
                .replace('{id}', deleteTarget?.id ?? '')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('settings.skillCancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('settings.skillDelete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── AI generate sub-dialog ─────────────────────────────────────────────────

interface GenerateDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  generating: boolean;
  onGenerate: (description: string) => void | Promise<void>;
  t: (k: string) => string;
}

function GenerateDialog({ open, onOpenChange, generating, onGenerate, t }: GenerateDialogProps) {
  const [description, setDescription] = useState('');
  // Reset the description each time the dialog opens so a previous attempt
  // doesn't linger after a successful generation.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clear local input state when dialog opens, mirrors mcp-settings pattern
    if (open) setDescription('');
  }, [open]);

  const submit = () => {
    const trimmed = description.trim();
    if (!trimmed) return;
    void onGenerate(trimmed);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5" />
            {t('settings.skillGenerateTitle')}
          </DialogTitle>
          <DialogDescription>{t('settings.skillGenerateDescription')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label className="text-sm">{t('settings.skillGenerateLabel')}</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('settings.skillGeneratePlaceholder')}
            className="min-h-32"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <p className="text-xs text-muted-foreground">
            {t('settings.skillGenerateHint')}
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('settings.skillCancel')}
          </Button>
          <Button onClick={submit} disabled={generating || !description.trim()} className="gap-1.5">
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {t('settings.skillGenerateButton')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
