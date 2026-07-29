import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createLogger, runWithRequestId, getRequestId } from '@/lib/logger';

describe('Structured Logger (pino)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset env between tests
    process.env = { ...originalEnv } as NodeJS.ProcessEnv;
    // Force JSON output for testability
    process.env.LOG_FORMAT = 'json';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('createLogger returns an object with debug/info/warn/error methods', () => {
    const log = createLogger('TestModule');
    expect(typeof log.debug).toBe('function');
    expect(typeof log.info).toBe('function');
    expect(typeof log.warn).toBe('function');
    expect(typeof log.error).toBe('function');
  });

  it('createLogger returns an object with child method', () => {
    const log = createLogger('TestModule');
    const child = log.child({ userId: '123' });
    expect(typeof child.info).toBe('function');
    expect(typeof child.error).toBe('function');
  });

  it('does not throw when logging strings', () => {
    const log = createLogger('TestModule');
    expect(() => log.info('hello world')).not.toThrow();
    expect(() => log.debug('debug message')).not.toThrow();
    expect(() => log.warn('warning')).not.toThrow();
    expect(() => log.error('error')).not.toThrow();
  });

  it('does not throw when logging objects', () => {
    const log = createLogger('TestModule');
    expect(() => log.info('with data', { sceneId: 'abc', type: 'slide' })).not.toThrow();
  });

  it('does not throw when logging errors', () => {
    const log = createLogger('TestModule');
    const err = new Error('test error');
    expect(() => log.error('something failed', err)).not.toThrow();
  });

  it('does not throw with mixed args', () => {
    const log = createLogger('TestModule');
    expect(() => log.info('processing', { id: 1 }, 'extra string', null, undefined)).not.toThrow();
  });

  it('does not throw with empty args', () => {
    const log = createLogger('TestModule');
    expect(() => log.info()).not.toThrow();
  });

  it('child logger produces independent loggers', () => {
    const log = createLogger('Parent');
    const child1 = log.child({ userId: 'user1' });
    const child2 = log.child({ userId: 'user2' });
    expect(child1).not.toBe(child2);
    expect(() => child1.info('msg1')).not.toThrow();
    expect(() => child2.info('msg2')).not.toThrow();
  });

  it('raw() returns the underlying pino logger', () => {
    const log = createLogger('TestModule');
    const raw = log.raw();
    expect(raw).toBeDefined();
    expect(typeof raw.info).toBe('function');
  });
});

describe('Request ID correlation', () => {
  it('getRequestId returns undefined outside a context', () => {
    expect(getRequestId()).toBeUndefined();
  });

  it('getRequestId returns the ID inside runWithRequestId', () => {
    const id = 'test-req-123';
    runWithRequestId(id, () => {
      expect(getRequestId()).toBe(id);
    });
  });

  it('getRequestId returns undefined after exiting the context', () => {
    const id = 'test-req-456';
    runWithRequestId(id, () => {
      expect(getRequestId()).toBe(id);
    });
    expect(getRequestId()).toBeUndefined();
  });

  it('supports nested contexts (inner overrides outer)', () => {
    const outerId = 'outer-req';
    const innerId = 'inner-req';

    runWithRequestId(outerId, () => {
      expect(getRequestId()).toBe(outerId);

      runWithRequestId(innerId, () => {
        expect(getRequestId()).toBe(innerId);
      });

      expect(getRequestId()).toBe(outerId);
    });
  });

  it('logger works correctly within request context without throwing', () => {
    const id = 'correlated-req';
    runWithRequestId(id, () => {
      const log = createLogger('TestModule');
      expect(() => log.info('correlated log')).not.toThrow();
      expect(getRequestId()).toBe(id);
    });
  });
});
