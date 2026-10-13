/**
 * Dependency-free server-side mixer for mono signed 16-bit little-endian PCM.
 *
 * Inputs must be raw PCM (not MP3, WAV, or base64). Request matching
 * output_format=pcm_24000 from both ElevenLabs generation endpoints.
 * Returns a standard PCM WAV Buffer playable by HTMLAudioElement.
 *
 * Does not alter the existing MP3-based speak_text tool.
 */
import "server-only";

export const AUDIO_SAMPLE_RATE = 24_000;
const BYTES_PER_SAMPLE = 2;
const MAX_DURATION_SECONDS = 30;
const MAX_INPUT_BYTES = AUDIO_SAMPLE_RATE * BYTES_PER_SAMPLE * MAX_DURATION_SECONDS;

export type MixAudioOptions = {
  voicePcm: Buffer;
  effectPcm: Buffer;
  voiceVolume?: number;
  effectVolume?: number;
  effectStartTime?: number;
  durationSeconds?: number;
  effectFadeInSeconds?: number;
  effectFadeOutSeconds?: number;
  sampleRate?: number;
};

function checkVolume(name: string, value: number) {
  if (!Number.isFinite(value) || value < 0 || value > 2) {
    throw new Error(`${name} must be between 0 and 2`);
  }
}

function checkSeconds(name: string, value: number) {
  if (!Number.isFinite(value) || value < 0 || value > MAX_DURATION_SECONDS) {
    throw new Error(`${name} must be between 0 and ${MAX_DURATION_SECONDS} seconds`);
  }
}

function checkPcm(name: string, data: Buffer) {
  if (!Buffer.isBuffer(data) || data.length === 0 || data.length % BYTES_PER_SAMPLE !== 0) {
    throw new Error(`${name} must be nonempty raw 16-bit PCM with an even byte length`);
  }
  if (data.length > MAX_INPUT_BYTES) {
    throw new Error(`${name} exceeds the 30-second PCM limit`);
  }
}

function wavHeader(sampleCount: number, sampleRate: number): Buffer {
  const header = Buffer.alloc(44);
  const dataBytes = sampleCount * BYTES_PER_SAMPLE;
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(dataBytes + 36, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * BYTES_PER_SAMPLE, 28);
  header.writeUInt16LE(BYTES_PER_SAMPLE, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(dataBytes, 40);
  return header;
}

/**
 * Overlay two mono PCM tracks with optional effect delay and fades.
 * The voice starts at t=0. An effect that exceeds the scene is truncated.
 * Peak normalization avoids clipping when both tracks overlap.
 */
export function mixPcmAudio({
  voicePcm,
  effectPcm,
  voiceVolume = 1,
  effectVolume = 0.35,
  effectStartTime = 0,
  durationSeconds,
  effectFadeInSeconds = 0,
  effectFadeOutSeconds = 0,
  sampleRate = AUDIO_SAMPLE_RATE,
}: MixAudioOptions): Buffer {
  if (sampleRate !== AUDIO_SAMPLE_RATE) {
    throw new Error(`Only ${AUDIO_SAMPLE_RATE} Hz mono PCM is currently supported`);
  }
  checkPcm("voicePcm", voicePcm);
  checkPcm("effectPcm", effectPcm);
  checkVolume("voiceVolume", voiceVolume);
  checkVolume("effectVolume", effectVolume);
  checkSeconds("effectStartTime", effectStartTime);
  checkSeconds("effectFadeInSeconds", effectFadeInSeconds);
  checkSeconds("effectFadeOutSeconds", effectFadeOutSeconds);
  if (durationSeconds !== undefined) checkSeconds("durationSeconds", durationSeconds);

  const voiceSamples = voicePcm.length / BYTES_PER_SAMPLE;
  const effectSamples = effectPcm.length / BYTES_PER_SAMPLE;
  const effectStartSample = Math.round(effectStartTime * sampleRate);
  const naturalSamples = Math.max(voiceSamples, effectStartSample + effectSamples);
  const outputSamples = durationSeconds === undefined
    ? naturalSamples
    : Math.round(durationSeconds * sampleRate);
  if (outputSamples < 1 || outputSamples > MAX_INPUT_BYTES / BYTES_PER_SAMPLE) {
    throw new Error("Mixed audio duration must be greater than 0 and at most 30 seconds");
  }

  const fadeInSamples = Math.round(effectFadeInSeconds * sampleRate);
  const fadeOutSamples = Math.round(effectFadeOutSeconds * sampleRate);
  const values = new Float32Array(outputSamples);
  let peak = 0;
  for (let i = 0; i < outputSamples; i++) {
    const voice = i < voiceSamples ? voicePcm.readInt16LE(i * 2) * voiceVolume : 0;
    const effectIndex = i - effectStartSample;
    let effect = 0;
    if (effectIndex >= 0 && effectIndex < effectSamples) {
      let envelope = 1;
      if (fadeInSamples > 0) envelope = Math.min(envelope, effectIndex / fadeInSamples);
      if (fadeOutSamples > 0) {
        envelope = Math.min(envelope, (effectSamples - 1 - effectIndex) / fadeOutSamples);
      }
      effect = effectPcm.readInt16LE(effectIndex * 2) * effectVolume * Math.max(0, envelope);
    }
    const mixed = voice + effect;
    values[i] = mixed;
    peak = Math.max(peak, Math.abs(mixed));
  }

  const scale = peak > 32767 ? 32767 / peak : 1;
  const output = Buffer.allocUnsafe(44 + outputSamples * BYTES_PER_SAMPLE);
  wavHeader(outputSamples, sampleRate).copy(output, 0);
  for (let i = 0; i < outputSamples; i++) {
    output.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(values[i] * scale))), 44 + i * 2);
  }
  return output;
}
