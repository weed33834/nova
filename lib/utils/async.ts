/**
 * Async utility helpers — shared across the codebase to eliminate
 * the 6+ copy-pasted `delay` / `sleep` implementations.
 */

/**
 * Resolve after `ms` milliseconds. Non-rejecting, so safe to use with
 * `Promise.race` for timeout patterns.
 *
 * @example
 * await delay(500);          // wait 500ms
 * await Promise.race([       // timeout pattern
 *   fetch(url),
 *   delay(5000).then(() => { throw new Error('timeout'); }),
 * ]);
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Alias for `delay` — matches the `sleep` naming convention used in some modules. */
export const sleep = delay;

/**
 * Race a promise against a timeout. Rejects with `Error("timed out after Xms")`
 * if the promise doesn't settle within `ms` milliseconds. The timer is always
 * cleaned up, even if the promise settles first.
 *
 * @example
 * await withTimeout(someAsyncWork(), 5000);
 */
export async function withTimeout(work: Promise<void>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
