'use client';

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let i = 0; i < value.length; i++) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
}

export function audioBufferToMonoWav(audioBuffer: AudioBuffer): ArrayBuffer {
  const sampleRate = audioBuffer.sampleRate;
  const sampleCount = audioBuffer.length;
  const dataSize = sampleCount * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  const channels = Array.from({ length: audioBuffer.numberOfChannels }, (_, index) =>
    audioBuffer.getChannelData(index),
  );
  let offset = 44;
  for (let i = 0; i < sampleCount; i++) {
    let mixed = 0;
    for (const channel of channels) mixed += channel[i];
    const sample = Math.max(-1, Math.min(1, mixed / channels.length));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }

  return buffer;
}

export function isWavBlob(blob: Blob, fileName?: string): boolean {
  return (
    blob.type.includes('audio/wav') ||
    blob.type.includes('audio/x-wav') ||
    /\.wav$/i.test(fileName || '')
  );
}

/**
 * Decode an audio Blob into an AudioBuffer using the browser's Web Audio API.
 *
 * Throws if called outside a browser or if the browser lacks AudioContext.
 * The caller is responsible for closing the AudioContext — this function
 * creates a temporary one and closes it automatically.
 */
export async function decodeAudioBlob(blob: Blob): Promise<AudioBuffer> {
  if (typeof window === 'undefined') {
    throw new Error('Audio decoding requires a browser environment');
  }
  const AudioContextConstructor =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) {
    throw new Error('This browser does not support audio conversion');
  }

  const audioContext = new AudioContextConstructor();
  try {
    const arrayBuffer = await blob.arrayBuffer();
    return await audioContext.decodeAudioData(arrayBuffer.slice(0));
  } finally {
    await audioContext.close().catch(() => undefined);
  }
}

export async function audioBlobToWav(blob: Blob): Promise<Blob> {
  if (isWavBlob(blob)) return blob;
  const audioBuffer = await decodeAudioBlob(blob);
  return new Blob([audioBufferToMonoWav(audioBuffer)], { type: 'audio/wav' });
}

export async function normalizeASRUploadAudio(
  providerId: string,
  audioBlob: Blob,
): Promise<{ blob: Blob; fileName: string }> {
  if (providerId !== 'lemonade-asr') {
    return { blob: audioBlob, fileName: 'recording.webm' };
  }
  return { blob: await audioBlobToWav(audioBlob), fileName: 'recording.wav' };
}
