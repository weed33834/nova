/**
 * pi-agent adapter (Phase D — consumer side).
 *
 * Converts MCP-discovered tools into pi `AgentTool` objects so the editor
 * agent can call them alongside the built-in tools.
 *
 * Schema bridging: MCP tools declare JSON Schema; pi-agent expects a TypeBox
 * `TSchema`. `Type.Unsafe(jsonSchema)` embeds the raw JSON Schema verbatim, so
 * the LLM sees the exact shape the MCP server declared and the MCP server
 * performs the real validation on callTool. The TypeScript `Static<>` of an
 * Unsafe schema is `unknown`, so `execute` receives untyped args that we pass
 * straight through.
 *
 * Tool namespacing: each adapted tool is named `mcp__<serverId>__<toolName>`
 * (Claude Desktop convention) so two servers exposing a tool of the same name
 * do not collide in the agent's tool table or allowlist.
 */

import { Type } from 'typebox';
import type { TSchema } from 'typebox';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { MCPDiscoveredTool } from './config';
import type { MCPClientManager } from './client-manager';
import { createLogger } from '@/lib/logger';

const log = createLogger('MCPAdapter');

/** Build the namespaced tool name shown to the agent. */
export function mcpToolName(serverId: string, toolName: string): string {
  return `mcp__${serverId}__${toolName}`;
}

/**
 * Wrap an MCP tool's JSON Schema in a permissive TypeBox schema.
 *
 * `Type.Unsafe` emits the raw schema object when serialized for the model, so
 * the LLM sees the MCP server's declared parameters. We default a missing
 * schema to a bare `object` so the model still gets a callable tool.
 */
function bridgeSchema(inputSchema: Record<string, unknown>): TSchema {
  const schema =
    Object.keys(inputSchema).length > 0 ? inputSchema : { type: 'object', properties: {} };
  return Type.Unsafe(schema) as TSchema;
}

/**
 * Build the pi `AgentTool` for a single discovered MCP tool.
 *
 * `execute` resolves the live `Client` for the tool's server from the manager,
 * calls `callTool`, and maps the MCP content array to pi's `AgentToolResult`
 * content shape (text + image). Errors are thrown (pi encodes thrown errors
 * into the tool-result surface itself).
 */
export function adaptMCPTool(
  tool: MCPDiscoveredTool,
  manager: MCPClientManager,
): AgentTool<TSchema, { serverId: string; toolName: string }> {
  const namespaced = mcpToolName(tool.serverId, tool.name);
  return {
    name: namespaced,
    label: tool.description || tool.name,
    description: tool.description || `MCP tool "${tool.name}" from server "${tool.serverId}".`,
    parameters: bridgeSchema(tool.inputSchema),
    async execute(_toolCallId, params) {
      const client = manager.getClient(tool.serverId);
      if (!client) {
        throw new Error(`MCP server "${tool.serverId}" is not connected`);
      }
      const result = await client.callTool({
        name: tool.name,
        arguments: params as Record<string, unknown>,
      });
      // `callTool`'s return type narrows `content` to `{}` under some overloads;
      // at runtime it is always an array of typed content blocks. Coerce via a
      // minimal local type so we map text/image and stringify everything else.
      const rawContent = (result.content ?? []) as Array<{
        type: string;
        text?: string;
        data?: string;
        mimeType?: string;
      }>;
      const content = rawContent.map((c) => {
        if (c.type === 'text' && typeof c.text === 'string') {
          return { type: 'text' as const, text: c.text };
        }
        if (c.type === 'image' && typeof c.data === 'string') {
          return { type: 'image' as const, data: c.data, mimeType: c.mimeType ?? 'image/png' };
        }
        // Audio / embedded-resource / unknown content types: surface as text
        // so the agent still sees a result rather than dropping it silently.
        return {
          type: 'text' as const,
          text: JSON.stringify(c),
        };
      });
      log.debug(`MCP tool ${namespaced} returned ${content.length} content block(s)`);
      return {
        content,
        details: { serverId: tool.serverId, toolName: tool.name },
      };
    },
  } as AgentTool<TSchema, { serverId: string; toolName: string }>;
}

/**
 * Adapt all discovered tools from the manager into pi AgentTool objects.
 *
 * Returns the tools plus the set of their namespaced names, so the caller can
 * build a combined allowlist (V0_ALLOWLIST ∪ mcp tool names) for the agent's
 * beforeToolCall gate.
 */
export function adaptAllMCPTools(manager: MCPClientManager): {
  tools: AgentTool<never, never>[];
  names: Set<string>;
} {
  const discovered = manager.getDiscoveredTools();
  const tools = discovered.map((t) => adaptMCPTool(t, manager) as AgentTool<never, never>);
  const names = new Set(tools.map((t) => t.name));
  return { tools, names };
}
