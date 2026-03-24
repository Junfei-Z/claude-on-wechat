import { randomUUID } from "node:crypto";
import { exec } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import QRCode from "qrcode";

import { logger } from "../logger.js";
import { redactToken } from "./util/redact.js";

// ---------------------------------------------------------------------------
// Account storage (per-account credential files)
// ---------------------------------------------------------------------------

export type WeixinAccountData = {
  token?: string;
  savedAt?: string;
  baseUrl?: string;
  userId?: string;
  accountId?: string;
};

let dataDir = "";

export function setDataDir(dir: string): void {
  dataDir = dir;
}

function resolveAccountsDir(): string {
  return path.join(dataDir, "accounts");
}

function resolveAccountPath(accountId: string): string {
  return path.join(resolveAccountsDir(), `${accountId}.json`);
}

export function loadAccount(): WeixinAccountData | null {
  const dir = resolveAccountsDir();
  try {
    if (!fs.existsSync(dir)) return null;
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
    if (files.length === 0) return null;
    const raw = fs.readFileSync(path.join(dir, files[0]), "utf-8");
    return JSON.parse(raw) as WeixinAccountData;
  } catch {
    return null;
  }
}

export function saveAccount(accountId: string, data: Partial<WeixinAccountData>): void {
  const dir = resolveAccountsDir();
  fs.mkdirSync(dir, { recursive: true });
  const existing = loadAccountById(accountId) ?? {};
  const merged: WeixinAccountData = {
    ...existing,
    ...data,
    accountId,
    savedAt: new Date().toISOString(),
  };
  const filePath = resolveAccountPath(accountId);
  fs.writeFileSync(filePath, JSON.stringify(merged, null, 2), "utf-8");
  try { fs.chmodSync(filePath, 0o600); } catch { /* best-effort */ }
}

function loadAccountById(accountId: string): WeixinAccountData | null {
  try {
    const filePath = resolveAccountPath(accountId);
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8")) as WeixinAccountData;
    }
  } catch { /* ignore */ }
  return null;
}

// ---------------------------------------------------------------------------
// Sync buf persistence
// ---------------------------------------------------------------------------

function syncBufPath(): string {
  return path.join(dataDir, "sync-buf.json");
}

export function loadSyncBuf(): string {
  try {
    const filePath = syncBufPath();
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8")) as { buf?: string };
      return data.buf ?? "";
    }
  } catch { /* ignore */ }
  return "";
}

export function saveSyncBuf(buf: string): void {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(syncBufPath(), JSON.stringify({ buf, savedAt: new Date().toISOString() }), "utf-8");
}

// ---------------------------------------------------------------------------
// QR Login
// ---------------------------------------------------------------------------

/** Try to open a file with the system's default viewer (non-blocking, best-effort). */
function openFile(filePath: string): void {
  const cmd =
    process.platform === "darwin" ? "open" :
    process.platform === "win32" ? "start" :
    "xdg-open";
  exec(`${cmd} ${JSON.stringify(filePath)}`, (err) => {
    if (err) logger.debug(`openFile failed: ${err.message}`);
  });
}

export const DEFAULT_ILINK_BOT_TYPE = "3";

const QR_LONG_POLL_TIMEOUT_MS = 35_000;
const MAX_QR_REFRESH_COUNT = 3;

interface QRCodeResponse {
  qrcode: string;
  qrcode_img_content: string;
}

interface StatusResponse {
  status: "wait" | "scaned" | "confirmed" | "expired";
  bot_token?: string;
  ilink_bot_id?: string;
  baseurl?: string;
  ilink_user_id?: string;
}

async function fetchQRCode(apiBaseUrl: string, botType: string): Promise<QRCodeResponse> {
  const base = apiBaseUrl.endsWith("/") ? apiBaseUrl : `${apiBaseUrl}/`;
  const url = new URL(`ilink/bot/get_bot_qrcode?bot_type=${encodeURIComponent(botType)}`, base);
  logger.info(`Fetching QR code from: ${url.toString()}`);
  const response = await fetch(url.toString());
  if (!response.ok) {
    const body = await response.text().catch(() => "(unreadable)");
    throw new Error(`Failed to fetch QR code: ${response.status} ${response.statusText} body=${body}`);
  }
  return await response.json() as QRCodeResponse;
}

