import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Mock the MCP SDK so client-manager tests never spawn real processes or open
 * real HTTP connections. Each test configures the mock Client's behaviour.
 */
const mocks = vi.hoisted(() => ({
  ClientCtor: vi.fn(),
  connect: vi.fn(),
  listTools: vi.fn(),
  close: vi.fn(),
  StdioTransport: vi.fn(),
  HttpTransport: vi.fn(),
}));

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: mocks.ClientCtor,
}));
vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: mocks.StdioTransport,
}));
vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: mocks.HttpTransport,
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

/**
 * Reset the singleton + mock state between tests. The client-manager caches
 * itself on `globalThis`, so we must clear that key to get a fresh instance.
 */
function resetSingleton() {
  const g = globalThis as typeof globalThis & Record<string, unknown>;
  delete g['__NOVA_MCP_CLIENT_MANAGER__'];
}

function makeConfig(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    s1: {
      id: 's1',
      name: 'Server One',
      enabled: true,
      transport: 'http' as const,
      url: 'https://example.com/mcp',
      ...overrides,
    },
  };
}

describe('MCPClientManager', () => {
  beforeEach(() => {
    resetSingleton();
    mocks.ClientCtor.mockReset();
    mocks.connect.mockReset();
    mocks.listTools.mockReset();
    mocks.close.mockReset();
    mocks.StdioTransport.mockReset();
    mocks.HttpTransport.mockReset();
    // Default happy path: `new Client()` returns an instance whose methods are
    // the shared spies. vitest 4.x requires a *constructable* implementation
    // for `new` (a plain function, not an arrow, not mockReturnValue).
    mocks.connect.mockResolvedValue(undefined);
    mocks.close.mockResolvedValue(undefined);
    mocks.listTools.mockResolvedValue({
      tools: [{ name: 'tool_a', description: 'A tool', inputSchema: { type: 'object' } }],
    });
    const instance = {
      connect: mocks.connect,
      listTools: mocks.listTools,
      close: mocks.close,
    };
    mocks.ClientCtor.mockImplementation(function () {
      return instance;
    });
  });

  afterEach(() => {
    resetSingleton();
  });

  it('connects enabled servers and discovers their tools', async () => {
    const { MCPClientManager } = await import('@/lib/mcp/client-manager');
    const mgr = new MCPClientManager();
    await mgr.connectAll(makeConfig());
    expect(mocks.connect).toHaveBeenCalledTimes(1);
    expect(mocks.listTools).toHaveBeenCalledTimes(1);
    const tools = mgr.getDiscoveredTools();
    expect(tools).toHaveLength(1);
    expect(tools[0]).toMatchObject({ serverId: 's1', name: 'tool_a' });
    expect(mgr.getStatus('s1').status).toBe('connected');
  });

  it('is idempotent: a second connectAll with the same config does not reconnect', async () => {
    const { MCPClientManager } = await import('@/lib/mcp/client-manager');
    const mgr = new MCPClientManager();
    const cfg = makeConfig();
    await mgr.connectAll(cfg);
    await mgr.connectAll(cfg);
    // connect + listTools each called exactly once — short-circuited.
    expect(mocks.connect).toHaveBeenCalledTimes(1);
    expect(mocks.listTools).toHaveBeenCalledTimes(1);
  });

  it('disconnects servers removed from the config', async () => {
    const { MCPClientManager } = await import('@/lib/mcp/client-manager');
    const mgr = new MCPClientManager();
    await mgr.connectAll(makeConfig());
    expect(mgr.getStatus('s1').status).toBe('connected');
    // Reconnect with an empty config → s1 is dropped.
    await mgr.connectAll({});
    expect(mgr.getStatus('s1').status).toBe('unknown');
    expect(mgr.getDiscoveredTools()).toEqual([]);
    expect(mocks.close).toHaveBeenCalledTimes(1);
  });

  it('disconnects servers that were disabled in the config', async () => {
    const { MCPClientManager } = await import('@/lib/mcp/client-manager');
    const mgr = new MCPClientManager();
    await mgr.connectAll(makeConfig());
    // Now disable s1.
    await mgr.connectAll({ s1: { ...makeConfig().s1, enabled: false } });
    expect(mgr.getStatus('s1').status).toBe('unknown');
    expect(mgr.getDiscoveredTools()).toEqual([]);
  });

  it('records a failing server as error and contributes no tools (non-fatal)', async () => {
    const { MCPClientManager } = await import('@/lib/mcp/client-manager');
    const mgr = new MCPClientManager();
    mocks.connect.mockRejectedValueOnce(new Error('boom: server down'));
    await mgr.connectAll(makeConfig());
    expect(mgr.getStatus('s1').status).toBe('error');
    expect(mgr.getStatus('s1').message).toContain('boom');
    expect(mgr.getDiscoveredTools()).toEqual([]);
  });

  it('one failing server does not block another succeeding', async () => {
    const { MCPClientManager } = await import('@/lib/mcp/client-manager');
    const mgr = new MCPClientManager();
    const goodInstance = {
      connect: vi.fn().mockResolvedValue(undefined),
      listTools: vi
        .fn()
        .mockResolvedValue({ tools: [{ name: 'good_tool', description: '', inputSchema: {} }] }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const badInstance = {
      connect: vi.fn().mockRejectedValue(new Error('nope')),
      listTools: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    };
    // First `new Client()` (s1) → bad; subsequent (s2) → good. Object insertion
    // order is s1 then s2, and connectOne runs synchronously up to `new Client`.
    mocks.ClientCtor.mockReset();
    mocks.ClientCtor.mockImplementationOnce(function () {
      return badInstance;
    }).mockImplementation(function () {
      return goodInstance;
    });
    await mgr.connectAll({
      s1: { id: 's1', name: 'Bad', enabled: true, transport: 'http', url: 'https://x' },
      s2: { id: 's2', name: 'Good', enabled: true, transport: 'http', url: 'https://y' },
    });
    expect(mgr.getStatus('s1').status).toBe('error');
    expect(mgr.getStatus('s2').status).toBe('connected');
    const tools = mgr.getDiscoveredTools();
    expect(tools).toHaveLength(1);
    expect(tools[0].serverId).toBe('s2');
  });

  it('getStatus returns unknown for a server that was never connected', async () => {
    const { MCPClientManager } = await import('@/lib/mcp/client-manager');
    const mgr = new MCPClientManager();
    expect(mgr.getStatus('never').status).toBe('unknown');
  });

  it('reconnects when transport params change', async () => {
    const { MCPClientManager } = await import('@/lib/mcp/client-manager');
    const mgr = new MCPClientManager();
    await mgr.connectAll(makeConfig());
    // Change the URL → must reconnect (not short-circuit).
    await mgr.connectAll({ s1: { ...makeConfig().s1, url: 'https://changed.example/mcp' } });
    expect(mocks.connect).toHaveBeenCalledTimes(2);
    expect(mocks.listTools).toHaveBeenCalledTimes(2);
  });

  it('getClient returns undefined for non-connected servers', async () => {
    const { MCPClientManager } = await import('@/lib/mcp/client-manager');
    const mgr = new MCPClientManager();
    expect(mgr.getClient('s1')).toBeUndefined();
    await mgr.connectAll(makeConfig());
    expect(mgr.getClient('s1')).toBeDefined();
  });
});

describe('getMCPClientManager singleton', () => {
  beforeEach(() => {
    resetSingleton();
  });
  afterEach(() => {
    resetSingleton();
  });

  it('returns the same instance across calls (process-wide)', async () => {
    const { getMCPClientManager } = await import('@/lib/mcp/client-manager');
    const a = getMCPClientManager();
    const b = getMCPClientManager();
    expect(a).toBe(b);
  });
});
