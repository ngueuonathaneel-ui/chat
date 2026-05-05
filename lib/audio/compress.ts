/**
 * Compression de messages vocaux côté client
 *
 * Objectif : réduire significativement la taille du WAV brut (1411 kbps stéréo CD)
 *            avant upload, tout en restant intelligible pour la voix humaine.
 *
 * Stratégie :
 *   1. Préférence : utiliser MediaRecorder avec mimeType opus/webm
 *      (Opus à 24-32 kbps reste excellent pour la voix → ratio ~50:1).
 *   2. Si MediaRecorder n'expose pas Opus, on dégrade sur webm/vorbis.
 *   3. Fallback ultime : on resample le WAV à 16 kHz mono 16-bit
 *      (réduction algorithmique × ~6) puis on encode en WAV PCM minimal.
 *
 * Toute compression supplémentaire (Opus.js WASM) reste possible mais
 * augmente sensiblement la taille du bundle ; on la garde comme TODO opt-in.
 */

const PREFERRED_MIME = [
  "audio/webm;codecs=opus",
  "audio/ogg;codecs=opus",
  "audio/webm",
  "audio/ogg",
];

export function pickBestMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const mime of PREFERRED_MIME) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return null;
}

/** Resample un AudioBuffer vers 16 kHz mono via OfflineAudioContext. */
export async function downsampleToMono16k(
  buffer: AudioBuffer
): Promise<AudioBuffer> {
  const target = 16_000;
  const offline = new OfflineAudioContext(
    1,
    Math.ceil((buffer.duration * target) | 0),
    target
  );
  const src = offline.createBufferSource();
  src.buffer = buffer;
  // Mixdown stereo → mono via gain matrix simple
  const merger = offline.createGain();
  src.connect(merger);
  merger.connect(offline.destination);
  src.start(0);
  return offline.startRendering();
}

/** Encode un AudioBuffer en WAV PCM 16-bit (header RIFF minimal). */
export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numCh = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const samples = buffer.getChannelData(0);
  const bytesPerSample = 2;
  const blockAlign = numCh * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * blockAlign;
  const bufferSize = 44 + dataSize;
  const ab = new ArrayBuffer(bufferSize);
  const view = new DataView(ab);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++)
      view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numCh, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  // PCM samples
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return new Blob([ab], { type: "audio/wav" });
}

/**
 * Compresse un Blob audio brut en utilisant la meilleure stratégie disponible.
 * Renvoie le Blob compressé + ratio.
 */
export async function compressVoiceBlob(input: Blob): Promise<{
  blob: Blob;
  originalSize: number;
  compressedSize: number;
  ratio: number;
  codec: string;
}> {
  const originalSize = input.size;

  // Si déjà encodé en Opus/Vorbis, on garde tel quel.
  if (
    input.type.includes("opus") ||
    input.type.includes("ogg") ||
    input.type.includes("webm")
  ) {
    return {
      blob: input,
      originalSize,
      compressedSize: originalSize,
      ratio: 1,
      codec: input.type,
    };
  }

  // WAV ou inconnu → resample + WAV PCM 16k mono
  const arrayBuffer = await input.arrayBuffer();
  const ctx = new (window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext)();
  const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
  const downsampled = await downsampleToMono16k(decoded);
  const out = audioBufferToWav(downsampled);
  return {
    blob: out,
    originalSize,
    compressedSize: out.size,
    ratio: originalSize / Math.max(out.size, 1),
    codec: "audio/wav;rate=16000;mono;pcm16",
  };
}
