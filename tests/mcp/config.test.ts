import { afterEach, describe, expect, it, vi } from 'vitest';

describe('MCP config helpers', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restore env between tests so flag checks don't bleed.
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  describe('isStdioTransportAvailable', () => {
    it('returns true in a vanilla standalone environment', async () => {
      delete process.env.NEXT_PUBLIC_VERCEL_ENV;
      delete process.env.NEXT_PUBLIC_MCP_STDIO_DISABLED;
      const { isStdioTransportAvailable } = await import('@/lib/mcp/config');
      expect(isStdioTransportAvailable()).toBe(true);
    });

    it('returns false on Vercel (NEXT_PUBLIC_VERCEL_ENV set)', async () => {
      process.env.NEXT_PUBLIC_VERCEL_ENV = 'production';
      const { isStdioTransportAvailable } = await import('@/lib/mcp/config');
      expect(isStdioTransportAvailable()).toBe(false);
    });

    it('returns false when explicitly disabled via NEXT_PUBLIC_MCP_STDIO_DISABLED', async () => {
      delete process.env.NEXT_PUBLIC_VERCEL_ENV;
      process.env.NEXT_PUBLIC_MCP_STDIO_DISABLED = 'true';
      const { isStdioTransportAvailable } = await import('@/lib/mcp/config');
      expect(isStdioTransportAvailable()).toBe(false);
    });

    it('does not treat "false" string as disabled (only "true" disables)', async () => {
      delete process.env.NEXT_PUBLIC_VERCEL_ENV;
      process.env.NEXT_PUBLIC_MCP_STDIO_DISABLED = 'false';
      const { isStdioTransportAvailable } = await import('@/lib/mcp/config');
      expect(isStdioTransportAvailable()).toBe(true);
    });
  });

  describe('isMCPExposureEnabled', () => {
    it('returns true in standalone by default', async () => {
      delete process.env.VERCEL;
      delete process.env.NEXT_PUBLIC_MCP_EXPOSE;
      const { isMCPExposureEnabled } = await import('@/lib/mcp/config');
      expect(isMCPExposureEnabled()).toBe(true);
    });

    it('returns false when NEXT_PUBLIC_MCP_EXPOSE is "false"', async () => {
      delete process.env.VERCEL;
      process.env.NEXT_PUBLIC_MCP_EXPOSE = 'false';
      const { isMCPExposureEnabled } = await import('@/lib/mcp/config');
      expect(isMCPExposureEnabled()).toBe(false);
    });

    it('returns false on Vercel regardless of the expose flag', async () => {
      process.env.VERCEL = '1';
      process.env.NEXT_PUBLIC_MCP_EXPOSE = 'true';
      const { isMCPExposureEnabled } = await import('@/lib/mcp/config');
      expect(isMCPExposureEnabled()).toBe(false);
    });
  });
});
