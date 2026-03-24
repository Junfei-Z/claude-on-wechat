import { z } from "zod";
import path from "node:path";
import os from "node:os";

const configSchema = z.object({
  WEIXIN_BASE_URL: z.string().default("https://ilinkai.weixin.qq.com"),
  WEIXIN_CDN_BASE_URL: z.string().default("https://novac2c.cdn.weixin.qq.com/c2c"),
  DATA_DIR: z.string().default("~/.wechat-claude"),
  DEBUG: z.string().optional(),
});

export type Config = {
  weixinBaseUrl: string;
  weixinCdnBaseUrl: string;
  dataDir: string;
};

function expandHome(p: string): string {
  if (p.startsWith("~/")) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

export function loadConfig(): Config {
  const raw = configSchema.parse(process.env);
  const dataDir = expandHome(raw.DATA_DIR);
  return {
    weixinBaseUrl: raw.WEIXIN_BASE_URL,
    weixinCdnBaseUrl: raw.WEIXIN_CDN_BASE_URL,
    dataDir,
  };
}
