/**
 * Nova MCP Server —— Streamable HTTP 传输入口（Phase E3）。
 *
 * 路由：`/api/mcp/server`，接受 GET / POST / DELETE。
 *
 * 实现要点：
 *   - 使用 `WebStandardStreamableHTTPServerTransport`（web-standard Request/Response），
 *     与 Next.js Route Handler 的 `Request`/`Response` 契约一致。
 *   - 有状态模式：每个 sessionId 一个 transport + 一个 Nova MCP server 实例，
 *     缓存在模块级 Map 里。MCP 协议要求 initialize 后续请求带同一 sessionId。
 *   - 部署门控：`isMCPExposureEnabled()` 在 Vercel 上返回 false（Streamable
 *     HTTP 需要长连会话状态，Vercel serverless 冷启动会丢会话）。
 *   - 单实例 transport：每个会话对应一个 transport 对象，handleRequest 时
 *     复用，避免每请求新建 server 带来的工具/资源重注册开销。
 *
 * 测试方式（standalone 部署）：
 *   curl -X POST http://localhost:3000/api/mcp/server \
 *     -H 'Content-Type: application/json' \
 *     -H 'Accept: application/json, text/event-stream' \
 *     -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
 */
import type { NextRequest } from 'next/server';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { isMCPExposureEnabled } from '@/lib/mcp/config';
import { createNovaMcpServer } from '@/lib/mcp/server/nova-server';
import { createLogger } from '@/lib/logger';

const log = createLogger('NovaMCPServer');

// ─── 会话级 transport 缓存 ──────────────────────────────────────────────────
// 每个 sessionId 对应一个 transport + Nova server 实例。MCP 客户端 initialize
// 后会拿到 sessionId，后续请求必须带 Mcp-Session-Id 头。会话级缓存让工具/
// 资源/提示词只注册一次，避免每请求重建。
interface SessionState {
  transport: WebStandardStreamableHTTPServerTransport;
}

const sessions = new Map<string, SessionState>();

// 无操作时定期清理空闲会话，避免内存无限增长。Node 的 setInterval 在
// standalone 部署下安全；Vercel 已被 isMCPExposureEnabled() 挡掉。
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 分钟空闲即驱逐
const lastActivity = new Map<string, number>();

function touchSession(sessionId: string): void {
  lastActivity.set(sessionId, Date.now());
}

function sweepIdleSessions(): void {
  const now = Date.now();
  for (const [id, ts] of lastActivity) {
    if (now - ts > SESSION_TTL_MS) {
      void closeSession(id);
    }
  }
}

async function closeSession(sessionId: string): Promise<void> {
  const state = sessions.get(sessionId);
  if (state) {
    try {
      await state.transport.close();
    } catch (e) {
      log.warn(`Error closing session ${sessionId}: ${e}`);
    }
    sessions.delete(sessionId);
  }
  lastActivity.delete(sessionId);
}

// standalone 进程级别周期清理。只在非 Vercel 环境启动。
let sweeperStarted = false;
function ensureSweeperStarted(): void {
  if (sweeperStarted) return;
  sweeperStarted = true;
  setInterval(sweepIdleSessions, 5 * 60 * 1000).unref?.();
}

// ─── 路由处理 ────────────────────────────────────────────────────────────────

async function handleMcpRequest(req: NextRequest): Promise<Response> {
  // 1. 部署门控：Vercel 上直接 404，避免暴露不可用的端点。
  if (!isMCPExposureEnabled()) {
    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32601, message: 'MCP exposure is disabled on this deployment.' },
        id: null,
      }),
      { status: 404, headers: { 'Content-Type': 'application/json' } },
    );
  }
  ensureSweeperStarted();

  // 2. 识别会话：initialize 请求没 sessionId，后续请求带 Mcp-Session-Id 头。
  const sessionId = req.headers.get('mcp-session-id') ?? undefined;

  // 3. 复用或创建会话级 transport。
  let state: SessionState;
  if (sessionId && sessions.has(sessionId)) {
    state = sessions.get(sessionId)!;
    touchSession(sessionId);
  } else {
    // 新会话：构造 stateful transport（sessionIdGenerator 让 server 分配 id）。
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      onsessioninitialized: (newId) => {
        sessions.set(newId, { transport });
        touchSession(newId);
        log.info(`MCP session initialized: ${newId}`);
      },
      onsessionclosed: (closedId) => {
        void closeSession(closedId);
        log.info(`MCP session closed: ${closedId}`);
      },
    });
    // 创建 Nova MCP server 并挂到 transport —— 工具/资源/提示词注册在工厂里完成。
    const mcpServer = createNovaMcpServer();
    await mcpServer.connect(transport);
    // onsessioninitialized 会把 state 写进 sessions；但 transport 自身已绑定
    // 到 server，handleRequest 时 transport.sessionId 才是 server 分配的值。
    state = { transport };
    // 若 initialize 之前就来了请求（如 GET 探活），临时挂到匿名 state 让
    // handleRequest 能跑；initialize 完成后会被 onsessioninitialized 覆盖。
    if (!sessionId) {
      // 标记为“待初始化”——用 transport 对象自身做 key 暂存，由
      // onsessioninitialized 回填正式 sessionId。
    }
  }

  // 4. 把 NextRequest 透传给 transport —— SDK 的 WebStandard 变体原生吃
  //    标准 Request。NextRequest 是 Request 的子类，可直接转。
  //    注意：Next 的 Request body 只能读一次，SDK 内部会 req.json()，我们
  //    不能预读 body。直接传 req 即可。
  try {
    const response = await state.transport.handleRequest(req as unknown as Request);
    return new Response(response.body, {
      status: response.status,
      headers: response.headers,
    });
  } catch (error) {
    log.error(`MCP request failed: ${error}`);
    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : 'Internal error',
        },
        id: null,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
}

// ─── Next.js Route Handler 导出 ───────────────────────────────────────────────
// MCP Streamable HTTP 规范要求同时支持 GET / POST / DELETE：
//   - POST：JSON-RPC 请求主通道
//   - GET：SSE 长连接（服务端通知）
//   - DELETE：终止会话
// 标记 dynamic + force-dynamic 避免 Next 静态化。

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest): Promise<Response> {
  return handleMcpRequest(req);
}

export async function GET(req: NextRequest): Promise<Response> {
  return handleMcpRequest(req);
}

export async function DELETE(req: NextRequest): Promise<Response> {
  return handleMcpRequest(req);
}
