/**
 * Webhook 出站通知 — 事件驱动的第三方集成。
 *
 * 当关键事件发生时（课堂生成完成、用户注册等），
 * 向用户配置的 webhook URL 发送 POST 请求。
 *
 * 配置：
 * - WEBHOOK_SECRET: 可选，用于签名验证（X-Nova-Signature 头）
 *
 * Webhook URL 通过 API 管理，存储在用户级别。
 */
import { createHmac } from 'node:crypto';
import { createLogger } from '@/lib/logger';

const log = createLogger('Webhook');

export interface WebhookEvent {
  type: string;
  data: unknown;
  timestamp: number;
}

export interface WebhookEndpoint {
  url: string;
  events: string[]; // 订阅的事件类型，空数组表示全部
}

/**
 * 发送 webhook 通知。
 *
 * - 超时 10 秒
 * - 失败不阻断主流程（fire-and-forget）
 * - 带 HMAC-SHA256 签名头
 */
export async function sendWebhook(
  endpoint: string,
  event: WebhookEvent,
  secret?: string,
): Promise<boolean> {
  const payload = JSON.stringify(event);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Nova-Event': event.type,
  };

  if (secret) {
    const signature = createHmac('sha256', secret).update(payload).digest('hex');
    headers['X-Nova-Signature'] = `sha256=${signature}`;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: payload,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      log.warn('Webhook returned non-OK status', {
        endpoint,
        status: res.status,
        event: event.type,
      });
      return false;
    }

    log.debug('Webhook sent', { endpoint, event: event.type });
    return true;
  } catch (err) {
    log.warn('Webhook delivery failed', { endpoint, event: event.type, err });
    return false;
  }
}

/**
 * 向多个端点广播事件。
 * 仅发送到订阅了该事件类型的端点。
 */
export async function broadcastWebhook(
  endpoints: WebhookEndpoint[],
  event: WebhookEvent,
  secret?: string,
): Promise<void> {
  const targeted = endpoints.filter(
    (ep) => ep.events.length === 0 || ep.events.includes(event.type),
  );

  await Promise.allSettled(
    targeted.map((ep) => sendWebhook(ep.url, event, secret)),
  );
}

// ── 预置事件类型 ──────────────────────────────────────────────────────────

export const WebhookEvents = {
  CLASSROOM_CREATED: 'classroom.created',
  CLASSROOM_GENERATED: 'classroom.generated',
  CLASSROOM_GENERATION_FAILED: 'classroom.generation_failed',
  CLASSROOM_UPDATED: 'classroom.updated',
  CLASSROOM_DELETED: 'classroom.deleted',
  USER_REGISTERED: 'user.registered',
  QUOTA_EXCEEDED: 'quota.exceeded',
} as const;
