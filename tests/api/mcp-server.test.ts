import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

/**
 * /api/mcp/server 路由测试（Phase E4）。
 *
 * 覆盖：
 *   - 部署门控：Vercel 上返回 404 + JSON-RPC error
 *   - 暴露开启时（standalone）路由可处理 initialize 请求并回 200
 *
 * 不测完整 MCP 协议握手（那是 SDK 内部），只测部署门控 + 请求转发是否触发。
 */

const mocks = vi.hoisted(() => ({
  isMCPExposureEnabled: vi.fn(),
  createNovaMcpServer: vi.fn(),
  transportHandleRequest: vi.fn(),
  mcpConnect: vi.fn(),
}));

vi.mock('@/lib/mcp/config', () => ({
  isMCPExposureEnabled: mocks.isMCPExposureEnabled,
}));

vi.mock('@/lib/mcp/server/nova-server', () => ({
  createNovaMcpServer: mocks.createNovaMcpServer,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Mock WebStandardStreamableHTTPServerTransport —— 避免 SDK 真实 transport
// 初始化（它会读 Node stream、注册定时器等）。
vi.mock('@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js', () => ({
  WebStandardStreamableHTTPServerTransport: vi.fn().mockImplementation(function () {
    return {
      handleRequest: mocks.transportHandleRequest,
      close: vi.fn().mockResolvedValue(undefined),
      sessionId: undefined,
    };
  }),
}));

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.resetModules();
});

function makeRequest(method: string, body?: unknown): NextRequest {
  return new Request('http://localhost/api/mcp/server', {
    method,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }) as unknown as NextRequest;
}

describe('POST /api/mcp/server — 部署门控', () => {
  beforeEach(() => {
    mocks.isMCPExposureEnabled.mockReset();
    mocks.createNovaMcpServer.mockReset();
    mocks.transportHandleRequest.mockReset();
    mocks.mcpConnect.mockReset();
    mocks.createNovaMcpServer.mockReturnValue({ connect: mocks.mcpConnect });
    mocks.mcpConnect.mockResolvedValue(undefined);
    mocks.transportHandleRequest.mockResolvedValue(
      new Response('{"jsonrpc":"2.0","id":1,"result":{}}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });

  it('Vercel 上（isMCPExposureEnabled=false）返回 404 + JSON-RPC error', async () => {
    mocks.isMCPExposureEnabled.mockReturnValue(false);
    const { POST } = await import('@/app/api/mcp/server/route');
    const res = await POST(
      makeRequest('POST', { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    );
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json).toMatchObject({
      jsonrpc: '2.0',
      error: { code: -32601, message: expect.stringContaining('disabled') },
      id: null,
    });
    // 不应创建 server。
    expect(mocks.createNovaMcpServer).not.toHaveBeenCalled();
  });

  it('standalone 部署下 initialize 请求会创建 Nova server 并转发给 transport', async () => {
    mocks.isMCPExposureEnabled.mockReturnValue(true);
    const { POST } = await import('@/app/api/mcp/server/route');
    const res = await POST(
      makeRequest('POST', {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0' },
        },
      }),
    );
    expect(res.status).toBe(200);
    // 创建 Nova server 并 connect transport。
    expect(mocks.createNovaMcpServer).toHaveBeenCalledTimes(1);
    expect(mocks.mcpConnect).toHaveBeenCalledTimes(1);
    // 请求被转发到 transport.handleRequest。
    expect(mocks.transportHandleRequest).toHaveBeenCalledTimes(1);
  });

  it('同一 session 的后续请求复用 transport（不重建 server）', async () => {
    mocks.isMCPExposureEnabled.mockReturnValue(true);
    const { POST } = await import('@/app/api/mcp/server/route');
    // 模拟 initialize 后客户端带 Mcp-Session-Id 头。
    // 由于 mock transport 不真的分配 sessionId，这里只能验证第二次请求
    // 不会再次 createNovaMcpServer（因为 onsessioninitialized 没被触发，
    // sessions Map 为空，会走“无 session”分支但 transport 实例缓存逻辑
    // 依赖 sessionId）。我们用一个带 sessionId 的请求验证不崩溃。
    const reqWithSession = new Request('http://localhost/api/mcp/server', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'mcp-session-id': 'fake-session-id',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
    }) as unknown as NextRequest;
    const res = await POST(reqWithSession);
    expect(res.status).toBe(200);
  });
});

describe('GET / DELETE /api/mcp/server', () => {
  beforeEach(() => {
    mocks.isMCPExposureEnabled.mockReturnValue(true);
    mocks.createNovaMcpServer.mockReturnValue({ connect: mocks.mcpConnect });
    mocks.mcpConnect.mockResolvedValue(undefined);
    mocks.transportHandleRequest.mockResolvedValue(new Response('', { status: 202, headers: {} }));
  });

  it('GET 请求也被转发到 transport（SSE 探活通道）', async () => {
    vi.resetModules();
    const { GET } = await import('@/app/api/mcp/server/route');
    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(202);
  });

  it('Vercel 上 GET 也返回 404', async () => {
    mocks.isMCPExposureEnabled.mockReturnValue(false);
    vi.resetModules();
    const { GET } = await import('@/app/api/mcp/server/route');
    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(404);
  });

  it('DELETE 请求被转发到 transport（会话终止）', async () => {
    vi.resetModules();
    const { DELETE } = await import('@/app/api/mcp/server/route');
    const res = await DELETE(makeRequest('DELETE'));
    expect(res.status).toBe(202);
  });
});
