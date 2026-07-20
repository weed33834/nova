/**
 * Nova MCP Server —— 暴露面工厂（Phase E2）。
 *
 * 把 Nova 的三类能力注册到一个 `McpServer` 实例上，供两种传输复用：
 *   - Streamable HTTP（standalone 部署，Phase E3 的 `/api/mcp/server`）
 *   - stdio（Claude Desktop，Phase E3 的 `scripts/mcp-server.ts`）
 *
 * 暴露面（设计文档见 Phase E1）：
 *   - 工具（1 个）：`parse_document` —— 调用 Nova 本地解析器，把上传的
 *     CSV/JSON/YAML/XML/HTML/EPUB/IPYNB/PY/JS/TS/LaTeX/BibTeX/RIS 文件
 *     转成结构化 Markdown。直接满足“支持上传更多类型文件 + 解析”。
 *   - 资源（3 个静态 URI）：
 *       nova://skills    —— SKILL_CATALOG（5 个 agent 技能的展示元数据）
 *       nova://prompts   —— PromptRegistry（主 + PBL v2 提示词清单）
 *       nova://formats   —— DOCUMENT_MIME_TYPES（Nova 能解析的格式清单）
 *   - 提示词（动态）：PromptRegistry 的每个 entry 注册为一个 MCP prompt，
 *     外部客户端 `prompts/get` 时回填 system/user 模板。
 *
 * 不暴露 agent 工具（read_scene_content 等）：这些工具依赖请求级 deps
 * （scene 上下文、aiCall），外部 MCP 客户端拿不到场景上下文，调用会失败。
 * 技能清单通过 `nova://skills` 资源让外部客户端知晓有哪些技能。
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getPromptRegistry, type PromptRegistryEntry } from '@/lib/prompts/registry';
import { SKILL_CATALOG, type SkillCatalogEntry } from '@/lib/agent/tools/registry';
import { DOCUMENT_MIME_TYPES, NOVA_LOCAL_MIMES } from '@/lib/document/mime';
import { novaLocalExtractorProvider } from '@/lib/document/extractors/nova-local';
import { normalizeDocumentMimeType } from '@/lib/document/mime';
import type { DocumentArtifact } from '@/lib/document/types';

/** Nova MCP server 的固定身份。 */
export const NOVA_SERVER_INFO = {
  name: 'nova',
  version: '0.3.0',
} as const;

/** 三个静态资源的 URI。 */
export const NOVA_RESOURCE_URIS = {
  skills: 'nova://skills',
  prompts: 'nova://prompts',
  formats: 'nova://formats',
} as const;

/** parse_document 工具的输入 schema。 */
const ParseDocumentSchema = z.object({
  /** 文件名（用于 MIME 推断 + 元数据）。 */
  fileName: z.string().describe('Original file name (used for MIME inference).'),
  /** MIME 类型；缺失时按扩展名推断。 */
  mimeType: z
    .string()
    .optional()
    .describe('MIME type; inferred from fileName extension when omitted.'),
  /** base64 编码的文件内容（外部客户端无法直接传二进制）。 */
  contentBase64: z
    .string()
    .describe('Base64-encoded file content. Decoded server-side before parsing.'),
});

type ParseDocumentArgs = z.infer<typeof ParseDocumentSchema>;

/**
 * 创建并配置一个 Nova MCP server 实例。传输由调用方在 `connect()` 时注入。
 *
 * 设计要点：
 *   - 无状态 —— server 内部不持有会话级 scene/agent 上下文；只暴露可独立
 *     完成的能力（文件解析 + 清单读取 + 提示词模板回填）。
 *   - 工厂每次都返回全新实例，便于多会话/多传输隔离。
 */
export function createNovaMcpServer(): McpServer {
  const server = new McpServer(NOVA_SERVER_INFO, {
    instructions:
      'Nova MCP server — exposes Nova file parsing, skill/prompt/format catalogs. ' +
      'Use `parse_document` to extract text from structured/web/code/academic files.',
  });

  registerParseDocumentTool(server);
  registerStaticResources(server);
  registerPromptCatalog(server);

  return server;
}

// ─── 工具：parse_document ────────────────────────────────────────────────────

