import { describe, test, expect, vi } from 'vitest';

import {
  getEffectiveMediaFlags,
  isTTSEnabledForFormat,
  isImageEnabledForFormat,
  isVideoEnabledForFormat,
} from '@/lib/utils/course-format';

describe('getEffectiveMediaFlags', () => {
  test('video format follows all settings when all are true', () => {
    const flags = getEffectiveMediaFlags('video', {
      imageGenerationEnabled: true,
      videoGenerationEnabled: true,
      ttsEnabled: true,
    });
    expect(flags).toEqual({
      imageEnabled: true,
      videoEnabled: true,
      ttsEnabled: true,
    });
  });

  test('video format follows all settings when all are false', () => {
    const flags = getEffectiveMediaFlags('video', {
      imageGenerationEnabled: false,
      videoGenerationEnabled: false,
      ttsEnabled: false,
    });
    expect(flags).toEqual({
      imageEnabled: false,
      videoEnabled: false,
      ttsEnabled: false,
    });
  });

  test('video format follows all settings with a mixed configuration', () => {
    const flags = getEffectiveMediaFlags('video', {
      imageGenerationEnabled: true,
      videoGenerationEnabled: false,
      ttsEnabled: true,
    });
    expect(flags).toEqual({
      imageEnabled: true,
      videoEnabled: false,
      ttsEnabled: true,
    });
  });

  test('ppt-audio format force-disables video; image/tts follow settings (all true)', () => {
    const flags = getEffectiveMediaFlags('ppt-audio', {
      imageGenerationEnabled: true,
      videoGenerationEnabled: true,
      ttsEnabled: true,
    });
    expect(flags).toEqual({
      imageEnabled: true,
      videoEnabled: false,
      ttsEnabled: true,
    });
  });

  test('ppt-audio format force-disables video even when videoGenerationEnabled is true', () => {
    const flags = getEffectiveMediaFlags('ppt-audio', {
      imageGenerationEnabled: false,
      videoGenerationEnabled: true,
      ttsEnabled: false,
    });
    expect(flags).toEqual({
      imageEnabled: false,
      videoEnabled: false,
      ttsEnabled: false,
    });
  });

  test('text-only format force-disables all media regardless of settings', () => {
    const flags = getEffectiveMediaFlags('text-only', {
      imageGenerationEnabled: true,
      videoGenerationEnabled: true,
      ttsEnabled: true,
    });
    expect(flags).toEqual({
      imageEnabled: false,
      videoEnabled: false,
      ttsEnabled: false,
    });
  });

  test('text-only format force-disables all media even when settings are all false', () => {
    const flags = getEffectiveMediaFlags('text-only', {
      imageGenerationEnabled: false,
      videoGenerationEnabled: false,
      ttsEnabled: false,
    });
    expect(flags).toEqual({
      imageEnabled: false,
      videoEnabled: false,
      ttsEnabled: false,
    });
  });

  test('undefined format is treated as video (all true)', () => {
    const flags = getEffectiveMediaFlags(undefined, {
      imageGenerationEnabled: true,
      videoGenerationEnabled: true,
      ttsEnabled: true,
    });
    expect(flags).toEqual({
      imageEnabled: true,
      videoEnabled: true,
      ttsEnabled: true,
    });
  });

  test('undefined format is treated as video (mixed settings)', () => {
    const flags = getEffectiveMediaFlags(undefined, {
      imageGenerationEnabled: false,
      videoGenerationEnabled: true,
      ttsEnabled: false,
    });
    expect(flags).toEqual({
      imageEnabled: false,
      videoEnabled: true,
      ttsEnabled: false,
    });
  });

  test('missing settings fields default to false', () => {
    const flags = getEffectiveMediaFlags('video', {});
    expect(flags).toEqual({
      imageEnabled: false,
      videoEnabled: false,
      ttsEnabled: false,
    });
  });
});

describe('isTTSEnabledForFormat', () => {
  test('returns true for video when ttsEnabled is true', () => {
    expect(isTTSEnabledForFormat('video', { ttsEnabled: true })).toBe(true);
  });

  test('returns false for video when ttsEnabled is false', () => {
    expect(isTTSEnabledForFormat('video', { ttsEnabled: false })).toBe(false);
  });

  test('returns true for ppt-audio when ttsEnabled is true', () => {
    expect(isTTSEnabledForFormat('ppt-audio', { ttsEnabled: true })).toBe(true);
  });

  test('returns false for text-only even when ttsEnabled is true', () => {
    expect(isTTSEnabledForFormat('text-only', { ttsEnabled: true })).toBe(false);
  });

  test('returns false for undefined format when ttsEnabled is false', () => {
    expect(isTTSEnabledForFormat(undefined, { ttsEnabled: false })).toBe(false);
  });
});

describe('isImageEnabledForFormat', () => {
  test('returns true for video when imageGenerationEnabled is true', () => {
    expect(isImageEnabledForFormat('video', { imageGenerationEnabled: true })).toBe(true);
  });

  test('returns true for ppt-audio when imageGenerationEnabled is true', () => {
    expect(isImageEnabledForFormat('ppt-audio', { imageGenerationEnabled: true })).toBe(true);
  });

  test('returns false for text-only even when imageGenerationEnabled is true', () => {
    expect(isImageEnabledForFormat('text-only', { imageGenerationEnabled: true })).toBe(false);
  });

  test('returns false for undefined format when imageGenerationEnabled is false', () => {
    expect(isImageEnabledForFormat(undefined, { imageGenerationEnabled: false })).toBe(false);
  });
});

describe('isVideoEnabledForFormat', () => {
  test('returns true for video when videoGenerationEnabled is true', () => {
    expect(isVideoEnabledForFormat('video', { videoGenerationEnabled: true })).toBe(true);
  });

  test('returns false for ppt-audio even when videoGenerationEnabled is true', () => {
    expect(isVideoEnabledForFormat('ppt-audio', { videoGenerationEnabled: true })).toBe(false);
  });

  test('returns false for text-only even when videoGenerationEnabled is true', () => {
    expect(isVideoEnabledForFormat('text-only', { videoGenerationEnabled: true })).toBe(false);
  });

  test('returns true for undefined format when videoGenerationEnabled is true', () => {
    expect(isVideoEnabledForFormat(undefined, { videoGenerationEnabled: true })).toBe(true);
  });
});
