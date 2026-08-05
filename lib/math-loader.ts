/**
 * KaTeX / Temml 懒加载器（可选依赖，math 能力）。
 *
 * 设计：fire-and-forget 预加载 + 同步缓存访问。
 *  - 完整安装（已装 katex/temml）：模块加载后几 ms 完成预取，同步访问立即可用。
 *  - core-only（未装）：预取失败缓存 null，同步访问返回 null → 调用方降级（原样文本）。
 *
 * 适用场景：无法 await 的同步渲染路径（scene-generator / latex-to-omml）。
 * 可在 async 路径直接使用的地方（engine.ts），优先 `await import()` 更直接。
 */

// ─── KaTeX ───────────────────────────────────────────────────────────────────
type KatexModule = typeof import('katex')['default'];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let katexCached: KatexModule | null | undefined;
let katexPromise: Promise<void> | null = null;

/** 返回 katex 模块（未安装或加载中返回 null）。 */
export function getKatex(): KatexModule | null {
  if (katexCached !== undefined) return katexCached;
  if (!katexPromise) {
    katexPromise = import('katex')
      .then((m) => {
        katexCached = m.default;
      })
      .catch(() => {
        katexCached = null;
      });
  }
  return katexCached ?? null;
}

/** 模块加载时预取 katex（fire-and-forget）。 */
export function preloadKatex(): void {
  getKatex();
}

/** 等待 katex 加载完成（用于 async 路径）。返回模块或 null（未安装）。 */
export async function ensureKatex(): Promise<KatexModule | null> {
  if (katexCached !== undefined) return katexCached;
  if (!katexPromise) {
    katexPromise = import('katex')
      .then((m) => {
        katexCached = m.default;
      })
      .catch(() => {
        katexCached = null;
      });
  }
  await katexPromise;
  return katexCached ?? null;
}

// ─── Temml ───────────────────────────────────────────────────────────────────
type TemmlModule = typeof import('temml')['default'];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let temmlCached: TemmlModule | null | undefined;
let temmlPromise: Promise<void> | null = null;

/** 返回 temml 模块（未安装或加载中返回 null）。 */
export function getTemml(): TemmlModule | null {
  if (temmlCached !== undefined) return temmlCached;
  if (!temmlPromise) {
    temmlPromise = import('temml')
      .then((m) => {
        temmlCached = m.default;
      })
      .catch(() => {
        temmlCached = null;
      });
  }
  return temmlCached ?? null;
}

/** 模块加载时预取 temml。 */
export function preloadTemml(): void {
  getTemml();
}
