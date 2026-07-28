import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  readCustomSkill: vi.fn(),
  createCustomSkill: vi.fn(),
  updateCustomSkill: vi.fn(),
  isValidCustomSkillId: vi.fn(),
}));

vi.mock('@/lib/server/skill-storage', () => ({
  readCustomSkill: mocks.readCustomSkill,
  createCustomSkill: mocks.createCustomSkill,
  updateCustomSkill: mocks.updateCustomSkill,
  isValidCustomSkillId: mocks.isValidCustomSkillId,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

function asNextRequest(init: RequestInit): NextRequest {
  return new Request('http://localhost/api/skills/import', init) as unknown as NextRequest;
}

function skillJson(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    displayName: id,
    category: 'custom',
    summary: 's',
    description: 'd',
    promptTemplate: 'pt',
    parameters: [],
    enabled: true,
    ...overrides,
  };
}

describe('POST /api/skills/import', () => {
  beforeEach(() => {
    mocks.readCustomSkill.mockReset();
    mocks.createCustomSkill.mockReset();
    mocks.updateCustomSkill.mockReset();
    mocks.isValidCustomSkillId.mockReset();
    mocks.isValidCustomSkillId.mockImplementation((id: string) => /^[a-z0-9_-]+$/.test(id));
  });

  it('rejects a payload without `skills`', async () => {
    const { POST } = await import('@/app/api/skills/import/route');
    const res = await POST(
      asNextRequest({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.errorCode).toBe('INVALID_REQUEST');
  });

  it('creates new skills from an array', async () => {
    mocks.readCustomSkill.mockResolvedValue(null);
    mocks.createCustomSkill.mockImplementation(async (s: { id: string }) => s);
    const { POST } = await import('@/app/api/skills/import/route');
    const res = await POST(
      asNextRequest({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skills: [skillJson('a'), skillJson('b')] }),
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.created).toEqual(['a', 'b']);
    expect(json.updated).toEqual([]);
    expect(json.skipped).toEqual([]);
  });

  it('accepts a single skill object', async () => {
    mocks.readCustomSkill.mockResolvedValue(null);
    mocks.createCustomSkill.mockImplementation(async (s: { id: string }) => s);
    const { POST } = await import('@/app/api/skills/import/route');
    const res = await POST(
      asNextRequest({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skills: skillJson('solo') }),
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.created).toEqual(['solo']);
  });

  it('skips existing skills when overwrite is false', async () => {
    mocks.readCustomSkill.mockResolvedValue(skillJson('dup'));
    const { POST } = await import('@/app/api/skills/import/route');
    const res = await POST(
      asNextRequest({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skills: [skillJson('dup')] }),
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.created).toEqual([]);
    expect(json.updated).toEqual([]);
    expect(json.skipped).toHaveLength(1);
    expect(json.skipped[0].id).toBe('dup');
  });

  it('overwrites existing skills when overwrite is true', async () => {
    const existing = skillJson('dup', { createdAt: '2024-01-01T00:00:00.000Z' });
    mocks.readCustomSkill.mockResolvedValue(existing);
    mocks.updateCustomSkill.mockImplementation(async (s: { id: string }) => s);
    const { POST } = await import('@/app/api/skills/import/route');
    const res = await POST(
      asNextRequest({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skills: [skillJson('dup')], overwrite: true }),
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.updated).toEqual(['dup']);
    expect(mocks.updateCustomSkill).toHaveBeenCalledTimes(1);
    // Preserves original createdAt.
    const arg = mocks.updateCustomSkill.mock.calls[0][0];
    expect(arg.createdAt).toBe('2024-01-01T00:00:00.000Z');
  });

  it('skips skills with invalid ids', async () => {
    mocks.isValidCustomSkillId.mockReturnValue(false);
    const { POST } = await import('@/app/api/skills/import/route');
    const res = await POST(
      asNextRequest({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skills: [skillJson('BadID')] }),
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.skipped).toHaveLength(1);
    expect(json.skipped[0].reason).toContain('invalid id');
  });

  it('skips skills that fail validation', async () => {
    const { POST } = await import('@/app/api/skills/import/route');
    const res = await POST(
      asNextRequest({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skills: [skillJson('valid_id', { displayName: '' })],
        }),
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.skipped).toHaveLength(1);
    expect(json.skipped[0].reason).toContain('displayName');
  });
});
