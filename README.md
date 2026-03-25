<p align="center">
  <img src="https://img.shields.io/badge/WeChat-07C160?style=for-the-badge&logo=wechat&logoColor=white" alt="WeChat"/>
  <img src="https://img.shields.io/badge/Claude_Code-191919?style=for-the-badge&logo=anthropic&logoColor=white" alt="Claude Code"/>
  <img src="https://img.shields.io/badge/MCP-Protocol-blue?style=for-the-badge" alt="MCP"/>
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge" alt="License"/>
  <br/>
  <img src="https://img.shields.io/github/stars/Junfei-Z/claude-on-wechat?style=for-the-badge&logo=github&color=gold" alt="Stars"/>
  <img src="https://img.shields.io/github/forks/Junfei-Z/claude-on-wechat?style=for-the-badge&logo=github" alt="Forks"/>
</p>

<h1 align="center">💬 Claude on WeChat</h1>

<p align="center">
  <strong>把你的微信变成 AI 开发终端</strong><br/>
  微信发消息，Claude Code 干活 — 读代码、改 Bug、提 PR、查论文、跑命令，全在一条微信消息里完成。
</p>


---

## 🤔 这不是聊天机器人

普通的微信 ChatBot 只能聊天。**Claude on WeChat** 让你通过微信远程操控一台**有手有脚的 AI Agent**：

| 能力 | 💬 普通微信 ChatBot | 🚀 Claude on WeChat |
|------|:-:|:-:|
| 💭 聊天对话 | ✅ | ✅ |
| 📂 读写本地文件 | ❌ | ✅ |
| 🖥️ 执行终端命令 | ❌ | ✅ |
| 🔀 操作 Git / GitHub | ❌ | ✅ |
| 🌐 联网搜索 | ❌ | ✅ |
| 🧩 接入 Figma / Notion 等工具 | ❌ | ✅ |
| ⏰ 定时任务 | ❌ | ✅ |
| 🧠 跨消息保留完整上下文 | ❌ | ✅ |

---

## 🎯 使用场景

### 📱 移动端代码审查
> 地铁上收到同事的 PR，微信发一句 *"review 一下 PR #42"*，Claude 帮你看完代码直接留评论。

### 🔬 科研助手
> 发论文 PDF 路径，让它总结要点、提取关键信息、甚至帮你写实验代码。

### 🖥️ 远程运维
> *"服务器上 docker 容器状态怎么样？"* — 直接跑命令查看并汇报。

### ⏰ 定时播报
> 设置每天早上推送 arXiv 最新论文摘要到微信。

### 🎨 设计转代码
> 发 Figma 链接，Claude 读取设计稿生成代码，完成后微信通知你。

### 📊 数据分析
> *"帮我跑一下 data/ 目录下的分析脚本，把结果发我"* — 执行完直接汇报。

---

## ⚙️ 工作原理

本项目是一个 MCP server，声明了 `claude/channel` capability（Claude Code Channel v2.1.80+ 的官方扩展机制）。

```
📱 微信用户 ⟷ 🌐 微信 API ⟷ 🔌 claude-on-wechat (MCP Server) ⟷ 🤖 Claude Code (全部工具能力)
```

| 角色 | 职责 |
|------|------|
| **📱 微信** | 用户发送 / 接收消息的 IM 平台 |
| **🔌 claude-on-wechat** | 轮询微信 API 获取新消息，推送 MCP notification 给 Claude Code；接收 Claude Code 的 reply tool 调用，将回复发送到微信（自动分段、Markdown 转纯文本） |
| **🤖 Claude Code** | 接收 channel 推送的消息，在当前 session 中处理（可使用所有工具能力），通过 reply tool 回复，原生管理会话上下文 |

### ✨ 技术亮点

- 🏛️ 基于 Claude Code Channel **官方协议**，不是 hack
- 💪 完整继承 Claude Code 的**所有工具能力**（不是阉割版）
- 🧠 **上下文连续**，不是每条消息独立处理
- 🖼️ **图片/文件/视频/语音消息支持**（我们的增强，详见下方）
- 🧩 可以和其他 MCP server **组合使用**（Figma + 微信 = 设计稿转代码后微信通知）

---

## 🚀 快速开始

### 📋 前置条件

- 🤖 Claude Code **v2.1.80+**
- 📦 Node.js 18+ 或 Bun 运行时
- 💬 微信 **v8.0.70+**

### 1️⃣ 克隆项目并构建

```bash
git clone https://github.com/Junfei-Z/claude-on-wechat.git
cd claude-on-wechat
npm install
npm run build
```

