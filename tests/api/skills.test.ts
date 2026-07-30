import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import type { CustomSkill } from '@/lib/agent/tools/custom-skill';

const mocks = vi.hoisted(() => ({
  listCustomSkills: vi.fn(),
  createCustomSkill: vi.fn(),
  readCustomSkill: vi.fn(),
  updateCustomSkill: vi.fn(),
  deleteCustomSkill: vi.fn(),
  isValidCustomSkillId: vi.fn(),
}));

vi.mock('@/lib/server/skill-storage', () => ({
  listCustomSkills: mocks.listCustomSkills,
  createCustomSkill: mocks.createCustomSkill,
  readCustomSkill: mocks.readCustomSkill,
  updateCustomSkill: mocks.updateCustomSkill,
  deleteCustomSkill: mocks.deleteCustomSkill,
  isValidCustomSkillId: mocks.isValidCustomSkillId,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  }),
  runWithRequestId: (_id: string, fn: () => Promise<unknown>) => fn(),
}));

function validSkillPayload(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'my_skill',
    displayName: 'My Skill',
    category: 'custom',
    summary: 'A test skill.',
    description: 'Used to test the route.',
    promptTemplate: 'Summarize: {{text}}',
    parameters: [{ name: 'text', type: 'string', description: 'input', required: true }],
    enabled: true,
    ...overrides,
  };
}

function asNextRequest(url: string, init?: RequestInit): NextRequest {
  return new Request(url, init) as unknown as NextRequest;
}

describe('GET /api/skills', () => {
  beforeEach(() => {
    mocks.listCustomSkills.mockReset();
  });

  it('returns built-in + custom skills with source tags', async () => {
    mocks.listCustomSkills.mockResolvedValue([
      {
        id: 'my_skill',
        displayName: 'My Skill',
        category: 'custom',
        summary: 'A test skill.',
        description: 'desc',
        promptTemplate: 'pt',
        parameters: [],
        enabled: true,
        version: '1.0.0',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      } satisfies CustomSkill,
    ]);
    const { GET } = await import('@/app/api/skills/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.skills.length).toBeGreaterThan(0);
    const sources = new Set(json.skills.map((s: { source: string }) => s.source));
    expect(sources.has('builtin')).toBe(true);
    expect(sources.has('custom')).toBe(true);
    expect(json.total).toBe(json.skills.length);
    expect(typeof json.enabledCount).toBe('number');
  });

  it('returns 500 when the store throws', async () => {
    mocks.listCustomSkills.mockRejectedValue(new Error('disk full'));
    const { GET } = await import('@/app/api/skills/route');
    const res = await GET();
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.success).toBe(false);
  });
});

describe('POST /api/skills', () => {
  beforeEach(() => {
    mocks.createCustomSkill.mockReset();
    mocks.isValidCustomSkillId.mockReset();
    mocks.isValidCustomSkillId.mockReturnValue(true);
  });

  it('creates a valid skill and returns 201', async () => {
    mocks.createCustomSkill.mockImplementation(async (skill: CustomSkill) => skill);
    const { POST } = await import('@/app/api/skills/route');
    const res = await POST(
      asNextRequest('http://localhost/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validSkillPayload()),
      }),
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.skill.id).toBe('my_skill');
    expect(mocks.createCustomSkill).toHaveBeenCalledTimes(1);
  });

  it('rejects an invalid id with 400', async () => {
    const { POST } = await import('@/app/api/skills/route');
    const res = await POST(
      asNextRequest('http://localhost/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validSkillPayload({ id: 'BadID' })),
      }),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.errorCode).toBe('INVALID_REQUEST');
    expect(mocks.createCustomSkill).not.toHaveBeenCalled();
  });

  it('rejects an empty displayName with 400', async () => {
    const { POST } = await import('@/app/api/skills/route');
    const res = await POST(
      asNextRequest('http://localhost/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validSkillPayload({ displayName: '' })),
      }),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.errorCode).toBe('INVALID_REQUEST');
    expect(mocks.createCustomSkill).not.toHaveBeenCalled();
  });

  it('returns 409 when the skill already exists', async () => {
    mocks.createCustomSkill.mockRejectedValue(new Error('Custom skill "my_skill" already exists'));
    const { POST } = await import('@/app/api/skills/route');
    const res = await POST(
      asNextRequest('http://localhost/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validSkillPayload()),
      }),
    );
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.errorCode).toBe('INVALID_REQUEST');
  });
});
