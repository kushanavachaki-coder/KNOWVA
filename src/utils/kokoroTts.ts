/**
 * Browser-local Kokoro TTS experiment.
 *
 * This is intentionally isolated from Gemini TTS. The first test loads
 * kokoro-js from a pinned ESM CDN URL, then downloads/caches the model
 * in the user's browser and performs speech locally.
 */

const KOKORO_MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const KOKORO_MODULE = 'https://esm.sh/kokoro-js@1.2.1';

let kokoroPromise: Promise<any> | null = null;

async function getKokoro() {
  if (!kokoroPromise) {
    kokoroPromise = (async () => {
      const { KokoroTTS } = await import(/* @vite-ignore */ KOKORO_MODULE);
      const hasWebGPU = typeof navigator !== 'undefined' && 'gpu' in navigator;
      return KokoroTTS.from_pretrained(
        KOKORO_MODEL,
        hasWebGPU
          ? { dtype: 'fp32', device: 'webgpu' }
          : { dtype: 'q8', device: 'wasm' }
      );
    })();
  }

  try {
    return await kokoroPromise;
  } catch (error) {
    kokoroPromise = null;
    throw error;
  }
}

export async function speakWithKokoro(
  text: string,
  voice = 'af_heart'
): Promise<boolean> {
  if (!text.trim()) return false;

  const tts = await getKokoro();
  const audio = await tts.generate(text, { voice });
  const blob = audio.toBlob();
  const url = URL.createObjectURL(blob);

  return new Promise<boolean>((resolve) => {
    const player = new Audio(url);
    let settled = false;

    const finish = (success: boolean) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      resolve(success);
    };

    player.onended = () => finish(true);
    player.onerror = () => finish(false);
    void player.play().catch(() => finish(false));
  });
}