### 2️⃣ 注册 MCP server

使用 `claude mcp add` 命令注册，将路径替换为你的实际克隆位置：

```bash
claude mcp add wechat -- node /你的路径/claude-on-wechat/dist/server.js
```

> 💡 例如：`claude mcp add wechat -- node /Users/yourname/claude-on-wechat/dist/server.js`

<details>
<summary>📝 也可以手动编辑 .mcp.json（点击展开）</summary>

在你想让 Claude Code 工作的目录下，创建或编辑 `.mcp.json`：

```json
{
  "mcpServers": {
    "wechat": {
      "command": "node",
      "args": ["/你的路径/claude-on-wechat/dist/server.js"]
    }
  }
}
```

</details>

### 3️⃣ 启动 Claude Code

> ⚠️ **注意**：以下命令需要在**终端 shell** 中运行（即正常的命令行提示符下），不是在 Claude Code 的交互界面里。

```bash
claude --dangerously-load-development-channels server:wechat
```

启动后你应该看到：
```
Listening for channel messages from: server:wechat
```

> 💡 首次启动会自动弹出微信登录二维码图片，用微信扫码登录。登录凭证会保存到 `~/.wechat-claude/`，后续启动自动恢复。

如需重新登录：

```bash
rm -rf ~/.wechat-claude/accounts/
```

### 4️⃣ 开始使用

用微信给登录的账号发消息，Claude Code 会自动接收并回复 🎉

你可以发送**文字、图片、文件、视频、语音**，Claude Code 都能接收和处理。

---

## 🔧 配置

通过环境变量配置。可以在启动时传入，或在 `.mcp.json` 中设置：

```bash
# 方式一：启动时传入环境变量
DEBUG=1 claude --dangerously-load-development-channels server:wechat
```

```json
// 方式二：在 .mcp.json 中配置
{
  "mcpServers": {
    "wechat": {
      "command": "node",
      "args": ["/你的路径/claude-on-wechat/dist/server.js"],
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
| `DATA_DIR` | `~/.wechat-claude` | 📁 数据持久化目录（账号凭证、同步状态） |
| `DEBUG` | 未设置 | 🐛 设置任意值开启调试日志 |

---

## 📦 内置处理

| 功能 | 说明 |
|------|------|
| ✂️ **自动分段** | 微信单条消息限制 4000 字符，超长回复自动拆分多条发送 |
| 📝 **Markdown 转纯文本** | Claude 的回复自动去除 Markdown 格式（微信不支持渲染） |
| 🔐 **凭证持久化** | 微信登录凭证保存在 `DATA_DIR` 下，重启自动恢复 |
| 📷 **二维码自动打开** | 登录二维码保存为图片并自动用系统默认程序打开 |
| 🖼️ **媒体消息支持** | 图片、文件、视频、语音消息自动下载到本地，Claude Code 可直接读取 |

---

## 🔀 与上游的关系

本项目的 MCP server 基于 [fengliu222/claude-wechat-channel](https://github.com/fengliu222/claude-wechat-channel) 进行了二次开发，在此感谢原作者的出色工作！

### 我们的改进

| 改进 | 说明 |
|------|------|
| 🖼️ **媒体消息支持** | 原版仅支持文本消息，图片/文件/视频/语音消息会被跳过。我们补全了媒体消息的接收流程：自动下载解密到本地，并将文件路径推送给 Claude Code，使其能直接读取和处理 |
| 📖 **使用文档** | 提供完整的中文使用指南和场景示例 |

> 原版代码中已经实现了媒体文件的下载和解密能力（`media-download.ts`），但在消息处理流程中（`monitor.ts`）未接入。我们的修改主要是将这些已有能力串联起来，修改量很小但效果显著。

---

## ⚠️ 注意事项

- 🧪 Channel 功能目前是 Claude Code 的实验性特性，需要 `--dangerously-load-development-channels` 标志
- 🔒 `DATA_DIR` 下的凭证文件请妥善保管

---

## 📄 License

MIT

---

## ⭐ 觉得有用？

如果这个项目对你有帮助，请给个 **Star** 支持一下！你的 Star 是我持续更新的动力 🙏


<a href="https://www.star-history.com/?repos=Junfei-Z%2Fclaude-on-wechat&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/image?repos=Junfei-Z/claude-on-wechat&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/image?repos=Junfei-Z/claude-on-wechat&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/image?repos=Junfei-Z/claude-on-wechat&type=date&legend=top-left" />
 </picture>
</a>

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/Junfei-Z">Junfei-Z</a> & 🤖 Claude Code
</p>
