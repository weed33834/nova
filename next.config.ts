import type { NextConfig } from 'next';

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
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-tooltip',
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

    return [
      {
        source: '/(.*)',
        headers: [
          ...(!extraAncestors ? [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }] : []),
          {
            key: 'Content-Security-Policy',
            value: `frame-ancestors ${frameAncestors}`,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
