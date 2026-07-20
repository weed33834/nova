#!/usr/bin/env node
/**
 * Nova MCP Server —— stdio CLI 入口（Phase E3）。
 *
 * 供 Claude Desktop 等 stdio 客户端接入 Nova 的 MCP 能力。配合 Claude
 * Desktop 的 `claude_desktop_config.json` 使用：
 *
 * ```json
 * {
 *   "mcpServers": {
 *     "nova": {
 *       "command": "node",
 *       "args": ["/abs/path/to/nova/scripts/mcp-server.ts"],
 *       "env": { "TSX": "1" }
 *     }
 *   }
 * }
 * ```
 *
 * 或用 tsx 直接跑（避免预编译）：
 *
 * ```json
 * {
 *   "mcpServers": {
 *     "nova": {
 *       "command": "npx",
 *       "args": ["tsx", "/abs/path/to/nova/scripts/mcp-server.ts"]
 *     }
 *   }
 * }
 * ```
 *
 * 暴露面与 HTTP 入口完全一致（同一个 createNovaMcpServer 工厂），区别仅在
 * 传输：stdio 走 stdin/stdout，无会话状态（MCP stdio 是单会话模型）。
 *
 * 注意：
 *   - stdio 模式下不要往 stdout 打任何调试日志（会污染 JSON-RPC 流），所有
 *     日志走 stderr。
 *   - 进程退出时关闭 transport，让客户端能感知断开。
 *   - 此脚本只在能 spawn 长期子进程的环境跑（standalone / 本地），
 *     Vercel 不会用到。
 */

// 必须先加载 .env.local，让 prompt loader 的 process.cwd() 指向项目根，
// 且复用项目的环境变量（如有外部解析器配置）。
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createNovaMcpServer } from '../lib/mcp/server/nova-server';
import { createLogger } from '../lib/logger';

// 内联 .env.local 加载（与 tests/setup-env.ts 同思路，避免新增 dotenv 依赖）。
function loadEnvLocal(): void {
  const envPath = resolve(process.cwd(), '.env.local');
  try {
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx < 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // .env.local 不存在则跳过 —— Claude Desktop 也能用环境变量直接注入。
  }
}
loadEnvLocal();

// stdio 模式下所有日志走 stderr，stdout 专属 JSON-RPC。
const log = createLogger('NovaMCPStdio');

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  const server = createNovaMcpServer();

  // 优雅退出：收到 SIGINT/SIGTERM 时关闭 transport，让客户端感知断开。
  const shutdown = async (signal: string) => {
    log.info(`Received ${signal}, shutting down Nova MCP stdio server...`);
    try {
      await transport.close();
    } catch (e) {
      log.error(`Error closing transport: ${e}`);
    }
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await server.connect(transport);
  // eslint-disable-next-line no-console
  console.error('[nova-mcp] stdio server ready on stdin/stdout');
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('[nova-mcp] fatal:', error);
  process.exit(1);
});
