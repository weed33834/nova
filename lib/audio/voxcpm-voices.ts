'use client';

import { useCallback, useEffect, useState } from 'react';
import { db, type VoiceProfileRecord } from '@/lib/utils/database';
import type { TTSVoiceInfo } from '@/lib/audio/types';
import {
  VOXCPM_AUTO_VOICE,
  VOXCPM_AUTO_VOICE_ID,
  VOXCPM_TTS_PROVIDER_ID,
  buildAutoVoxCPMVoicePrompt,
  getVoxCPMProfileIdFromVoiceId,
  getVoxCPMProfileVoiceId,
  voxCPMBackendSupportsVoiceRegistration,
  type VoxCPMProviderOptions,
  type VoxCPMVoicePromptContext,
} from '@/lib/audio/voxcpm';
import {
  ensureRegisteredVoice,
  type VoiceRegistrationRequestConfig,
} from '@/lib/audio/voice-registration-client';
import {
  isWavBlob,
  decodeAudioBlob,
  audioBlobToWav,
} from '@/lib/audio/wav-utils';
import { blobToBase64 } from '@/lib/audio/codec';

export type VoxCPMVoiceProfile = VoiceProfileRecord;

const VOXCPM_VOICE_PROFILES_CHANGED = 'voxcpm-voice-profiles-changed';
export const VOXCPM_REFERENCE_AUDIO_MAX_BYTES = 10 * 1024 * 1024;
export const VOXCPM_REFERENCE_AUDIO_MAX_SECONDS = 60;

function notifyVoiceProfilesChanged(): void {
  window.dispatchEvent(new Event(VOXCPM_VOICE_PROFILES_CHANGED));
}

function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function replaceFileExtension(fileName: string | undefined, extension: string): string {
  const cleanName = fileName?.trim() || `reference.${extension}`;
  return cleanName.includes('.')
    ? cleanName.replace(/\.[^.]+$/u, `.${extension}`)
    : `${cleanName}.${extension}`;
}

export async function validateVoxCPMReferenceAudio(blob: Blob): Promise<void> {
  if (blob.size > VOXCPM_REFERENCE_AUDIO_MAX_BYTES) {
    throw new Error('Reference audio must be 10 MB or smaller');
  }

  const audioBuffer = await decodeAudioBlob(blob);
  if (audioBuffer.duration > VOXCPM_REFERENCE_AUDIO_MAX_SECONDS) {
    throw new Error('Reference audio must be 60 seconds or shorter');
  }
}

export async function normalizeVoxCPMReferenceAudio(
  blob: Blob,
  fileName?: string,
): Promise<{ blob: Blob; name: string; mimeType: string }> {
  await validateVoxCPMReferenceAudio(blob);

  if (isWavBlob(blob, fileName)) {
    return {
      blob,
      name: replaceFileExtension(fileName, 'wav'),
      mimeType: blob.type || 'audio/wav',
    };
  }

  const wavBlob = await audioBlobToWav(blob);
  if (wavBlob.size > VOXCPM_REFERENCE_AUDIO_MAX_BYTES) {
    throw new Error('Reference audio must be 10 MB or smaller after conversion');
  }
  return {
    blob: wavBlob,
    name: replaceFileExtension(fileName, 'wav'),
    mimeType: 'audio/wav',
  };
}

export function getVoxCPMVoiceOptions(
  profiles: VoxCPMVoiceProfile[],
  options: { supportsClone?: boolean } = {},
): TTSVoiceInfo[] {
  const visibleProfiles = options.supportsClone
    ? profiles
    : profiles.filter((profile) => profile.kind !== 'clone');
  return [
    VOXCPM_AUTO_VOICE,
    ...visibleProfiles.map((profile) => ({
      id: getVoxCPMProfileVoiceId(profile.id),
      name: profile.name,
      language: 'auto',
      gender: 'neutral' as const,
      description:
        profile.kind === 'clone' ? 'Browser-saved cloned voice' : 'Browser-saved prompt voice',
    })),
  ];
}

