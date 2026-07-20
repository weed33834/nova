/**
 * MCP server connection test endpoint (Phase D — consumer side).
 *
 * Receives a single `MCPServerConfig`, attempts to connect (via the
 * process-wide `MCPClientManager`), lists the discovered tools, and returns
 * the count + tool names so the Settings UI can show a test result.
 *
 * stdio transport spawns a child process server-side; HTTP transport opens a
 * Streamable HTTP connection. Either way the connection is reused by the
 * editor agent's next turn (the manager is idempotent and short-circuits
 * unchanged configs), so a successful test here means the next agent turn
 * already has the tools available without reconnecting.
 *
 * A failure is non-fatal: we return 200 with `success: false` and the error
 * message so the UI can surface it without a thrown toast.
 */
import type { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { getMCPClientManager } from '@/lib/mcp/client-manager';
import type { MCPServerConfig } from '@/lib/mcp/config';
import { createLogger } from '@/lib/logger';
import { validateUrlForSSRF } from '@/lib/server/ssrf-guard';

const log = createLogger('MCPTest');

interface TestBody {
  server: MCPServerConfig;
}

export async function POST(req: NextRequest) {
  let body: TestBody;
  try {
    body = (await req.json()) as TestBody;
  } catch {
    return apiError('INVALID_REQUEST', 400, 'Invalid JSON body');
  }

  const server = body.server;
  if (!server || typeof server.id !== 'string' || !server.id) {
    return apiError('MISSING_REQUIRED_FIELD', 400, 'server config is required');
  }
  if (server.transport !== 'stdio' && server.transport !== 'http') {
    return apiError('INVALID_REQUEST', 400, 'transport must be "stdio" or "http"');
  }
  if (server.transport === 'stdio') {
    return apiError('INVALID_REQUEST', 400, 'stdio MCP servers cannot be tested through HTTP');
  }
  if (typeof server.url !== 'string' || !server.url) {
    return apiError('MISSING_REQUIRED_FIELD', 400, 'HTTP MCP server URL is required');
  }
  const ssrfError = await validateUrlForSSRF(server.url);
  if (ssrfError) {
    return apiError('INVALID_REQUEST', 400, ssrfError);
  }

  // Force a fresh connection by disconnecting any prior one for this id, so a
  // re-test after editing fields actually re-evaluates the new config rather
  // than short-circuiting on the previous (cached) connection.
  const manager = getMCPClientManager();
  await manager.disconnect(server.id);

  // Test in isolation: connect only this server, then read its status. We do
  // NOT call `connectAll` with the full config here because the client may
  // not have sent other servers (and we only want to test this one).
  const singleServerConfig = { [server.id]: { ...server, enabled: true } };
  try {
    await manager.connectAll(singleServerConfig);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.warn(`MCP test threw for "${server.name}": ${message}`);
    return apiSuccess({
      success: false,
      connected: false,
      error: message,
      toolCount: 0,
      tools: [] as string[],
    });
  }

  const status = manager.getStatus(server.id);
  if (status.status !== 'connected') {
    return apiSuccess({
      success: false,
      connected: false,
      error: status.message ?? 'Connection failed',
      toolCount: 0,
      tools: [] as string[],
    });
  }

  const discovered = manager.getDiscoveredTools().filter((t) => t.serverId === server.id);
  log.info(
    `MCP test OK for "${server.name}" (${server.id}, ${server.transport}): ${discovered.length} tool(s)`,
  );
  return apiSuccess({
    success: true,
    connected: true,
    toolCount: discovered.length,
    tools: discovered.map((t) => t.name),
  });
}
