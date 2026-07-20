import { describe, expect, it, vi } from 'vitest';
import type { MCPDiscoveredTool } from '@/lib/mcp/config';
import type { MCPClientManager } from '@/lib/mcp/client-manager';

/**
 * Build a fake manager exposing only the surface the adapter reads, so we can
 * test the bridging logic without spinning up a real MCP Client.
 */
function makeFakeManager(
  tools: MCPDiscoveredTool[],
): Pick<MCPClientManager, 'getDiscoveredTools' | 'getClient'> {
  return {
    getDiscoveredTools: () => tools,
    getClient: () => undefined,
  };
}

describe('mcpToolName', () => {
  it('namespaces as mcp__<serverId>__<toolName>', async () => {
    const { mcpToolName } = await import('@/lib/mcp/pi-adapter');
    expect(mcpToolName('filesystem', 'read_file')).toBe('mcp__filesystem__read_file');
  });

  it('preserves tool names with special characters (no sanitization)', async () => {
    const { mcpToolName } = await import('@/lib/mcp/pi-adapter');
    // The adapter is a thin pass-through; collision-avoidance is by convention.
    expect(mcpToolName('s1', 'tools/call')).toBe('mcp__s1__tools/call');
  });
});

describe('adaptAllMCPTools', () => {
  it('returns an empty toolset + empty name set when no tools are discovered', async () => {
    const { adaptAllMCPTools } = await import('@/lib/mcp/pi-adapter');
    const manager = makeFakeManager([]);
    const { tools, names } = adaptAllMCPTools(manager as MCPClientManager);
    expect(tools).toEqual([]);
    expect(names.size).toBe(0);
  });

  it('adapts every discovered tool and namespaces its name', async () => {
    const { adaptAllMCPTools, mcpToolName } = await import('@/lib/mcp/pi-adapter');
    const discovered: MCPDiscoveredTool[] = [
      {
        serverId: 'fs',
        name: 'read_file',
        description: 'Read a file',
        inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
      },
      {
        serverId: 'fs',
        name: 'write_file',
        description: 'Write a file',
        inputSchema: {
          type: 'object',
          properties: { path: { type: 'string' }, content: { type: 'string' } },
        },
      },
      {
        serverId: 'github',
        name: 'create_issue',
        description: '',
        inputSchema: {},
      },
    ];
    const { tools, names } = adaptAllMCPTools(makeFakeManager(discovered) as MCPClientManager);
    expect(tools).toHaveLength(3);
    expect(new Set(tools.map((t) => t.name))).toEqual(
      new Set([
        mcpToolName('fs', 'read_file'),
        mcpToolName('fs', 'write_file'),
        mcpToolName('github', 'create_issue'),
      ]),
    );
    // names mirrors the tool names exactly.
    expect(names).toEqual(new Set(tools.map((t) => t.name)));
  });

  it('gives each adapted tool a description (falls back to a default when missing)', async () => {
    const { adaptAllMCPTools } = await import('@/lib/mcp/pi-adapter');
    const discovered: MCPDiscoveredTool[] = [
      { serverId: 's', name: 't1', description: 'Has desc', inputSchema: {} },
      { serverId: 's', name: 't2', description: '', inputSchema: {} },
    ];
    const { tools } = adaptAllMCPTools(makeFakeManager(discovered) as MCPClientManager);
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    expect(byName['mcp__s__t1'].description).toBe('Has desc');
    // Empty description falls back to a non-empty default mentioning the server.
    expect(byName['mcp__s__t2'].description).toContain('"s"');
  });

  it('embeds the raw JSON Schema verbatim via Type.Unsafe', async () => {
    const { adaptAllMCPTools } = await import('@/lib/mcp/pi-adapter');
    const schema = {
      type: 'object',
      properties: { query: { type: 'string', description: 'search query' } },
      required: ['query'],
    };
    const discovered: MCPDiscoveredTool[] = [
      { serverId: 's', name: 'search', description: 'd', inputSchema: schema },
    ];
    const { tools } = adaptAllMCPTools(makeFakeManager(discovered) as MCPClientManager);
    // The adapted tool's `parameters` carries the schema object (Type.Unsafe
    // embeds it); verify by structural equality of its enumerable shape.
    const params = tools[0].parameters as unknown as Record<string, unknown>;
    expect(params).toMatchObject(schema);
  });
});

describe('adaptMCPTool execute', () => {
  it('throws when the server client is not connected', async () => {
    const { adaptMCPTool } = await import('@/lib/mcp/pi-adapter');
    const tool: MCPDiscoveredTool = {
      serverId: 's',
      name: 't',
      description: 'd',
      inputSchema: {},
    };
    // Fake manager returns no client → execute must throw.
    const manager = makeFakeManager([tool]);
    const adapted = adaptMCPTool(tool, manager as MCPClientManager);
    await expect(adapted.execute!('id', {})).rejects.toThrow('not connected');
  });

  it('maps text content blocks and surfaces non-text as stringified text', async () => {
    const { adaptMCPTool } = await import('@/lib/mcp/pi-adapter');
    const callTool = vi.fn().mockResolvedValue({
      content: [
        { type: 'text', text: 'hello' },
        { type: 'image', data: 'base64==', mimeType: 'image/png' },
        { type: 'audio', data: 'audio==' },
      ],
    });
    const fakeManager = {
      getDiscoveredTools: () => [],
      getClient: () => ({ callTool }) as unknown,
    };
    const tool: MCPDiscoveredTool = {
      serverId: 's',
      name: 't',
      description: 'd',
      inputSchema: {},
    };
    const adapted = adaptMCPTool(tool, fakeManager as unknown as MCPClientManager);
    const result = await adapted.execute!('id', { q: 'x' });
    expect(callTool).toHaveBeenCalledWith({ name: 't', arguments: { q: 'x' } });
    expect(result.content).toHaveLength(3);
    expect(result.content[0]).toEqual({ type: 'text', text: 'hello' });
    expect(result.content[1]).toEqual({
      type: 'image',
      data: 'base64==',
      mimeType: 'image/png',
    });
    // Audio is not a known type → stringified fallback as text.
    expect(result.content[2].type).toBe('text');
    expect((result.content[2] as { text?: string }).text).toContain('audio');
    // details carries the routing metadata.
    expect(result.details).toEqual({ serverId: 's', toolName: 't' });
  });

  it('returns an empty content array when callTool yields no content', async () => {
    const { adaptMCPTool } = await import('@/lib/mcp/pi-adapter');
    const callTool = vi.fn().mockResolvedValue({ content: [] });
    const fakeManager = {
      getDiscoveredTools: () => [],
      getClient: () => ({ callTool }) as unknown,
    };
    const tool: MCPDiscoveredTool = {
      serverId: 's',
      name: 't',
      description: 'd',
      inputSchema: {},
    };
    const adapted = adaptMCPTool(tool, fakeManager as unknown as MCPClientManager);
    const result = await adapted.execute!('id', {});
    expect(result.content).toEqual([]);
  });
});