export function useVoxCPMVoiceProfiles() {
  const [profiles, setProfiles] = useState<VoxCPMVoiceProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await db.voiceProfiles
        .where('providerId')
        .equals(VOXCPM_TTS_PROVIDER_ID)
        .toArray();
      rows.sort((a, b) => b.updatedAt - a.updatedAt);
      setProfiles(rows);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial load + subscribe to voice-profile changes. Suppressed —
    // refresh() is the data loader, the setState is inside it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    window.addEventListener(VOXCPM_VOICE_PROFILES_CHANGED, refresh);
    return () => window.removeEventListener(VOXCPM_VOICE_PROFILES_CHANGED, refresh);
  }, [refresh]);

  const addPromptVoice = useCallback(
    async (input: { name: string; voicePrompt: string }) => {
      const now = Date.now();
      const id = createId();
      await db.voiceProfiles.put({
        id,
        providerId: VOXCPM_TTS_PROVIDER_ID,
        kind: 'prompt',
        name: input.name.trim(),
        voicePrompt: input.voicePrompt.trim(),
        createdAt: now,
        updatedAt: now,
      });
      await refresh();
      notifyVoiceProfilesChanged();
      return getVoxCPMProfileVoiceId(id);
    },
    [refresh],
  );

  const addCloneVoice = useCallback(
    async (input: {
      name: string;
      referenceAudio: Blob;
      referenceAudioName?: string;
      referenceAudioMimeType?: string;
      promptText?: string;
      voicePrompt?: string;
    }) => {
      const now = Date.now();
      const id = createId();
      const referenceAudio = await normalizeVoxCPMReferenceAudio(
        input.referenceAudio,
        input.referenceAudioName,
      );
      await db.voiceProfiles.put({
        id,
        providerId: VOXCPM_TTS_PROVIDER_ID,
        kind: 'clone',
        name: input.name.trim(),
        voicePrompt: input.voicePrompt?.trim() || undefined,
        promptText: input.promptText?.trim() || undefined,
        referenceAudio: referenceAudio.blob,
        referenceAudioName: referenceAudio.name,
        referenceAudioMimeType: referenceAudio.mimeType,
        createdAt: now,
        updatedAt: now,
      });
      await refresh();
      notifyVoiceProfilesChanged();
      return getVoxCPMProfileVoiceId(id);
    },
    [refresh],
  );

  const deleteVoice = useCallback(
    async (id: string) => {
      await db.voiceProfiles.delete(id);
      await refresh();
      notifyVoiceProfilesChanged();
    },
    [refresh],
  );

  return { profiles, loading, refresh, addPromptVoice, addCloneVoice, deleteVoice };
}

export async function getVoxCPMProviderOptions(
  voiceId: string,
  context?: VoxCPMVoicePromptContext,
  request?: VoiceRegistrationRequestConfig,
): Promise<VoxCPMProviderOptions> {
  if (voiceId === VOXCPM_AUTO_VOICE_ID) {
    // Drive register-once only when this VoxCPM backend supports it; otherwise
    // (and on any failure) fall back to the inline voice-design prompt.
    const canRegister =
      !!request &&
      !!context?.voiceDesign &&
      voxCPMBackendSupportsVoiceRegistration(context.backend ?? 'vllm-omni');
    const registeredVoiceId = canRegister
      ? await ensureRegisteredVoice(
          VOXCPM_TTS_PROVIDER_ID,
          { voiceDesign: context!.voiceDesign, language: context!.language || context!.locale },
          request!,
        ).catch(() => undefined)
      : undefined;
    return {
      voiceMode: 'auto',
      voicePrompt: buildAutoVoxCPMVoicePrompt(context), // inline fallback always set
      ...(registeredVoiceId ? { registeredVoiceId } : {}),
    };
  }

  const profileId = getVoxCPMProfileIdFromVoiceId(voiceId);
  if (!profileId) {
    return {
      voiceMode: 'prompt',
      voicePrompt: voiceId,
    };
  }

  const profile = await db.voiceProfiles.get(profileId);
  if (!profile) {
    return {
      voiceMode: 'auto',
      voicePrompt: buildAutoVoxCPMVoicePrompt(context),
    };
  }

  if (profile.kind === 'clone' && profile.referenceAudio) {
    return {
      voiceMode: 'clone',
      voicePrompt: profile.voicePrompt,
      promptText: profile.promptText,
      referenceAudioBase64: await blobToBase64(profile.referenceAudio),
      referenceAudioMimeType:
        profile.referenceAudioMimeType || profile.referenceAudio.type || 'audio/wav',
      referenceAudioName: profile.referenceAudioName || `${profile.name}.wav`,
    };
  }

  return {
    voiceMode: 'prompt',
    voicePrompt: profile.voicePrompt || profile.name,
  };
}
