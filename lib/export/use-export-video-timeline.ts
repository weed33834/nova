/**
 * React hook for exporting the classroom video timeline IR as JSON.
 *
 * Integrates the pure `compileVideoTimeline` compiler (lib/video-export) with
 * live app state by providing Dexie-backed implementations of `TimingProbe`
 * and `AssetSource`. The resulting `VideoTimeline` IR is downloaded as a JSON
 * file that downstream renderers (Hyperframes, FFmpeg pipeline, etc.) can
 * consume.
 *
 * This is the P1a integration: the IR is produced and exported. The actual
 * video rendering (P1b) will consume this IR in a separate worker process.
 */
'use client';

import { useState, useCallback } from 'react';
import { saveAs } from 'file-saver';
import { toast } from 'sonner';
import { useStageStore } from '@/lib/store/stage';
import { useI18n } from '@/lib/hooks/use-i18n';
import { db } from '@/lib/utils/database';
import {
  compileVideoTimeline,
  type CompileDeps,
  type CompilerScene,
  type TimingProbe,
  type AssetSource,
  type AssetMeta,
} from '@/lib/video-export';
import type { SpeechAction, PlayVideoAction } from '@nova/dsl';
import type { Scene } from '@/lib/types/stage';
import { createLogger } from '@/lib/logger';

const log = createLogger('ExportVideoTimeline');

/**
 * Build a TimingProbe backed by IndexedDB (Dexie).
 *
 * Audio durations are stored at TTS generation time (#861). When a speech
 * action has no stored audio (e.g. TTS was not generated), returns null so
 * the compiler falls back to its deterministic no-audio estimate.
 */
function createDexieTimingProbe(
  audioDurationMap: Map<string, number>,
  videoDurationMap: Map<string, number>,
): TimingProbe {
  return {
    audioDurationMs(action: SpeechAction): number | null {
      // Look up by action id — the TTS pipeline stores audio keyed by action id.
      const actionId = (action as { id?: string }).id;
      if (!actionId) return null;
      return audioDurationMap.get(actionId) ?? null;
    },
    videoDurationMs(action: PlayVideoAction): number | null {
      const elementId = (action as { elementId?: string }).elementId;
      if (!elementId) return null;
      return videoDurationMap.get(elementId) ?? null;
    },
    clearElementCount: () => 0,
    isDiscussionSkipped: () => false,
    isEditCodeNoop: () => false,
  };
}

/**
 * Build an AssetSource backed by IndexedDB (Dexie).
 *
 * Checks the `media` and `audio` tables for presence. Returns metadata
 * (mimeType, format, duration) when available.
 */
function createDexieAssetSource(
  audioMetaMap: Map<string, AssetMeta>,
  mediaMetaMap: Map<string, AssetMeta>,
): AssetSource {
  return {
    audio(action: SpeechAction): AssetMeta | null {
      const actionId = (action as { id?: string }).id;
      if (!actionId) return null;
      return audioMetaMap.get(actionId) ?? null;
    },
    media(elementId: string): AssetMeta | null {
      return mediaMetaMap.get(elementId) ?? null;
    },
  };
}

/**
 * Extract all audio action IDs from the scenes' actions arrays.
 * Used to selectively load only the needed audio records from IndexedDB,
 * instead of loading ALL records (which includes heavy Blob data).
 */
function extractAudioIds(scenes: readonly Scene[]): string[] {
  const ids: string[] = [];
  for (const scene of scenes) {
    for (const action of scene.actions ?? []) {
      if (action.type === 'speech') {
        const actionId = (action as { id?: string }).id;
        if (actionId) ids.push(actionId);
      }
    }
  }
  return ids;
}

/**
 * Extract all media element IDs from scenes' canvas elements.
 * Used to selectively load only the needed media records.
 */
function extractMediaElementIds(scenes: readonly Scene[]): Set<string> {
  const ids = new Set<string>();
  for (const scene of scenes) {
    const canvas = (scene.content as { canvas?: { elements?: Array<{ id?: string }> } })?.canvas;
    if (canvas?.elements) {
      for (const el of canvas.elements) {
        if (el.id) ids.add(el.id);
      }
    }
  }
  return ids;
}

/**
 * Pre-resolve audio durations and media metadata from IndexedDB.
 *
 * The compiler needs synchronous access to durations (the pure compile fold
 * can't await). We pre-load only the metadata needed for the current stage's
 * scenes into Maps before calling compileVideoTimeline.
 *
 * Performance: Only loads records referenced by the current stage's scenes,
 * not ALL records in the database. This avoids loading large Blob data for
 * other stages' audio/media.
 */
