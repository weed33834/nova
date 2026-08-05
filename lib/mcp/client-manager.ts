/**
 * MCP Client Manager (Phase D — consumer side).
 *
 * Owns the lifecycle of outbound MCP connections: one `Client` per configured
 * server (stdio child process or Streamable HTTP). Discovers tools via
 * `listTools()` and exposes them to the pi-agent adapter.
 *
 * Server-side only — `StdioClientTransport` spawns child processes and is not
 * browser-safe. Instantiated as a process-wide singleton (via `globalThis`) so
 * connections survive across requests in standalone Next.js and are not
 * orphaned by dev hot-reloads.
 */

// MCP SDK 为可选依赖：仅 type import + 运行时动态加载
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { MCPServersConfig, MCPServerConfig, MCPDiscoveredTool } from './config';
import { createLogger } from '@/lib/logger';

const log = createLogger('MCPClientManager');

interface ManagedServer {
  config: MCPServerConfig;
  /** Present only when the connection succeeded. */
  client?: Client;
  tools: MCPDiscoveredTool[];
  status: 'connected' | 'error';
  errorMessage?: string;
  connectedAt?: number;
}

/**
 * Manages all outbound MCP server connections for the running process.
 *
 * `connectAll` is idempotent: it disconnects servers that were removed or
 * disabled, and (re)connects enabled ones. Calling it on every request is safe
 * but cheap-ish (it short-circuits already-connected servers); callers that
 * know the config is stable may skip repeated calls.
 */
export class MCPClientManager {
  private servers = new Map<string, ManagedServer>();
  /**
   * Per-request AbortSignal. When set, all in-flight MCP tool calls
   * receive this signal so they can be cancelled when the user aborts
   * the agent turn. Set by the agent route before invoking the agent,
   * cleared after the turn completes.
   */
  private currentAbortSignal: AbortSignal | null = null;

  /** Set the AbortSignal for the current agent turn (enables MCP tool cancellation). */
  setAbortSignal(signal: AbortSignal | null): void {
    this.currentAbortSignal = signal;
  }

  /** Get the current AbortSignal (or undefined if none is set). */
  getAbortSignal(): AbortSignal | null {
    return this.currentAbortSignal;
  }

  /** Connect (or reconnect) every enabled server; drop disabled/removed ones. */
  async connectAll(config: MCPServersConfig): Promise<void> {
    const enabledIds = new Set(
      Object.values(config)
        .filter((c) => c.enabled)
        .map((c) => c.id),
    );

    // Tear down servers that are no longer enabled or were removed from config.
    for (const id of [...this.servers.keys()]) {
      if (!enabledIds.has(id)) {
        await this.disconnect(id);
      }
    }

    // (Re)connect enabled servers. A connection failure is non-fatal — the
    // server is recorded as `error` and its tools are simply unavailable, so
    // one broken MCP server cannot take down the editor agent.
    await Promise.all(
      Object.values(config)
        .filter((c) => c.enabled)
        .map((c) => this.connectOne(c)),
    );
  }

