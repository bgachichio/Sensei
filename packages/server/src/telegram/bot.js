import TelegramBot from 'node-telegram-bot-api';

/**
 * SenseiTelegramBot - Chat with Sensei from Telegram
 * 
 * Commands:
 *   /start     — Welcome message
 *   /search    — Search your knowledge base
 *   /capture   — Quick capture knowledge
 *   /briefing  — Generate daily briefing
 *   /stats     — Knowledge base stats
 *   /help      — Show commands
 * 
 * Natural interactions:
 *   - Send any text → Sensei captures or responds based on context
 *   - Send a URL → Sensei parses it for knowledge
 *   - Send an image → Sensei analyses it via AI vision
 *   - Send a document → Sensei ingests it
 * 
 * Security:
 *   - Only responds to the configured user ID
 *   - Bot token stored server-side only
 */

export class SenseiTelegramBot {
  constructor({ database, pipeline, searchEngine, proactiveEngine, aiProvider }) {
    this.db = database;
    this.pipeline = pipeline;
    this.search = searchEngine;
    this.proactive = proactiveEngine;
    this.ai = aiProvider;
    this.bot = null;
    this.allowedUserId = null;
  }

  /**
   * Start the bot if configured
   */
  start() {
    const config = this.db.getSetting('telegram');
    if (!config || !config.botToken) {
      console.log('[Telegram] Not configured — skipping.');
      return;
    }

    this.allowedUserId = config.allowedUserId ? String(config.allowedUserId) : null;

    try {
      this.bot = new TelegramBot(config.botToken, {
        polling: { autoStart: true, params: { timeout: 30 } }
      });

      // Catch polling errors without crashing
      this.bot.on('polling_error', (error) => {
        const code = error?.response?.statusCode || error?.code;
        if (code === 401 || code === 404) {
          console.error('[Telegram] Invalid bot token. Check Settings.');
          this.stop();
        } else {
          console.warn(`[Telegram] Polling error (${code}): ${error.message}. Will retry.`);
        }
      });

      this.bot.on('error', (error) => {
        console.error('[Telegram] Bot error:', error.message);
      });

      this._registerHandlers();
      console.log('[Telegram] Bot started and listening.');
    } catch (e) {
      console.error('[Telegram] Failed to start:', e.message);
    }
  }

  /**
   * Stop the bot
   */
  stop() {
    if (this.bot) {
      this.bot.stopPolling();
      this.bot = null;
    }
  }

  /**
   * Restart the bot (called when settings change)
   */
  restart() {
    this.stop();
    this.start();
    // Send welcome message to confirm bot works
    this.sendWelcome();
  }

  /**
   * Send a welcome/confirmation message to the allowed user
   */
  async sendWelcome() {
    if (!this.bot || !this.allowedUserId) return;
    try {
      const profile = this.db.getSetting('user_profile') || {};
      const name = profile.preferredName || profile.fullName || 'there';
      const stats = this.db.getStats();
      await this.bot.sendMessage(this.allowedUserId,
        `🥋 *Sensei is connected!*\n\n` +
        `Welcome, ${name}. Your personal knowledge base is ready.\n\n` +
        `📄 ${stats.articles} articles · 👤 ${stats.entities} entities · 🔗 ${stats.backlinks} connections\n\n` +
        `Send me anything — text, links, images — and I'll capture the knowledge.\n` +
        `Type /help for all commands.`,
        { parse_mode: 'Markdown' }
      );
      console.log('[Telegram] Welcome message sent.');
    } catch (e) {
      console.warn('[Telegram] Could not send welcome message:', e.message);
    }
  }

  /**
   * Security: only allow the configured user
   */
  _isAllowed(msg) {
    if (!this.allowedUserId) return true; // If no ID set, allow all (user's choice)
    return String(msg.from.id) === this.allowedUserId;
  }

  _unauthorized(msg) {
    this.bot.sendMessage(msg.chat.id, '🔒 Unauthorised. This Sensei instance is private.');
  }

  /**
   * Get the system prompt incorporating tone/style settings
   */
  _getSystemPrompt() {
    const toneStyle = this.db.getSetting('tone_style') || {};
    const profile = this.db.getSetting('user_profile') || {};
    const name = profile.preferredName || profile.fullName || 'there';

    const toneMap = {
      concise: 'Be very concise and direct. No fluff.',
      conversational: 'Be warm, natural, and conversational.',
      professional: 'Be formal, structured, and precise.',
      analytical: 'Be data-driven, precise, and analytical.',
      coaching: 'Be encouraging, supportive, and always end with an actionable next step.',
      socratic: 'Ask probing questions to help the user think deeper.'
    };

    const lengthMap = {
      brief: 'Keep responses to 1-3 sentences maximum.',
      balanced: 'Keep responses to 1-2 short paragraphs.',
      detailed: 'Provide thorough, detailed responses with structure.'
    };

    return [
      `You are Sensei, a personal knowledge assistant for ${name}.`,
      toneMap[toneStyle.tone] || toneMap.concise,
      lengthMap[toneStyle.length] || lengthMap.balanced,
      toneStyle.customInstructions || '',
      'You have access to their personal knowledge base. Reference it when relevant.',
      'When capturing knowledge, confirm what was saved concisely.'
    ].filter(Boolean).join(' ');
  }

