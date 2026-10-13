/**
 * Server-only TTS helper for audio scenes.
 * Uses the same voice and settings as speak_text, but requests raw 24kHz PCM
 * for the mixer. The existing speak_text MCP tool remains untouched.
 */
import "server-only";

export type SceneVoiceOptions = {
  text: string;
};

export async function generateSceneVoicePcm({ text }: SceneVoiceOptions): Promise<Buffer> {
  const key = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!key || !voiceId) throw new Error("ElevenLabs voice credentials are not configured");
  const message = text.trim();
  if (!message || message.length > 180) {
    throw new Error("Voice text must be 1–180 characters");
  }

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=pcm_24000`,
    {
      method: "POST",
      headers: {
        "xi-api-key": key,
        "Content-Type": "application/json",
        Accept: "application/octet-stream",
      },
      body: JSON.stringify({
        text: message,
        model_id: "eleven_v4",
        voice_settings: { stability: 0.55, similarity_boost: 0.75 },
      }),
      cache: "no-store",
    }
  );

  if (!response.ok) {
    // Never expose upstream response bodies, credentials, or voice IDs.
    throw new Error(`ElevenLabs PCM speech generation failed (HTTP ${response.status})`);
  }
  const audio = Buffer.from(await response.arrayBuffer());
  if (audio.length === 0 || audio.length > 4_000_000 || audio.length % 2 !== 0) {
    throw new Error("Speech PCM output is empty, malformed, or exceeds 4 MB");
  }
  return audio;
}