  private async connectOne(config: MCPServerConfig): Promise<void> {
    // Already connected with the same transport params? Skip the round-trip.
    const existing = this.servers.get(config.id);
    if (
      existing?.status === 'connected' &&
      existing.client &&
      this.configUnchanged(existing.config, config)
    ) {
      return;
    }
    // Drop any stale connection for this id before reconnecting.
    await this.disconnect(config.id);

    try {
      // MCP SDK 为可选依赖：运行时动态加载，未安装时连接失败并给出明确指引
      let ClientCtor: typeof import('@modelcontextprotocol/sdk/client/index.js')['Client'];
      try {
        ({ Client: ClientCtor } = await import('@modelcontextprotocol/sdk/client/index.js'));
      } catch {
        throw new Error(
          'MCP 接入需要可选依赖 @modelcontextprotocol/sdk，请执行 pnpm add @modelcontextprotocol/sdk 后重试。',
        );
      }
      const transport = await this.buildTransport(config);
      const client = new ClientCtor({ name: 'nova-agent', version: '1.0.0' }, { capabilities: {} });
      await client.connect(transport);
      const result = await client.listTools();
      const tools: MCPDiscoveredTool[] = (result.tools ?? []).map((t) => ({
        serverId: config.id,
        name: t.name,
        description: t.description ?? '',
        inputSchema: (t.inputSchema ?? { type: 'object', properties: {} }) as Record<
          string,
          unknown
        >,
      }));
      this.servers.set(config.id, {
        config,
        client,
        tools,
        status: 'connected',
        connectedAt: Date.now(),
      });
      log.info(
        `connected MCP server "${config.name}" (${config.id}, ${config.transport}): ${tools.length} tool(s)`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.servers.set(config.id, {
        config,
        tools: [],
        status: 'error',
        errorMessage: message,
      });
      log.error(`failed to connect MCP server "${config.name}" (${config.id}): ${message}`);
    }
  }

  private async buildTransport(config: MCPServerConfig): Promise<Transport> {
    // 动态加载 transport 类（MCP SDK 为可选依赖）
    let stdioCtor: typeof import('@modelcontextprotocol/sdk/client/stdio.js')['StdioClientTransport'];
    let httpCtor: typeof import('@modelcontextprotocol/sdk/client/streamableHttp.js')['StreamableHTTPClientTransport'];
    try {
      ({ StdioClientTransport: stdioCtor } = await import('@modelcontextprotocol/sdk/client/stdio.js'));
      ({ StreamableHTTPClientTransport: httpCtor } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js'));
    } catch {
      throw new Error(
        'MCP 接入需要可选依赖 @modelcontextprotocol/sdk，请执行 pnpm add @modelcontextprotocol/sdk 后重试。',
      );
    }
    if (config.transport === 'stdio') {
      if (!config.command) {
        throw new Error('stdio transport requires a "command"');
      }
      return new stdioCtor({
        command: config.command,
        args: config.args,
        env: config.env,
      });
    }
    // http
    if (!config.url) {
      throw new Error('http transport requires a "url"');
    }
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(config.url);
    } catch {
      throw new Error(
        `MCP server "${config.name}" has an invalid URL: "${config.url}". Expected a full URL like https://example.com/mcp.`,
      );
    }
    const headers: Record<string, string> = {};
    if (config.authToken) headers.Authorization = `Bearer ${config.authToken}`;
    return new httpCtor(parsedUrl, {
      requestInit: { headers },
    });
  }

  private configUnchanged(a: MCPServerConfig, b: MCPServerConfig): boolean {
    return (
      a.transport === b.transport &&
      a.command === b.command &&
      a.url === b.url &&
      a.authToken === b.authToken &&
      JSON.stringify(a.args ?? []) === JSON.stringify(b.args ?? []) &&
      JSON.stringify(a.env ?? {}) === JSON.stringify(b.env ?? {})
    );
  }

  /** All tools discovered across connected servers (error servers contribute none). */
  getDiscoveredTools(): MCPDiscoveredTool[] {
    return [...this.servers.values()]
      .filter((s) => s.status === 'connected')
      .flatMap((s) => s.tools);
  }

  /** The connected client for a server (undefined if not connected). */
  getClient(serverId: string): Client | undefined {
    const m = this.servers.get(serverId);
    return m?.status === 'connected' ? m.client : undefined;
  }

  /** Connection status for Settings UI display. */
  getStatus(serverId: string): { status: 'connected' | 'error' | 'unknown'; message?: string } {
    const m = this.servers.get(serverId);
    if (!m) return { status: 'unknown' };
    return { status: m.status, message: m.errorMessage };
  }

  async disconnect(serverId: string): Promise<void> {
    const m = this.servers.get(serverId);
    if (!m) return;
    if (m.client) {
      try {
        await m.client.close();
      } catch {
        // Best-effort close; transport may already be gone.
      }
    }
    this.servers.delete(serverId);
  }

  async disconnectAll(): Promise<void> {
    await Promise.all([...this.servers.keys()].map((id) => this.disconnect(id)));
  }
}

// ─── Process-wide singleton ───────────────────────────────────────────────────
//
// `globalThis` guard: in dev, hot reload re-evaluates this module; without the
// guard each reload would orphan the previously-spawned stdio child processes.
// In standalone Next.js, a single instance survives across requests.

const GLOBAL_KEY = '__NOVA_MCP_CLIENT_MANAGER__';

function getGlobal(): typeof globalThis & Record<string, unknown> {
  return globalThis as typeof globalThis & Record<string, unknown>;
}

export function getMCPClientManager(): MCPClientManager {
  const g = getGlobal();
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = new MCPClientManager();
  }
  return g[GLOBAL_KEY] as MCPClientManager;
}
