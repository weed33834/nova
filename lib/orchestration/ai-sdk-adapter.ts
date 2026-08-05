/**
 * AI SDK Adapter for LangGraph
 *
 * Provides LangChain-compatible interface for LLM calls.
 * Uses the unified callLLM / streamLLM layer which goes through
 * Vercel AI SDK, supporting all providers (OpenAI, Anthropic, Google, etc.).
 *
 * 注意：不继承 @langchain/core 的 BaseChatModel（可选依赖）——
 * _generate/streamGenerate 均为自实现（走 callLLM/streamLLM），
 * 消息按 role/content 字段判断，不依赖 langchain 消息类。
 * 这样 core-only 安装（未装 @langchain）时本文件可正常编译加载。
 */

import type { LanguageModel } from 'ai';

import { callLLM, streamLLM } from '@/lib/ai/llm';
import type { ThinkingConfig } from '@/lib/types/provider';
import { createLogger } from '@/lib/logger';

const log = createLogger('AISdkAdapter');

/**
 * Stream chunk types for streaming generation
 */
export type StreamChunk =
  | { type: 'delta'; content: string }
  | {
      type: 'tool_calls';
      toolCalls: {
        id: string;
        index: number;
        type: 'function';
        function: { name: string; arguments: string };
      }[];
    }
  | { type: 'done'; content: string };

/** langchain BaseMessage 的兼容结构（按字段判断，不引入包） */
interface CompatMessage {
  role?: string;
  type?: string;
  content?: unknown;
}

/**
 * Adapter to use any AI SDK LanguageModel with LangGraph
 *
 * Accepts a LanguageModel instance (from getModel()) instead of raw
 * API credentials, enabling support for all providers.
 */
export class AISdkLangGraphAdapter {
  private languageModel: LanguageModel;
  private thinking?: ThinkingConfig;

  constructor(languageModel: LanguageModel, thinking?: ThinkingConfig) {
    this.languageModel = languageModel;
    this.thinking = thinking;
  }

  _llmType(): string {
    return 'ai-sdk';
  }

  _combineLLMOutput() {
    return {};
  }

  /**
   * Convert LangChain-compatible messages to AI SDK message format.
   * 按 role/type/content 字段判断（兼容 langchain BaseMessage 与普通对象）。
   */
  private convertMessages(
    messages: unknown[],
  ): { role: 'system' | 'user' | 'assistant'; content: string }[] {
    return messages.map((msg) => {
      const m = msg as CompatMessage;
      const content =
        typeof m.content === 'string'
          ? m.content
          : m.content === undefined || m.content === null
            ? ''
            : JSON.stringify(m.content);
      const role =
        m.role === 'system' || m.type === 'system'
          ? ('system' as const)
          : m.role === 'assistant' || m.type === 'ai'
            ? ('assistant' as const)
            : ('user' as const);
      return { role, content };
    });
  }

  async _generate(
    messages: unknown[],
    _options?: unknown,
    _runManager?: unknown,
  ): Promise<{
    generations: { text: string; message: { content: string } }[];
    llmOutput: Record<string, never>;
  }> {
    const aiMessages = this.convertMessages(messages);

    try {
      const result = await callLLM(
        {
          model: this.languageModel,
          messages: aiMessages,
        },
        'chat-adapter',
        undefined,
        this.thinking,
      );

      const content = result.text || '';

      log.info('[AI SDK Adapter] Response:', {
        textLength: content.length,
      });

      // 普通对象即可（下游仅读取 generations[].text）
      const aiMessage = { content };

      return {
        generations: [
          {
            text: content,
            message: aiMessage,
          },
        ],
        llmOutput: {},
      };
    } catch (error) {
      log.error('[AI SDK Adapter Error]', error);
      throw error;
    }
  }

  /**
   * Stream generate with text deltas
   *
   * Yields chunks of text as they arrive, then yields done with full content.
   * Uses streamLLM which goes through Vercel AI SDK's streamText.
   */
  async *streamGenerate(
    messages: unknown[],
    options?: { tools?: Record<string, unknown>; signal?: AbortSignal },
  ): AsyncGenerator<StreamChunk> {
    const aiMessages = this.convertMessages(messages);

    const result = streamLLM(
      {
        model: this.languageModel,
        messages: aiMessages,
        abortSignal: options?.signal,
      },
      'chat-adapter-stream',
      this.thinking,
    );

    let fullContent = '';

    for await (const chunk of result.textStream) {
      if (chunk) {
        fullContent += chunk;
        yield { type: 'delta', content: chunk };
      }
    }

    // Yield done with full content
    yield { type: 'done', content: fullContent };
  }
}
