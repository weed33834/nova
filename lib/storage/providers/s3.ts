/**
 * S3-compatible object storage provider.
 *
 * Works with AWS S3, Alibaba OSS (S3-compatible mode), Cloudflare R2,
 * MinIO, Backblaze B2, and any service that implements the S3 API.
 *
 * Configuration via environment variables:
 * - S3_ENDPOINT:       Custom endpoint (e.g. https://oss-cn-hangzhou.aliyuncs.com)
 * - S3_REGION:         Region (e.g. us-east-1)
 * - S3_BUCKET:         Bucket name
 * - S3_ACCESS_KEY_ID:  Access key
 * - S3_SECRET_ACCESS_KEY: Secret key
 * - S3_PUBLIC_BASE_URL: Optional CDN/base URL for public access (e.g. https://cdn.example.com)
 *
 * If S3_BUCKET is not set, the provider is inactive and falls back to Noop.
 */
// @aws-sdk/client-s3 为可选依赖：仅 type import（编译期擦除）+ 运行时动态 import（ensureClient）
import type { S3Client } from '@aws-sdk/client-s3';
import type { StorageProvider, StorageType } from '../types';
import { createLogger } from '@/lib/logger';

const log = createLogger('S3Storage');

const PATH_PREFIX: Record<StorageType, string> = {
  media: 'media',
  poster: 'posters',
  audio: 'audio',
};

export class S3StorageProvider implements StorageProvider {
  private client: S3Client | null = null;
  private bucket: string;
  private publicBaseUrl: string;

  constructor() {
    // 不在构造函数初始化 S3Client（依赖可选包 @aws-sdk/client-s3），首次使用时懒加载
    this.bucket = process.env.S3_BUCKET!;
    this.publicBaseUrl = process.env.S3_PUBLIC_BASE_URL || '';
  }

  /** 懒加载 S3Client：未安装可选依赖时给出明确指引 */
  private async ensureClient(): Promise<S3Client> {
    if (this.client) return this.client;
    try {
      const { S3Client } = await import('@aws-sdk/client-s3');
      const region = process.env.S3_REGION || 'us-east-1';
      this.client = new S3Client({
        region,
        endpoint: process.env.S3_ENDPOINT,
        credentials: {
          accessKeyId: process.env.S3_ACCESS_KEY_ID!,
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
        },
        forcePathStyle: !process.env.S3_ENDPOINT?.includes('amazonaws.com'),
      });
      log.info('S3 storage provider initialized', { bucket: this.bucket, region });
      return this.client;
    } catch {
      throw new Error(
        'S3 存储需要可选依赖 @aws-sdk/client-s3，请执行 pnpm add @aws-sdk/client-s3 后重试。',
      );
    }
  }

  private buildKey(hash: string, type: StorageType): string {
    return `${PATH_PREFIX[type]}/${hash}`;
  }

  private buildUrl(key: string): string {
    if (this.publicBaseUrl) {
      return `${this.publicBaseUrl.replace(/\/$/, '')}/${key}`;
    }
    // 回退到 S3 默认 URL 格式
    const endpoint = process.env.S3_ENDPOINT;
    if (endpoint && !endpoint.includes('amazonaws.com')) {
      // 自定义 endpoint（MinIO / OSS 等）使用 path-style
      return `${endpoint.replace(/\/$/, '')}/${this.bucket}/${key}`;
    }
    return `https://${this.bucket}.s3.${process.env.S3_REGION || 'us-east-1'}.amazonaws.com/${key}`;
  }

  async upload(
    hash: string,
    blob: Buffer,
    type: StorageType,
    mimeType?: string,
  ): Promise<string> {
    const key = this.buildKey(hash, type);

    // 去重：已存在则直接返回 URL
    if (await this.exists(hash, type)) {
      return this.buildUrl(key);
    }

    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await this.ensureClient();
    await client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: blob,
        ContentType: mimeType || 'application/octet-stream',
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );

    log.debug('Uploaded to S3', { key, size: blob.length });
    return this.buildUrl(key);
  }

  async exists(hash: string, type: StorageType): Promise<boolean> {
    try {
      const { HeadObjectCommand } = await import('@aws-sdk/client-s3');
      const client = await this.ensureClient();
      await client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: this.buildKey(hash, type),
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  getUrl(hash: string, type: StorageType): string {
    return this.buildUrl(this.buildKey(hash, type));
  }

  async batchExists(hashes: string[], type: StorageType): Promise<Set<string>> {
    // S3 无原生批量 HeadObject，并发检查
    const results = await Promise.all(
      hashes.map(async (hash) => ({ hash, exists: await this.exists(hash, type) })),
    );
    return new Set(results.filter((r) => r.exists).map((r) => r.hash));
  }

  /** 启动时检查 bucket 是否可访问 */
  async healthCheck(): Promise<boolean> {
    try {
      const { HeadBucketCommand } = await import('@aws-sdk/client-s3');
      const client = await this.ensureClient();
      await client.send(
        new HeadBucketCommand({ Bucket: this.bucket }),
      );
      return true;
    } catch (err) {
      log.error('S3 health check failed', err);
      return false;
    }
  }
}
