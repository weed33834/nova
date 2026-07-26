/**
 * JSON parsing with fallback strategies for AI-generated responses.
 */

import { jsonrepair } from 'jsonrepair';
import { createLogger } from '@/lib/logger';
const log = createLogger('Generation');

function repairQuotedPropertyFragments(jsonStr: string): string {
  return jsonStr.replace(
    /([,{]\s*)"([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(true|false|null|[+-]?\d+(?:\.\d+)?)"(?=\s*[,}])/g,
    (_match, prefix, key, value) => `${prefix}"${key}": ${value}`,
  );
}

function logJsonParseError(stage: string, jsonStr: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const positionMatch = message.match(/position\s+(\d+)/i);
  const position = positionMatch ? Number(positionMatch[1]) : undefined;

  if (typeof position === 'number' && Number.isFinite(position)) {
    const start = Math.max(0, position - 120);
    const end = Math.min(jsonStr.length, position + 120);
    log.warn(
      `${stage} parse error at position ${position}: ${message}. Context: ${jsonStr
        .slice(start, end)
        .replace(/\n/g, '\\n')}`,
    );
    return;
  }

  log.warn(`${stage} parse error: ${message}`);
}

export function parseJsonResponse<T>(response: string): T | null {
  const exactParsed = tryParseExactJson<T>(response);
  if (exactParsed !== null) return exactParsed;

  const cleanedResponse = stripReasoningPrefix(response);
  if (cleanedResponse !== response.trim()) {
    const parsedCleaned = parseJsonResponseCandidate<T>(cleanedResponse);
    if (parsedCleaned !== null) return parsedCleaned;
  }

  const parsed = parseJsonResponseCandidate<T>(response);
  if (parsed !== null) return parsed;

  // Downgraded from error→warn: this is a recoverable parse failure, not a
  // crash. Truncated to 200 chars each (from 500) because LLM output may
  // echo user-submitted document text and shouldn't flood the logs.
  log.warn('Failed to parse JSON from response');
  log.warn('Raw response (first 200 chars):', cleanedResponse.substring(0, 200));
  log.warn(
    'Raw response (last 200 chars):',
    cleanedResponse.substring(Math.max(0, cleanedResponse.length - 200)),
  );

  return null;
}

function tryParseExactJson<T>(response: string): T | null {
  try {
    return JSON.parse(response.trim()) as T;
  } catch {
    return null;
  }
}

function stripReasoningPrefix(response: string): string {
  const trimmed = response.trim();
  const matches = [...trimmed.matchAll(/<\/(?:think|thinking|reasoning)>\s*/gi)];
  const lastMatch = matches.at(-1);

  if (!lastMatch || lastMatch.index === undefined) return trimmed;

  return trimmed.slice(lastMatch.index + lastMatch[0].length).trim();
}

function parseJsonResponseCandidate<T>(response: string): T | null {
  const cleanedResponse = response.trim();

  // Strategy 1: Try to extract JSON from markdown code blocks (may have multiple)
  const codeBlockMatches = cleanedResponse.matchAll(/```(?:json)?\s*([\s\S]*?)```/g);
  for (const match of codeBlockMatches) {
    const extracted = match[1].trim();
    // Only try if it looks like JSON (starts with { or [)
    if (extracted.startsWith('{') || extracted.startsWith('[')) {
      const result = tryParseJson<T>(extracted);
      if (result !== null) {
        log.debug('Successfully parsed JSON from code block');
        return result;
      }
    }
  }

  // Strategy 2: Try to find JSON structure directly in response (no code block)
  // Look for array or object start
  const jsonStartArray = cleanedResponse.indexOf('[');
  const jsonStartObject = cleanedResponse.indexOf('{');

  if (jsonStartArray !== -1 || jsonStartObject !== -1) {
    // Prefer the structure that appears first
    const startIndex =
      jsonStartArray === -1
        ? jsonStartObject
        : jsonStartObject === -1
          ? jsonStartArray
          : Math.min(jsonStartArray, jsonStartObject);

    // Find the matching close bracket
    let depth = 0;
    let endIndex = -1;
    let inString = false;
    let escapeNext = false;

    for (let i = startIndex; i < cleanedResponse.length; i++) {
      const char = cleanedResponse[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === '\\' && inString) {
        escapeNext = true;
        continue;
      }

      if (char === '"' && !escapeNext) {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === '[' || char === '{') depth++;
        else if (char === ']' || char === '}') {
          depth--;
          if (depth === 0) {
            endIndex = i;
            break;
          }
        }
      }
    }

    if (endIndex !== -1) {
      const jsonStr = cleanedResponse.substring(startIndex, endIndex + 1);
      const result = tryParseJson<T>(jsonStr);
      if (result !== null) {
        log.debug('Successfully parsed JSON from response body');
        return result;
      }
    }
  }

  // Strategy 3: Last resort - try the whole response
  const result = tryParseJson<T>(cleanedResponse.trim());
  if (result !== null) {
    log.debug('Successfully parsed raw response as JSON');
    return result;
  }

  return null;
}

