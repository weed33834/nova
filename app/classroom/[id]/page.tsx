'use client';

import { Stage } from '@/components/stage';
import { ThemeProvider } from '@/lib/hooks/use-theme';
import { useStageStore } from '@/lib/store';
import { useSettingsStore } from '@/lib/store/settings';
import { claimStageSceneLoadToken, isCurrentStageSceneLoadToken } from '@/lib/store/stage';
import { loadImageMapping } from '@/lib/utils/image-storage';
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, RotateCcw, AlertTriangle } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useSceneGenerator } from '@/lib/hooks/use-scene-generator';
import { useMediaGenerationStore } from '@/lib/store/media-generation';
import { useWhiteboardHistoryStore } from '@/lib/store/whiteboard-history';
import { createLogger } from '@/lib/logger';
import { MediaStageProvider } from '@/lib/contexts/media-stage-context';
import { generateMediaForOutlines } from '@/lib/media/media-orchestrator';
import { useAgentRegistry } from '@/lib/orchestration/registry/store';
import type { PdfImage } from '@/lib/types/generation';
import type { AgentInfo } from '@/lib/generation/generation-pipeline';
import {
  applyClassroomStageAndScenes,
  defaultClassroomLoadDeps,
  runClassroomLoad,
  saveGeneratedAgentsForCurrentLoad,
} from '@/lib/classroom/load-classroom';

const log = createLogger('Classroom');

