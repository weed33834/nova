/**
 * 用户配额管理 — 基于用量的访问控制。
 *
 * 在速率限制（短时间窗口）之上，增加月度用量配额。
 * 超限时阻断生成类 API 调用，返回 402 Payment Required。
 *
 * 配额维度：
 * - LLM 调用次数（按月）
 * - 图片生成次数（按月）
 * - 视频生成次数（按月）
 * - TTS 字符数（按月）
 *
 * 配置：
 * - QUOTA_LLM_CALLS: 月度 LLM 调用上限（默认 1000）
 * - QUOTA_IMAGE_GEN: 月度图片生成上限（默认 100）
 * - QUOTA_VIDEO_GEN: 月度视频生成上限（默认 20）
 * - QUOTA_TTS_CHARS: 月度 TTS 字符上限（默认 50000）
 *
 * 管理员不受配额限制。
 */
import { getDb } from '@/lib/db/client';
import { usageRecords } from '@/lib/db/schema';
import { eq, and, gte, sql } from 'drizzle-orm';
import { createLogger } from '@/lib/logger';

const log = createLogger('Quota');

export type QuotaKind = 'llm' | 'image' | 'video' | 'tts';

interface QuotaConfig {
  limit: number;
  label: string;
}

const QUOTA_CONFIG: Record<QuotaKind, QuotaConfig> = {
  llm: { limit: Number(process.env.QUOTA_LLM_CALLS) || 1000, label: 'LLM calls' },
  image: { limit: Number(process.env.QUOTA_IMAGE_GEN) || 100, label: 'Image generations' },
  video: { limit: Number(process.env.QUOTA_VIDEO_GEN) || 20, label: 'Video generations' },
  tts: { limit: Number(process.env.QUOTA_TTS_CHARS) || 50000, label: 'TTS characters' },
};

export interface QuotaStatus {
  kind: QuotaKind;
  used: number;
  limit: number;
  remaining: number;
  exceeded: boolean;
}

/** 获取当前月份的起始时间戳（epoch ms） */
function monthStart(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}

/** 查询用户当月用量 */
export async function getMonthlyUsage(
  userId: string,
  kind: QuotaKind,
): Promise<number> {
  try {
    const db = getDb();
    const start = monthStart();
    const result = await db
      .select({ total: sql<number>`COALESCE(SUM(${usageRecords.quantity}), 0)` })
      .from(usageRecords)
      .where(
        and(
          eq(usageRecords.userId, userId),
          eq(usageRecords.kind, kind),
          gte(usageRecords.createdAt, start),
        ),
      );

    // TTS 按 character 单位统计，其他按次
    if (kind === 'tts') {
      const charResult = await db
        .select({ total: sql<number>`COALESCE(SUM(${usageRecords.inputTokens} + ${usageRecords.outputTokens}), 0)` })
        .from(usageRecords)
        .where(
          and(
            eq(usageRecords.userId, userId),
            eq(usageRecords.kind, sql`'tts'`),
            gte(usageRecords.createdAt, start),
          ),
        );
      return Number(charResult[0]?.total || 0);
    }

    return Number(result[0]?.total || 0);
  } catch (err) {
    log.error('Failed to query monthly usage', err);
    return 0;
  }
}

/** 检查用户是否超出配额 */
export async function checkQuota(
  userId: string,
  kind: QuotaKind,
  userRole?: string,
): Promise<QuotaStatus> {
  const config = QUOTA_CONFIG[kind];

  // 管理员不受限
  if (userRole === 'admin') {
    return { kind, used: 0, limit: Infinity, remaining: Infinity, exceeded: false };
  }

  const used = await getMonthlyUsage(userId, kind);
  const exceeded = used >= config.limit;

  return {
    kind,
    used,
    limit: config.limit,
    remaining: Math.max(0, config.limit - used),
    exceeded,
  };
}

/** 批量检查所有配额 */
export async function checkAllQuotas(
  userId: string,
  userRole?: string,
): Promise<Record<QuotaKind, QuotaStatus>> {
  const [llm, image, video, tts] = await Promise.all([
    checkQuota(userId, 'llm', userRole),
    checkQuota(userId, 'image', userRole),
    checkQuota(userId, 'video', userRole),
    checkQuota(userId, 'tts', userRole),
  ]);

  return { llm, image, video, tts };
}

/** 记录用量 */
export async function recordUsage(
  userId: string | null,
  kind: QuotaKind,
  providerId: string,
  modelId: string,
  quantity: number = 1,
  metadata?: { inputTokens?: number; outputTokens?: number; modelString?: string },
): Promise<void> {
  try {
    const db = getDb();
    await db.insert(usageRecords).values({
      createdAt: Date.now(),
      kind,
      source: 'api',
      providerId,
      modelId,
      modelString: metadata?.modelString || modelId,
      inputTokens: metadata?.inputTokens || 0,
      outputTokens: metadata?.outputTokens || 0,
      quantity,
      unit: kind === 'tts' ? 'character' : kind === 'image' ? 'image' : kind === 'video' ? 'second' : 'token',
      userId: userId || undefined,
    });
  } catch (err) {
    log.error('Failed to record usage', err);
  }
}
