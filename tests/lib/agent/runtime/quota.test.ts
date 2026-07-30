import { describe, it, expect, vi } from 'vitest';

// Mock the quota module so we don't need a real database
vi.mock('@/lib/server/quota', () => ({
  recordUsage: vi.fn().mockResolvedValue(undefined),
  checkQuota: vi.fn().mockResolvedValue({ exceeded: false, used: 0, limit: 100, remaining: 100 }),
}));

// Mock the logger to avoid noise in test output
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  }),
}));

import { makeQuotaHook } from '@/lib/agent/runtime/quota';
import { checkQuota } from '@/lib/server/quota';

describe('quota hook', () => {
  it('is a no-op when userId is null (anonymous mode)', async () => {
    const hook = makeQuotaHook({ userId: null });
    const result = await hook({} as never);
    expect(result).toBeUndefined();
  });

  it('does not terminate while quota remains', async () => {
    vi.mocked(checkQuota).mockResolvedValueOnce({
      kind: 'llm',
      exceeded: false,
      used: 50,
      limit: 100,
      remaining: 50,
    });
    const hook = makeQuotaHook({ userId: 'user-1' });
    const result = await hook({} as never);
    expect(result).toBeUndefined();
  });

  it('terminates when quota is exceeded', async () => {
    vi.mocked(checkQuota).mockResolvedValueOnce({
      kind: 'llm',
      exceeded: true,
      used: 100,
      limit: 100,
      remaining: 0,
    });
    const hook = makeQuotaHook({ userId: 'user-1' });
    const result = await hook({} as never);
    expect(result?.terminate).toBe(true);
  });
});
