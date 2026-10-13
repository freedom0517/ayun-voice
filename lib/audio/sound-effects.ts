/**
 * Server-only ElevenLabs sound-effects helper.
 * This module does not change the existing speak_text tool.
 */
import "server-only";

export type SoundEffectOptions = {
  prompt: string;
  durationSeconds?: number;
  promptInfluence?: number;
};

export async function generateSoundEffect({
  prompt,
  durationSeconds = 5,
  promptInfluence = 0.3,
}: SoundEffectOptions): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not configured");

  const description = prompt.trim();
  if (!description || description.length > 500) {
    throw new Error("Sound effect prompt must be 1–500 characters");
  }
  if (!Number.isFinite(durationSeconds) || durationSeconds < 0.5 || durationSeconds > 22) {
    throw new Error("Sound effect duration must be between 0.5 and 22 seconds");
  }
  if (!Number.isFinite(promptInfluence) || promptInfluence < 0 || promptInfluence > 1) {
    throw new Error("promptInfluence must be between 0 and 1");
  }

  const response = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: description,
      duration_seconds: durationSeconds,
      prompt_influence: promptInfluence,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    // Do not return raw upstream error bodies: they may contain sensitive details.
    throw new Error(`ElevenLabs sound generation failed (HTTP ${response.status})`);
  }

  const audio = Buffer.from(await response.arrayBuffer());
  if (audio.length === 0 || audio.length > 4_000_000) {
    throw new Error("Sound effect output is empty or exceeds 4 MB");
  }
  return audio;
}
