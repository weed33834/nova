'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
// echarts 为可选依赖（charts 能力）：运行时动态加载，未安装降级为占位提示
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let echartsLib: any = null;
let echartsPromise: Promise<void> | null = null;
function loadUsageEcharts() {
  if (!echartsPromise) {
    echartsPromise = (async () => {
      try {
        const [core, charts, components, renderers] = await Promise.all([
          import('echarts/core'),
          import('echarts/charts'),
          import('echarts/components'),
          import('echarts/renderers'),
        ]);
        const echarts = core as typeof import('echarts/core');
        echarts.use([
          charts.LineChart,
          components.GridComponent,
          components.TooltipComponent,
          renderers.SVGRenderer,
        ]);
        echartsLib = echarts;
      } catch {
        echartsLib = null;
      }
    })();
  }
  return echartsPromise;
}
import { Loader2, RefreshCw, BarChart3, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useTheme } from '@/lib/hooks/use-theme';
import { cn } from '@/lib/utils';


type UsageKind = 'llm' | 'image' | 'video' | 'tts' | 'asr';
type UsageUnit = 'token' | 'image' | 'second' | 'character';

interface Bucket {
  key: string;
  kind: UsageKind;
  unit: UsageUnit;
  requests: number;
  totalTokens: number;
  quantity: number;
}

interface UsageResponse {
  totals: { requests: number; llmTokens: number };
  byModel: Bucket[];
  byDay: Bucket[];
  byKind: Bucket[];
}

/** Modalities that carry a monthly quota (ASR has no quota). */
type QuotaKind = 'llm' | 'image' | 'video' | 'tts';

interface QuotaStatus {
  kind: QuotaKind;
  used: number;
  /** Server uses `Infinity` for admins, which serializes to `null` over JSON. */
  limit: number | null;
  remaining: number | null;
  exceeded: boolean;
}

/** Shape of GET /api/quota -> { success, quotas: Record<QuotaKind, QuotaStatus> } */
type QuotaMap = Record<QuotaKind, QuotaStatus>;

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

const KIND_LABEL_KEY: Record<UsageKind, string> = {
  llm: 'settings.usage.kindLlm',
  image: 'settings.usage.kindImage',
  video: 'settings.usage.kindVideo',
  tts: 'settings.usage.kindTts',
  asr: 'settings.usage.kindAsr',
};

const UNIT_LABEL_KEY: Record<UsageUnit, string> = {
  token: 'settings.usage.unitToken',
  image: 'settings.usage.unitImage',
  second: 'settings.usage.unitSecond',
  character: 'settings.usage.unitCharacter',
};

/** Display order of modality sections. */
const KIND_ORDER: UsageKind[] = ['llm', 'image', 'video', 'tts', 'asr'];

/** Quota kinds reported by /api/quota, in display order (ASR has no quota). */
const QUOTA_KINDS: QuotaKind[] = ['llm', 'image', 'video', 'tts'];

