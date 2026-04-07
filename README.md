# 🥋 Sensei

**The self-updating personal knowledge base.**

Sensei automatically ingests, structures, and connects knowledge from your digital life — AI conversations, email, messages, notes, and the web — into a unified, AI-queryable knowledge graph backed by plain Markdown files. Self-hosted. Open source. Private by design.

[![Support](https://img.shields.io/badge/Support_Sensei-237352?style=for-the-badge)](https://paystack.shop/pay/gachichio)

---

## Features

### 🧠 Knowledge Engine
- **Automatic ingestion** — knowledge flows in from 14+ sources without manual entry
- **AI-powered classification** — articles auto-categorised into topics, people, projects, decisions, insights, commitments, preferences
- **Entity extraction** — people, projects, decisions, and commitments automatically identified and tracked
- **Custom categories** — create your own categories beyond the defaults
- **Full CRUD** — create, read, update, delete, and recategorise articles (files physically move between directories)

### 🔗 Connections & Linking
- **Wikilinks** — `[[double-bracket]]` syntax links articles together (Obsidian-compatible)
- **Automatic backlinks** — every link creates a reverse reference
- **Semantic connections** — AI discovers related articles by meaning, not just keywords
- **Entity co-occurrence** — articles mentioning the same person/project are automatically linked
- **Orphan detection** — unconnected articles are flagged for linking
- **Knowledge graph visualisation** — interactive force-directed graph of all entities and connections

### 🔍 Search
- **Full-text search** — SQLite FTS5 with Porter stemming
- **Semantic search** — vector embeddings with cosine similarity ranking
- **Hybrid search** — combines both for the best results

### 🤖 AI Integration (Multi-LLM with Failover)
- **7 providers** — OpenRouter, OpenAI, Anthropic, Gemini, Grok, Perplexity, Ollama
- **Up to 3 active** — primary, secondary, tertiary with automatic failover
- **No lock-in** — switch providers anytime; works without AI (full-text search only mode)

### 📥 Connectors (14+)
- **AI conversations** — Claude, ChatGPT, Gemini (ZIP import)
- **Note-taking** — Obsidian (vault watcher), Notion (API), Google Docs, Google Keep, Apple Notes
- **Communication** — Gmail, iMessage, WhatsApp, Telegram, Slack, RSS feeds
- **Generic** — Webhook endpoint, media upload with OCR
- **Configurable sync** — per-connector intervals (hourly / 4h / 12h / daily / custom time / manual) with global defaults

### 🔗 Content Parser
- **URL parsing** — share a tweet, article, or video link; Sensei extracts the core insight, key facts, and tags, and saves it as a knowledge article with the source backlinked
- **Image analysis** — upload or share an image; AI describes it, OCR extracts text, knowledge is captured
- **Document ingestion** — PDFs and text files processed and indexed

### 💬 Telegram Bot
- **Chat with Sensei** — search, capture, parse links, receive briefings, analyse images — all from Telegram
- **Commands** — `/search`, `/capture`, `/briefing`, `/stats`, `/ask`, `/help`
- **Natural interaction** — send text (captured), links (parsed for insight), images (analysed), documents (ingested)
- **Secure** — only responds to your configured Telegram user ID

### 🧩 MCP Server
- **7 tools** — `sensei_search`, `sensei_read`, `sensei_write`, `sensei_ingest`, `sensei_people`, `sensei_graph`, `sensei_stats`
- **Connect any AI client** — Claude Desktop, Cursor, Claude Code, or any MCP-compatible tool
- **JSON-RPC + SSE** — standard MCP protocol over HTTP

### 🧭 Proactive Intelligence
- **Background engine** — runs quietly every 30 minutes
- **Connection discovery** — finds new semantic links between articles
- **Stale knowledge detection** — flags high-importance articles that haven't been updated in 90+ days
- **Orphan linking** — suggests connections for isolated articles
- **Daily briefing** — AI-generated summary of what's new, what needs attention, and suggested next steps

### 🎨 UI & Experience
- **7-step onboarding** — identity, appearance, AI providers, storage, first knowledge, domain/Telegram setup, connectors
- **Dark / Light / Auto themes** — pill-style toggle with live system theme detection
- **Font selection** — Inter, Georgia, JetBrains Mono, System — with live preview
- **Font size** — S / M / L / XL visual selector
- **Animations** — smooth transitions and effects, configurable on/off
- **Mobile-first** — responsive layout, 44px touch targets, iOS zoom prevention, safe-area support
- **Cross-browser** — Chrome, Safari, Firefox, Edge tested
- **Tone & style** — configure how Sensei speaks (concise / conversational / professional / analytical / coaching / socratic) with custom instructions

### ☁️ Storage & Sync
- **Observable** — all knowledge stored as plain `.md` files with YAML frontmatter
- **Cloud sync** — Backblaze B2, Google Drive, Dropbox, Box, S3/R2 (via rclone)
- **Local sync** — filesystem path for cross-machine / mobile access
- **Git-friendly** — version your knowledge with git

### 🔒 Security
- **Self-hosted** — your data never leaves your infrastructure
- **No telemetry** — zero data phones home
- **HTTPS** — automatic TLS via Caddy reverse proxy
- **Security headers** — HSTS, X-Frame-Options, X-Content-Type-Options, X-XSS-Protection
- **API keys server-side only** — never sent to frontend
- **Telegram auth** — only your user ID can interact with your bot
- **MCP auth** — bearer token support for remote access

---

## Quick Start

```bash
git clone https://github.com/bgachichio/sensei.git
cd sensei
npm install
cd packages/web && npx vite build && cd ../..
npm start
```

Open `http://localhost:8082` and complete the onboarding wizard.

## Deployment

### PM2 (recommended for VPS)

```bash
mkdir -p logs
pm2 start ecosystem.config.cjs
pm2 save
```

### With HTTPS (Caddy)

```
your-domain.com {
    reverse_proxy localhost:8082
}
```

```bash
sudo systemctl reload caddy
```

### MCP Client Config

```json
{
  "mcpServers": {
    "sensei": {
      "type": "http",
      "url": "https://your-domain.com/mcp"
    }
  }
}
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SENSEI_PORT` | `8082` | Server port |
| `SENSEI_DATA_DIR` | `~/sensei-data` | Knowledge base directory |

All other configuration (AI providers, storage, connectors, Telegram) is managed through the web UI.

## CLI

```bash
node packages/cli/src/index.js search "kubernetes"
node packages/cli/src/index.js add "Decided to use Caddy for reverse proxy"
node packages/cli/src/index.js list projects
node packages/cli/src/index.js stats
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js |
| Server | Express.js |
| Frontend | React + Vite + Tailwind CSS |
| Database | SQLite (better-sqlite3) + FTS5 |
| MCP | JSON-RPC over HTTP |
| AI | 7 providers with failover |
| Chat | Telegram Bot API |

## Project Structure

```
sensei/
├── packages/
│   ├── core/           # Storage, search, graph, AI, ingestion, media, scheduler, proactive
│   ├── server/         # Express API + MCP server + Telegram bot
│   ├── web/            # React frontend
│   ├── cli/            # Command-line interface
│   └── connectors/     # AI, note-taking, comms, storage connectors
├── tests/              # Integration + extended test suites (101 tests)
├── ecosystem.config.cjs # PM2 config
└── package.json
```

## Licence

AGPLv3 — see [LICENCE](LICENCE)

## Author

**Brian Gachichio** — [gachichio.org](https://gachichio.org) · [@b_gachichio](https://x.com/b_gachichio) · [GitHub](https://github.com/bgachichio/) · [LinkedIn](https://www.linkedin.com/in/briangachichio/)

---

Made with ❤️ by Brian Gachichio &nbsp; [![Support](https://img.shields.io/badge/Support-Sensei-237352?style=for-the-badge)](https://paystack.shop/pay/gachichio)