export default function ClassroomDetailPage() {
  const params = useParams();
  const classroomId = params?.id as string;

  const loadFromStorage = useStageStore((state) => state.loadFromStorage);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const generationStartedRef = useRef(false);

  const onGenerationComplete = useCallback(() => {
    log.info('[Classroom] All scenes generated');
  }, []);

  // P1-1: Show toast when a scene fails, so users know WHAT failed and WHY.
  // Previously, onSceneFailed was not passed at all — failures were silent.
  const { t } = useI18n();
  const onSceneFailed = useCallback(
    (outline: { title: string }, error: string) => {
      toast.error(t('errors.generation.sceneFailed', { title: outline.title }), {
        description: error,
      });
      log.warn(`[Classroom] Scene "${outline.title}" failed:`, error);
    },
    [t],
  );

  const sceneGeneratorOptions = useMemo(
    () => ({ onComplete: onGenerationComplete, onSceneFailed }),
    [onGenerationComplete, onSceneFailed],
  );
  const { generateRemaining, retrySingleOutline, stop } = useSceneGenerator(sceneGeneratorOptions);

  const loadClassroom = useCallback(
    async (isEffectCurrent: () => boolean = () => true) => {
      const loadToken = claimStageSceneLoadToken();
      const isCurrent = () => isEffectCurrent() && isCurrentStageSceneLoadToken(loadToken);

      await runClassroomLoad({
        classroomId,
        loadToken,
        isCurrent,
        loadFromStorage,
        getCurrentStage: () => useStageStore.getState().stage,
        fetchClassroom: defaultClassroomLoadDeps.fetchClassroom,
        applyFallbackScenes: (args) =>
          defaultClassroomLoadDeps.applyFallbackScenes({
            ...args,
            isCurrent,
            applyStageAndScenes: applyClassroomStageAndScenes,
          }),
        saveGeneratedAgents: (stageId, agents) =>
          saveGeneratedAgentsForCurrentLoad(stageId, agents, isCurrent),
        loadRestoredMediaTasks: defaultClassroomLoadDeps.loadRestoredMediaTasks,
        applyRestoredMediaTasks: defaultClassroomLoadDeps.applyRestoredMediaTasks,
        discardRestoredMediaTasks: defaultClassroomLoadDeps.discardRestoredMediaTasks,
        loadGeneratedAgentRecords: defaultClassroomLoadDeps.loadGeneratedAgentRecords,
        applyGeneratedAgentRecords: defaultClassroomLoadDeps.applyGeneratedAgentRecords,
        getSettings: () => useSettingsStore.getState(),
        getAgent: (id) => useAgentRegistry.getState().getAgent(id),
        restoreAgentSelection: defaultClassroomLoadDeps.restoreAgentSelection,
        setError,
        setLoading,
        log,
      });
    },
    [classroomId, loadFromStorage],
  );

  useEffect(() => {
    // Reset loading state on course switch to unmount Stage during transition,
    // preventing stale data from syncing back to the new course
    /* eslint-disable react-hooks/set-state-in-effect -- Course switch must hide stale Stage before async load */
    setLoading(true);
    setError(null);
    /* eslint-enable react-hooks/set-state-in-effect */
    generationStartedRef.current = false;

    // Clear previous classroom's media tasks to prevent cross-classroom contamination.
    // Placeholder IDs (gen_img_1, gen_vid_1) are NOT globally unique across stages,
    // so stale tasks from a previous classroom would shadow the new one's.
    const mediaStore = useMediaGenerationStore.getState();
    mediaStore.revokeObjectUrls();
    useMediaGenerationStore.setState({ tasks: {} });

    // Clear whiteboard history to prevent snapshots from a previous course leaking in.
    useWhiteboardHistoryStore.getState().clearHistory();

    let cancelled = false;
    loadClassroom(() => !cancelled);

    // Cancel ongoing generation when classroomId changes or component unmounts
    return () => {
      cancelled = true;
      stop();
    };
  }, [classroomId, loadClassroom, stop]);

  // Auto-resume generation for pending outlines
  useEffect(() => {
    if (loading || error || generationStartedRef.current) return;

    const state = useStageStore.getState();
    const { outlines, scenes, stage, generationComplete } = state;

    // Check if there are pending outlines. A finished deck is frozen for
    // editing: deleting a slide leaves its outline orphaned, but that must not
    // be treated as an interrupted generation and regenerated. Only resume
    // when generation has not completed.
    const completedOrders = new Set(scenes.map((s) => s.order));
    const hasPending = !generationComplete && outlines.some((o) => !completedOrders.has(o.order));

    if (hasPending && stage) {
      generationStartedRef.current = true;

      // Load generation params from sessionStorage (stored by generation-preview before navigating)
      let params: {
        pdfImages?: PdfImage[];
        agents?: AgentInfo[];
        userProfile?: string;
        languageDirective?: string;
      } = {};
      try {
        const genParamsStr = sessionStorage.getItem('generationParams');
        if (genParamsStr) params = JSON.parse(genParamsStr);
      } catch (parseError) {
        log.warn(
          '[Classroom] Invalid generationParams; starting without restored inputs:',
          parseError,
        );
        sessionStorage.removeItem('generationParams');
      }

      // Reconstruct imageMapping from IndexedDB using pdfImages storageIds
      const storageIds = (params.pdfImages || [])
        .map((img: { storageId?: string }) => img.storageId)
        .filter((storageId): storageId is string => Boolean(storageId));

      loadImageMapping(storageIds).then((imageMapping) => {
        generateRemaining({
          pdfImages: params.pdfImages,
          imageMapping,
          stageInfo: {
            name: stage.name || '',
            description: stage.description,
            style: stage.style,
          },
          agents: params.agents,
          userProfile: params.userProfile,
          languageDirective: params.languageDirective || stage.languageDirective,
        });
      });
    } else if (outlines.length > 0 && stage) {
      // All scenes are generated, but some media may not have finished.
      // Resume media generation for any tasks not yet in IndexedDB.
      // generateMediaForOutlines skips already-completed tasks automatically.
      generationStartedRef.current = true;
      // The deck reached the classroom already fully materialized (e.g. a
      // single-slide course, or a deck whose last slide finished in
      // generation-preview), so generateRemaining's completion path never
      // ran. Record completion now so a later edit/delete is not treated as
      // an interrupted generation. No-op if already complete or not all
      // outlines have scenes.
      useStageStore.getState().markGenerationCompleteIfDone();
      // Resume media only for outlines that still have a scene. On a finished
      // deck the user may have deleted a slide, leaving an orphaned outline;
      // generating its media would waste API calls on a slide that is gone.
      const materializedOrders = new Set(scenes.map((s) => s.order));
      const materializedOutlines = outlines.filter((o) => materializedOrders.has(o.order));
      generateMediaForOutlines(materializedOutlines, stage.id, undefined, stage.courseFormat).catch((err) => {
        log.warn('[Classroom] Media generation resume error:', err);
      });
    }
  }, [loading, error, generateRemaining]);

  return (
    <ThemeProvider>
      <MediaStageProvider value={classroomId}>
        <div className="h-screen flex flex-col overflow-hidden">
          {loading ? (
            <div
              className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900"
              role="status"
              aria-live="polite"
              aria-label={t('classroom.loadingAriaLabel')}
            >
              <div className="text-center text-muted-foreground flex flex-col items-center gap-3">
                <Loader2 className="size-6 animate-spin text-pink-500" aria-hidden="true" />
                <p className="text-sm">{t('classroom.loading')}</p>
              </div>
            </div>
          ) : error ? (
            <div
              className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900"
              role="alert"
            >
              <div className="text-center flex flex-col items-center gap-3 max-w-md px-6">
                <AlertTriangle
                  className="size-8 text-destructive/80"
                  aria-hidden="true"
                />
                <p className="text-sm font-medium text-destructive mb-2">
                  {t('classroom.errorTitle')}
                </p>
                <p className="text-xs text-muted-foreground mb-4 break-words">{error}</p>
                <button
                  onClick={() => {
                    setError(null);
                    setLoading(true);
                    loadClassroom();
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors text-sm"
                >
                  <RotateCcw className="size-3.5" aria-hidden="true" />
                  {t('classroom.retryLabel')}
                </button>
              </div>
            </div>
          ) : (
            <Stage onRetryOutline={retrySingleOutline} />
          )}
        </div>
      </MediaStageProvider>
    </ThemeProvider>
  );
}
