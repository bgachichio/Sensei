# 🥋 Sensei

**The self-updating personal knowledge base.**

Sensei automatically ingests, structures, and connects knowledge from your AI conversations, email, messages, and note-taking apps into a unified, observable, AI-queryable knowledge graph — backed by plain Markdown files you own.

## Why Sensei?

Your knowledge is fragmented across dozens of platforms. Claude conversations evaporate. ChatGPT chats are locked behind export buttons. Email threads hold decisions nobody can find. Notion pages sit unconnected. None of it talks to each other.

**Sensei fixes this.** One knowledge base. All your sources. Always connected. Always yours.

## Features

### 🧠 Automatic Knowledge Ingestion
- **14 data connectors** — AI conversations, email, messages, note-taking apps, RSS, webhooks
- Content automatically classified, tagged, and linked — no manual organisation
- Configurable sync intervals per connector (hourly / 4h / 12h / daily / custom time / manual)
- Global sync defaults for all connectors

### 🔗 Knowledge Graph & Linking
- **Automatic backlinks** — every article knows what links to it
- **6 link types** — explicit wikilinks, semantic similarity, entity co-occurrence, temporal, causal, suggested
- **Entity extraction** — people, projects, decisions, commitments, locations auto-detected
- **Orphan detection** — unlinked articles flagged for connection
- Obsidian-compatible `[[wikilink]]` syntax
- Interactive force-directed graph visualisation

### 🔍 Hybrid Search
- Full-text search (SQLite FTS5 with porter stemming)
- Semantic search (embeddings + cosine similarity via your chosen AI)
- Results ranked by relevance with category filtering

### 🤖 Multi-LLM with Automatic Failover
- **7 providers** — OpenRouter, OpenAI, Anthropic, Gemini, Grok, Perplexity, Ollama
- Configure up to **3 providers** (primary → secondary → tertiary)
- If primary fails, Sensei automatically falls to the next

### 💬 Telegram Bot
- Chat with Sensei from your phone — zero-friction mobile access
- `/search` `/capture` `/briefing` `/stats` `/ask` commands
- Send text → captured as knowledge. Send a URL → AI extracts insight. Send an image → AI analyses it.
- Secured to your Telegram user ID only

### 🔮 Proactive Intelligence
- Background engine discovers new connections every 30 minutes
- **Content parser** — share a tweet, article, or video link; AI extracts the embedded knowledge
- **Daily briefings** — summarises what's new and what needs attention
- **Stale detection** — flags outdated high-importance knowledge

### 📡 MCP Server
- 7 tools: `sensei_search`, `sensei_read`, `sensei_write`, `sensei_ingest`, `sensei_people`, `sensei_graph`, `sensei_stats`
- Connect Claude Desktop, Cursor, or any MCP client

### 🎨 Beautiful UI
- Responsive (mobile + desktop), dark / light / auto theme
- 4 fonts, 4 sizes, configurable animations (on/off)
- Tone & style settings (concise / conversational / professional / analytical / coaching / socratic)
- All settings persist across sessions

### 📱 Connectors

| Category | Connectors |
|----------|-----------|
| AI Conversations | Claude, ChatGPT, Gemini |
| Note-Taking | Obsidian, Notion, Google Docs, Google Keep, Apple Notes |
| Communication | Gmail, iMessage, WhatsApp, Telegram, Slack, RSS |
| Storage | Backblaze B2, Google Drive, Dropbox, Box, S3/R2, local |
| Generic | Webhook, media upload, URL parser |

### 🔒 Security
- Self-hosted — data never leaves your infrastructure
- API keys server-side only. Security headers. TLS via Caddy. No telemetry.

## Quick Start

```bash
git clone https://github.com/bgachichio/Sensei.git
cd Sensei
npm install
cd packages/web && npx vite build && cd ../..
npm start
```

Open `http://localhost:8082` and complete the 7-step onboarding.

## MCP Configuration

```json
{
  "mcpServers": {
    "sensei": {
      "type": "http",
      "url": "http://localhost:8082/mcp"
    }
  }
}
```

## CLI

```bash
node packages/cli/src/index.js search "kubernetes"
node packages/cli/src/index.js add "Met with John, agreed to ship by Friday"
node packages/cli/src/index.js stats
```

## Licence

AGPL-3.0 — see [LICENCE](LICENCE)

## Author

**Brian Gachichio Karanja** — [gachichio.org](https://gachichio.org) · [@b_gachichio](https://x.com/b_gachichio) · [GitHub](https://github.com/bgachichio/) · [LinkedIn](https://www.linkedin.com/in/briangachichio/)

---

Made with ❤️ by Brian Gachichio &nbsp; [![Support](https://img.shields.io/badge/Support-Sensei-237352?style=for-the-badge)](https://paystack.shop/pay/gachichio)
