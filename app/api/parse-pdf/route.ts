import { NextRequest } from 'next/server';
import {
  isServerConfiguredProvider,
  resolvePDFApiKey,
  resolvePDFBaseUrl,
} from '@/lib/server/provider-config';
import type { PDFProviderId } from '@/lib/pdf/types';
import type { ParsedPdfContent } from '@/lib/types/pdf';
import { documentArtifactToParsedPdfContent, extractDocument } from '@/lib/document';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { sanitizedErrorDetails } from '@/lib/server/llm-error-response';
import { validateUrlForSSRF } from '@/lib/server/ssrf-guard';
const log = createLogger('Parse PDF');

// Mirror extract-document's per-file cap: arrayBuffer() loads the whole upload
// into memory as a Buffer, so an unbounded upload would let a single request
// OOM the process. 50MB matches the sibling route and is well above any real
// course material.
const MAX_PDF_FILE_SIZE_BYTES = 50 * 1024 * 1024;

// PDF extraction (esp. AliDocMind/MinerU round-trips) can take well past the
// default Vercel timeout; pin an explicit ceiling so the function isn't killed
// mid-parse on managed platforms.
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  let pdfFileName: string | undefined;
  let resolvedProviderId: string | undefined;
  try {
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      log.error('Invalid Content-Type for PDF upload:', contentType);
      return apiError(
        'INVALID_REQUEST',
        400,
        `Invalid Content-Type: expected multipart/form-data, got "${contentType}"`,
      );
    }

    const formData = await req.formData();
    const pdfFile = formData.get('pdf') as File | null;
    const providerId = formData.get('providerId') as PDFProviderId | null;
    const apiKey = formData.get('apiKey') as string | null;
    const baseUrl = formData.get('baseUrl') as string | null;

    if (!pdfFile) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'No PDF file provided');
    }

    // providerId is required from the client — no server-side store to fall back to
    const effectiveProviderId = providerId || ('unpdf' as PDFProviderId);
    pdfFileName = pdfFile?.name;
    resolvedProviderId = effectiveProviderId;

    // Reject oversized uploads before arrayBuffer() materializes the full file
    // into a heap Buffer (OOM protection — same boundary extract-document enforces).
    if (pdfFile.size > MAX_PDF_FILE_SIZE_BYTES) {
      return apiError(
        'INVALID_REQUEST',
        413,
        `PDF file is too large. Maximum size is ${Math.floor(
          MAX_PDF_FILE_SIZE_BYTES / 1024 / 1024,
        )}MB.`,
      );
    }

    // Managed providers are admin-owned: ignore any client-sent key/baseUrl.
    const managed = isServerConfiguredProvider('pdf', effectiveProviderId);
    const clientBaseUrl = managed ? undefined : baseUrl || undefined;
    if (clientBaseUrl && process.env.NODE_ENV === 'production') {
      const ssrfError = await validateUrlForSSRF(clientBaseUrl);
      if (ssrfError) {
        return apiError('INVALID_URL', 403, ssrfError);
      }
    }

    const config = {
      providerId: effectiveProviderId,
      apiKey: resolvePDFApiKey(effectiveProviderId, managed ? undefined : apiKey || undefined),
      baseUrl: resolvePDFBaseUrl(effectiveProviderId, clientBaseUrl),
    };

    // Convert PDF to buffer
    const arrayBuffer = await pdfFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Route the existing PDF API through the document extraction boundary.
    const artifact = await extractDocument({
      buffer,
      fileName: pdfFile.name,
      fileSize: pdfFile.size,
      mimeType: 'application/pdf',
      config,
    });
    const result = documentArtifactToParsedPdfContent(artifact);

    // Add file metadata
    const resultWithMetadata: ParsedPdfContent = {
      ...result,
      metadata: {
        ...result.metadata,
        pageCount: result.metadata?.pageCount ?? 0, // Ensure pageCount is always a number
        fileName: pdfFile.name,
        fileSize: pdfFile.size,
      },
    };

    return apiSuccess({ data: resultWithMetadata });
  } catch (error) {
    log.error(
      `PDF parsing failed [provider=${resolvedProviderId ?? 'unknown'}, file="${pdfFileName ?? 'unknown'}"]:`,
      error,
    );
    return apiError(
      'PARSE_FAILED',
      500,
      'PDF parsing failed. Please try again.',
      sanitizedErrorDetails(error),
    );
  }
}
