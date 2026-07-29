import { NoopStorageProvider } from './providers/noop';
import { S3StorageProvider } from './providers/s3';
import type { StorageProvider } from './types';
import { createLogger } from '@/lib/logger';

const log = createLogger('Storage');

let _provider: StorageProvider | null = null;

/**
 * 根据环境变量自动选择存储 provider：
 * - 配置了 S3_BUCKET → S3StorageProvider
 * - 否则 → NoopStorageProvider（回退到 IndexedDB）
 */
export function getStorageProvider(): StorageProvider {
  if (!_provider) {
    if (process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY) {
      _provider = new S3StorageProvider();
      log.info('Using S3-compatible storage provider');
    } else {
      _provider = new NoopStorageProvider();
      log.info('Using noop storage provider (no S3 configured)');
    }
  }
  return _provider;
}

export type { StorageProvider, StorageType } from './types';
