/**
 * ProactiveEngine - Background intelligence that runs quietly, continuously
 * 
 * Jobs:
 * 1. Connection Discovery — find new links between articles
 * 2. Content Parsing — extract knowledge from URLs, tweets, videos, images
 * 3. Stale Detection — flag outdated knowledge
 * 4. Daily Briefing — summarise what's new and what needs attention
 * 5. Orphan Linking — suggest connections for isolated articles
 * 
 * All jobs are AI-powered via the user's configured LLM.
 * Runs on a timer, one job at a time, to stay within 1GB VM memory.
 */

export class ProactiveEngine {
  constructor({ database, storage, searchEngine, knowledgeGraph, linkDiscovery, pipeline, aiProvider }) {
    this.db = database;
    this.storage = storage;
    this.search = searchEngine;
    this.graph = knowledgeGraph;
    this.links = linkDiscovery;
    this.pipeline = pipeline;
    this.ai = aiProvider;
    this.timer = null;
    this.running = false;
  }

  get enabled() {
    return this.ai && this.ai.configured;
  }

  /**
   * Start the background proactive loop (runs every 30 minutes)
   */
  start(intervalMs = 30 * 60 * 1000) {
    if (!this.enabled) {
      console.log('[Proactive] No AI configured — proactive intelligence disabled.');
      return;
    }
    console.log('[Proactive] Starting background intelligence engine.');
    // Run once immediately, then on interval
    this._runCycle();
    this.timer = setInterval(() => this._runCycle(), intervalMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async _runCycle() {
    if (this.running) return;
    this.running = true;
    try {
      await this.discoverNewConnections();
      await this.detectStaleKnowledge();
      await this.suggestOrphanLinks();
    } catch (e) {
      console.error('[Proactive] Cycle error:', e.message);
    }
    this.running = false;
  }

  /**
   * Parse a shared URL (tweet, article, video) and extract knowledge
   */
  async parseURL(url) {
    if (!this.enabled) throw new Error('AI provider not configured');

    let content = '';
    let title = '';
    let mediaType = 'link';

    // Detect URL type
    if (url.match(/x\.com|twitter\.com/i)) {
      mediaType = 'tweet';
    } else if (url.match(/youtube\.com|youtu\.be/i)) {
      mediaType = 'video';
    } else if (url.match(/\.(png|jpg|jpeg|gif|webp)(\?|$)/i)) {
      mediaType = 'image';
    }

    // Fetch the page content
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Sensei/0.2; +https://github.com/bgachichio/sensei)' },
        redirect: 'follow',
        signal: AbortSignal.timeout(15000)
      });
      if (res.ok) {
        const html = await res.text();
        // Extract title
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        title = titleMatch ? titleMatch[1].trim() : '';
        // Extract text content (strip HTML)
        content = html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .substring(0, 8000);
      }
    } catch (e) {
      console.warn(`[Proactive] Failed to fetch ${url}: ${e.message}`);
    }

    // Use AI to extract the core insight
    const extraction = await this.ai.chat([
      {
        role: 'system',
        content: `You are an expert knowledge extractor. Given content from a ${mediaType}, extract the core insight, key facts, and actionable takeaways. Be concise and structured. Return valid JSON only.`
      },
      {
        role: 'user',
        content: `Extract the core knowledge from this ${mediaType}.\n\nURL: ${url}\nTitle: ${title}\nContent:\n${content.substring(0, 4000)}\n\nReturn JSON:\n{"title":"Clear descriptive title","summary":"2-3 sentence summary of the core insight","keyFacts":["fact1","fact2"],"tags":["tag1","tag2"],"category":"topics|insights|decisions|projects","importance":"low|normal|high|critical"}`
      }
    ], { temperature: 0.2 });

    let parsed;
    try {
      parsed = JSON.parse(extraction.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
    } catch {
      parsed = { title: title || url, summary: content.substring(0, 200), keyFacts: [], tags: [], category: 'insights', importance: 'normal' };
    }

    // Build the knowledge article
    const articleContent = [
      `# ${parsed.title || title}`,
      '',
      `> Source: [${mediaType}](${url})`,
      '',
      `## Summary`,
      parsed.summary,
      '',
      parsed.keyFacts?.length > 0 ? `## Key Facts\n${parsed.keyFacts.map(f => `- ${f}`).join('\n')}` : '',
    ].filter(Boolean).join('\n');

    // Ingest through the pipeline
    const result = await this.pipeline.ingest({
      title: parsed.title || title || `${mediaType}: ${url}`,
      content: articleContent,
      category: parsed.category || 'insights',
      tags: [...(parsed.tags || []), mediaType, 'parsed-from-link'],
      source: { type: `parsed_${mediaType}`, id: url, date: new Date().toISOString(), url }
    });

    return { ...result, parsed };
  }

