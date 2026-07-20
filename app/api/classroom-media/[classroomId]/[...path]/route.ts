import { promises as fs, createReadStream } from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { CLASSROOMS_DIR, isValidClassroomId } from '@/lib/server/classroom-storage';
import { createLogger } from '@/lib/logger';
import { apiError } from '@/lib/server/api-response';

const log = createLogger('ClassroomMedia');

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.aac': 'audio/aac',
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ classroomId: string; path: string[] }> },
) {
  const { classroomId, path: pathSegments } = await params;

  // Validate classroomId
  if (!isValidClassroomId(classroomId)) {
    return apiError(
      'INVALID_REQUEST',
      400,
      'Invalid classroom ID.',
      `classroomId="${classroomId}"`,
      'Loading classroom media',
    );
  }

  // Validate path segments — no traversal
  const joined = pathSegments.join('/');
  if (joined.includes('..') || pathSegments.some((s) => s.includes('\0'))) {
    return apiError(
      'INVALID_REQUEST',
      400,
      'Invalid file path.',
      `path="${joined}"`,
      'Loading classroom media',
    );
  }

  // Only allow media/ and audio/ subdirectories
  const subDir = pathSegments[0];
  if (subDir !== 'media' && subDir !== 'audio') {
    return apiError(
      'INVALID_REQUEST',
      404,
      'File not found. Only media/ and audio/ paths are accessible.',
      `subDir="${subDir}"`,
      'Loading classroom media',
    );
  }

  const filePath = path.join(CLASSROOMS_DIR, classroomId, ...pathSegments);
  const resolvedBase = path.resolve(CLASSROOMS_DIR, classroomId);

  try {
    // Resolve symlinks and verify the real path stays within the classroom dir
    const realPath = await fs.realpath(filePath);
    if (!realPath.startsWith(resolvedBase + path.sep) && realPath !== resolvedBase) {
      return apiError(
        'INVALID_REQUEST',
        404,
        'File not found.',
        `path outside classroom dir: ${joined}`,
        'Loading classroom media',
      );
    }

    const stat = await fs.stat(realPath);
    if (!stat.isFile()) {
      return apiError('INVALID_REQUEST', 404, 'File not found.', undefined, 'Loading classroom media');
    }

    const ext = path.extname(realPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // Stream the file to avoid loading large videos into memory
    const stream = createReadStream(realPath);
    const webStream = new ReadableStream({
      start(controller) {
        stream.on('data', (chunk: Buffer | string) => controller.enqueue(chunk));
        stream.on('end', () => controller.close());
        stream.on('error', (err) => controller.error(err));
      },
      cancel() {
        stream.destroy();
      },
    });

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(stat.size),
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return apiError(
        'INVALID_REQUEST',
        404,
        'File not found.',
        `ENOENT: ${joined}`,
        'Loading classroom media',
      );
    }
    log.error(
      `Classroom media serving failed [classroomId=${classroomId}, path=${joined}]:`,
      error,
    );
    return apiError(
      'INTERNAL_ERROR',
      500,
      'Failed to load classroom media file.',
      error instanceof Error ? error.message : String(error),
      `Loading classroom media: ${joined}`,
    );
  }
}
