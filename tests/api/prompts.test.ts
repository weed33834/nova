import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getPromptRegistry: vi.fn(),
  loadPrompt: vi.fn(),
}));

vi.mock('@/lib/prompts', () => ({
  getPromptRegistry: mocks.getPromptRegistry,
  loadPrompt: mocks.loadPrompt,
}));

vi.mock('@/lib/logger', () => {
  const stubLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => stubLogger),
    raw: vi.fn(),
  };
  return {
    createLogger: vi.fn(() => stubLogger),
    runWithRequestId: vi.fn((_id: string, fn: () => unknown) => fn()),
    getRequestId: vi.fn(() => undefined),
  };
});

function asNextRequest(url: string): NextRequest {
  return new Request(url) as unknown as NextRequest;
}

describe('GET /api/prompts', () => {
  beforeEach(() => {
    mocks.getPromptRegistry.mockReset();
  });

  it('returns the full prompt registry', async () => {
    mocks.getPromptRegistry.mockReturnValue([
      {
        id: 'slide-content',
        source: 'main',
        displayName: 'Slide Content',
        version: '1.0.0',
        deprecated: false,
        hasUserTemplate: true,
        path: 'lib/prompts/templates/slide-content',
      },
      {
        id: 'pbl-design',
        source: 'pbl-v2',
        displayName: 'PBL Design',
        version: '1.0.0',
        deprecated: false,
        hasUserTemplate: false,
        path: 'lib/pbl/v2/prompts/pbl-design.md',
      },
    ]);
    const { GET } = await import('@/app/api/prompts/route');
    const res = await GET(asNextRequest('http://localhost/api/prompts'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.prompts).toHaveLength(2);
    expect(json.total).toBe(2);
    expect(json.prompts[0].id).toBe('slide-content');
    expect(json.prompts[1].source).toBe('pbl-v2');
  });

  it('returns 500 when the registry throws', async () => {
    mocks.getPromptRegistry.mockImplementation(() => {
      throw new Error('fs read failed');
    });
    const { GET } = await import('@/app/api/prompts/route');
    const res = await GET(asNextRequest('http://localhost/api/prompts'));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.success).toBe(false);
  });
});

describe('GET /api/prompts/[id]', () => {
  beforeEach(() => {
    mocks.loadPrompt.mockReset();
  });

  it('returns the rendered prompt detail', async () => {
    mocks.loadPrompt.mockReturnValue({
      id: 'slide-content',
      systemPrompt: 'You are a slide generator.',
      userPromptTemplate: 'Generate content for: {{topic}}',
      version: '1.0.0',
      deprecated: false,
      config: { tags: ['slide'] },
    });
    const { GET } = await import('@/app/api/prompts/[id]/route');
    const res = await GET(asNextRequest('http://localhost/api/prompts/slide-content'), {
      params: Promise.resolve({ id: 'slide-content' }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.prompt.id).toBe('slide-content');
    expect(json.prompt.systemPrompt).toContain('slide generator');
    expect(json.prompt.userPromptTemplate).toContain('{{topic}}');
  });

  it('returns 404 for an unknown prompt id', async () => {
    mocks.loadPrompt.mockReturnValue(null);
    const { GET } = await import('@/app/api/prompts/[id]/route');
    const res = await GET(asNextRequest('http://localhost/api/prompts/nope'), {
      params: Promise.resolve({ id: 'nope' }),
    });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.errorCode).toBe('INVALID_REQUEST');
  });

  it('returns 500 when loadPrompt throws', async () => {
    mocks.loadPrompt.mockImplementation(() => {
      throw new Error('snippet not found');
    });
    const { GET } = await import('@/app/api/prompts/[id]/route');
    const res = await GET(asNextRequest('http://localhost/api/prompts/broken'), {
      params: Promise.resolve({ id: 'broken' }),
    });
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.success).toBe(false);
  });
});