  /**
   * Parse an uploaded image for embedded knowledge
   */
  async parseImage(base64Data, mimeType, filename) {
    if (!this.enabled) throw new Error('AI provider not configured');

    const description = await this.ai.describeImage(base64Data, mimeType);

    // Extract deeper knowledge from the description
    const extraction = await this.ai.extractEntities(description);

    const content = [
      `# ${extraction.summary || filename}`,
      '',
      `![${filename}](uploaded)`,
      '',
      `## AI Analysis`,
      description,
    ].join('\n');

    return this.pipeline.ingest({
      title: extraction.summary || `Image: ${filename}`,
      content,
      category: extraction.importance === 'high' ? 'insights' : 'topics',
      tags: [...(extraction.tags || []), 'image', 'parsed'],
      source: { type: 'parsed_image', id: filename }
    });
  }

  /**
   * Discover new connections between recent articles
   */
  async discoverNewConnections() {
    const recent = this.db.listArticles({ limit: 20 });
    let newLinks = 0;

    for (const article of recent) {
      const fullArticle = await this.storage.read(article.path);
      if (!fullArticle) continue;

      const existingBacklinks = this.db.getBacklinks(article.id);
      const similar = await this.search.findSimilar(article.id, 3, 0.7);

      for (const sim of similar) {
        const alreadyLinked = existingBacklinks.some(b => b.source_article_id === sim.id || b.target_article_id === sim.id);
        if (!alreadyLinked) {
          this.db.addBacklink({
            sourceArticleId: article.id,
            targetArticleId: sim.id,
            linkType: 'semantic',
            context: `Discovered connection (${(sim.similarity * 100).toFixed(0)}% similar)`,
            strength: sim.similarity
          });
          newLinks++;
        }
      }
    }

    if (newLinks > 0) console.log(`[Proactive] Discovered ${newLinks} new connections.`);
    return newLinks;
  }

  /**
   * Detect articles that may be stale (>90 days old, high importance)
   */
  async detectStaleKnowledge() {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const articles = this.db.listArticles({ limit: 200 });
    const stale = articles.filter(a =>
      a.updated_at < cutoff &&
      (a.importance === 'high' || a.importance === 'critical') &&
      a.category !== 'raw'
    );

    if (stale.length > 0) {
      // Store stale list as a setting for the dashboard to display
      this.db.setSetting('stale_articles', stale.map(a => ({ id: a.id, title: a.title, updatedAt: a.updated_at })));
    }
    return stale.length;
  }

  /**
   * Suggest links for orphan articles
   */
  async suggestOrphanLinks() {
    const orphans = this.links.getOrphans();
    let linked = 0;

    for (const orphan of orphans.slice(0, 10)) {
      const similar = await this.search.findSimilar(orphan.id, 2, 0.6);
      for (const sim of similar) {
        this.db.addBacklink({
          sourceArticleId: orphan.id,
          targetArticleId: sim.id,
          linkType: 'suggested',
          context: `Suggested link for orphan article`,
          strength: sim.similarity
        });
        linked++;
      }
    }

    if (linked > 0) console.log(`[Proactive] Linked ${linked} orphan connections.`);
    return linked;
  }

  /**
   * Generate a daily briefing
   */
  async generateBriefing() {
    if (!this.enabled) return null;

    const recent = this.db.listArticles({ limit: 10 });
    const stale = this.db.getSetting('stale_articles') || [];
    const stats = this.db.getStats();
    const orphans = this.links.getOrphans();

    const briefingContent = await this.ai.chat([
      {
        role: 'system',
        content: 'You are Sensei, a personal knowledge base assistant. Generate a concise daily briefing.'
      },
      {
        role: 'user',
        content: `Generate a daily briefing based on:\n\nRecent articles (${recent.length}):\n${recent.map(a => `- [${a.category}] ${a.title}`).join('\n')}\n\nStale articles needing review: ${stale.length}\nOrphan articles (unlinked): ${orphans.length}\nTotal knowledge: ${stats.articles} articles, ${stats.entities} entities, ${stats.backlinks} connections\n\nBe concise. Highlight what needs attention. Suggest 1-2 actionable next steps.`
      }
    ], { maxTokens: 500 });

    // Store as a knowledge article
    await this.pipeline.ingest({
      title: `Daily Briefing — ${new Date().toLocaleDateString()}`,
      content: briefingContent,
      category: 'insights',
      tags: ['briefing', 'daily'],
      source: { type: 'proactive', id: `briefing-${Date.now()}` }
    });

    return briefingContent;
  }
}
