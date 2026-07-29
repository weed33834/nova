/**
 * GET /api/admin/system
 *
 * Returns system information: version, database type, feature flags,
 * configured providers, and environment. Requires the `settings:manage` permission.
 */
import { NextRequest } from 'next/server';
import { withApiHandler } from '@/lib/server/api-handler';
import { apiSuccess } from '@/lib/server/api-response';
import { requirePermission } from '@/lib/auth/rbac';
import { getDatabaseType } from '@/lib/db';
import { isFeatureEnabled } from '@/lib/server/feature-flags';
import { resolveDbPath } from '@/lib/db/client';

export const GET = withApiHandler(async (_req: NextRequest) => {
  await requirePermission('settings:manage');

  // Collect configured providers (keys exist but values are redacted)
  const providerPrefixes = [
    'OPENAI', 'ANTHROPIC', 'GOOGLE', 'AZURE_OPENAI', 'DEEPSEEK',
    'QWEN', 'KIMI', 'MINIMAX', 'GLM', 'SILICONFLOW', 'DOUBAO',
    'OPENROUTER', 'GROK', 'TENCENT', 'XIAOMI',
  ];
  const configuredProviders = providerPrefixes
    .filter((p) => process.env[`${p}_API_KEY`])
    .map((p) => p.toLowerCase());

  // Collect TTS providers
  const ttsProviders = ['OPENAI', 'AZURE', 'GLM', 'QWEN', 'MINIMAX', 'ELEVENLABS']
    .filter((p) => process.env[`TTS_${p}_API_KEY`])
    .map((p) => p.toLowerCase());

  // Collect feature flags
  const knownFlags = [
    'FEATURE_VIDEO_EXPORT',
    'FEATURE_EXPERIMENTAL_MODEL_ROUTING',
    'FEATURE_QUOTA_LIMIT',
    'FEATURE_MAX_SCENES',
  ];
  const flags: Record<string, boolean | string | number> = {};
  for (const flag of knownFlags) {
    if (process.env[flag] !== undefined) {
      flags[flag] = isFeatureEnabled(flag);
    }
  }

  return apiSuccess({
    data: {
      version: process.env.npm_package_version ?? 'unknown',
      nodeVersion: process.version,
      environment: process.env.NODE_ENV ?? 'development',
      database: {
        type: getDatabaseType(),
        path: getDatabaseType() === 'sqlite' ? resolveDbPath() : undefined,
      },
      providers: {
        llm: configuredProviders,
        tts: ttsProviders,
      },
      features: flags,
      security: {
        rateLimiting: {
          distributed: !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN),
        },
        sentry: {
          server: !!process.env.SENTRY_DSN,
          client: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
        },
        otel: !!process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
      },
      storage: {
        s3Configured: !!(process.env.S3_ENDPOINT && process.env.S3_BUCKET),
      },
      email: {
        smtpConfigured: !!(process.env.SMTP_HOST && process.env.SMTP_USER),
      },
    },
  });
}, { rateLimit: 'light', rateLimitScope: 'admin-system' });
