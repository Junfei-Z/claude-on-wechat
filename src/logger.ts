/** Simple logger — all output to stderr to avoid conflicting with MCP stdio transport on stdout. */
export const logger = {
  info: (msg: string) => console.error(`[INFO] ${msg}`),
  warn: (msg: string) => console.error(`[WARN] ${msg}`),
  error: (msg: string) => console.error(`[ERROR] ${msg}`),
  debug: (msg: string) => {
    if (process.env.DEBUG) console.error(`[DEBUG] ${msg}`);
  },
};
