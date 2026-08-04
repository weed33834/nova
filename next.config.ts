import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  // Next's standalone trace chunks can contain ':' on Windows. Generate the
  // Docker-only standalone artifact on POSIX hosts, and use normal output locally.
  output: process.env.VERCEL || process.platform === 'win32' ? undefined : 'standalone',
  transpilePackages: ['mathml2omml', 'pptxgenjs', '@nova/importer', '@nova/renderer', '@nova/dsl', '@nova/storage'],
  serverExternalPackages: [
    '@earendil-works/pi-ai',
    '@earendil-works/pi-agent-core',
    'postgres',
    '@node-saml/passport-saml',
  ],
  experimental: {
    proxyClientMaxBodySize: '100mb',
    optimizePackageImports: [
      'lucide-react',
      'motion',
      '@radix-ui/react-popover',
      'embla-carousel-react',
      'sonner',
      // 重型依赖：首屏不需要立即加载，分割进独立 chunk
      'echarts',
      'shiki',
      '@langchain/core',
      '@langchain/langgraph',
      '@xyflow/react',
      'next-auth',
      'katex',
      'prosemirror-view',
      'prosemirror-state',
      'prosemirror-model',
      // 审计新增：进一步减少首屏bundle体积
      'ai',                       // Vercel AI SDK (~200KB)
      '@assistant-ui/react',      // 聊天UI组件库 (~200KB)
      'jszip',                    // ZIP处理 — 仅导出时用
      'zustand',                  // 状态管理
      'zod',                      // 验证 — v4体积增大
      'immer',                    // 不可变状态
      'react-i18next',            // i18n框架
    ],
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
    // 允许课堂内容引用外部图片 CDN（根据需要添加域名）
    remotePatterns: [
      { protocol: 'https', hostname: '**.githubusercontent.com' },
      { protocol: 'https', hostname: '**.unsplash.com' },
      { protocol: 'https', hostname: '**.wikimedia.org' },
    ],
  },
  // Disable type checking during dev for faster startup.
  // Also skip when SKIP_TS_CHECK is set — tsc --noEmit is run separately in CI
  // with a higher memory limit to avoid the Next.js worker OOM on large projects.
  typescript: {
    ignoreBuildErrors: process.env.NODE_ENV === 'development' || process.env.SKIP_TS_CHECK === 'true',
  },
  async headers() {
    const extraAncestors = process.env.ALLOWED_FRAME_ANCESTORS?.trim();
    const frameAncestors = extraAncestors ? `'self' ${extraAncestors}` : "'self'";

    // HSTS — only honoured by browsers over HTTPS, so it is safe to emit on
    // plain HTTP (e.g. behind a TLS-terminating proxy). Defaults match the
    // OWASP recommendation (2 years, includeSubDomains). `preload` is opt-in
    // via env because it is a one-way commitment that requires domain
    // registration on the HSTS preload list.
    const hstsMaxAge = process.env.HSTS_MAX_AGE || '63072000';
    const hstsPreload = process.env.HSTS_PRELOAD === 'true';
    const strictTransportSecurity = [
      `max-age=${hstsMaxAge}`,
      'includeSubDomains',
      ...(hstsPreload ? ['preload'] : []),
    ].join('; ');

    // Permissions-Policy: the classroom uses the microphone (voice input) and
    // potentially the camera (multimodal capture); everything else that the
    // app does not use is locked down to deny by omission / `()`.
    const permissionsPolicy = [
      'camera=(self)',
      'microphone=(self)',
      'geolocation=()',
      'payment=()',
      'usb=()',
      'magnetometer=()',
      'gyroscope=()',
      'accelerometer=()',
      'interest-cohort=()',
      'browsing-topics=()',
    ].join(', ');

    return [
      {
        source: '/(.*)',
        headers: [
          ...(!extraAncestors ? [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }] : []),
          {
            key: 'Content-Security-Policy',
            // Only the framing-related directives are constrained here. A full
            // script-src/style-src CSP requires nonce wiring and runtime
            // testing; `object-src 'none'` and `base-uri 'self'` are safe
            // belt-and-braces additions that do not affect normal rendering.
            value: [
              `frame-ancestors ${frameAncestors}`,
              "base-uri 'self'",
              "object-src 'none'",
            ].join('; '),
          },
          { key: 'Strict-Transport-Security', value: strictTransportSecurity },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: permissionsPolicy },
          { key: 'X-DNS-Prefetch-Control', value: 'off' },
        ],
      },
    ];
  },
};

// Wrap with Sentry config — no-op when SENTRY_DSN / SENTRY_AUTH_TOKEN are unset.
export default withSentryConfig(nextConfig, {
  silent: true,
  widenClientFileUpload: true,
  disableLogger: true,
});
