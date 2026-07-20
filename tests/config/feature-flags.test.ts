import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  isNovaEditorEnabled,
  isVocationalTaskEngineEnabled,
  resolveVocationalActive,
  shouldShowVocationalTestUi,
} from '@/lib/config/feature-flags';

const FLAG = 'NEXT_PUBLIC_Nova_EDITOR_ENABLED';

describe('isNovaEditorEnabled', () => {
  let original: string | undefined;

  beforeEach(() => {
    original = process.env[FLAG];
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env[FLAG];
    } else {
      process.env[FLAG] = original;
    }
  });

  it('returns false when the env var is unset', () => {
    delete process.env[FLAG];
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
});

describe('isVocationalTaskEngineEnabled', () => {
  const flag = 'OPENNova_ENABLE_VOCATIONAL';
  let original: string | undefined;

  beforeEach(() => {
    original = process.env[flag];
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env[flag];
    } else {
      process.env[flag] = original;
    }
  });

  it('defaults off when unset', () => {
    delete process.env[flag];
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
    if (original === undefined) {
      delete process.env[flag];
    } else {
      process.env[flag] = original;
    }
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
