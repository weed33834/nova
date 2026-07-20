'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Sparkles, Zap, Loader2, Database } from 'lucide-react';
import type { SceneOutline } from '@/lib/types/generation';

const DEMO_REQUIREMENT =
  '人工智能导论：从AI基础到前沿技术，系统掌握人工智能核心知识。涵盖搜索算法、知识表示、机器学习、深度学习、NLP、计算机视觉、强化学习、生成式AI、AI伦理。';

export function DemoSeedButton() {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [loadingCached, setLoadingCached] = useState(false);

  const handleGenerateFresh = async () => {
    if (generating) return;

    setGenerating(true);
    try {
      const sessionState = {
        sessionId: `demo_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        requirements: { requirement: DEMO_REQUIREMENT },
        pdfText: '',
        pdfImages: [],
        imageStorageIds: [],
        documentSources: undefined,
        pdfStorageKey: undefined,
        pdfFileName: undefined,
        documentMimeType: undefined,
        pdfProviderId: undefined,
        pdfProviderConfig: undefined,
        sceneOutlines: null,
        currentStep: 'generating' as const,
        previewPhase: 'preparing' as const,
      };
      sessionStorage.setItem('generationSession', JSON.stringify(sessionState));
      router.push('/generation-preview');
    } catch (err) {
      console.error('Failed to start generation:', err);
    } finally {
      setGenerating(false);
    }
  };

  const handleLoadCached = async () => {
    setLoadingCached(true);
    try {
      const { useStageStore } = await import('@/lib/store/stage');
      const { CACHED_AI_COURSE } = await import('@/lib/demo/cached-ai-course');
      const stageStore = useStageStore.getState();

      const stage = CACHED_AI_COURSE.stage;
      stageStore.setStage(stage);
      stageStore.setOutlines(CACHED_AI_COURSE.outlines as SceneOutline[]);

      router.push(`/classroom/${stage.id}`);
    } catch (err) {
      console.error('Failed to load cached demo:', err);
    } finally {
      setLoadingCached(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <Button
        onClick={handleGenerateFresh}
        disabled={generating}
        className="gap-2 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary text-primary-foreground shadow-lg"
      >
        <Loader2 className={`h-4 w-4 ${generating ? '' : 'hidden'}`} />
        <Sparkles className={`h-4 w-4 ${generating ? 'hidden' : ''}`} />
        <Zap className={`h-4 w-4 ${generating ? 'hidden' : ''}`} />
        <span>{generating ? '正在启动...' : 'AI 实时生成演示课程'}</span>
      </Button>
      <Button
        variant="outline"
        onClick={handleLoadCached}
        disabled={loadingCached}
        className="gap-2"
      >
        <Database className={`h-4 w-4 ${loadingCached ? 'animate-spin' : ''}`} />
        <span>{loadingCached ? '加载中...' : '秒开缓存演示课程'}</span>
      </Button>
    </div>
  );
}
