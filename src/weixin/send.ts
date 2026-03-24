import { sendMessage as sendMessageApi } from "./api.js";
import type { WeixinApiOptions } from "./api.js";
import { logger } from "../logger.js";
import { generateId } from "./util/random.js";
import type { MessageItem, SendMessageReq } from "./types.js";
import { MessageItemType, MessageState, MessageType } from "./types.js";
import type { UploadedFileInfo } from "./cdn/upload.js";

function generateClientId(): string {
  return generateId("wechat-claude");
}

/**
 * Convert markdown-formatted text to plain text for Weixin delivery.
 */
export function markdownToPlainText(text: string): string {
  let result = text;
  // Code blocks: strip fences, keep code content
  result = result.replace(/```[^\n]*\n?([\s\S]*?)```/g, (_, code: string) => code.trim());
  // Images: remove entirely
  result = result.replace(/!\[[^\]]*\]\([^)]*\)/g, "");
  // Links: keep display text only
  result = result.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  // Tables: remove separator rows, then strip leading/trailing pipes
  result = result.replace(/^\|[\s:|-]+\|$/gm, "");
  result = result.replace(/^\|(.+)\|$/gm, (_, inner: string) =>
    inner.split("|").map((cell) => cell.trim()).join("  "),
  );
  // Bold
  result = result.replace(/\*\*(.+?)\*\*/g, "$1");
  result = result.replace(/__(.+?)__/g, "$1");
  // Italic
  result = result.replace(/\*(.+?)\*/g, "$1");
  result = result.replace(/_(.+?)_/g, "$1");
  // Strikethrough
  result = result.replace(/~~(.+?)~~/g, "$1");
  // Inline code
  result = result.replace(/`([^`]+)`/g, "$1");
  // Headers
  result = result.replace(/^#{1,6}\s+/gm, "");
  // Blockquotes
  result = result.replace(/^>\s?/gm, "");
  // Horizontal rules
  result = result.replace(/^[-*_]{3,}$/gm, "");
  // Unordered lists
  result = result.replace(/^[\s]*[-*+]\s+/gm, "• ");
  // Ordered lists
  result = result.replace(/^[\s]*\d+\.\s+/gm, "");
  return result.trim();
}

function buildTextMessageReq(params: {
  to: string;
  text: string;
  contextToken?: string;
  clientId: string;
}): SendMessageReq {
  const { to, text, contextToken, clientId } = params;
  const item_list: MessageItem[] = text
    ? [{ type: MessageItemType.TEXT, text_item: { text } }]
    : [];
  return {
    msg: {
      from_user_id: "",
      to_user_id: to,
      client_id: clientId,
      message_type: MessageType.BOT,
      message_state: MessageState.FINISH,
      item_list: item_list.length ? item_list : undefined,
      context_token: contextToken ?? undefined,
    },
  };
}

export async function sendMessageWeixin(params: {
  to: string;
  text: string;
  opts: WeixinApiOptions & { contextToken?: string };
}): Promise<{ messageId: string }> {
  const { to, text, opts } = params;
  if (!opts.contextToken) {
    logger.error(`sendMessageWeixin: contextToken missing, refusing to send to=${to}`);
    throw new Error("sendMessageWeixin: contextToken is required");
  }
  const clientId = generateClientId();
  const req = buildTextMessageReq({ to, text, contextToken: opts.contextToken, clientId });
  try {
    await sendMessageApi({
      baseUrl: opts.baseUrl,
      token: opts.token,
      timeoutMs: opts.timeoutMs,
      body: req,
    });
  } catch (err) {
    logger.error(`sendMessageWeixin: failed to=${to} clientId=${clientId} err=${String(err)}`);
    throw err;
  }
  return { messageId: clientId };
}

async function sendMediaItems(params: {
  to: string;
  text: string;
  mediaItem: MessageItem;
  opts: WeixinApiOptions & { contextToken?: string };
  label: string;
}): Promise<{ messageId: string }> {
  const { to, text, mediaItem, opts, label } = params;
  const items: MessageItem[] = [];
  if (text) {
    items.push({ type: MessageItemType.TEXT, text_item: { text } });
  }
  items.push(mediaItem);

  let lastClientId = "";
  for (const item of items) {
    lastClientId = generateClientId();
    const req: SendMessageReq = {
      msg: {
        from_user_id: "",
        to_user_id: to,
        client_id: lastClientId,
        message_type: MessageType.BOT,
        message_state: MessageState.FINISH,
        item_list: [item],
        context_token: opts.contextToken ?? undefined,
      },
    };
    try {
      await sendMessageApi({ baseUrl: opts.baseUrl, token: opts.token, timeoutMs: opts.timeoutMs, body: req });
    } catch (err) {
      logger.error(`${label}: failed to=${to} clientId=${lastClientId} err=${String(err)}`);
      throw err;
    }
  }
  logger.debug(`${label}: success to=${to} clientId=${lastClientId}`);
  return { messageId: lastClientId };
}

export async function sendImageMessageWeixin(params: {
  to: string;
  text: string;
  uploaded: UploadedFileInfo;
  opts: WeixinApiOptions & { contextToken?: string };
}): Promise<{ messageId: string }> {
  const { to, text, uploaded, opts } = params;
  if (!opts.contextToken) throw new Error("sendImageMessageWeixin: contextToken is required");
  const imageItem: MessageItem = {
    type: MessageItemType.IMAGE,
    image_item: {
      media: {
        encrypt_query_param: uploaded.downloadEncryptedQueryParam,
        aes_key: Buffer.from(uploaded.aeskey).toString("base64"),
        encrypt_type: 1,
      },
      mid_size: uploaded.fileSizeCiphertext,
    },
  };
  return sendMediaItems({ to, text, mediaItem: imageItem, opts, label: "sendImageMessageWeixin" });
}

export async function sendVideoMessageWeixin(params: {
  to: string;
  text: string;
  uploaded: UploadedFileInfo;
  opts: WeixinApiOptions & { contextToken?: string };
}): Promise<{ messageId: string }> {
  const { to, text, uploaded, opts } = params;
  if (!opts.contextToken) throw new Error("sendVideoMessageWeixin: contextToken is required");
  const videoItem: MessageItem = {
    type: MessageItemType.VIDEO,
    video_item: {
      media: {
        encrypt_query_param: uploaded.downloadEncryptedQueryParam,
        aes_key: Buffer.from(uploaded.aeskey).toString("base64"),
        encrypt_type: 1,
      },
      video_size: uploaded.fileSizeCiphertext,
    },
  };
  return sendMediaItems({ to, text, mediaItem: videoItem, opts, label: "sendVideoMessageWeixin" });
}

export async function sendFileMessageWeixin(params: {
  to: string;
  text: string;
  fileName: string;
  uploaded: UploadedFileInfo;
  opts: WeixinApiOptions & { contextToken?: string };
}): Promise<{ messageId: string }> {
  const { to, text, fileName, uploaded, opts } = params;
  if (!opts.contextToken) throw new Error("sendFileMessageWeixin: contextToken is required");
  const fileItem: MessageItem = {
    type: MessageItemType.FILE,
    file_item: {
      media: {
        encrypt_query_param: uploaded.downloadEncryptedQueryParam,
        aes_key: Buffer.from(uploaded.aeskey).toString("base64"),
        encrypt_type: 1,
      },
      file_name: fileName,
      len: String(uploaded.fileSize),
    },
  };
  return sendMediaItems({ to, text, mediaItem: fileItem, opts, label: "sendFileMessageWeixin" });
}
