/**
 * MCP (Model Context Protocol) server configuration types.
 *
 * Users configure external MCP servers (stdio command or HTTP URL) in Settings.
 * At runtime, the client-manager instantiates one MCP `Client` per configured
 * server, calls `listTools()`, and adapts discovered tools into the editor
 * agent's toolset (Phase D) and/or PBL planner (Phase D).
 *
 * Phase E exposes Nova's own capabilities as an MCP server (Streamable HTTP
 * for standalone deployments, stdio for CLI clients like Claude Desktop).
 */

/** Transport type for an MCP server connection. */
export type MCPTransport = 'stdio' | 'http';

/** A single configured MCP server entry. */
export interface MCPServerConfig {
  /** Unique ID (nanoid or slug). */
  id: string;
  /** Human-readable label shown in Settings. */
  name: string;
  /** Whether this server is active (tools loaded) or paused. */
  enabled: boolean;
  /** Transport mechanism. */
  transport: MCPTransport;

  // ─── stdio transport ───
  /** Command to launch (e.g. "npx", "node", "python"). */
  command?: string;
  /** Arguments passed to the command. */
  args?: string[];
  /** Environment variables for the child process. */
  env?: Record<string, string>;

  // ─── HTTP transport ───
  /** Full URL of the MCP server's Streamable HTTP endpoint. */
  url?: string;
  /** Bearer token or API key sent as Authorization header. */
  authToken?: string;

  // ─── metadata ───
  /** When this was configured (ISO string). */
  createdAt?: string;
  /** Last connection test result. */
  lastStatus?: 'unknown' | 'connected' | 'error';
  lastStatusMessage?: string;
  lastCheckedAt?: string;
}

/** Map of server ID → config, persisted in settings store. */
export type MCPServersConfig = Record<string, MCPServerConfig>;

/** A tool discovered from an MCP server (after listTools + schema adaptation). */
export interface MCPDiscoveredTool {
  /** The MCP server ID that provides this tool. */
  serverId: string;
  /** Tool name as reported by the MCP server. */
  name: string;
  /** Tool description. */
  description: string;
  /** JSON Schema for the tool's input parameters. */
  inputSchema: Record<string, unknown>;
}

/** Result of connecting to an MCP server and listing its tools. */
export interface MCPConnectionResult {
  serverId: string;
  connected: boolean;
  tools: MCPDiscoveredTool[];
  error?: string;
}

/** Default empty config. */
export const DEFAULT_MCP_SERVERS_CONFIG: MCPServersConfig = {};

/**
 * Whether MCP server exposure (Phase E) is enabled in the current deployment.
 * Streamable HTTP transport requires a long-lived process (session state);
 * Vercel serverless cold-starts break this. Only enable for standalone.
 */
export function isMCPExposureEnabled(): boolean {
  if (process.env.VERCEL) return false;
  return process.env.NEXT_PUBLIC_MCP_EXPOSE !== 'false';
}

/**
 * Whether stdio transport is usable in the current deployment. stdio spawns a
 * long-lived child process, which is impossible under Vercel's stateless
 * serverless model. Vercel auto-injects `NEXT_PUBLIC_VERCEL_ENV` (visible to
 * the client), so this is safe to call from client components as well.
 *
 * Operators can force-disable stdio via `NEXT_PUBLIC_MCP_STDIO_DISABLED=true`.
 */
export function isStdioTransportAvailable(): boolean {
  if (process.env.NEXT_PUBLIC_MCP_STDIO_DISABLED === 'true') return false;
  // Vercel auto-injects NEXT_PUBLIC_VERCEL_ENV as a public env var.
  if (process.env.NEXT_PUBLIC_VERCEL_ENV) return false;
  return true;
}
