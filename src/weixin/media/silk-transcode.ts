import { logger } from "../../logger.js";

const SILK_SAMPLE_RATE = 24_000;

function pcmBytesToWav(pcm: Uint8Array, sampleRate: number): Buffer {
  const pcmBytes = pcm.byteLength;
  const totalSize = 44 + pcmBytes;
  const buf = Buffer.allocUnsafe(totalSize);
  let offset = 0;

  buf.write("RIFF", offset); offset += 4;
  buf.writeUInt32LE(totalSize - 8, offset); offset += 4;
  buf.write("WAVE", offset); offset += 4;

  buf.write("fmt ", offset); offset += 4;
  buf.writeUInt32LE(16, offset); offset += 4;
  buf.writeUInt16LE(1, offset); offset += 2;
  buf.writeUInt16LE(1, offset); offset += 2;
  buf.writeUInt32LE(sampleRate, offset); offset += 4;
  buf.writeUInt32LE(sampleRate * 2, offset); offset += 4;
  buf.writeUInt16LE(2, offset); offset += 2;
  buf.writeUInt16LE(16, offset); offset += 2;

  buf.write("data", offset); offset += 4;
  buf.writeUInt32LE(pcmBytes, offset); offset += 4;

  Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength).copy(buf, offset);

  return buf;
}

export async function silkToWav(silkBuf: Buffer): Promise<Buffer | null> {
  try {
    const { decode } = await import("silk-wasm");
    logger.debug(`silkToWav: decoding ${silkBuf.length} bytes of SILK`);
    const result = await decode(silkBuf, SILK_SAMPLE_RATE);
    logger.debug(`silkToWav: decoded duration=${result.duration}ms pcmBytes=${result.data.byteLength}`);
    const wav = pcmBytesToWav(result.data, SILK_SAMPLE_RATE);
    logger.debug(`silkToWav: WAV size=${wav.length}`);
    return wav;
  } catch (err) {
    logger.warn(`silkToWav: transcode failed, will use raw silk err=${String(err)}`);
    return null;
  }
}
