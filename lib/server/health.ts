import {
  getServerWebSearchProviders,
  getServerImageProviders,
  getServerVideoProviders,
  getServerTTSProviders,
} from '@/lib/server/provider-config';

const version = process.env.npm_package_version || '0.1.0';

/**
 * Build the readiness response payload shared by `/api/health` (legacy) and
 * `/api/health/ready`. Extracted so the two endpoints stay in lockstep without
 * copy-pasted construction logic.
 *
 * 报告所有企业级服务的配置状态，便于运维和监控。
 */
export function buildReadinessPayload() {
  return {
    status: 'ok' as const,
    version,
    timestamp: new Date().toISOString(),
    capabilities: {
      webSearch: Object.keys(getServerWebSearchProviders()).length > 0,
      imageGeneration: Object.keys(getServerImageProviders()).length > 0,
      videoGeneration: Object.keys(getServerVideoProviders()).length > 0,
      tts: Object.values(getServerTTSProviders()).some((info) => !info.disabled),
    },
    services: {
      // 对象存储：S3 配置了则为 's3'，否则 'noop'（IndexedDB 回退）
      storage: process.env.S3_BUCKET ? 's3' : 'noop',
      // 邮件通知：SMTP_HOST 配置了则为 true
      email: !!process.env.SMTP_HOST,
      // 分布式限流：Upstash Redis 配置了则为 true
      distributedRateLimit: !!process.env.UPSTASH_REDIS_REST_URL,
      // 用户配额管理：任一 QUOTA_ 变量配置了则为 true
      quota: !!(
        process.env.QUOTA_LLM_CALLS ||
        process.env.QUOTA_IMAGE_GEN ||
        process.env.QUOTA_VIDEO_GEN ||
        process.env.QUOTA_TTS_CHARS
      ),
      // Webhook 签名验证
      webhookSigning: !!process.env.WEBHOOK_SECRET,
      // 错误追踪
      sentry: !!process.env.SENTRY_DSN,
      // 访问控制
      accessCode: !!process.env.ACCESS_CODE,
    },
  };
}
