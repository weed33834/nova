'use client';

/**
 * Audio codec utilities — base64 ↔ Blob ↔ Uint8Array conversions shared
 * across TTS, ASR, and voice-registration modules.
 *
 * Consolidates the 8+ copy-pasted `blobToBase64` / `base64ToBlob` /
 * `bytesToBase64` implementations that were scattered across:
 *   - lib/audio/voxcpm-voices.ts
 *   - lib/audio/voice-registration-client.ts
 *   - lib/audio/tts-providers.ts
 *   - lib/audio/voxcpm-registration.ts
 *   - lib/utils/image-storage.ts
 */

/**
 * Convert a Blob to a **raw** base64 string (no `data:` URL prefix).
 *
 * Uses FileReader.readAsDataURL under the hood, then strips the
 * `data:<mime>;base64,` prefix. Rejects on read error.
 *
 * @example
 * const b64 = await blobToBase64(audioBlob);  // => "SGVsbG8g..."
 */
export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('Failed to read blob as base64'));
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIndex = result.indexOf(',');
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}

/**
 * Convert a Blob to a full **data URL** (`data:<mime>;base64,...`).
 *
 * Use this when you need a directly embeddable URL (e.g. `<img src=...>`),
 * as opposed to `blobToBase64` which returns only the raw base64 payload.
 */
export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error || new Error('Failed to read blob as data URL'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Decode a raw base64 string into a Blob with the given MIME type.
 *
 * @param base64 Raw base64 string (no `data:` prefix).
 * @param mimeType Fallback MIME type if the base64 doesn't carry one.
 *
 * @example
 * const blob = base64ToBlob(b64String, 'audio/wav');
 */
export function base64ToBlob(base64: string, mimeType?: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType || 'audio/wav' });
}

/**
 * Convert a Uint8Array / ArrayBuffer to a raw base64 string.
 *
 * Uses `btoa` in the browser and `Buffer.from(...).toString('base64')` in Node.js.
 */
export function bytesToBase64(bytes: Uint8Array | ArrayBuffer): string {
  const view = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  // Node.js path — Buffer is available in Next.js server and edge runtimes.
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(view).toString('base64');
  }
  // Browser path.
  let binary = '';
  for (let i = 0; i < view.length; i++) {
    binary += String.fromCharCode(view[i]);
  }
  return btoa(binary);
}
