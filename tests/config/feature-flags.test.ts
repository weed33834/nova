import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isNovaEditorEnabled,
  isVocationalTaskEngineEnabled,
  resolveVocationalActive,
  shouldShowVocationalTestUi,
} from '@/lib/config/feature-flags';

const FLAG = 'NEXT_PUBLIC_NOVA_EDITOR_ENABLED';
const LEGACY_FLAG = 'NEXT_PUBLIC_Nova_EDITOR_ENABLED';

describe('isNovaEditorEnabled', () => {
  let original: string | undefined;
  let legacyOriginal: string | undefined;

  beforeEach(() => {
    original = process.env[FLAG];
    legacyOriginal = process.env[LEGACY_FLAG];
  });

  afterEach(() => {
    if (original === undefined) delete process.env[FLAG];
    else process.env[FLAG] = original;
    if (legacyOriginal === undefined) delete process.env[LEGACY_FLAG];
    else process.env[LEGACY_FLAG] = legacyOriginal;
  });

  it('returns false when the env var is unset', () => {
    delete process.env[FLAG];
    delete process.env[LEGACY_FLAG];
    expect(isNovaEditorEnabled()).toBe(false);
  });

  it("returns true for 'true'", () => {
    process.env[FLAG] = 'true';
    expect(isNovaEditorEnabled()).toBe(true);
  });

  it("returns true for '1'", () => {
    process.env[FLAG] = '1';
    expect(isNovaEditorEnabled()).toBe(true);
  });

  it("returns false for 'false'", () => {
    process.env[FLAG] = 'false';
    expect(isNovaEditorEnabled()).toBe(false);
  });

  it('returns false for an unrecognized string', () => {
    process.env[FLAG] = 'yes';
    expect(isNovaEditorEnabled()).toBe(false);
  });

  it('falls back to the legacy mixed-case alias and warns', () => {
    delete process.env[FLAG];
    process.env[LEGACY_FLAG] = 'true';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(isNovaEditorEnabled()).toBe(true);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('prefers the canonical name over the legacy alias', () => {
    process.env[FLAG] = 'false';
    process.env[LEGACY_FLAG] = 'true';
    expect(isNovaEditorEnabled()).toBe(false);
  });
});

describe('isVocationalTaskEngineEnabled', () => {
  const flag = 'NOVA_ENABLE_VOCATIONAL';
  const legacyFlag = 'OPENNova_ENABLE_VOCATIONAL';
  let original: string | undefined;
  let legacyOriginal: string | undefined;

  beforeEach(() => {
    original = process.env[flag];
    legacyOriginal = process.env[legacyFlag];
  });

  afterEach(() => {
    if (original === undefined) delete process.env[flag];
    else process.env[flag] = original;
    if (legacyOriginal === undefined) delete process.env[legacyFlag];
    else process.env[legacyFlag] = legacyOriginal;
  });

  it('defaults off when unset', () => {
    delete process.env[flag];
    delete process.env[legacyFlag];
    expect(isVocationalTaskEngineEnabled()).toBe(false);
  });

  it("returns true for 'true' and '1'", () => {
    process.env[flag] = 'true';
    expect(isVocationalTaskEngineEnabled()).toBe(true);

    process.env[flag] = '1';
    expect(isVocationalTaskEngineEnabled()).toBe(true);
  });

  it("returns false for 'false'", () => {
    process.env[flag] = 'false';
    expect(isVocationalTaskEngineEnabled()).toBe(false);
  });

  it('falls back to the legacy mixed-case alias', () => {
    delete process.env[flag];
    process.env[legacyFlag] = 'true';
    expect(isVocationalTaskEngineEnabled()).toBe(true);
  });

  it('resolves active mode from both request intent and server flag', () => {
    process.env[flag] = 'true';
    expect(resolveVocationalActive({ taskEngineMode: true })).toBe(true);
    expect(resolveVocationalActive({ taskEngineMode: false })).toBe(false);
    expect(resolveVocationalActive(undefined)).toBe(false);

    process.env[flag] = 'false';
    expect(resolveVocationalActive({ taskEngineMode: true })).toBe(false);
  });
});

describe('shouldShowVocationalTestUi', () => {
  const flag = 'NEXT_PUBLIC_SHOW_VOCATIONAL_TEST_UI';
  let original: string | undefined;

  beforeEach(() => {
    original = process.env[flag];
  });

  afterEach(() => {
    if (original === undefined) delete process.env[flag];
    else process.env[flag] = original;
  });

  it('defaults off when unset', () => {
    delete process.env[flag];
    expect(shouldShowVocationalTestUi()).toBe(false);
  });

  it("returns true for 'true' and '1'", () => {
    process.env[flag] = 'true';
    expect(shouldShowVocationalTestUi()).toBe(true);

    process.env[flag] = '1';
    expect(shouldShowVocationalTestUi()).toBe(true);
  });
});
