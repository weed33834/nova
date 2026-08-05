'use client';

/**
 * 设置面板顶部的能力状态卡片。
 * 展示所有可降级功能的安装状态：
 *  - ✓ 已安装（正常可用）
 *  - ⚠ 未安装（灰色 + 安装命令，点击复制）
 *  - 未完成降级改造的功能额外标注"需完整安装"
 */
import { useState } from 'react';
import { CheckCircle2, XCircle, Copy, Check } from 'lucide-react';
import { CAPABILITY_LIST } from '@/lib/capabilities';
import { useCapabilities } from '@/lib/hooks/use-capabilities';
import { toast } from 'sonner';

export function CapabilityStatusCard() {
  const { caps, loading } = useCapabilities();
  const [copied, setCopied] = useState<string | null>(null);

  if (loading || !caps) return null;

  const installAll = CAPABILITY_LIST.filter((c) => !caps[c.id]?.installed)
    .map((c) => c.installCmd)
    .filter((v, i, a) => a.indexOf(v) === i) // 去重命令
    .join(' && ');

  const copyText = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      toast.success('安装命令已复制');
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error('复制失败，请手动复制命令');
    }
  };

  return (
    <div className="rounded-xl border border-border/60 p-3 mb-2">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          功能能力状态
          <span className="text-[11px] font-normal text-muted-foreground">
            （可选依赖是否已安装）
          </span>
        </h3>
        {installAll && (
          <button
            onClick={() => copyText(installAll, 'all')}
            className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
          >
            {copied === 'all' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            复制全部安装命令
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
        {CAPABILITY_LIST.map((cap) => {
          const status = caps[cap.id];
          const installed = status?.installed ?? true;
          const isCopied = copied === cap.id;
          return (
            <div
              key={cap.id}
              className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs transition-colors ${
                installed
                  ? 'bg-emerald-500/8 text-emerald-700 dark:text-emerald-400'
                  : 'bg-muted/60 text-muted-foreground'
              }`}
              title={`${cap.description}${installed ? '' : `\n安装: ${status?.installCmd}`}`}
            >
              {installed ? (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <XCircle className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
              )}
              <span className="truncate">{cap.label}</span>
              {!installed && status && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    copyText(status.installCmd, cap.id);
                  }}
                  className="ml-auto shrink-0 rounded px-1 hover:bg-foreground/10"
                  title="复制安装命令"
                >
                  {isCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {!installAll && (
        <p className="mt-2 text-[11px] text-emerald-700/70 dark:text-emerald-400/70">
          所有可选功能均已安装，完整可用。
        </p>
      )}
      {installAll && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          有 {CAPABILITY_LIST.filter((c) => !caps[c.id]?.installed).length} 项功能未安装。
          未安装的功能将显示为灰色，安装后即可启用。
          <code className="ml-1 rounded bg-muted px-1 py-0.5 text-[10px]">{installAll.slice(0, 60)}…</code>
        </p>
      )}
    </div>
  );
}