/**
 * Try to parse JSON with various fixes for common AI response issues
 */
export function tryParseJson<T>(jsonStr: string): T | null {
  // Attempt 0: Try parsing as-is
  try {
    return JSON.parse(jsonStr) as T;
  } catch (error) {
    logJsonParseError('Attempt 0', jsonStr, error);
    // Continue to fix attempts
  }

  // Attempt 0.5: Repair unescaped double quotes inside HTML string values.
  // The slide-content LLM often emits content like:
  //   "content":"<p style=\"font-size:20px;\">光合作用"光反应"阶段</p>"
  // where the unescaped " around 光反应 prematurely terminates the JSON string.
  // We walk the input with a tolerant scanner: when inside a string value,
  // a `"` is only treated as the string terminator if it is followed (after
  // optional whitespace) by `,`, `}`, `]`, or `:`. Any other `"` is re-escaped
  // as `\"`. This is conservative — it only triggers when strict parsing fails.
  const htmlQuoteRepaired = repairUnescapedQuotesInHtmlStrings(jsonStr);
  if (htmlQuoteRepaired !== jsonStr) {
    try {
      const result = JSON.parse(htmlQuoteRepaired) as T;
      log.warn('Repaired unescaped double quotes inside HTML string values');
      return result;
    } catch (error) {
      logJsonParseError('Attempt 0.5', htmlQuoteRepaired, error);
      // Continue to the original fix attempts below, using the repaired text
      // as input (it may still need LaTeX / truncation fixes).
    }
  }

  // Use the HTML-quote-repaired text as the base for subsequent attempts —
  // those attempts do their own string-level fixes that are orthogonal to
  // unescaped quote repair, and starting from the repaired text gives them
  // a cleaner input.
  const workingStr = htmlQuoteRepaired !== jsonStr ? htmlQuoteRepaired : jsonStr;

  // Attempt 1: Try parsing the (possibly repaired) input as-is
  try {
    return JSON.parse(workingStr) as T;
  } catch (error) {
    logJsonParseError('Attempt 1', workingStr, error);
    // Continue to fix attempts
  }

  // Attempt 2: Fix common JSON issues from AI responses
  try {
    let fixed = workingStr;

    // Fix 0: Recover malformed property fragments that were accidentally
    // emitted as standalone strings inside an object, such as:
    // `"height: 76"` -> `"height": 76`
    // `"fixedRatio: false"` -> `"fixedRatio": false`
    // The object-context prefix/suffix guards keep valid JSON strings intact.
    fixed = repairQuotedPropertyFragments(fixed);

    // Fix 1: Handle LaTeX-style escapes that break JSON (e.g., \frac, \left, \right, \times, etc.)
    // These are common in math content and need to be double-escaped
    // Match backslash followed by letters (LaTeX commands) inside strings,
    // but skip valid JSON escape sequences (\b, \f, \n, \r, \t, \u)
    fixed = fixed.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/g, (_match, content) => {
      // Double-escape backslash+letter ONLY for non-JSON-escape letters
      const fixedContent = content.replace(/\\([a-zA-Z])/g, (_m: string, ch: string) => {
        // Preserve valid JSON escape sequences
        if ('bfnrtu'.includes(ch)) return `\\${ch}`;
        return `\\\\${ch}`;
      });
      return `"${fixedContent}"`;
    });

    // Fix 2: Fix other invalid escape sequences (e.g., \S, \L, etc.)
    // Valid JSON escapes: \", \\, \/, \b, \f, \n, \r, \t, \uXXXX
    fixed = fixed.replace(/\\([^"\\\/bfnrtu\n\r])/g, (match, char) => {
      // If it's a letter, it's likely a LaTeX command
      if (/[a-zA-Z]/.test(char)) {
        return '\\\\' + char;
      }
      return match;
    });

    // Fix 3: Try to fix truncated JSON arrays/objects
    const trimmed = fixed.trim();
    if (trimmed.startsWith('[') && !trimmed.endsWith(']')) {
      const lastCompleteObj = fixed.lastIndexOf('}');
      if (lastCompleteObj > 0) {
        fixed = fixed.substring(0, lastCompleteObj + 1) + ']';
        log.warn('Fixed truncated JSON array');
      }
    } else if (trimmed.startsWith('{') && !trimmed.endsWith('}')) {
      // Try to close incomplete object
      const openBraces = (fixed.match(/{/g) || []).length;
      const closeBraces = (fixed.match(/}/g) || []).length;
      if (openBraces > closeBraces) {
        fixed += '}'.repeat(openBraces - closeBraces);
        log.warn('Fixed truncated JSON object');
      }
    }

    return JSON.parse(fixed) as T;
  } catch (error) {
    logJsonParseError('Attempt 2', workingStr, error);
    // Continue to next attempt
  }

  // Attempt 3: Use jsonrepair to fix malformed JSON (e.g. unescaped quotes in Chinese text)
  try {
    const repaired = jsonrepair(workingStr);
    return JSON.parse(repaired) as T;
  } catch (error) {
    logJsonParseError('Attempt 3', workingStr, error);
    // Continue to next attempt
  }

  // Attempt 4: More aggressive fixing - remove control characters
  try {
    let fixed = workingStr;

    // Remove or escape control characters
    fixed = fixed.replace(/[\x00-\x1F\x7F]/g, (char) => {
      switch (char) {
        case '\n':
          return '\\n';
        case '\r':
          return '\\r';
        case '\t':
          return '\\t';
        default:
          return '';
      }
    });

    return JSON.parse(fixed) as T;
  } catch (error) {
    logJsonParseError('Attempt 4', workingStr, error);
    return null;
  }
}

