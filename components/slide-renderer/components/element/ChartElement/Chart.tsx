'use client';

import { useEffect, useRef, useMemo, useState } from 'react';
import tinycolor from 'tinycolor2';
import type { ChartData, ChartOptions, ChartType } from '@nova/dsl';
import { getChartOption } from './chartOption';

/**
 * ECharts 为可选依赖（charts 能力）：运行时动态加载，未安装时降级为占位提示。
 * 保持 ECharts 按需注册（core + 各图表 + SVG 渲染器）。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let echartsLib: any = null;
let echartsPromise: Promise<void> | null = null;
function loadEcharts() {
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
          charts.BarChart,
          charts.LineChart,
          charts.PieChart,
          charts.ScatterChart,
          charts.RadarChart,
          components.LegendComponent,
          renderers.SVGRenderer,
        ]);
        echartsLib = echarts;
      } catch {
        echartsLib = null; // 未安装 echarts
      }
    })();
  }
  return echartsPromise;
}

interface ChartProps {
  width: number;
  height: number;
  type: ChartType;
  data: ChartData;
  themeColors: string[];
  textColor?: string;
  lineColor?: string;
  options?: ChartOptions;
}

export function Chart({
  width: _width,
  height: _height,
  type,
  data,
  themeColors,
  textColor,
  lineColor,
  options,
}: ChartProps) {
  const chartRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartInstance = useRef<any>(null);
  const [ready, setReady] = useState(false);

  // 动态加载 echarts（可选依赖）
  useEffect(() => {
    let cancelled = false;
    void loadEcharts().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateOption = useCallbackRef(() => {
    const echarts = echartsLib;
    if (!echarts || !chartRef.current) return;
    const option = getChartOption({
      type,
      data,
      themeColors,
      textColor,
      lineColor,
      lineSmooth: options?.lineSmooth || false,
      stack: options?.stack || false,
    });
    if (option) {
      chartInstance.current?.setOption(option, true);
    }
  });

  // Initialize chart
  useEffect(() => {
    if (!ready || !chartRef.current || !echartsLib) return;

    chartInstance.current = echartsLib.init(chartRef.current, null, {
      renderer: 'svg',
    });
    updateOption();

    const resizeObserver = new ResizeObserver(() => {
      chartInstance.current?.resize();
    });
    resizeObserver.observe(chartRef.current);

    return () => {
      resizeObserver.disconnect();
      chartInstance.current?.dispose();
      chartInstance.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Init-only effect: chart setup and resize observer
  }, [ready]);

  // Update chart when props change
  useEffect(() => {
    updateOption();
  }, [updateOption]);

  if (!ready) {
    return (
      <div className="chart w-full h-full flex items-center justify-center text-xs text-muted-foreground/60">
        📊 图表渲染需要可选依赖 echarts（pnpm add echarts）
      </div>
    );
  }

  return <div ref={chartRef} className="chart w-full h-full" />;
}

/**
 * 缓存回调引用：避免每次渲染重建 updateOption 导致 effect 重复触发。
 */
function useCallbackRef<T extends (...args: never[]) => unknown>(fn: T): T {
  const ref = useRef(fn);
  ref.current = fn;
  return useMemo(() => ((...args: never[]) => ref.current(...args)) as T, []);
}
