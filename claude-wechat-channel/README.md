# claude-wechat-channel

微信 Channel for [Claude Code](https://docs.anthropic.com/en/docs/claude-code)。

让 Claude Code 直接通过微信收发消息 — 微信消息到达后，Claude Code 在当前 session 中处理并回复，完整保留上下文和工具能力。

## 工作原理

本项目是一个 MCP server，声明了 `claude/channel` capability（[Claude Code Channel](https://docs.anthropic.com/en/docs/claude-code) v2.1.80+ 的官方扩展机制）。三方各司其职：

| 角色 | 职责 |
|------|------|
| **微信** | 用户发送/接收消息的 IM 平台 |
| **claude-wechat-channel** | 轮询微信 API 获取新消息，推送 MCP notification 给 Claude Code；接收 Claude Code 的 reply tool 调用，将回复发送到微信（自动分段、markdown 转纯文本） |
| **Claude Code** | 接收 channel 推送的消息，在当前 session 中处理（可使用所有工具能力），通过 reply tool 回复，原生管理会话上下文 |

## 快速开始

### 前置条件

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) v2.1.80+
- [Node.js](https://nodejs.org/) 18+ 或 [Bun](https://bun.sh/) 运行时

### 1. 注册 MCP server

在你想让 Claude Code 工作的目录下，创建或编辑 `.mcp.json`：

```json
{
  "mcpServers": {
    "wechat": {
      "command": "npx",
      "args": ["claude-wechat-channel"]
    }
  }
}
```

### 2. 启动 Claude Code

```bash
claude --dangerously-load-development-channels server:wechat
```

首次启动会自动弹出微信登录二维码图片，用微信扫码登录。登录凭证会保存到 `~/.wechat-claude/`，后续启动自动恢复。

> 如需重新登录，删除凭证目录即可：`rm -rf ~/.wechat-claude/accounts/`

### 3. 开始使用

从「微信ClawBot」发消息，Claude Code 会自动接收并回复。

## 配置

通过环境变量配置，在 `.mcp.json` 中传入：

```json
{
  "mcpServers": {
    "wechat": {
      "command": "npx",
      "args": ["claude-wechat-channel"],
      "env": {
        "DATA_DIR": "~/.wechat-claude",
        "DEBUG": "1"
      }
    }
  }
}
```

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `DATA_DIR` | `~/.wechat-claude` | 数据持久化目录（账号凭证、同步状态） |
| `DEBUG` | 未设置 | 设置任意值开启调试日志 |

## 内置处理

- **自动分段**：微信单条消息限制 4000 字符，超长回复会自动拆分为多条发送
- **Markdown 转纯文本**：Claude 的回复会自动去除 markdown 格式（微信不支持渲染）
- **凭证持久化**：微信登录凭证保存在 `DATA_DIR` 目录下，重启自动恢复登录状态
- **二维码自动打开**：登录二维码会保存为图片并自动用系统默认程序打开（macOS / Linux / Windows）

## 注意事项

- Channel 功能目前是 Claude Code 的实验性特性，需要 `--dangerously-load-development-channels` 标志
- `DATA_DIR` 下的凭证文件请妥善保管

## License

MIT