/**
 * Repair unescaped double quotes inside JSON string values that contain HTML.
 *
 * The slide-content LLM occasionally emits JSON like:
 *   "content":"<p style=\"font-size:20px;\">光合作用"光反应"阶段</p>"
 * where the unescaped " around 光反应 prematurely terminates the JSON string.
 *
 * Strategy: walk the input with a tolerant scanner. When inside a string value
 * (after seeing `:` `"`), a `"` is only treated as the string terminator if
 * the next non-whitespace character is a JSON structural delimiter (`,`, `}`,
 * `]`, or `:`). Any other `"` is re-escaped as `\"`.
 *
 * This is conservative — it only changes the input when a `"` inside a string
 * is followed by something that is clearly not a JSON delimiter, which is the
 * signature of an unescaped quote in the content. Valid JSON is passed through
 * unchanged because in valid JSON a string-terminating `"` is always followed
 * by a delimiter.
 */
function repairUnescapedQuotesInHtmlStrings(input: string): string {
  let out = '';
  let i = 0;
  let inString = false;
  let modified = false;
  // Track whether the current string value looks like HTML (starts with `<`
  // after the opening quote). Only repair quotes inside HTML-ish strings to
  // avoid misinterpreting punctuation in plain-text values.
  let stringLooksLikeHtml = false;
  let stringContentStart = -1;

  while (i < input.length) {
    const ch = input[i];

    if (!inString) {
      // Detect the start of a string value: a `"` that comes after a `:`
      // (with optional whitespace between). Property-name strings (before
      // the `:`) are left untouched — their closing `"` is always followed
      // by `:`, which is a delimiter, so the tolerant logic below would
      // never need to re-escape inside them anyway.
      if (ch === '"') {
        inString = true;
        stringLooksLikeHtml = false;
        stringContentStart = i + 1;
        out += ch;
        i++;
        continue;
      }
      out += ch;
      i++;
      continue;
    }

    // Inside a string.
    if (ch === '\\') {
      // Preserve escape sequences verbatim — including `\"`, which is a
      // legitimately escaped quote inside the string.
      out += ch;
      if (i + 1 < input.length) {
        out += input[i + 1];
        i += 2;
      } else {
        i++;
      }
      continue;
    }

    if (ch === '"') {
      // Tentative string terminator. Peek ahead: if the next non-whitespace
      // char is a JSON delimiter, this is a real terminator. Otherwise it's
      // an unescaped quote inside the content — re-escape it.
      let k = i + 1;
      while (k < input.length && /\s/.test(input[k])) k++;
      const nextCh = k < input.length ? input[k] : '';
      const isDelimiter =
        nextCh === ',' || nextCh === '}' || nextCh === ']' || nextCh === ':';

      if (isDelimiter) {
        // Real terminator — close the string.
        inString = false;
        out += ch;
        i++;
        continue;
      }

      // Unescaped quote inside the string. Check if the string so far looks
      // like HTML (to avoid touching plain-text strings). We only mark it as
      // HTML if the first non-whitespace content after the opening quote is
      // `<` (an HTML tag).
      if (stringContentStart >= 0) {
        let s = stringContentStart;
        while (s < i && /\s/.test(input[s])) s++;
        if (s < i && input[s] === '<') {
          stringLooksLikeHtml = true;
        }
        stringContentStart = -1; // only check once
      }

      if (stringLooksLikeHtml) {
        // Re-escape this `"` as `\"` so it doesn't terminate the string.
        out += '\\"';
        modified = true;
        i++;
        continue;
      }

      // Not an HTML string — still treat as terminator to avoid false
      // positives in plain-text values. If this is wrong, later repair
      // attempts (jsonrepair) will try to fix it.
      inString = false;
      out += ch;
      i++;
      continue;
    }

    out += ch;
    i++;
  }

  return modified ? out : input;
}
