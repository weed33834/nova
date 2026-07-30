/**
 * Truncate a string to `max` characters, appending an ellipsis with the
 * original length so the caller can see how much was cut.
 *
 * Used to keep upstream error bodies (frequently multi-KB HTML error pages
 * on gateway 5xx) out of `Error.message`, which would bloat logs and UI
 * error toasts.
 *
 * @example
 * truncateErrorText('<html>…5KB of error page…</html>')
 * // => '<html>…first 300 chars…... (5120 chars)'
 */
export function truncateErrorText(text: string, max = 300): string {
  return text.length > max ? `${text.slice(0, max)}... (${text.length} chars)` : text;
}

/**
 * Truncate a string to `max` characters, appending a single-character
 * ellipsis (`…`) when truncated.
 *
 * Lightweight truncation for display contexts (log lines, prompt projections,
 * UI labels) where the original length is not needed.
 *
 * @example
 * truncateText('Hello world', 5)  // => 'Hello…'
 */
export function truncateText(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max - 1)) + '…';
}