async function pollQRStatus(apiBaseUrl: string, qrcode: string): Promise<StatusResponse> {
  const base = apiBaseUrl.endsWith("/") ? apiBaseUrl : `${apiBaseUrl}/`;
  const url = new URL(`ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`, base);
  const headers: Record<string, string> = { "iLink-App-ClientVersion": "1" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), QR_LONG_POLL_TIMEOUT_MS);
  try {
    const response = await fetch(url.toString(), { headers, signal: controller.signal });
    clearTimeout(timer);
    const rawText = await response.text();
    if (!response.ok) {
      throw new Error(`Failed to poll QR status: ${response.status} ${response.statusText}`);
    }
    return JSON.parse(rawText) as StatusResponse;
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === "AbortError") {
      return { status: "wait" };
    }
    throw err;
  }
}

export type LoginResult = {
  connected: boolean;
  botToken?: string;
  accountId?: string;
  baseUrl?: string;
  userId?: string;
  message: string;
};

/**
 * Full QR login flow: fetch QR → display in terminal → poll status → return credentials.
 */
export async function loginWithQR(opts: {
  apiBaseUrl: string;
  botType?: string;
  timeoutMs?: number;
}): Promise<LoginResult> {
  const botType = opts.botType || DEFAULT_ILINK_BOT_TYPE;
  const timeoutMs = opts.timeoutMs ?? 480_000;

  let qrResponse: QRCodeResponse;
  try {
    qrResponse = await fetchQRCode(opts.apiBaseUrl, botType);
  } catch (err) {
    return { connected: false, message: `获取二维码失败: ${String(err)}` };
  }

  // Display QR code — save as image and auto-open (for MCP mode where stderr is hidden)
  const qrImagePath = path.join(dataDir, "qr-login.png");
  try {
    await QRCode.toFile(qrImagePath, qrResponse.qrcode_img_content, { width: 400, margin: 2 });
    openFile(qrImagePath);
    logger.info(`微信登录二维码已保存并打开: ${qrImagePath}`);
  } catch {
    logger.warn("无法生成二维码图片文件");
  }
  // Also print to stderr as fallback (visible when running directly)
  try {
    const terminalQR = await QRCode.toString(qrResponse.qrcode_img_content, { type: "terminal", small: true });
    console.error("\n请使用微信扫描以下二维码:\n");
    console.error(terminalQR);
  } catch {
    console.error(`\nQR Code URL: ${qrResponse.qrcode_img_content}\n`);
  }

  const deadline = Date.now() + timeoutMs;
  let scannedPrinted = false;
  let qrRefreshCount = 1;
  let currentQrcode = qrResponse.qrcode;

  while (Date.now() < deadline) {
    try {
      const statusResponse = await pollQRStatus(opts.apiBaseUrl, currentQrcode);

      switch (statusResponse.status) {
        case "wait":
          break;
        case "scaned":
          if (!scannedPrinted) {
            console.error("\n已扫码，在微信继续操作...");
            scannedPrinted = true;
          }
          break;
        case "expired": {
          qrRefreshCount++;
          if (qrRefreshCount > MAX_QR_REFRESH_COUNT) {
            return { connected: false, message: "登录超时：二维码多次过期，请重新开始。" };
          }
          console.error(`\n二维码已过期，正在刷新...(${qrRefreshCount}/${MAX_QR_REFRESH_COUNT})`);
          try {
            const newQr = await fetchQRCode(opts.apiBaseUrl, botType);
            currentQrcode = newQr.qrcode;
            scannedPrinted = false;
            try {
              await QRCode.toFile(qrImagePath, newQr.qrcode_img_content, { width: 400, margin: 2 });
              openFile(qrImagePath);
            } catch { /* best-effort */ }
            try {
              const terminalQR = await QRCode.toString(newQr.qrcode_img_content, { type: "terminal", small: true });
              console.error(terminalQR);
            } catch {
              console.error(`QR Code URL: ${newQr.qrcode_img_content}`);
            }
          } catch (refreshErr) {
            return { connected: false, message: `刷新二维码失败: ${String(refreshErr)}` };
          }
          break;
        }
        case "confirmed": {
          if (!statusResponse.ilink_bot_id) {
            return { connected: false, message: "登录失败：服务器未返回 ilink_bot_id。" };
          }
          // Clean up QR image
          try { fs.unlinkSync(qrImagePath); } catch { /* ignore */ }
          logger.info(`Login confirmed! accountId=${statusResponse.ilink_bot_id} userId=${redactToken(statusResponse.ilink_user_id)}`);
          return {
            connected: true,
            botToken: statusResponse.bot_token,
            accountId: statusResponse.ilink_bot_id,
            baseUrl: statusResponse.baseurl,
            userId: statusResponse.ilink_user_id,
            message: "与微信连接成功！",
          };
        }
      }
    } catch (err) {
      return { connected: false, message: `Login failed: ${String(err)}` };
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  return { connected: false, message: "登录超时，请重试。" };
}