async function preloadAssetMetadata(
  stageId: string,
  scenes: readonly Scene[],
): Promise<{
  audioDurationMap: Map<string, number>;
  videoDurationMap: Map<string, number>;
  audioMetaMap: Map<string, AssetMeta>;
  mediaMetaMap: Map<string, AssetMeta>;
}> {
  const audioDurationMap = new Map<string, number>();
  const videoDurationMap = new Map<string, number>();
  const audioMetaMap = new Map<string, AssetMeta>();
  const mediaMetaMap = new Map<string, AssetMeta>();

  try {
    // ── Audio: load only records referenced by this stage's speech actions ──
    const audioIds = extractAudioIds(scenes);
    if (audioIds.length > 0) {
      // Use where('id').anyOf() to avoid loading ALL audio records
      // (which would include heavy Blob data from every stage)
      const audioRecords = await db.audioFiles.where('id').anyOf(audioIds).toArray();
      for (const rec of audioRecords) {
        if (rec.duration) {
          audioDurationMap.set(rec.id, rec.duration * 1000);
        }
        audioMetaMap.set(rec.id, {
          id: rec.id,
          mimeType: rec.format === 'wav' ? 'audio/wav' : 'audio/mpeg',
          format: rec.format || 'mp3',
          durationMs: rec.duration ? rec.duration * 1000 : undefined,
          present: true,
        });
      }
    }

    // ── Media: filter by stageId using the compound key prefix ──
    // MediaFileRecord.id is `${stageId}:${elementId}`, so we can use
    // startsWith to only load media for the current stage.
    const mediaRecords = await db.mediaFiles
      .where('id')
      .startsWith(`${stageId}:`)
      .toArray();

    // Also filter to only elements referenced in scenes (further reduction)
    const referencedElementIds = extractMediaElementIds(scenes);

    for (const rec of mediaRecords) {
      const elementId = rec.id.includes(':') ? rec.id.split(':')[1] : rec.id;
      // Skip media records not referenced by any scene element
      if (referencedElementIds.size > 0 && !referencedElementIds.has(elementId)) continue;

      const isVideo = rec.type === 'video';
      const meta: AssetMeta = {
        id: rec.id,
        mimeType: rec.mimeType,
        format: isVideo ? 'mp4' : 'png',
        durationMs: undefined, // MediaFileRecord doesn't store duration
        present: !rec.error,
      };
      mediaMetaMap.set(elementId, meta);
      if (isVideo) {
        // Video duration unknown — the compiler will use the 'cap' policy
        videoDurationMap.set(elementId, 0);
      }
    }
  } catch (err) {
    log.warn('Failed to preload asset metadata from IndexedDB:', err);
  }

  return { audioDurationMap, videoDurationMap, audioMetaMap, mediaMetaMap };
}

export function useExportVideoTimeline() {
  const [exporting, setExporting] = useState(false);
  const { t } = useI18n();

  const exportVideoTimeline = useCallback(async () => {
    const { stage, scenes } = useStageStore.getState();
    if (!stage?.id || scenes.length === 0) {
      toast.error(t('export.noContent') || 'No content to export');
      return;
    }

    setExporting(true);
    const toastId = toast.loading(
      t('export.exportingVideoTimeline') || 'Exporting video timeline...',
    );

    try {
      // Pre-load only the asset metadata needed for this stage
      const { audioDurationMap, videoDurationMap, audioMetaMap, mediaMetaMap } =
        await preloadAssetMetadata(stage.id, scenes);

      // Build compiler dependencies
      const deps: CompileDeps = {
        timing: createDexieTimingProbe(audioDurationMap, videoDurationMap),
        assets: createDexieAssetSource(audioMetaMap, mediaMetaMap),
        config: {
          playbackSpeed: 1,
          whiteboardInitiallyOpen: false,
          onUnresolvedVideoDuration: 'cap',
        },
      };

      // Cast app scenes to compiler scenes (structurally compatible)
      const compilerScenes = scenes as unknown as CompilerScene[];

      // Compile the video timeline IR
      const ir = compileVideoTimeline(
        { stage: { id: stage.id, name: stage.name ?? stage.id }, scenes: compilerScenes },
        deps,
      );

      // Export as JSON
      const json = JSON.stringify(ir, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const filename = `${stage.name ?? stage.id}-timeline.json`
        .replace(/[^a-zA-Z0-9-_]/g, '_')
        .replace(/_+/g, '_');
      saveAs(blob, filename);

      // Report diagnostics
      const warnings = ir.diagnostics.filter((d) => d.severity === 'warn');
      const errors = ir.diagnostics.filter((d) => d.severity === 'error');
      const totalDuration = (ir.totalDurationMs / 1000).toFixed(1);

      if (errors.length > 0) {
        toast.error(
          `${t('export.timelineErrors') || 'Timeline exported with errors'}: ${errors.length} error(s), ${warnings.length} warning(s)`,
          { id: toastId },
        );
      } else if (warnings.length > 0) {
        toast.warning(
          `${t('export.timelineWithWarnings') || 'Timeline exported'} (${totalDuration}s, ${warnings.length} warning(s))`,
          { id: toastId },
        );
      } else {
        toast.success(
          `${t('export.timelineSuccess') || 'Video timeline exported'} (${totalDuration}s)`,
          { id: toastId },
        );
      }

      log.info(
        `Video timeline exported: ${ir.scenes.length} scenes, ${(ir.totalDurationMs / 1000).toFixed(1)}s, ${ir.diagnostics.length} diagnostic(s)`,
      );
    } catch (err) {
      log.error('Video timeline export failed:', err);
      toast.error(t('export.timelineFailed') || 'Failed to export video timeline', { id: toastId });
    } finally {
      setExporting(false);
    }
  }, [t]);

  return { exporting, exportVideoTimeline };
}
