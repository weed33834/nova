/**
 * Converts Azure portal endpoints into the base URL expected by @ai-sdk/azure.
 *
 * Azure commonly displays a full inference URL ending in `/chat/completions`,
 * while the SDK expects the prefix and appends that operation path itself.
 * Classic Azure OpenAI hosts also require `/openai`, but the SDK adds `/v1`
 * for those hosts, unlike Azure AI Foundry `services.ai.azure.com` endpoints.
 */
export function normalizeAzureBaseUrl(baseUrl?: string): string | undefined {
  const value = baseUrl?.trim();
  if (!value) return undefined;

  // User-supplied baseUrl may not be a valid URL (typos, missing scheme,
  // pasting just a region name). `new URL` throws TypeError on those —
  // return the original value so the caller can surface a friendly error
  // rather than crashing the whole model-creation flow.
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    // If it looks like a bare hostname (no scheme), retry with https://
    // so users can type "my-resource.openai.azure.com" without a scheme.
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value) && /\./.test(value)) {
      try {
        url = new URL(`https://${value}`);
      } catch {
        return value;
      }
    } else {
      return value;
    }
  }
  url.search = '';
  url.hash = '';

  let path = url.pathname.replace(/\/+$/, '');
  path = path.replace(/\/(?:chat\/completions|responses)$/i, '');
  path = path.replace(/\/deployments\/[^/]+$/i, '');

  if (url.hostname.endsWith('.openai.azure.com')) {
    path = path.replace(/\/v1$/i, '');
    if (!path) path = '/openai';
  }

  url.pathname = path || '/';
  return url.toString().replace(/\/$/, '');
}