export function UsageDashboard() {
  const { t } = useI18n();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const [data, setData] = useState<UsageResponse | null>(null);
  const [quota, setQuota] = useState<QuotaMap | null>(null);
  const [loading, setLoading] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartInstance = useRef<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch usage and monthly quota in parallel. Each is best-effort so a
      // failure in one endpoint never blocks the other.
      const [usageRes, quotaRes] = await Promise.allSettled([
        fetch('/api/usage').then((r) => r.json()),
        fetch('/api/quota').then((r) => r.json()),
      ]);
      if (usageRes.status === 'fulfilled') {
        const json = usageRes.value as UsageResponse & { success?: boolean };
        if (json.success !== false) setData(json);
      }
      if (quotaRes.status === 'fulfilled') {
        const json = quotaRes.value as { success?: boolean; quotas?: QuotaMap };
        if (json.success !== false && json.quotas) setQuota(json.quotas);
      }
    } catch {
      // best-effort
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial usage data load on mount / when `load` changes. Suppressed —
    // this IS the data-loading effect, not a derived-state sync.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const byDay = useMemo(() => data?.byDay ?? [], [data]);

  /** A single usage figure with its unit, for a model/kind bucket. */
  const usageValue = (b: Bucket): number => (b.kind === 'llm' ? b.totalTokens : b.quantity);
  const usageDisplay = (b: Bucket): string =>
    `${fmtNum(usageValue(b))} ${t(UNIT_LABEL_KEY[b.kind === 'llm' ? 'token' : b.unit])}`;

  // Group models by modality, in display order, dropping empty modalities.
  const sections = useMemo(() => {
    const byKind = new Map<UsageKind, { kindBucket?: Bucket; models: Bucket[] }>();
    for (const m of data?.byModel ?? []) {
      if (!byKind.has(m.kind)) byKind.set(m.kind, { models: [] });
      byKind.get(m.kind)!.models.push(m);
    }
    for (const k of data?.byKind ?? []) {
      if (byKind.has(k.kind)) byKind.get(k.kind)!.kindBucket = k;
    }
    return KIND_ORDER.filter((k) => byKind.has(k)).map((k) => ({
      kind: k,
      summary: byKind.get(k)!.kindBucket,
      models: byKind.get(k)!.models.sort((a, b) => b.requests - a.requests),
    }));
  }, [data]);

  // Daily REQUESTS trend — unit-agnostic so it works across all modalities.
  // Area-only with a soft gradient + faint line, theme-aware, to avoid the
  // harsh solid stroke in dark mode.
  // 动态加载 echarts（可选依赖），未安装时跳过图表渲染
  const [chartReady, setChartReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void loadUsageEcharts().then(() => {
      if (!cancelled) setChartReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current || !echartsLib) return;
    if (!chartInstance.current) {
      chartInstance.current = echartsLib.init(chartRef.current, undefined, { renderer: 'svg' });
    }
    const chart = chartInstance.current;
    const axis = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)';
    const split = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    const accent = isDark ? '#a78bfa' : '#7c3aed'; // violet, matches primary

    chart.setOption({
      tooltip: { trigger: 'axis' },
      grid: { left: 44, right: 16, top: 16, bottom: 28 },
      xAxis: {
        type: 'category',
        data: byDay.map((b) => b.key),
        axisLabel: { color: axis, fontSize: 11 },
        axisLine: { lineStyle: { color: split } },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        axisLabel: { color: axis, fontSize: 11 },
        splitLine: { lineStyle: { color: split } },
      },
      series: [
        {
          name: t('settings.usage.totalRequests'),
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 5,
          itemStyle: { color: accent },
          // Faint, thin connecting line instead of a hard solid stroke.
          lineStyle: { color: accent, width: 1, opacity: isDark ? 0.5 : 0.7 },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: isDark ? 'rgba(244, 114, 182,0.35)' : 'rgba(124,58,237,0.25)' },
                { offset: 1, color: isDark ? 'rgba(244, 114, 182,0.02)' : 'rgba(124,58,237,0.02)' },
              ],
            },
          },
          data: byDay.map((b) => b.requests),
        },
      ],
    });
    chart.resize();
  }, [byDay, t, isDark]);

  useEffect(() => {
    const onResize = () => chartInstance.current?.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      chartInstance.current?.dispose();
      chartInstance.current = null;
    };
  }, []);

  const totals = data?.totals;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">{t('settings.usage.title')}</h3>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          {t('settings.usage.refresh')}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground -mt-3">{t('settings.usage.disclaimer')}</p>

      {/* Monthly quota status — used / limit per modality, shown alongside usage stats. */}
      {quota ? (
        <div className="rounded-lg border p-3 flex flex-col gap-3">
          <span className="text-xs font-medium">Monthly Quota</span>
          {QUOTA_KINDS.map((kind) => {
            const q = quota[kind];
            // Admins get limit: Infinity on the server, which serializes to null over JSON.
            if (q.limit == null || !Number.isFinite(q.limit)) {
              return (
                <div key={kind} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{t(KIND_LABEL_KEY[kind])}</span>
                    <span className={cn('font-medium', q.exceeded && 'text-destructive')}>
                      {fmtNum(q.used)} / Unlimited
                    </span>
                  </div>
                </div>
              );
            }
            // q.limit is narrowed to a finite number here; capture it for math/formatting.
            const limit = q.limit;
            const pct = limit <= 0 ? 0 : Math.min(100, Math.round((q.used / limit) * 100));
            return (
              <div key={kind} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{t(KIND_LABEL_KEY[kind])}</span>
                  <span className={cn('font-medium', q.exceeded && 'text-destructive')}>
                    {fmtNum(q.used)} / {fmtNum(limit)} · {pct}%
                  </span>
                </div>
                <Progress
                  value={pct}
                  className={cn(
                    q.exceeded && '[&_[data-slot=progress-indicator]]:bg-destructive',
                  )}
                />
              </div>
            );
          })}
          {QUOTA_KINDS.some((k) => quota[k].exceeded) ? (
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertTitle>Quota exceeded</AlertTitle>
              <AlertDescription>
                You have reached the monthly limit for one or more modalities. Generation
                requests for the affected types are blocked until the cycle resets.
              </AlertDescription>
            </Alert>
          ) : null}
        </div>
      ) : null}

      {/* Per-modality summary chips — each with its own unit. */}
      {sections.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          <div className="rounded-lg border px-3 py-2 text-sm">
            <span className="text-muted-foreground">{t('settings.usage.totalRequests')}</span>
            <span className="ml-2 font-medium">{totals?.requests ?? 0}</span>
          </div>
          {sections.map(
            (s) =>
              s.summary && (
                <div key={s.kind} className="rounded-lg border px-3 py-2 text-sm">
                  <span className="text-muted-foreground">{t(KIND_LABEL_KEY[s.kind])}</span>
                  <span className="ml-2 font-medium">{usageDisplay(s.summary)}</span>
                  <span className="ml-1 text-xs text-muted-foreground">({s.summary.requests})</span>
                </div>
              ),
          )}
        </div>
      ) : null}

      {/* Daily request trend — unit-agnostic across modalities. */}
      <div className="rounded-lg border p-3">
        <div className="text-xs text-muted-foreground mb-2">{t('settings.usage.dailyTrend')}</div>
        {byDay.length > 0 ? (
          <div ref={chartRef} style={{ width: '100%', height: 200 }} />
        ) : (
          <div className="h-[120px] flex items-center justify-center text-sm text-muted-foreground">
            {t('settings.usage.empty')}
          </div>
        )}
      </div>

      {/* Per-modality tables — each section's usage column shares one unit. */}
      {sections.map((s) => (
        <div key={s.kind} className="rounded-lg border overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
            <span className="text-xs font-medium">{t(KIND_LABEL_KEY[s.kind])}</span>
            {s.summary && (
              <span className="text-xs text-muted-foreground">
                {usageDisplay(s.summary)} · {s.summary.requests} {t('settings.usage.reqs')}
              </span>
            )}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="text-left font-medium px-3 py-2">{t('settings.usage.model')}</th>
                <th className="text-right font-medium px-3 py-2">{t('settings.usage.reqs')}</th>
                <th className="text-right font-medium px-3 py-2">{t('settings.usage.usage')}</th>
              </tr>
            </thead>
            <tbody>
              {s.models.map((m) => (
                <tr key={m.key} className="border-t">
                  <td className="px-3 py-2 font-mono text-xs">{m.key}</td>
                  <td className="px-3 py-2 text-right">{m.requests}</td>
                  <td className="px-3 py-2 text-right">{usageDisplay(m)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
