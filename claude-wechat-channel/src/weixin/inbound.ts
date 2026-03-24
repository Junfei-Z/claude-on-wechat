import { logger } from "../logger.js";
import type { WeixinMessage, MessageItem } from "./types.js";
import { MessageItemType } from "./types.js";

// ---------------------------------------------------------------------------
// Context token store (in-process cache: userId → contextToken)
// ---------------------------------------------------------------------------

const contextTokenStore = new Map<string, string>();

export function setContextToken(userId: string, token: string): void {
  logger.debug(`setContextToken: userId=${userId}`);
  contextTokenStore.set(userId, token);
}

export function getContextToken(userId: string): string | undefined {
  const val = contextTokenStore.get(userId);
  logger.debug(`getContextToken: userId=${userId} found=${val !== undefined}`);
  return val;
}

// ---------------------------------------------------------------------------
// Message text extraction
// ---------------------------------------------------------------------------

function isMediaItem(item: MessageItem): boolean {
  return (
    item.type === MessageItemType.IMAGE ||
    item.type === MessageItemType.VIDEO ||
    item.type === MessageItemType.FILE ||
    item.type === MessageItemType.VOICE
  );
}

export function findMediaItems(itemList?: MessageItem[]): MessageItem[] {
  if (!itemList?.length) return [];
  return itemList.filter(isMediaItem);
}

export function bodyFromItemList(itemList?: MessageItem[]): string {
  if (!itemList?.length) return "";
  for (const item of itemList) {
    if (item.type === MessageItemType.TEXT && item.text_item?.text != null) {
      const text = String(item.text_item.text);
      const ref = item.ref_msg;
      if (!ref) return text;
      if (ref.message_item && isMediaItem(ref.message_item)) return text;
      const parts: string[] = [];
      if (ref.title) parts.push(ref.title);
      if (ref.message_item) {
        const refBody = bodyFromItemList([ref.message_item]);
        if (refBody) parts.push(refBody);
      }
      if (!parts.length) return text;
      return `[引用: ${parts.join(" | ")}]\n${text}`;
    }
    if (item.type === MessageItemType.VOICE && item.voice_item?.text) {
      return item.voice_item.text;
    }
  }
  return "";
}
