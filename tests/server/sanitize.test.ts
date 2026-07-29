import { describe, it, expect } from 'vitest';
import {
  sanitizeRichText,
  sanitizePlainText,
  sanitizeObject,
  containsDangerousHtml,
} from '@/lib/server/sanitize';

describe('Input Sanitization', () => {
  describe('sanitizeRichText', () => {
    it('strips script tags', () => {
      const input = '<p>Hello</p><script>alert("xss")</script>';
      const result = sanitizeRichText(input);
      expect(result).not.toContain('<script');
      expect(result).not.toContain('alert');
      expect(result).toContain('<p>Hello</p>');
    });

    it('strips event handlers', () => {
      const input = '<p onclick="alert(1)">Hello</p>';
      const result = sanitizeRichText(input);
      expect(result).not.toContain('onclick');
      expect(result).toContain('<p>Hello</p>');
    });

    it('strips javascript: URLs', () => {
      const input = '<a href="javascript:alert(1)">Click</a>';
      const result = sanitizeRichText(input);
      expect(result).not.toContain('javascript:');
    });

    it('strips iframe tags', () => {
      const input = '<iframe src="evil.com"></iframe><p>Good</p>';
      const result = sanitizeRichText(input);
      expect(result).not.toContain('<iframe');
      expect(result).toContain('<p>Good</p>');
    });

    it('preserves safe formatting', () => {
      const input = '<p>Hello <strong>world</strong> <em>italic</em></p>';
      const result = sanitizeRichText(input);
      expect(result).toContain('<strong>world</strong>');
      expect(result).toContain('<em>italic</em>');
    });

    it('preserves links with safe URLs', () => {
      const input = '<a href="https://example.com">Link</a>';
      const result = sanitizeRichText(input);
      expect(result).toContain('href="https://example.com"');
      expect(result).toContain('rel="noopener noreferrer"');
    });

    it('preserves images with safe URLs', () => {
      const input = '<img src="https://example.com/img.png" alt="test">';
      const result = sanitizeRichText(input);
      expect(result).toContain('src="https://example.com/img.png"');
      expect(result).toContain('alt="test"');
    });

    it('preserves tables', () => {
      const input = '<table><tr><td>A</td><td>B</td></tr></table>';
      const result = sanitizeRichText(input);
      expect(result).toContain('<table>');
      expect(result).toContain('<td>A</td>');
    });

    it('handles empty input', () => {
      expect(sanitizeRichText('')).toBe('');
      expect(sanitizeRichText(undefined as unknown as string)).toBe('');
      expect(sanitizeRichText(null as unknown as string)).toBe('');
    });
  });

  describe('sanitizePlainText', () => {
    it('strips all HTML tags', () => {
      const input = '<p>Hello <strong>world</strong></p>';
      const result = sanitizePlainText(input);
      expect(result).toBe('Hello world');
    });

    it('strips script tags', () => {
      const input = 'Hello<script>alert(1)</script>';
      const result = sanitizePlainText(input);
      expect(result).toBe('Hello');
    });

    it('handles empty input', () => {
      expect(sanitizePlainText('')).toBe('');
    });
  });

  describe('sanitizeObject', () => {
    it('sanitizes string values in objects', () => {
      const obj = { title: '<b>Safe</b>', content: '<script>evil()</script><p>Good</p>' };
      const result = sanitizeObject(obj);
      expect(result.title).toBe('Safe'); // plain text
      expect(result.content).toContain('Good');
      expect(result.content).not.toContain('<script');
    });

    it('handles nested objects', () => {
      const obj = { outer: { inner: '<script>x()</script>text' } };
      const result = sanitizeObject(obj);
      expect(result.outer.inner).toBe('text');
    });

    it('handles arrays', () => {
      const obj = { items: ['<b>a</b>', '<i>b</i>'] };
      const result = sanitizeObject(obj);
      expect(result.items[0]).toBe('a');
      expect(result.items[1]).toBe('b');
    });

    it('preserves non-string values', () => {
      const obj = { num: 42, bool: true, null: null, arr: [1, 2, 3] };
      const result = sanitizeObject(obj);
      expect(result.num).toBe(42);
      expect(result.bool).toBe(true);
      expect(result.null).toBe(null);
      expect(result.arr).toEqual([1, 2, 3]);
    });

    it('handles null and undefined', () => {
      expect(sanitizeObject(null)).toBe(null);
      expect(sanitizeObject(undefined)).toBe(undefined);
    });

    it('prevents infinite recursion with depth limit', () => {
      const obj: Record<string, unknown> = {};
      let current = obj;
      for (let i = 0; i < 15; i++) {
        current.child = {};
        current = current.child as Record<string, unknown>;
      }
      current.child = 'deep';
      // Should not throw or hang
      const result = sanitizeObject(obj);
      expect(result).toBeDefined();
    });
  });

  describe('containsDangerousHtml', () => {
    it('detects script tags', () => {
      expect(containsDangerousHtml('<script>alert(1)</script>')).toBe(true);
    });

    it('detects javascript: URLs', () => {
      expect(containsDangerousHtml('<a href="javascript:alert(1)">x</a>')).toBe(true);
    });

    it('detects event handlers', () => {
      expect(containsDangerousHtml('<p onclick="alert(1)">x</p>')).toBe(true);
      expect(containsDangerousHtml('<img onerror="alert(1)" src="x">')).toBe(true);
    });

    it('detects iframe tags', () => {
      expect(containsDangerousHtml('<iframe src="evil"></iframe>')).toBe(true);
    });

    it('returns false for safe HTML', () => {
      expect(containsDangerousHtml('<p>Hello world</p>')).toBe(false);
      expect(containsDangerousHtml('<a href="https://example.com">Link</a>')).toBe(false);
      expect(containsDangerousHtml('')).toBe(false);
    });

    it('is case-insensitive', () => {
      expect(containsDangerousHtml('<SCRIPT>alert(1)</SCRIPT>')).toBe(true);
      expect(containsDangerousHtml('<DIV ONCLICK="alert(1)">x</DIV>')).toBe(true);
    });
  });
});
