/**
 * Course format utilities.
 *
 * `CourseFormat` is a per-course macro switch stored on `Stage`. It overrides
 * the global media settings for THIS course only — the global settings in
 * `SettingsState` remain unchanged. This keeps courseFormat non-destructive:
 * switching a course to `text-only` does not silently turn off the user's
 * global image-generation toggle for other courses.
 */

import type { CourseFormat } from '@/lib/types/generation';

/**
 * Effective media flags after applying courseFormat override.
 * Callers should use these instead of reading settings directly when
 * deciding whether to generate images / videos / TTS.
 */
export interface EffectiveMediaFlags {
  /** Whether image generation should run for this course. */
  imageEnabled: boolean;
  /** Whether video generation should run for this course. */
  videoEnabled: boolean;
  /** Whether TTS generation should run for this course. */
  ttsEnabled: boolean;
}

/**
 * Derive the effective media flags for a course, combining the per-course
 * `courseFormat` with the user's global settings.
 *
 * Override matrix:
 * - `video`      → respects all global settings (default, backward compat)
 * - `ppt-audio`  → force-disables video; images + TTS follow global settings
 * - `text-only`  → force-disables images, video, and TTS
 *
 * @param courseFormat - from Stage.courseFormat; undefined → 'video'
 * @param settings - global settings (imageGenerationEnabled, videoGenerationEnabled, ttsEnabled)
 */
export function getEffectiveMediaFlags(
  courseFormat: CourseFormat | undefined,
  settings: {
    imageGenerationEnabled?: boolean;
    videoGenerationEnabled?: boolean;
    ttsEnabled?: boolean;
  },
): EffectiveMediaFlags {
  const format = courseFormat ?? 'video';

  switch (format) {
    case 'text-only':
      return {
        imageEnabled: false,
        videoEnabled: false,
        ttsEnabled: false,
      };

    case 'ppt-audio':
      return {
        imageEnabled: settings.imageGenerationEnabled ?? false,
        videoEnabled: false, // Force-disable video generation
        ttsEnabled: settings.ttsEnabled ?? false,
      };

    case 'video':
    default:
      return {
        imageEnabled: settings.imageGenerationEnabled ?? false,
        videoEnabled: settings.videoGenerationEnabled ?? false,
        ttsEnabled: settings.ttsEnabled ?? false,
      };
  }
}

/**
 * Whether the TTS step should run for this course format.
 *
 * Even when `settings.ttsEnabled` is true, `text-only` overrides it to false.
 * Use this in TTS trigger conditions alongside the existing provider checks.
 */
export function isTTSEnabledForFormat(
  courseFormat: CourseFormat | undefined,
  settings: { ttsEnabled?: boolean },
): boolean {
  return getEffectiveMediaFlags(courseFormat, settings).ttsEnabled;
}

/**
 * Whether image generation should run for this course format.
 */
export function isImageEnabledForFormat(
  courseFormat: CourseFormat | undefined,
  settings: { imageGenerationEnabled?: boolean },
): boolean {
  return getEffectiveMediaFlags(courseFormat, settings).imageEnabled;
}

/**
 * Whether video generation should run for this course format.
 */
export function isVideoEnabledForFormat(
  courseFormat: CourseFormat | undefined,
  settings: { videoGenerationEnabled?: boolean },
): boolean {
  return getEffectiveMediaFlags(courseFormat, settings).videoEnabled;
}
