/**
 * 把 PromptRegistry entry 渲染成 MCP `prompts/get` 返回结构。
 *
 * 懒加载：仅在客户端 prompts/get 时读盘，避免 prompts/list 全量加载。
 *
 * 两个 prompt 系统的模板布局不同：
 *   - main：`lib/prompts/templates/<id>/{system.md, user.md?}` —— 经 loadPrompt()
 *     处理 snippet 包含（{{snippet:name}}）。这里不复用 buildPrompt 的变量插值，
 *     因为 MCP 客户端没有 Nova 运行时变量；返回未插值的模板，让客户端自行填。
 *   - pbl-v2：`lib/pbl/v2/prompts/<id>.md` —— 单文件，作为 system 返回。
 */

import fs from 'fs';
import path from 'path';
import type { PromptRegistryEntry } from '@/lib/prompts/registry';
import { loadPrompt } from '@/lib/prompts/loader';
import type { PromptId } from '@/lib/prompts/types';

interface McpPromptMessage {
  role: 'user' | 'assistant';
  content: { type: 'text'; text: string };
}

interface McpPromptResult {
  messages: McpPromptMessage[];
  description?: string;
}

/**
 * 读取并渲染一个 prompt entry 为 MCP prompt 结果。
 *
 * 主系统走 loadPrompt()（处理 snippet 包含）；PBL v2 直接读单文件。
 * user.md 缺失时只返回 system 消息；存在则按 [system, user] 顺序返回。
 */
export async function renderPromptForMCP(entry: PromptRegistryEntry): Promise<McpPromptResult> {
  if (entry.source === 'main') {
    return renderMainPrompt(entry);
  }
  return renderPblV2Prompt(entry);
}

function renderMainPrompt(entry: PromptRegistryEntry): McpPromptResult {
  // loadPrompt 已处理 snippet 包含；变量插值留给客户端做。
  const loaded = loadPrompt(entry.id as PromptId);
  if (!loaded) {
    return {
      description: entry.description,
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `*Prompt "${entry.id}" could not be loaded.*`,
          },
        },
      ],
    };
  }

  const messages: McpPromptMessage[] = [];
  // system 模板作为 assistant 角色（提示词本身的“系统指令”）。
  if (loaded.systemPrompt) {
    messages.push({
      role: 'assistant',
      content: { type: 'text', text: loaded.systemPrompt },
    });
  }
  // user 模板作为 user 角色（待填充的请求模板）。
  if (loaded.userPromptTemplate) {
    messages.push({
      role: 'user',
      content: { type: 'text', text: loaded.userPromptTemplate },
    });
  }
  return { description: entry.description, messages };
}

function renderPblV2Prompt(entry: PromptRegistryEntry): McpPromptResult {
  const filePath = path.join(process.cwd(), entry.path);
  let text: string;
  try {
    text = fs.readFileSync(filePath, 'utf-8').trim();
  } catch {
    return {
      description: entry.description,
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `*PBL v2 prompt "${entry.id}" not found at ${entry.path}.*`,
          },
        },
      ],
    };
  }
  return {
    description: entry.description,
    messages: [
      // PBL v2 单文件作为 system 指令。
      { role: 'assistant', content: { type: 'text', text } },
    ],
  };
}
