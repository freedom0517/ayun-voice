/**
 * Server-only orchestration for a complete audio scene.
 *
 * Generates matching 24 kHz mono PCM tracks with ElevenLabs, mixes them
 * locally, and returns a playable WAV buffer. This module is intentionally
 * separate from MCP registration so the existing speak_text tool stays stable.
 */
import "server-only";

import { mixPcmAudio } from "./mixer";
import { generateSceneVoicePcm } from "./scene-voice";
import { generateSoundEffect } from "./sound-effects";

export type GenerateAudioSceneOptions = {
  voiceText: string;
  effectPrompt: string;
  effectDurationSeconds?: number;
  promptInfluence?: number;
  voiceVolume?: number;
  effectVolume?: number;
  effectStartTime?: number;
  durationSeconds?: number;
  effectFadeInSeconds?: number;
  effectFadeOutSeconds?: number;
};

export type GeneratedAudioScene = {
  audio: Buffer;
  mimeType: "audio/wav";
};

export async function generateAudioScene({
  voiceText,
  effectPrompt,
  effectDurationSeconds = 5,
  promptInfluence = 0.3,
  voiceVolume = 1,
  effectVolume = 0.35,
  effectStartTime = 0,
  durationSeconds,
  effectFadeInSeconds = 0.08,
  effectFadeOutSeconds = 0.12,
}: GenerateAudioSceneOptions): Promise<GeneratedAudioScene> {
  // Generate independent tracks concurrently to reduce serverless wall time.
  const [voicePcm, effectPcm] = await Promise.all([
    generateSceneVoicePcm({ text: voiceText }),
    generateSoundEffect({
      prompt: effectPrompt,
      durationSeconds: effectDurationSeconds,
      promptInfluence,
      outputFormat: "pcm_24000",
    }),
  ]);

  const audio = mixPcmAudio({
    voicePcm,
    effectPcm,
    voiceVolume,
    effectVolume,
    effectStartTime,
    durationSeconds,
    effectFadeInSeconds,
    effectFadeOutSeconds,
  });

  // Keep data-URL responses comfortably below the existing 4 MB guardrail.
  if (audio.length === 0 || audio.length > 4_000_000) {
    throw new Error("Mixed scene output is empty or exceeds 4 MB");
  }

  return { audio, mimeType: "audio/wav" };
}
