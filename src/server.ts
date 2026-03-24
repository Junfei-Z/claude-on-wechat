#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { loadConfig } from "./config.js";
import { logger } from "./logger.js";
import { setDataDir, loadAccount, saveAccount, loginWithQR } from "./weixin/auth.js";
import { getContextToken } from "./weixin/inbound.js";
import { sendMessageWeixin, markdownToPlainText } from "./weixin/send.js";
import { startMonitor } from "./monitor.js";

// ── .env loading ──────────────────────────────────────────────────────────────

try {
  const envPath = path.resolve(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx <= 0) continue;
      const key = trimmed.substring(0, eqIdx).trim();
      const value = trimmed.substring(eqIdx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
} catch {
  /* ignore */
}

// ── Config ────────────────────────────────────────────────────────────────────

const config = loadConfig();
fs.mkdirSync(config.dataDir, { recursive: true });
setDataDir(config.dataDir);

// ── MCP Server ────────────────────────────────────────────────────────────────

const WEIXIN_MAX_CHARS = 4000;

function splitMessage(text: string): string[] {
  if (text.length <= WEIXIN_MAX_CHARS) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= WEIXIN_MAX_CHARS) {
      chunks.push(remaining);
      break;
    }
    let splitAt = remaining.lastIndexOf("\n", WEIXIN_MAX_CHARS);
    if (splitAt <= 0 || splitAt < WEIXIN_MAX_CHARS * 0.5) {
      splitAt = WEIXIN_MAX_CHARS;
    }
    chunks.push(remaining.substring(0, splitAt));
    remaining = remaining.substring(splitAt).trimStart();
  }

  return chunks;
}

const mcp = new Server(
  { name: "wechat", version: "0.1.0" },
  {
    capabilities: {
      experimental: { "claude/channel": {} },
      tools: {},
    },
    instructions: `微信消息以 <channel source="wechat" sender="..." user_id="..."> 格式到达。
用 reply tool 回复，传入 user_id 参数。回复内容用纯文本，不要用 markdown 格式。
超过 ${WEIXIN_MAX_CHARS} 字的回复会自动分段发送。`,
  },
);

// ── Tools ─────────────────────────────────────────────────────────────────────

mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "reply",
      description: "回复微信消息。text 会自动从 markdown 转换为纯文本，超长消息会自动分段。",
      inputSchema: {
        type: "object" as const,
        properties: {
          user_id: { type: "string", description: "接收消息的微信用户 ID" },
          text: { type: "string", description: "回复内容" },
        },
        required: ["user_id", "text"],
      },
    },
  ],
}));

let weixinToken = "";

mcp.setRequestHandler(CallToolRequestSchema, async (req) => {
  if (req.params.name === "reply") {
    const { user_id, text } = req.params.arguments as {
      user_id: string;
      text: string;
    };

    const contextToken = getContextToken(user_id);
    if (!contextToken) {
      return {
        content: [{ type: "text" as const, text: `错误: 没有 user_id=${user_id} 的 contextToken，无法发送` }],
        isError: true,
      };
    }

    const chunks = splitMessage(markdownToPlainText(text));
    for (const chunk of chunks) {
      await sendMessageWeixin({
        to: user_id,
        text: chunk,
        opts: {
          baseUrl: config.weixinBaseUrl,
          token: weixinToken,
          contextToken,
        },
      });
    }

    logger.info(`reply sent to ${user_id}: ${chunks.length} chunk(s)`);
    return { content: [{ type: "text" as const, text: "sent" }] };
  }

  return {
    content: [{ type: "text" as const, text: `未知工具: ${req.params.name}` }],
    isError: true,
  };
});

// ── Bootstrap ─────────────────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  // Connect MCP transport first (stdio)
  const transport = new StdioServerTransport();
  await mcp.connect(transport);

  logger.info("MCP server connected via stdio");

  // WeChat login
  let account = loadAccount();

  if (!account?.token || !account?.accountId) {
    logger.info("未找到已保存的账号，开始微信登录...");
    const result = await loginWithQR({ apiBaseUrl: config.weixinBaseUrl });

    if (!result.connected || !result.botToken || !result.accountId) {
      logger.error(`登录失败: ${result.message}`);
      process.exit(1);
    }

    saveAccount(result.accountId, {
      token: result.botToken,
      baseUrl: result.baseUrl,
      userId: result.userId,
    });

    logger.info(result.message);
    account = loadAccount();
  }

  if (!account?.token || !account?.accountId) {
    logger.error("无法加载账号信息");
    process.exit(1);
  }

  weixinToken = account.token;
  logger.info(`已登录账号: ${account.accountId}`);

  // Graceful shutdown
  const abortController = new AbortController();

  const shutdown = () => {
    logger.info("正在退出...");
    abortController.abort();
    setTimeout(() => process.exit(0), 2000);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Start monitor (pushes notifications to Claude via mcp)
  try {
    await startMonitor({
      config,
      token: account.token,
      accountId: account.accountId,
      mcp,
      abortSignal: abortController.signal,
    });
  } catch (err) {
    if (abortController.signal.aborted) {
      logger.info("程序已退出");
    } else {
      logger.error(`monitor 异常退出: ${String(err)}`);
      process.exit(1);
    }
  }
}

bootstrap().catch((err) => {
  logger.error(`Fatal error: ${String(err)}`);
  process.exit(1);
});
