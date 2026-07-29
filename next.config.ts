import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  // Next's standalone trace chunks can contain ':' on Windows. Generate the
  // Docker-only standalone artifact on POSIX hosts, and use normal output locally.
  output: process.env.VERCEL || process.platform === 'win32' ? undefined : 'standalone',
  transpilePackages: ['mathml2omml', 'pptxgenjs', '@nova/importer'],
  serverExternalPackages: ['@earendil-works/pi-ai', '@earendil-works/pi-agent-core'],
  experimental: {
    proxyClientMaxBodySize: '200mb',
    optimizePackageImports: [
      'lucide-react',
      'motion',
      '@radix-ui/react-popover',
      'embla-carousel-react',
      'sonner',
    ],
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
  },
  // Disable type checking during dev for faster startup
  typescript: {
    ignoreBuildErrors: process.env.NODE_ENV === 'development',
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
