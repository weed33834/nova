/**
 * Feature Flags tests.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { isFeatureEnabled, getFeatureConfig, getFeatureNumber, resetFeatureFlags, getAllFeatureFlags } from '@/lib/server/feature-flags';

beforeEach(() => {
  // Clear cache and env vars before each test
  resetFeatureFlags();
  delete process.env.FEATURE_TEST_BOOL;
  delete process.env.FEATURE_TEST_STRING;
  delete process.env.FEATURE_TEST_NUMBER;
});

describe('Feature Flags', () => {
  describe('isFeatureEnabled', () => {
    it('returns false for unset flags', () => {
      expect(isFeatureEnabled('NONEXISTENT')).toBe(false);
    });

    it('returns true when FEATURE_* = "true"', () => {
      process.env.FEATURE_TEST_BOOL = 'true';
      expect(isFeatureEnabled('TEST_BOOL')).toBe(true);
    });

    it('returns true when FEATURE_* = "1"', () => {
      process.env.FEATURE_TEST_BOOL = '1';
      expect(isFeatureEnabled('TEST_BOOL')).toBe(true);
    });

    it('returns true when FEATURE_* = "yes"', () => {
      process.env.FEATURE_TEST_BOOL = 'yes';
      expect(isFeatureEnabled('TEST_BOOL')).toBe(true);
    });

    it('returns false when FEATURE_* = "false"', () => {
      process.env.FEATURE_TEST_BOOL = 'false';
      expect(isFeatureEnabled('TEST_BOOL')).toBe(false);
    });

    it('returns false when FEATURE_* = "0"', () => {
      process.env.FEATURE_TEST_BOOL = '0';
      expect(isFeatureEnabled('TEST_BOOL')).toBe(false);
    });

    it('is case-insensitive', () => {
      process.env.FEATURE_TEST_BOOL = 'true';
      expect(isFeatureEnabled('test_bool')).toBe(true);
      expect(isFeatureEnabled('Test_Bool')).toBe(true);
    });
  });

  describe('getFeatureConfig', () => {
    it('returns default for unset flags', () => {
      expect(getFeatureConfig('NONEXISTENT', 'default-val')).toBe('default-val');
    });

    it('returns string value for set flags', () => {
      process.env.FEATURE_TEST_STRING = 'custom-value';
      expect(getFeatureConfig('TEST_STRING', 'default')).toBe('custom-value');
    });

    it('returns "true" for boolean true flags', () => {
      process.env.FEATURE_TEST_BOOL = 'true';
      expect(getFeatureConfig('TEST_BOOL', 'default')).toBe('true');
    });

    it('returns default for boolean false flags', () => {
      process.env.FEATURE_TEST_BOOL = 'false';
      expect(getFeatureConfig('TEST_BOOL', 'default')).toBe('default');
    });
  });

  describe('getFeatureNumber', () => {
    it('returns default for unset flags', () => {
      expect(getFeatureNumber('NONEXISTENT', 42)).toBe(42);
    });

    it('returns parsed number for set flags', () => {
      process.env.FEATURE_TEST_NUMBER = '1000';
      expect(getFeatureNumber('TEST_NUMBER', 100)).toBe(1000);
    });

    it('returns default for invalid numbers', () => {
      process.env.FEATURE_TEST_NUMBER = 'not-a-number';
      expect(getFeatureNumber('TEST_NUMBER', 50)).toBe(50);
    });
  });

  describe('getAllFeatureFlags', () => {
    it('returns empty object when no flags set', () => {
      const flags = getAllFeatureFlags();
      // May contain flags from other tests, but TEST_ flags should not be present
      expect(flags.TEST_BOOL).toBeUndefined();
    });

    it('returns all set flags', () => {
      process.env.FEATURE_TEST_BOOL = 'true';
      process.env.FEATURE_TEST_STRING = 'value';
      resetFeatureFlags();
      const flags = getAllFeatureFlags();
      expect(flags.TEST_BOOL).toBe(true);
      expect(flags.TEST_STRING).toBe('value');
    });
  });

  describe('caching', () => {
    it('caches flags on first read', () => {
      process.env.FEATURE_TEST_BOOL = 'true';
      expect(isFeatureEnabled('TEST_BOOL')).toBe(true);

      // Change env after cache is built
      process.env.FEATURE_TEST_BOOL = 'false';
      // Should still return cached value
      expect(isFeatureEnabled('TEST_BOOL')).toBe(true);

      // After reset, should pick up new value
      resetFeatureFlags();
      expect(isFeatureEnabled('TEST_BOOL')).toBe(false);
    });
  });
});
