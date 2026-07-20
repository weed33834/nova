import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  connectAll: vi.fn(),
  disconnect: vi.fn(),
  getStatus: vi.fn(),
  getDiscoveredTools: vi.fn(),
}));

vi.mock('@/lib/mcp/client-manager', () => ({
  getMCPClientManager: () => ({
    connectAll: mocks.connectAll,
    disconnect: mocks.disconnect,
    getStatus: mocks.getStatus,
    getDiscoveredTools: mocks.getDiscoveredTools,
  }),
}));

// SSRF guard has its own dedicated test suite (tests/server/ssrf-guard.test.ts).
// Mock it here so the route test stays focused on route logic, not DNS resolution
// (mcp.example.com is unreachable in the test environment).
vi.mock('@/lib/server/ssrf-guard', () => ({
  validateUrlForSSRF: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

async function postMcpTest(body: unknown) {
  const { POST } = await import('@/app/api/mcp/test/route');
  const request = new Request('http://localhost/api/mcp/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return POST(request as unknown as NextRequest);
}

const validServer = {
  id: 's1',
  name: 'Test Server',
  enabled: false,
  transport: 'http' as const,
  url: 'https://mcp.example.com/mcp',
};

describe('POST /api/mcp/test', () => {
  beforeEach(() => {
    mocks.connectAll.mockReset();
    mocks.disconnect.mockReset();
    mocks.getStatus.mockReset();
    mocks.getDiscoveredTools.mockReset();
    mocks.disconnect.mockResolvedValue(undefined);
    mocks.connectAll.mockResolvedValue(undefined);
  });

  it('rejects a request without a server config', async () => {
    const res = await postMcpTest({});
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toMatchObject({ success: false, errorCode: 'MISSING_REQUIRED_FIELD' });
  });

  it('rejects an unsupported transport', async () => {
    const res = await postMcpTest({
      server: { id: 's1', name: 'X', enabled: true, transport: 'ws' },
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toMatchObject({ success: false, errorCode: 'INVALID_REQUEST' });
  });

  it('returns success + tool names when the manager reports connected', async () => {
    mocks.getStatus.mockReturnValue({ status: 'connected' });
    mocks.getDiscoveredTools.mockReturnValue([
      { serverId: 's1', name: 'read_file', description: 'd', inputSchema: {} },
      { serverId: 's1', name: 'write_file', description: 'd', inputSchema: {} },
      { serverId: 'other', name: 'other_tool', description: '', inputSchema: {} },
    ]);
    const res = await postMcpTest({ server: validServer });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      success: true,
      connected: true,
      toolCount: 2,
      tools: ['read_file', 'write_file'],
    });
    // The endpoint forces a fresh connection by disconnecting first.
    expect(mocks.disconnect).toHaveBeenCalledWith('s1');
    // connectAll receives the single server with enabled forced on.
    expect(mocks.connectAll).toHaveBeenCalledTimes(1);
    const arg = mocks.connectAll.mock.calls[0][0];
    expect(arg.s1.enabled).toBe(true);
  });

  it('returns success:false + error when the manager reports error', async () => {
    mocks.getStatus.mockReturnValue({ status: 'error', message: 'ECONNREFUSED' });
    mocks.getDiscoveredTools.mockReturnValue([]);
    const res = await postMcpTest({ server: validServer });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      success: false,
      connected: false,
      error: 'ECONNREFUSED',
      toolCount: 0,
      tools: [],
    });
  });

  it('returns success:false when connectAll throws', async () => {
    mocks.connectAll.mockRejectedValue(new Error('transport init failed'));
    const res = await postMcpTest({ server: validServer });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      success: false,
      connected: false,
      error: 'transport init failed',
      toolCount: 0,
    });
  });

  it('returns success:false for a server that was never connected (unknown status)', async () => {
    mocks.getStatus.mockReturnValue({ status: 'unknown' });
    mocks.getDiscoveredTools.mockReturnValue([]);
    const res = await postMcpTest({ server: validServer });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.connected).toBe(false);
  });
});
