/**
 * Pagination utilities for API list endpoints.
 *
 * Standardized cursor-based and offset-based pagination helpers so all list
 * routes return a consistent envelope:
 *
 * ```json
 * {
 *   "success": true,
 *   "items": [...],
 *   "pagination": {
 *     "page": 1,
 *     "pageSize": 20,
 *     "total": 100,
 *     "totalPages": 5,
 *     "hasMore": true
 *   }
 * }
 * ```
 */
import { NextRequest } from 'next/server';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export interface PaginatedResult<T> {
  items: T[];
  pagination: PaginationMeta;
}

/**
 * Extract pagination parameters from a NextRequest's query string.
 *
 * - `page` defaults to 1, minimum 1
 * - `pageSize` defaults to 20, minimum 1, maximum 100
 */
export function extractPagination(req: NextRequest | Request): PaginationParams {
  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(url.searchParams.get('pageSize') || String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE),
  );
  return { page, pageSize };
}

/**
 * Apply offset-based pagination to an array in memory.
 *
 * Use this when the full dataset is already loaded (e.g. from a flat-file
 * store or a small DB query). For large datasets, use SQL LIMIT/OFFSET directly.
 */
export function paginateArray<T>(
  items: T[],
  params: PaginationParams,
): PaginatedResult<T> {
  const { page, pageSize } = params;
  const total = items.length;
  const totalPages = Math.ceil(total / pageSize) || (total > 0 ? 1 : 0);
  const start = (page - 1) * pageSize;
  const end = start + pageSize;

  return {
    items: items.slice(start, end),
    pagination: {
      page,
      pageSize,
      total,
      totalPages,
      hasMore: page < totalPages,
    },
  };
}
