import fs from "node:fs/promises";
import path from "node:path";
import { logger } from "../../logger.js";
import { getMimeFromFilename } from "./mime.js";
import { downloadAndDecryptBuffer, downloadPlainCdnBuffer } from "../cdn/pic-decrypt.js";
import { silkToWav } from "./silk-transcode.js";
import { tempFileName } from "../util/random.js";
import type { WeixinMessage } from "../types.js";
import { MessageItemType } from "../types.js";

const WEIXIN_MEDIA_MAX_BYTES = 100 * 1024 * 1024;

export type WeixinInboundMediaOpts = {
  decryptedPicPath?: string;
  decryptedVoicePath?: string;
  voiceMediaType?: string;
  decryptedFilePath?: string;
  fileMediaType?: string;
  decryptedVideoPath?: string;
};

async function saveToTemp(buf: Buffer, tmpDir: string, ext: string, originalFilename?: string): Promise<string> {
  await fs.mkdir(tmpDir, { recursive: true });
  const name = originalFilename ?? tempFileName("weixin", ext);
  const filePath = path.join(tmpDir, name);
  await fs.writeFile(filePath, buf);
  return filePath;
}

export async function downloadMediaFromItem(
  item: NonNullable<WeixinMessage["item_list"]>[number],
  deps: {
    cdnBaseUrl: string;
    tmpDir: string;
    label: string;
  },
): Promise<WeixinInboundMediaOpts> {
  const { cdnBaseUrl, tmpDir, label } = deps;
  const result: WeixinInboundMediaOpts = {};

  if (item.type === MessageItemType.IMAGE) {
    const img = item.image_item;
    if (!img?.media?.encrypt_query_param) return result;
    const aesKeyBase64 = img.aeskey
      ? Buffer.from(img.aeskey, "hex").toString("base64")
      : img.media.aes_key;
    try {
      const buf = aesKeyBase64
        ? await downloadAndDecryptBuffer(img.media.encrypt_query_param, aesKeyBase64, cdnBaseUrl, `${label} image`)
        : await downloadPlainCdnBuffer(img.media.encrypt_query_param, cdnBaseUrl, `${label} image-plain`);
      if (buf.length > WEIXIN_MEDIA_MAX_BYTES) throw new Error(`image too large: ${buf.length} bytes`);
      result.decryptedPicPath = await saveToTemp(buf, tmpDir, ".jpg");
      logger.debug(`${label} image saved: ${result.decryptedPicPath}`);
    } catch (err) {
      logger.error(`${label} image download/decrypt failed: ${String(err)}`);
    }
  } else if (item.type === MessageItemType.VOICE) {
    const voice = item.voice_item;
    if (!voice?.media?.encrypt_query_param || !voice.media.aes_key) return result;
    try {
      const silkBuf = await downloadAndDecryptBuffer(voice.media.encrypt_query_param, voice.media.aes_key, cdnBaseUrl, `${label} voice`);
      const wavBuf = await silkToWav(silkBuf);
      if (wavBuf) {
        result.decryptedVoicePath = await saveToTemp(wavBuf, tmpDir, ".wav");
        result.voiceMediaType = "audio/wav";
      } else {
        result.decryptedVoicePath = await saveToTemp(silkBuf, tmpDir, ".silk");
        result.voiceMediaType = "audio/silk";
      }
    } catch (err) {
      logger.error(`${label} voice download/transcode failed: ${String(err)}`);
    }
  } else if (item.type === MessageItemType.FILE) {
    const fileItem = item.file_item;
    if (!fileItem?.media?.encrypt_query_param || !fileItem.media.aes_key) return result;
    try {
      const buf = await downloadAndDecryptBuffer(fileItem.media.encrypt_query_param, fileItem.media.aes_key, cdnBaseUrl, `${label} file`);
      if (buf.length > WEIXIN_MEDIA_MAX_BYTES) throw new Error(`file too large: ${buf.length} bytes`);
      const mime = getMimeFromFilename(fileItem.file_name ?? "file.bin");
      result.decryptedFilePath = await saveToTemp(buf, tmpDir, path.extname(fileItem.file_name ?? ".bin"), fileItem.file_name ?? undefined);
      result.fileMediaType = mime;
    } catch (err) {
      logger.error(`${label} file download failed: ${String(err)}`);
    }
  } else if (item.type === MessageItemType.VIDEO) {
    const videoItem = item.video_item;
    if (!videoItem?.media?.encrypt_query_param || !videoItem.media.aes_key) return result;
    try {
      const buf = await downloadAndDecryptBuffer(videoItem.media.encrypt_query_param, videoItem.media.aes_key, cdnBaseUrl, `${label} video`);
      if (buf.length > WEIXIN_MEDIA_MAX_BYTES) throw new Error(`video too large: ${buf.length} bytes`);
      result.decryptedVideoPath = await saveToTemp(buf, tmpDir, ".mp4");
    } catch (err) {
      logger.error(`${label} video download failed: ${String(err)}`);
    }
  }

  return result;
}
