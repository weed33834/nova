'use client';

/**
 * 前端能力状态 Hook —— 拉取 /api/capabilities 并缓存。
 * 设置面板、功能入口用它展示"已安装 / 未安装"。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CapabilityId } from '@/lib/capabilities';

export interface CapabilityStatus {
  id: CapabilityId;
  installed: boolean;
  downgradeable: boolean;
  deps: string[];
  installCmd: string;
}

interface CapabilitiesResponse {
  capabilities: Record<CapabilityId, CapabilityStatus>;
  missing: CapabilityId[];
  allInstalled: boolean;
}

export function useCapabilities() {
  const [caps, setCaps] = useState<Record<CapabilityId, CapabilityStatus> | null>(null);
  const [missing, setMissing] = useState<CapabilityId[]>([]);
  const [loading, setLoading] = useState(true);
  const loadedRef = useRef(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/capabilities', { cache: 'no-store' });
      if (res.ok) {
        const data = (await res.json()) as CapabilitiesResponse;
        setCaps(data.capabilities);
        setMissing(data.missing);
      }
    } catch {
      // 静默失败：能力检测不可用时视为全部已安装（完整安装模式）
    } finally {
      setLoading(false);
      loadedRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (!loadedRef.current) refresh();
  }, [refresh]);

  const isInstalled = useCallback(
    (id: CapabilityId): boolean => {
      if (!caps) return true; // 未检测到 → 保守视为已安装
      return caps[id]?.installed ?? true;
    },
    [caps],
  );

  const installCmdFor = useCallback(
    (id: CapabilityId): string => caps?.[id]?.installCmd ?? '',
    [caps],
  );

  return { caps, missing, loading, refresh, isInstalled, installCmdFor };
}
