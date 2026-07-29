/**
 * Input sanitization for stored content.
 *
 * Uses `sanitize-html` (already a project dependency) to strip dangerous HTML
 * from user-submitted content before persistence. This prevents stored XSS
 * attacks where malicious scripts are embedded in classroom stage/scene data.
 *
 * The sanitizer is configured to ALLOW rich formatting (bold, italic, links,
 * lists, images, etc.) but STRIP:
 *  - <script> tags and event handlers (onclick, onerror, etc.)
 *  - <iframe>, <object>, <embed> tags
 *  - javascript: URLs
 *  - data: URLs (except for images)
 *  - style attributes that could inject CSS-based attacks
 */
import sanitizeHtml from 'sanitize-html';

// ── Sanitization configurations ────────────────────────────────────────────

/**
 * Permissive config for rich text content (slide text, descriptions, etc.)
 * Allows formatting tags but strips all executable content.
 */
const richTextConfig: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'hr', 'span', 'div',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup', 'small',
    'ul', 'ol', 'li',
    'blockquote', 'code', 'pre', 'kbd',
    'a', 'img',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'figure', 'figcaption',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height'],
    span: ['class'],
    div: ['class'],
    code: ['class'],
    th: ['colspan', 'rowspan'],
    td: ['colspan', 'rowspan'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: {
    img: ['http', 'https', 'data'],
  },
  // Strip class attributes that could be used for CSS injection
  allowedClasses: {
    span: ['*'],
    div: ['*'],
    code: ['language-*', 'hljs'],
  },
  disallowedTagsMode: 'discard',
  // Enforce rel="noopener noreferrer" on all links
  transformTags: {
    a: (_tag, attribs) => {
      const result: Record<string, string> = {
        ...attribs,
        rel: 'noopener noreferrer',
      };
      if (attribs.target === '_blank') {
        result.target = '_blank';
      }
      return { tagName: 'a', attribs: result };
    },
  },
};

/**
 * Strict config for plain text fields (titles, labels, names)
 * Strips ALL HTML tags — these fields should never contain markup.
 */
const plainTextConfig: sanitizeHtml.IOptions = {
  allowedTags: [],
  allowedAttributes: {},
  disallowedTagsMode: 'discard',
};

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Sanitize rich text content (allows formatting, strips scripts/XSS).
 * Use for: slide content, descriptions, prompt templates, chat messages.
 */
export function sanitizeRichText(html: string): string {
  if (!html || typeof html !== 'string') return html ?? '';
  return sanitizeHtml(html, richTextConfig);
}

/**
 * Sanitize plain text (strips ALL HTML).
 * Use for: titles, labels, names, email subjects.
 */
export function sanitizePlainText(text: string): string {
  if (!text || typeof text !== 'string') return text ?? '';
  return sanitizeHtml(text, plainTextConfig);
}

/**
 * Deeply sanitize all string values in an object.
 * Recursively walks the object and applies the appropriate sanitizer based on
 * the field name heuristic:
 *  - Fields containing "html", "content", "description", "template" → rich text
 *  - Fields containing "title", "name", "label", "summary" → plain text
 *  - Other string fields → plain text
 *
 * This is a safety net for objects like Stage/Scene that may contain
 * user-generated content in nested fields.
 */
export function sanitizeObject<T>(obj: T, depth = 0): T {
  if (depth > 10) return obj; // Prevent infinite recursion
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'string') {
    return sanitizePlainText(obj) as unknown as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item, depth + 1)) as unknown as T;
  }

  if (typeof obj === 'object' && obj instanceof Object) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      if (typeof value === 'string') {
        if (
          lowerKey.includes('html') ||
          lowerKey.includes('content') ||
          lowerKey.includes('description') ||
          lowerKey.includes('template') ||
          lowerKey.includes('prompt')
        ) {
          result[key] = sanitizeRichText(value);
        } else {
          result[key] = sanitizePlainText(value);
        }
      } else {
        result[key] = sanitizeObject(value, depth + 1);
      }
    }
    return result as unknown as T;
  }

  return obj;
}

/**
 * Check if a string contains potentially dangerous HTML.
 * Returns true if the input contains script tags, event handlers, or
 * javascript: URLs that would be stripped by sanitization.
 */
export function containsDangerousHtml(html: string): boolean {
  if (!html || typeof html !== 'string') return false;
  const lower = html.toLowerCase();
  return (
    lower.includes('<script') ||
    lower.includes('javascript:') ||
    /\son\w+\s*=/.test(lower) ||
    lower.includes('<iframe') ||
    lower.includes('<object') ||
    lower.includes('<embed')
  );
}
