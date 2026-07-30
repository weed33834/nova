/**
 * HTML utility helpers — shared across the codebase to eliminate
 * the 8+ copy-pasted `stripHtml` / `escapeHtml` implementations.
 */

/**
 * Remove all HTML tags from a string, returning plain text.
 *
 * Tags are replaced with a space (not deleted) so adjacent block-level
 * elements don't merge their text content. Multiple whitespace runs are
 * collapsed to a single space.
 *
 * @example
 * stripHtml('<p>Hello <b>world</b></p>')  // => 'Hello world'
 */
export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Escape HTML special characters for safe interpolation into HTML markup
 * or attribute values.
 *
 * Escapes: `&`, `<`, `>`, `"`, `'`
 *
 * @example
 * escapeHtml('<script>alert("xss")</script>')
 * // => '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
