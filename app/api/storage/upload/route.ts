/**
 * 对象存储上传路由 — 内容哈希去重，返回 CDN URL。
 *
 * 未配置外部存储时走 NoopStorageProvider，返回空字符串；前端
 * uploadBlobToStorage 拿到空串视为未配置，回退到 IndexedDB 本地存储。
 * 这避免了"前端调用、后端 404、用户看不到错误"的静默失败链路。
 */
import { NextRequest } from 'next/server';
import { apiSuccess, apiError } from '@/lib/server/api-response';
import { withApiHandler } from '@/lib/server/api-handler';
import { getStorageProvider } from '@/lib/storage';

export const runtime = 'nodejs';

export const POST = withApiHandler(async (req: NextRequest) => {
  const contentType = req.headers.get('content-type') || '';
  if (!contentType.includes('multipart/form-data')) {
    return apiError(
      'INVALID_REQUEST',
      400,
      `Invalid Content-Type: expected multipart/form-data, got "${contentType}"`,
    );
  }

  const formData = await req.formData();
  const hash = formData.get('hash');
  const type = formData.get('type');
  const file = formData.get('file');

  if (typeof hash !== 'string' || !hash) {
    return apiError('MISSING_REQUIRED_FIELD', 400, 'Missing "hash" field');
  }
  if (type !== 'media' && type !== 'audio' && type !== 'poster') {
    return apiError(
      'INVALID_REQUEST',
      400,
      `Invalid "type": expected media|audio|poster, got "${type}"`,
    );
  }
  if (!(file instanceof File)) {
    return apiError('MISSING_REQUIRED_FIELD', 400, 'Missing "file" field');
  }

  // 防止大文件撑爆内存（Buffer.from 会全量加载到内存）
  const MAX_UPLOAD_SIZE = 25 * 1024 * 1024; // 25 MB
  if (file.size > MAX_UPLOAD_SIZE) {
    return apiError(
      'INVALID_REQUEST',
      413,
      `File too large: ${(file.size / 1024 / 1024).toFixed(1)} MB (max ${MAX_UPLOAD_SIZE / 1024 / 1024} MB)`,
    );
  }

  try {
    const provider = getStorageProvider();
    const buffer = Buffer.from(await file.arrayBuffer());
    const url = await provider.upload(hash, buffer, type, file.type || undefined);
    // NoopStorageProvider 返回空串，表示存储未配置；前端据此回退本地存储。
    return apiSuccess({ url });
  } catch (err) {
    return apiError(
      'INTERNAL_ERROR',
      500,
      err instanceof Error ? err.message : 'Storage upload failed',
    );
  }
}, { rateLimit: 'media' });
