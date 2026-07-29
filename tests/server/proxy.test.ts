import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// proxy.ts 导出的函数需要在 Edge 环境运行，测试中直接 mock Web Crypto
describe('Edge Proxy — Access Code Gate', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('should pass through when ACCESS_CODE is not set', async () => {
    delete process.env.ACCESS_CODE;
    const { proxy } = await import('@/proxy');

    const request = new NextRequest('http://localhost:3000/editor');
    const response = await proxy(request);

    expect(response.status).toBe(200);
  });

  it('should allow public routes without access code', async () => {
    process.env.ACCESS_CODE = 'test-code';
    const { proxy } = await import('@/proxy');

    const publicPaths = [
      '/',
      '/auth/signin',
      '/api/health',
      '/api/health/live',
      '/api/access-code/verify',
      '/api/usage',
      '/classroom/abc123',
      '/_next/static/chunk.js',
      '/favicon.ico',
      '/icons/icon.png',
      '/fonts/inter.woff2',
    ];

    for (const path of publicPaths) {
      const request = new NextRequest(`http://localhost:3000${path}`);
      const response = await proxy(request);
      expect(response.status).toBe(200);
    }
  });

  it('should block API routes without valid cookie', async () => {
    process.env.ACCESS_CODE = 'test-code';
    const { proxy } = await import('@/proxy');

    const request = new NextRequest('http://localhost:3000/api/generate-classroom', {
      headers: {},
    });

    const response = await proxy(request);
    expect(response.status).toBe(401);

    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.errorCode).toBe('UNAUTHORIZED');
  });

  it('should allow page requests without cookie (frontend shows modal)', async () => {
    process.env.ACCESS_CODE = 'test-code';
    const { proxy } = await import('@/proxy');

    const request = new NextRequest('http://localhost:3000/editor');
    const response = await proxy(request);

    // 页面请求（非 API）应该通过，前端显示 access code modal
    expect(response.status).toBe(200);
  });

  it('should allow requests with valid access code cookie', async () => {
    process.env.ACCESS_CODE = 'test-secret-code';
    const { proxy } = await import('@/proxy');

    // 生成有效的 HMAC 签名 token
    const timestamp = Date.now().toString();
    const encoder = new TextEncoder();
    const keyData = encoder.encode('test-secret-code');
    const key = await crypto.subtle.importKey(
      'raw',
      keyData.buffer as ArrayBuffer,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const data = encoder.encode(timestamp);
    const sigBuffer = await crypto.subtle.sign('HMAC', key, data.buffer as ArrayBuffer);
    const signature = Array.from(new Uint8Array(sigBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const token = `${timestamp}.${signature}`;

    const request = new NextRequest('http://localhost:3000/api/generate-classroom', {
      headers: {
        Cookie: `nova_access=${token}`,
      },
    });

    const response = await proxy(request);
    expect(response.status).toBe(200);
  });

  it('should reject expired tokens', async () => {
    process.env.ACCESS_CODE = 'test-secret-code';
    const { proxy } = await import('@/proxy');

    // 8 天前的 token（超过 7 天有效期）
    const expiredTimestamp = (Date.now() - 8 * 24 * 60 * 60 * 1000).toString();
    const encoder = new TextEncoder();
    const keyData = encoder.encode('test-secret-code');
    const key = await crypto.subtle.importKey(
      'raw',
      keyData.buffer as ArrayBuffer,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const data = encoder.encode(expiredTimestamp);
    const sigBuffer = await crypto.subtle.sign('HMAC', key, data.buffer as ArrayBuffer);
    const signature = Array.from(new Uint8Array(sigBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const token = `${expiredTimestamp}.${signature}`;

    const request = new NextRequest('http://localhost:3000/api/generate-classroom', {
      headers: { Cookie: `nova_access=${token}` },
    });

    const response = await proxy(request);
    expect(response.status).toBe(401);
  });

  it('should reject tokens with invalid signature', async () => {
    process.env.ACCESS_CODE = 'test-secret-code';
    const { proxy } = await import('@/proxy');

    const timestamp = Date.now().toString();
    const token = `${timestamp}.invalid-signature-hex`;

    const request = new NextRequest('http://localhost:3000/api/generate-classroom', {
      headers: { Cookie: `nova_access=${token}` },
    });

    const response = await proxy(request);
    expect(response.status).toBe(401);
  });
});

describe('Edge Proxy — CSRF Protection', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.ACCESS_CODE;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('should allow GET requests without Origin header', async () => {
    const { proxy } = await import('@/proxy');

    const request = new NextRequest('http://localhost:3000/api/some-endpoint');
    const response = await proxy(request);

    expect(response.status).toBe(200);
  });

  it('should allow POST requests without Origin header (non-browser client)', async () => {
    const { proxy } = await import('@/proxy');

    const request = new NextRequest('http://localhost:3000/api/some-endpoint', {
      method: 'POST',
      headers: {},
    });

    const response = await proxy(request);
    expect(response.status).toBe(200);
  });

  it('should allow POST requests with matching Origin header', async () => {
    const { proxy } = await import('@/proxy');

    const request = new NextRequest('http://localhost:3000/api/some-endpoint', {
      method: 'POST',
      headers: {
        origin: 'http://localhost:3000',
      },
    });

    const response = await proxy(request);
    expect(response.status).toBe(200);
  });

  it('should reject POST requests with mismatched Origin header', async () => {
    const { proxy } = await import('@/proxy');

    const request = new NextRequest('http://localhost:3000/api/some-endpoint', {
      method: 'POST',
      headers: {
        origin: 'https://evil.example.com',
      },
    });

    const response = await proxy(request);
    expect(response.status).toBe(403);

    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.errorCode).toBe('FORBIDDEN');
    expect(body.error).toContain('Cross-site');
  });

  it('should reject PUT requests with mismatched Origin header', async () => {
    const { proxy } = await import('@/proxy');

    const request = new NextRequest('http://localhost:3000/api/some-endpoint', {
      method: 'PUT',
      headers: {
        origin: 'https://evil.example.com',
      },
    });

    const response = await proxy(request);
    expect(response.status).toBe(403);
  });

  it('should reject DELETE requests with mismatched Origin header', async () => {
    const { proxy } = await import('@/proxy');

    const request = new NextRequest('http://localhost:3000/api/some-endpoint', {
      method: 'DELETE',
      headers: {
        origin: 'https://evil.example.com',
      },
    });

    const response = await proxy(request);
    expect(response.status).toBe(403);
  });

  it('should reject PATCH requests with mismatched Origin header', async () => {
    const { proxy } = await import('@/proxy');

    const request = new NextRequest('http://localhost:3000/api/some-endpoint', {
      method: 'PATCH',
      headers: {
        origin: 'https://evil.example.com',
      },
    });

    const response = await proxy(request);
    expect(response.status).toBe(403);
  });

  it('should allow NextAuth POST endpoints regardless of Origin (NextAuth has its own CSRF)', async () => {
    const { proxy } = await import('@/proxy');

    const request = new NextRequest('http://localhost:3000/api/auth/signin', {
      method: 'POST',
      headers: {
        origin: 'https://evil.example.com',
      },
    });

    const response = await proxy(request);
    expect(response.status).toBe(200);
  });

  it('should reject requests with malformed Origin header', async () => {
    const { proxy } = await import('@/proxy');

    const request = new NextRequest('http://localhost:3000/api/some-endpoint', {
      method: 'POST',
      headers: {
        origin: 'not-a-valid-url',
      },
    });

    const response = await proxy(request);
    expect(response.status).toBe(403);
  });

  it('should apply CSRF check even when ACCESS_CODE is not set', async () => {
    delete process.env.ACCESS_CODE;
    const { proxy } = await import('@/proxy');

    const request = new NextRequest('http://localhost:3000/api/some-endpoint', {
      method: 'POST',
      headers: {
        origin: 'https://evil.example.com',
      },
    });

    const response = await proxy(request);
    expect(response.status).toBe(403);
  });
});