  _registerHandlers() {
    // /start
    this.bot.onText(/\/start/, (msg) => {
      if (!this._isAllowed(msg)) return this._unauthorized(msg);
      const name = this.db.getSetting('user_profile')?.preferredName || 'there';
      this.bot.sendMessage(msg.chat.id,
        `🥋 *Sensei is ready, ${name}.*\n\n` +
        `I'm your personal knowledge base. Here's what I can do:\n\n` +
        `💬 *Send any text* — I'll capture it as knowledge\n` +
        `🔗 *Send a link* — I'll extract the insight\n` +
        `📷 *Send an image* — I'll analyse it\n` +
        `🔍 /search <query> — Search your KB\n` +
        `📊 /stats — Knowledge base stats\n` +
        `📋 /briefing — Daily briefing\n` +
        `❓ /help — All commands`,
        { parse_mode: 'Markdown' }
      );
    });

    // /help
    this.bot.onText(/\/help/, (msg) => {
      if (!this._isAllowed(msg)) return this._unauthorized(msg);
      this.bot.sendMessage(msg.chat.id,
        `🥋 *Sensei Commands*\n\n` +
        `/search <query> — Search your knowledge\n` +
        `/capture <text> — Save knowledge explicitly\n` +
        `/briefing — Generate daily briefing\n` +
        `/stats — KB statistics\n` +
        `/ask <question> — Ask Sensei a question\n\n` +
        `Or just send me:\n` +
        `• *Text* — I'll capture it\n` +
        `• *Links* — I'll parse for insights\n` +
        `• *Images* — I'll analyse them\n` +
        `• *Documents* — I'll ingest them`,
        { parse_mode: 'Markdown' }
      );
    });

    // /search
    this.bot.onText(/\/search (.+)/, async (msg, match) => {
      if (!this._isAllowed(msg)) return this._unauthorized(msg);
      const query = match[1];
      try {
        const results = await this.search.search(query, { limit: 5 });
        if (results.length === 0) {
          return this.bot.sendMessage(msg.chat.id, `🔍 No results for "${query}".`);
        }
        const text = results.map((r, i) =>
          `${i + 1}. *${r.title}*\n   _${r.category}_ · ${r.relevance ? `${(r.relevance * 100).toFixed(0)}%` : 'match'}`
        ).join('\n\n');
        this.bot.sendMessage(msg.chat.id, `🔍 *Results for "${query}":*\n\n${text}`, { parse_mode: 'Markdown' });
      } catch (e) {
        this.bot.sendMessage(msg.chat.id, `❌ Search failed: ${e.message}`);
      }
    });

    // /capture
    this.bot.onText(/\/capture (.+)/s, async (msg, match) => {
      if (!this._isAllowed(msg)) return this._unauthorized(msg);
      try {
        const result = await this.pipeline.ingest({
          content: match[1],
          source: { type: 'telegram', id: `tg-${msg.message_id}`, date: new Date(msg.date * 1000).toISOString() }
        });
        if (result.success) {
          this.bot.sendMessage(msg.chat.id,
            `✅ *Captured:* ${result.article.frontmatter.title}\n📂 _${result.article.frontmatter.category}_`,
            { parse_mode: 'Markdown' }
          );
        } else {
          this.bot.sendMessage(msg.chat.id, `❌ ${result.error}`);
        }
      } catch (e) {
        this.bot.sendMessage(msg.chat.id, `❌ ${e.message}`);
      }
    });

    // /stats
    this.bot.onText(/\/stats/, (msg) => {
      if (!this._isAllowed(msg)) return this._unauthorized(msg);
      const stats = this.db.getStats();
      this.bot.sendMessage(msg.chat.id,
        `🥋 *Sensei Knowledge Base*\n\n` +
        `📄 ${stats.articles} articles\n` +
        `👤 ${stats.entities} entities\n` +
        `🔗 ${stats.backlinks} connections\n` +
        `🔀 ${stats.relations} relations\n\n` +
        stats.byCategory.map(c => `  _${c.category}_: ${c.count}`).join('\n'),
        { parse_mode: 'Markdown' }
      );
    });

    // /briefing
    this.bot.onText(/\/briefing/, async (msg) => {
      if (!this._isAllowed(msg)) return this._unauthorized(msg);
      if (!this.proactive?.enabled) {
        return this.bot.sendMessage(msg.chat.id, '⚠️ AI provider not configured. Add an API key in Settings to enable briefings.');
      }
      this.bot.sendMessage(msg.chat.id, '⏳ Generating briefing...');
      try {
        const briefing = await this.proactive.generateBriefing();
        this.bot.sendMessage(msg.chat.id, `📋 *Daily Briefing*\n\n${briefing}`, { parse_mode: 'Markdown' });
      } catch (e) {
        this.bot.sendMessage(msg.chat.id, `❌ ${e.message}`);
      }
    });

    // /ask
    this.bot.onText(/\/ask (.+)/s, async (msg, match) => {
      if (!this._isAllowed(msg)) return this._unauthorized(msg);
      if (!this.ai?.configured) {
        return this.bot.sendMessage(msg.chat.id, '⚠️ AI not configured.');
      }
      try {
        // Search KB for context
        const results = await this.search.search(match[1], { limit: 3 });
        const context = results.map(r => `[${r.category}] ${r.title}`).join('\n');

        const response = await this.ai.chat([
          { role: 'system', content: this._getSystemPrompt() },
          { role: 'user', content: `Question: ${match[1]}\n\nRelevant knowledge:\n${context || 'None found.'}` }
        ], { maxTokens: 500 });

        this.bot.sendMessage(msg.chat.id, response, { parse_mode: 'Markdown' });
      } catch (e) {
        this.bot.sendMessage(msg.chat.id, `❌ ${e.message}`);
      }
    });

    // Photo handler
    this.bot.on('photo', async (msg) => {
      if (!this._isAllowed(msg)) return this._unauthorized(msg);
      if (!this.proactive?.enabled) {
        return this.bot.sendMessage(msg.chat.id, '⚠️ AI not configured for image analysis.');
      }
      try {
        this.bot.sendMessage(msg.chat.id, '🔍 Analysing image...');
        const photo = msg.photo[msg.photo.length - 1]; // Highest resolution
        const file = await this.bot.getFile(photo.file_id);
        const url = `https://api.telegram.org/file/bot${this.bot.token}/${file.file_path}`;
        const res = await fetch(url);
        const buffer = Buffer.from(await res.arrayBuffer());
        const base64 = buffer.toString('base64');

        const result = await this.proactive.parseImage(base64, 'image/jpeg', `telegram-${msg.message_id}.jpg`);
        if (result.success) {
          this.bot.sendMessage(msg.chat.id,
            `✅ *Image captured:* ${result.article?.frontmatter?.title || 'Image'}\n${msg.caption ? `📝 _${msg.caption}_` : ''}`,
            { parse_mode: 'Markdown' }
          );
        }
      } catch (e) {
        this.bot.sendMessage(msg.chat.id, `❌ Image processing failed: ${e.message}`);
      }
    });

    // Document handler
    this.bot.on('document', async (msg) => {
      if (!this._isAllowed(msg)) return this._unauthorized(msg);
      try {
        const file = await this.bot.getFile(msg.document.file_id);
        const url = `https://api.telegram.org/file/bot${this.bot.token}/${file.file_path}`;
        const res = await fetch(url);
        const buffer = Buffer.from(await res.arrayBuffer());

        this.bot.sendMessage(msg.chat.id, '📄 Processing document...');
        const result = await this.pipeline.ingest({
          content: buffer.toString('utf-8').substring(0, 10000),
          title: msg.document.file_name,
          source: { type: 'telegram_document', id: `tg-doc-${msg.message_id}` }
        });
        if (result.success) {
          this.bot.sendMessage(msg.chat.id, `✅ *Ingested:* ${result.article.frontmatter.title}`, { parse_mode: 'Markdown' });
        }
      } catch (e) {
        this.bot.sendMessage(msg.chat.id, `❌ ${e.message}`);
      }
    });

    // Catch-all: plain text messages (not commands)
    this.bot.on('message', async (msg) => {
      if (!this._isAllowed(msg)) return;
      if (!msg.text || msg.text.startsWith('/')) return;
      // Skip if already handled by photo/document handlers
      if (msg.photo || msg.document) return;

      const text = msg.text.trim();

      // Check if it's a URL → parse for knowledge
      const urlMatch = text.match(/https?:\/\/[^\s]+/);
      if (urlMatch && this.proactive?.enabled) {
        try {
          this.bot.sendMessage(msg.chat.id, '🔗 Parsing link for insights...');
          const result = await this.proactive.parseURL(urlMatch[0]);
          if (result.success) {
            const title = result.parsed?.title || result.article?.frontmatter?.title || 'Link';
            const summary = result.parsed?.summary || '';
            this.bot.sendMessage(msg.chat.id,
              `✅ *${title}*\n\n${summary}\n\n📂 _${result.article?.frontmatter?.category || 'insights'}_`,
              { parse_mode: 'Markdown' }
            );
          }
        } catch (e) {
          this.bot.sendMessage(msg.chat.id, `❌ ${e.message}`);
        }
        return;
      }

      // Otherwise: capture as knowledge
      try {
        const result = await this.pipeline.ingest({
          content: text,
          source: { type: 'telegram', id: `tg-${msg.message_id}`, date: new Date(msg.date * 1000).toISOString() }
        });
        if (result.success) {
          this.bot.sendMessage(msg.chat.id,
            `✅ *${result.article.frontmatter.title}*\n📂 _${result.article.frontmatter.category}_`,
            { parse_mode: 'Markdown' }
          );
        }
      } catch (e) {
        this.bot.sendMessage(msg.chat.id, `❌ ${e.message}`);
      }
    });
  }
}
