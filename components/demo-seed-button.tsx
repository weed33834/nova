'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Sparkles, Zap, Loader2, Database } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { SceneOutline } from '@/lib/types/generation';
import { CACHED_AI_COURSE_SCENES } from '@/lib/demo/cached-ai-course';

export function DemoSeedButton() {
  const { t } = useI18n();
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [loadingCached, setLoadingCached] = useState(false);

  const handleGenerateFresh = async () => {
    if (generating) return;

    setGenerating(true);
    try {
      const sessionState = {
        sessionId: `demo_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        requirements: {
          requirement: t('demoSeed.requirement', {
            defaultValue:
              'Introduction to AI: from AI fundamentals to cutting-edge technology, systematically master the core knowledge of artificial intelligence. Covering search algorithms, knowledge representation, machine learning, deep learning, NLP, computer vision, reinforcement learning, generative AI, and AI ethics.',
          }),
        },
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
      stageStore.setScenes(CACHED_AI_COURSE_SCENES);
      stageStore.setGenerationComplete(true);
      // 确保场景落盘后再跳转，避免课堂页从 IndexedDB 读到空场景
      await stageStore.saveToStorage();

      router.push(`/classroom/${stage.id}`);
    } catch (err) {
      console.error('Failed to load cached demo:', err);
    } finally {
      setLoadingCached(false);
    }
  };

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <Button
        onClick={handleGenerateFresh}
        disabled={generating}
        className="gap-2 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary text-primary-foreground shadow-lg"
      >
        <Loader2 className={`h-4 w-4 ${generating ? '' : 'hidden'}`} />
        <Sparkles className={`h-4 w-4 ${generating ? 'hidden' : ''}`} />
        <Zap className={`h-4 w-4 ${generating ? 'hidden' : ''}`} />
        <span>{generating ? t('demoSeed.launchingDemo') : t('demoSeed.launchDemo')}</span>
      </Button>
      <Button
        variant="outline"
        onClick={handleLoadCached}
        disabled={loadingCached}
        className="gap-2"
      >
        <Database className={`h-4 w-4 ${loadingCached ? 'animate-spin' : ''}`} />
        <span>{loadingCached ? t('demoSeed.loading') : t('demoSeed.loadCached')}</span>
      </Button>
    </div>
  );
}
