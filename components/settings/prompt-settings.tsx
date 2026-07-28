'use client';

/**
 * Prompt Template catalog panel (Phase 2B — Agent prompt layer UI).
 *
 * Lists every prompt template shipped with the deployment (read-only — prompts
 * are file-delivered templates, not user data, so runtime mutation would break
 * deterministic deployments). Provides:
 *
 *   • Catalog list — id, source (main / pbl-v2), version, tags, deprecated flag
 *   • Search + source filter
 *   • Detail drawer — fetches the rendered system + user template via
 *     GET /api/prompts/[id] and shows the raw markdown with snippet/conditional
 *     syntax preserved (variables are NOT interpolated — the raw template is
 *     shown so authors can review placeholder syntax).
 *
 * This closes the frontend/backend gap: `/api/prompts` existed but no UI
 * consumed it. The panel is wired into the Settings dialog under a new
 * "Prompts" section.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Search,
  FileText,
  Loader2,
  AlertTriangle,
  Tag,
} from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { toast } from 'sonner';

// ─── API shapes ─────────────────────────────────────────────────────────────

interface PromptRegistryEntry {
  id: string;
  source: 'main' | 'pbl-v2';
  displayName: string;
  version: string;
  description?: string;
  tags?: string[];
  deprecated: boolean;
  hasUserTemplate: boolean;
  path: string;
}

interface PromptsListResponse {
  success: true;
  prompts: PromptRegistryEntry[];
  total: number;
}

interface PromptDetail {
  id: string;
  systemPrompt: string;
  userPromptTemplate?: string;
  version: string;
  deprecated: boolean;
  config?: Record<string, unknown>;
}

interface PromptDetailResponse {
  success: true;
  prompt: PromptDetail;
}

// ─── Main panel ─────────────────────────────────────────────────────────────

type SourceFilter = 'all' | 'main' | 'pbl-v2';

export function PromptSettings() {
  const { t } = useI18n();
  const [prompts, setPrompts] = useState<PromptRegistryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [selected, setSelected] = useState<PromptRegistryEntry | null>(null);

  const reloadNonce = useRef(0);

  const refresh = useCallback(async () => {
    const nonce = ++reloadNonce.current;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/prompts', { method: 'GET' });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      if (reloadNonce.current !== nonce) return;
      setPrompts((data as PromptsListResponse).prompts);
    } catch (e) {
      if (reloadNonce.current !== nonce) return;
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      if (reloadNonce.current === nonce) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot mount fetch, setState is in async callback not sync effect body
    void refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return prompts.filter((p) => {
      if (sourceFilter !== 'all' && p.source !== sourceFilter) return false;
      if (!q) return true;
      return (
        p.id.toLowerCase().includes(q) ||
        p.displayName.toLowerCase().includes(q) ||
        (p.description ?? '').toLowerCase().includes(q) ||
        (p.tags ?? []).some((tag) => tag.toLowerCase().includes(q))
      );
    });
  }, [prompts, query, sourceFilter]);

  const counts = useMemo(() => {
    const main = prompts.filter((p) => p.source === 'main').length;
    const pbl = prompts.filter((p) => p.source === 'pbl-v2').length;
    const deprecated = prompts.filter((p) => p.deprecated).length;
    return { main, pbl, deprecated, total: prompts.length };
  }, [prompts]);

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
        {t('settings.promptSettingsDescription')}
      </div>

      {/* Search + filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('settings.promptSearchPlaceholder')}
            className="pl-8"
          />
        </div>
        <div className="flex items-center gap-1 rounded-md border p-0.5">
          {(['all', 'main', 'pbl-v2'] as SourceFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setSourceFilter(s)}
              className={`px-2.5 py-1 text-xs rounded transition-colors ${
                sourceFilter === s
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {s === 'all'
                ? t('settings.promptSourceAll')
                : s === 'main'
                  ? t('settings.promptSourceMain')
                  : t('settings.promptSourcePbl')}
            </button>
          ))}
        </div>
      </div>

      {/* Summary */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>
          {t('settings.promptCount')
            .replace('{total}', String(counts.total))
            .replace('{main}', String(counts.main))
            .replace('{pbl}', String(counts.pbl))}
        </span>
        {counts.deprecated > 0 && (
          <Badge variant="outline" className="gap-1 text-[10px] text-amber-600 border-amber-300">
            <AlertTriangle className="h-3 w-3" />
            {counts.deprecated} {t('settings.promptDeprecated')}
          </Badge>
        )}
      </div>

      {loading && (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
          {t('settings.promptLoading')}
        </div>
      )}
      {!loading && loadError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive">
          {t('settings.promptLoadFailed')}: {loadError}
        </div>
      )}
      {!loading && !loadError && filtered.length === 0 && (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {t('settings.promptEmpty')}
        </div>
      )}

      {/* List */}
      {!loading && filtered.length > 0 && (
        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-2 pr-2">
            {filtered.map((p) => (
              <button
                key={`${p.source}:${p.id}`}
                onClick={() => setSelected(p)}
                className="w-full text-left rounded-lg border p-3 hover:bg-muted/40 transition-colors space-y-1.5"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="font-medium text-sm truncate">{p.displayName}</span>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {p.source}
                  </Badge>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    v{p.version}
                  </Badge>
                  {p.deprecated && (
                    <Badge
                      variant="outline"
                      className="text-[10px] text-amber-600 border-amber-300"
                    >
                      {t('settings.promptDeprecated')}
                    </Badge>
                  )}
                  {p.hasUserTemplate && (
                    <Badge variant="secondary" className="text-[10px]">
                      {t('settings.promptHasUserTemplate')}
                    </Badge>
                  )}
                </div>
                {p.description && (
                  <div className="text-xs text-muted-foreground line-clamp-2">
                    {p.description}
                  </div>
                )}
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground/70">
                  <span className="font-mono truncate">{p.id}</span>
                  {p.tags && p.tags.length > 0 && (
                    <span className="flex items-center gap-1">
                      <Tag className="h-3 w-3" />
                      {p.tags.join(', ')}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Detail dialog */}
      <PromptDetailDialog entry={selected} onClose={() => setSelected(null)} t={t} />
    </div>
  );
}

// ─── Detail dialog ──────────────────────────────────────────────────────────

interface DetailProps {
  entry: PromptRegistryEntry | null;
  onClose: () => void;
  t: (k: string) => string;
}

function PromptDetailDialog({ entry, onClose, t }: DetailProps) {
  const [detail, setDetail] = useState<PromptDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!entry) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset local state when the dialog closes, mirrors mcp-settings pattern
      setDetail(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetail(null);
    fetch(`/api/prompts/${entry.id}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || data.success === false) {
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        return data as PromptDetailResponse;
      })
      .then((data) => {
        if (cancelled) return;
        setDetail(data.prompt);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [entry]);

  return (
    <Dialog open={!!entry} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {entry && <FileText className="h-5 w-5 text-muted-foreground" />}
            {entry?.displayName ?? ''}
          </DialogTitle>
          <DialogDescription>
            {entry && (
              <span className="flex items-center gap-2 flex-wrap mt-1">
                <Badge variant="outline" className="font-mono text-[10px]">
                  {entry.source}
                </Badge>
                <Badge variant="outline" className="font-mono text-[10px]">
                  v{entry.version}
                </Badge>
                <span className="font-mono text-[10px]">{entry.id}</span>
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {entry?.description && (
          <p className="text-sm text-muted-foreground">{entry.description}</p>
        )}

        {loading && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
            {t('settings.promptDetailLoading')}
          </div>
        )}
        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        {!loading && !error && detail && (
          <ScrollArea className="flex-1 max-h-[55vh]">
            <div className="space-y-4 pr-2">
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t('settings.promptSystemPrompt')}
                </div>
                <pre className="rounded-md border bg-muted/30 p-3 text-xs whitespace-pre-wrap font-mono overflow-x-auto">
                  {detail.systemPrompt || t('settings.promptEmptyContent')}
                </pre>
              </div>
              {detail.userPromptTemplate && (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {t('settings.promptUserTemplate')}
                  </div>
                  <pre className="rounded-md border bg-muted/30 p-3 text-xs whitespace-pre-wrap font-mono overflow-x-auto">
                    {detail.userPromptTemplate}
                  </pre>
                </div>
              )}
            </div>
          </ScrollArea>
        )}

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => {
              if (detail?.systemPrompt) {
                void navigator.clipboard?.writeText(
                  [detail.systemPrompt, detail.userPromptTemplate]
                    .filter(Boolean)
                    .join('\n\n---\n\n'),
                );
                toast.success(t('settings.promptCopied'));
              }
            }}
            disabled={!detail || loading}
            className="mr-auto"
          >
            {t('settings.promptCopy')}
          </Button>
          <Button variant="outline" onClick={onClose}>
            {t('settings.promptClose')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