function registerParseDocumentTool(server: McpServer): void {
  server.registerTool(
    'parse_document',
    {
      title: 'Parse Document',
      description:
        'Parse an uploaded file (CSV/JSON/YAML/XML/HTML/EPUB/IPYNB/Python/JS/TS/LaTeX/BibTeX/RIS) ' +
        'into structured Markdown. Base64-encode the file content and pass it in. ' +
        'Returns extracted text + a brief schema/statistics summary.',
      inputSchema: ParseDocumentSchema,
    },
    async (args: ParseDocumentArgs) => {
      // 1. 解码 base64 —— 外部客户端只能传文本，二进制走 base64。
      let buffer: Buffer;
      try {
        buffer = Buffer.from(args.contentBase64, 'base64');
      } catch {
        return makeErrorResult('Invalid base64 content.');
      }
      if (buffer.length === 0) {
        return makeErrorResult('Empty file content.');
      }

      // 2. 规范化 MIME —— 浏览器可能给 octet-stream，按扩展名补全。
      const mimeType = args.mimeType || normalizeDocumentMimeType({ fileName: args.fileName });
      if (!mimeType) {
        return makeErrorResult(
          `Cannot infer MIME type from fileName "${args.fileName}". Pass mimeType explicitly.`,
        );
      }

      // 3. 仅暴露 nova-local 解析器支持的格式（无外部依赖，可在任何部署跑）。
      if (!NOVA_LOCAL_MIMES.includes(mimeType)) {
        const supported = NOVA_LOCAL_MIMES.join(', ');
        return makeErrorResult(
          `MIME type "${mimeType}" is not supported by Nova local parser. Supported: ${supported}.`,
        );
      }

      // 4. 调用解析器。
      let artifact: DocumentArtifact;
      try {
        artifact = await novaLocalExtractorProvider.extract({
          buffer,
          fileName: args.fileName,
          fileSize: buffer.length,
          mimeType,
          config: { providerId: 'nova-local' },
        });
      } catch (error) {
        return makeErrorResult(
          `Parse failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      // 5. 拼装文本块为单个 Markdown 文本返回。
      const text = artifact.blocks
        .map((b) => b.text ?? '')
        .filter((t) => t.length > 0)
        .join('\n\n');
      const meta = [`*Parsed ${args.fileName} (${mimeType}, ${buffer.length} bytes)*`].join('\n');

      return {
        content: [{ type: 'text', text: `${meta}\n\n${text}` }],
      };
    },
  );
}

// ─── 资源：skills / prompts / formats ────────────────────────────────────────

function registerStaticResources(server: McpServer): void {
  // nova://skills —— SKILL_CATALOG 的静态展示元数据。
  server.registerResource(
    'skills',
    NOVA_RESOURCE_URIS.skills,
    {
      title: 'Nova Skills',
      description: 'Catalog of Nova agent skills (tools) with display metadata.',
      mimeType: 'application/json',
    },
    async () => {
      // SKILL_CATALOG is readonly; JSON.stringify accepts it as-is.
      const payload = SKILL_CATALOG;
      return {
        contents: [
          {
            uri: NOVA_RESOURCE_URIS.skills,
            mimeType: 'application/json',
            text: JSON.stringify(payload, null, 2),
          },
        ],
      };
    },
  );

  // nova://prompts —— PromptRegistry 清单（主 + PBL v2）。
  server.registerResource(
    'prompts',
    NOVA_RESOURCE_URIS.prompts,
    {
      title: 'Nova Prompts',
      description: 'Registry of all prompt templates (main + PBL v2 systems).',
      mimeType: 'application/json',
    },
    async () => {
      const entries = getPromptRegistry();
      const payload = entries.map((e) => ({
        id: e.id,
        source: e.source,
        displayName: e.displayName,
        version: e.version,
        description: e.description,
        tags: e.tags,
        deprecated: e.deprecated,
        hasUserTemplate: e.hasUserTemplate,
        path: e.path,
      }));
      return {
        contents: [
          {
            uri: NOVA_RESOURCE_URIS.prompts,
            mimeType: 'application/json',
            text: JSON.stringify(payload, null, 2),
          },
        ],
      };
    },
  );

  // nova://formats —— Nova 能解析的 MIME 清单。
  server.registerResource(
    'formats',
    NOVA_RESOURCE_URIS.formats,
    {
      title: 'Nova Parseable Formats',
      description: 'MIME types Nova can parse via the local extractor (parse_document).',
      mimeType: 'application/json',
    },
    async () => {
      // 反查 id→mime，给外部客户端一个稳定的 {id, mime, label} 清单。
      const formats = Object.entries(DOCUMENT_MIME_TYPES)
        .filter(([id]) => NOVA_LOCAL_MIMES.includes(DOCUMENT_MIME_TYPES[id]))
        .map(([id, mime]) => ({ id, mime, label: id.toUpperCase() }));
      return {
        contents: [
          {
            uri: NOVA_RESOURCE_URIS.formats,
            mimeType: 'application/json',
            text: JSON.stringify({ formats, parseTool: 'parse_document' }, null, 2),
          },
        ],
      };
    },
  );
}

// ─── 提示词：把 PromptRegistry 每个 entry 注册为 MCP prompt ──────────────────

function registerPromptCatalog(server: McpServer): void {
  const entries = getPromptRegistry();
  for (const entry of entries) {
    registerSinglePrompt(server, entry);
  }
}

/**
 * 注册单个 prompt。注意：
 *   - MCP prompt 名只允许 `[a-zA-Z0-9_-]`，main 系统的 kebab-case id 直接可用；
 *     PBL v2 同样是 kebab-case，无需转义。
 *   - 重名（main 与 pbl-v2 撞名）按先注册先生效处理，并在描述里标注 source
 *     以便客户端区分。当前注册表已按 (source, id) 排序，main 在 pbl-v2 前。
 *   - `prompts/get` 返回 system + user 两个 message（user 缺失则只回 system）。
 */
function registerSinglePrompt(server: McpServer, entry: PromptRegistryEntry): void {
  // MCP prompt 名带斜杠/点会出问题，这里做一次保险的清洗。
  const safeName = entry.id.replace(/[^a-zA-Z0-9_-]/g, '-');
  server.registerPrompt(
    safeName,
    {
      title: entry.displayName,
      description:
        (entry.description ?? `Nova prompt: ${entry.displayName}`) +
        ` (source: ${entry.source}, v${entry.version}${entry.deprecated ? ', deprecated' : ''})`,
    },
    (async () => {
      // 懒加载模板内容 —— 只在 prompts/get 时读盘，避免 list 时全量加载。
      const { renderPromptForMCP } = await import('./prompt-renderer');
      const rendered = await renderPromptForMCP(entry);
      // registerPrompt 要求返回 GetPromptResult 形状（messages + 可选 description）。
      return rendered;
    }) as never,
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeErrorResult(message: string) {
  return {
    content: [{ type: 'text' as const, text: `Error: ${message}` }],
    isError: true,
  };
}
