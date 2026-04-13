import { Router } from 'express';
import multer from 'multer';
import { nanoid } from 'nanoid';
import { AIProvider } from '@sensei/core';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

export function apiRoutes(services) {
  const router = Router();
  const { storage, database, searchEngine, knowledgeGraph, linkDiscovery, pipeline } = services;

  // ── Articles ──

  router.get('/articles', async (req, res) => {
    try {
      const { category, limit = 50, offset = 0 } = req.query;
      const articles = database.listArticles({ category, limit: +limit, offset: +offset });
      res.json({ articles });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/articles/:id', async (req, res) => {
    try {
      const dbArticle = database.getArticle(req.params.id);
      if (!dbArticle) return res.status(404).json({ error: 'Not found' });
      const article = await storage.read(dbArticle.path);
      const backlinks = database.getBacklinks(req.params.id);
      const forwardLinks = database.getForwardLinks(req.params.id);
      const entities = database.getArticleEntities(req.params.id);
      res.json({ article, backlinks, forwardLinks, entities });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/articles', async (req, res) => {
    try {
      const { title, category, content, tags } = req.body;
      const article = await storage.write({ title, category, content, tags });
      const contentHash = await storage.contentHash(article.path);
      database.upsertArticle({ ...article.frontmatter, path: article.path, content_hash: contentHash, content });
      await searchEngine.indexArticle(article.id, `${title}\n\n${content || ''}`);
      res.json({ article });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.put('/articles/:id', async (req, res) => {
    try {
      const dbArticle = database.getArticle(req.params.id);
      if (!dbArticle) return res.status(404).json({ error: 'Not found' });

      // If adding a custom category, register it
      if (req.body.category) {
        const { addCategory } = await import('@sensei/core');
        addCategory(req.body.category);
        // Persist custom categories
        const customs = database.getSetting('custom_categories') || [];
        if (!customs.includes(req.body.category)) {
          database.setSetting('custom_categories', [...customs, req.body.category]);
        }
      }

      const updated = await storage.update(dbArticle.path, req.body);
      const actualPath = updated._movedFrom ? updated.path : dbArticle.path;
      const contentHash = await storage.contentHash(actualPath);

      // If file was moved (recategorised), update the path in DB
      if (updated._movedFrom) {
        database.deleteArticle(req.params.id);
      }
      database.upsertArticle({
        id: req.params.id,
        ...updated,
        path: actualPath,
        content_hash: contentHash,
        created: updated.created || dbArticle.created_at,
        updated: updated.updated || new Date().toISOString()
      });

      if (req.body.content || req.body.title) {
        await searchEngine.indexArticle(req.params.id, `${updated.title}\n\n${req.body.content || updated.content || ''}`);
        await linkDiscovery.discoverLinks(req.params.id, req.body.content || updated.content || '', actualPath);
      }
      res.json({ article: updated });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.delete('/articles/:id', async (req, res) => {
    try {
      const dbArticle = database.getArticle(req.params.id);
      if (!dbArticle) return res.status(404).json({ error: 'Not found' });
      await storage.delete(dbArticle.path);
      database.deleteArticle(req.params.id);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Search ──

  router.get('/search', async (req, res) => {
    try {
      const { q, category, limit = 20 } = req.query;
      if (!q) return res.json({ results: [] });
      const results = await searchEngine.search(q, { category, limit: +limit });
      res.json({ results, query: q });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Graph ──

  router.get('/graph', (req, res) => {
    try {
      const { type, limit = 200 } = req.query;
      const data = knowledgeGraph.getGraphData({ entityType: type, limit: +limit });
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/entities', (req, res) => {
    try {
      const { type, limit = 100 } = req.query;
      const entities = database.listEntities(type, +limit);
      res.json({ entities });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/entities/:id/articles', (req, res) => {
    try {
      const articles = database.getEntityArticles(req.params.id);
      const relations = database.getEntityRelations(req.params.id);
      res.json({ articles, relations });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/people/:name', (req, res) => {
    try {
      const dossier = knowledgeGraph.getPersonDossier(req.params.name);
      if (!dossier) return res.status(404).json({ error: 'Person not found' });
      res.json(dossier);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Ingestion ──

  router.post('/ingest', async (req, res) => {
    try {
      const result = await pipeline.ingest(req.body);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/ingest/batch', async (req, res) => {
    try {
      const results = await pipeline.ingestBatch(req.body.items || []);
      res.json({ results, total: results.length, success: results.filter(r => r.success).length });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/reindex', async (req, res) => {
    try {
      const result = await pipeline.reindexAll();
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Media Upload ──

  router.post('/media', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
      const mediaPath = await storage.storeMedia(req.file.originalname, req.file.buffer);
      res.json({ path: mediaPath, size: req.file.size, mimetype: req.file.mimetype });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Settings & Onboarding ──

  router.get('/settings', (req, res) => {
    try {
      const settings = database.getAllSettings();
      res.json({ settings, isOnboarded: !!settings.user_profile });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/settings', (req, res) => {
    try {
      for (const [key, value] of Object.entries(req.body)) {
        database.setSetting(key, value);
      }
      // Restart Telegram bot if telegram settings changed
      if (req.body.telegram && services.telegramBot) {
        services.telegramBot.restart();
      }
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/onboarding', async (req, res) => {
    try {
      const { userProfile, appearance, storage: storagePrefs, aiProvider: aiConfig } = req.body;

      database.setSetting('user_profile', userProfile);
      database.setSetting('appearance', appearance);
      database.setSetting('storage_preferences', storagePrefs);

      if (aiConfig && aiConfig.apiKey) {
        database.setSetting('ai_provider', aiConfig);
        // Re-initialise AI provider
        const newAi = new AIProvider(aiConfig);
        services.aiProvider = newAi;
        services.searchEngine = new (await import('@sensei/core')).SearchEngine(database, newAi);
        services.pipeline.ai = newAi;
        services.pipeline.search = services.searchEngine;
        if (services.mediaProcessor) services.mediaProcessor.ai = newAi;
      }

      // Handle multi-provider format
      if (aiConfig && aiConfig.providers && aiConfig.providers.length > 0) {
        database.setSetting('ai_provider', aiConfig);
        const newAi = new AIProvider(aiConfig);
        services.aiProvider = newAi;
        services.searchEngine = new (await import('@sensei/core')).SearchEngine(database, newAi);
        services.pipeline.ai = newAi;
        services.pipeline.search = services.searchEngine;
        if (services.mediaProcessor) services.mediaProcessor.ai = newAi;
      }

      res.json({ success: true, message: 'Welcome to Sensei, ' + (userProfile.preferredName || userProfile.fullName) });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Stats ──

  router.get('/stats', (req, res) => {
    try {
      const stats = database.getStats();
      const orphans = linkDiscovery.getOrphans();
      res.json({ ...stats, orphans: orphans.length });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Connectors ──

  router.post('/connectors/claude/import', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
      const { ClaudeConnector } = await import('@sensei/connectors');
      const connector = new ClaudeConnector();
      const items = await connector.parseExport(req.file.buffer);
      const results = await pipeline.ingestBatch(items);
      res.json({ imported: results.filter(r => r.success).length, total: items.length });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/connectors/chatgpt/import', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
      const { ChatGPTConnector } = await import('@sensei/connectors');
      const connector = new ChatGPTConnector();
      const items = await connector.parseExport(req.file.buffer);
      const results = await pipeline.ingestBatch(items);
      res.json({ imported: results.filter(r => r.success).length, total: items.length });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/connectors/gemini/import', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
      const { GeminiConnector } = await import('@sensei/connectors');
      const connector = new GeminiConnector();
      const items = await connector.parseExport(req.file.buffer);
      const results = await pipeline.ingestBatch(items);
      res.json({ imported: results.filter(r => r.success).length, total: items.length });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Webhook (generic ingest) ──

  router.post('/webhook/ingest', async (req, res) => {
    try {
      const { content, title, category, tags, source } = req.body;
      if (!content) return res.status(400).json({ error: 'content is required' });
      const result = await pipeline.ingest({
        content, title, category, tags,
        source: source || { type: 'webhook', id: nanoid(8) }
      });
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Additional Connector Imports ──

  router.post('/connectors/whatsapp/import', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
      const { WhatsAppConnector } = await import('@sensei/connectors');
      const connector = new WhatsAppConnector();
      const items = await connector.parseExport(req.file.buffer);
      const results = await pipeline.ingestBatch(items);
      res.json({ imported: results.filter(r => r.success).length, total: items.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/connectors/telegram/import', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
      const { TelegramConnector } = await import('@sensei/connectors');
      const connector = new TelegramConnector();
      const items = await connector.parseExport(req.file.buffer);
      const results = await pipeline.ingestBatch(items);
      res.json({ imported: results.filter(r => r.success).length, total: items.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/connectors/google-keep/import', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
      const { GoogleKeepConnector } = await import('@sensei/connectors');
      const connector = new GoogleKeepConnector();
      const items = await connector.parseExport(req.file.buffer);
      const results = await pipeline.ingestBatch(items);
      res.json({ imported: results.filter(r => r.success).length, total: items.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Media Processing ──

  router.post('/media/process', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
      const { mediaProcessor } = services;
      let result;
      if (req.file.mimetype.startsWith('image/')) {
        result = await mediaProcessor.processImage(req.file.buffer, req.file.originalname, req.file.mimetype);
      } else if (req.file.mimetype === 'application/pdf') {
        result = await mediaProcessor.processPDF(req.file.buffer, req.file.originalname);
      } else {
        const mediaPath = await storage.storeMedia(req.file.originalname, req.file.buffer);
        result = { path: mediaPath, originalName: req.file.originalname, mimeType: req.file.mimetype, size: req.file.size };
      }

      // If OCR or description extracted, optionally ingest as knowledge
      if ((result.ocrText && result.ocrText.length > 30) || (result.extractedText && result.extractedText.length > 30)) {
        const textContent = result.ocrText || result.extractedText || '';
        await pipeline.ingest({
          title: `Media: ${req.file.originalname}`,
          content: `![${req.file.originalname}](${result.path})\n\n${result.description ? `**Description:** ${result.description}\n\n` : ''}${textContent}`,
          category: null,
          tags: ['media', req.file.mimetype.split('/')[0]],
          source: { type: 'media_upload', id: result.path }
        });
      }

      res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Sync Scheduler ──

  router.get('/sync/status', (req, res) => {
    try {
      const { syncScheduler } = services;
      res.json(syncScheduler.getStatus());
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/sync/config', (req, res) => {
    try {
      const { syncScheduler } = services;
      const { connectorId, config } = req.body;
      if (connectorId) {
        syncScheduler.updateConfig(connectorId, config);
      } else {
        syncScheduler.updateGlobalConfig(config);
      }
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/sync/run/:connectorId', async (req, res) => {
    try {
      const { syncScheduler } = services;
      await syncScheduler.runSync(req.params.connectorId);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Storage Management ──

  router.get('/storage/config', (req, res) => {
    try {
      const { storageManager } = services;
      res.json(storageManager.getConfig());
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/storage/cloud', (req, res) => {
    try {
      const { storageManager } = services;
      const { provider, ...config } = req.body;
      storageManager.setPrimaryCloud(provider, config);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/storage/local', (req, res) => {
    try {
      const { storageManager } = services;
      storageManager.setPrimaryLocal(req.body.path);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/storage/sync-to-cloud', async (req, res) => {
    try {
      const result = await services.storageManager.syncToCloud();
      res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/storage/sync-to-local', async (req, res) => {
    try {
      const result = await services.storageManager.syncToLocal();
      res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Proactive Intelligence ──

  router.post('/parse-url', async (req, res) => {
    try {
      const { proactiveEngine } = services;
      if (!proactiveEngine.enabled) return res.status(400).json({ error: 'AI provider not configured. Add an API key in Settings.' });
      const result = await proactiveEngine.parseURL(req.body.url);
      res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/parse-image', upload.single('file'), async (req, res) => {
    try {
      const { proactiveEngine } = services;
      if (!proactiveEngine.enabled) return res.status(400).json({ error: 'AI provider not configured.' });
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
      const base64 = req.file.buffer.toString('base64');
      const result = await proactiveEngine.parseImage(base64, req.file.mimetype, req.file.originalname);
      res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/briefing', async (req, res) => {
    try {
      const { proactiveEngine } = services;
      if (!proactiveEngine.enabled) return res.status(400).json({ error: 'AI provider not configured.' });
      const briefing = await proactiveEngine.generateBriefing();
      res.json({ briefing });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── AI Provider Status + Configuration ──

  router.get('/ai/status', (req, res) => {
    try {
      const { aiProvider } = services;
      if (!aiProvider || !aiProvider.configured) {
        return res.json({ configured: false, providers: [] });
      }
      res.json({ configured: true, providers: aiProvider.getStatus() });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/ai/configure', async (req, res) => {
    try {
      const aiConfig = req.body;
      database.setSetting('ai_provider', aiConfig);

      // Reinit ALL services that depend on AI
      const { AIProvider: AIP, SearchEngine: SE } = await import('@sensei/core');
      const newAi = new AIP(aiConfig);
      services.aiProvider = newAi;

      const newSearch = new SE(database, newAi);
      services.searchEngine = newSearch;
      services.pipeline.ai = newAi;
      services.pipeline.search = newSearch;
      if (services.mediaProcessor) services.mediaProcessor.ai = newAi;
      if (services.proactiveEngine) {
        services.proactiveEngine.ai = newAi;
        services.proactiveEngine.search = newSearch;
        // Restart proactive engine with new AI
        services.proactiveEngine.stop();
        services.proactiveEngine.start();
      }
      if (services.telegramBot) {
        services.telegramBot.ai = newAi;
      }

      res.json({ success: true, providers: newAi.getStatus() });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Categories ──

  router.get('/categories', async (req, res) => {
    try {
      const { CATEGORIES } = await import('@sensei/core');
      const customs = database.getSetting('custom_categories') || [];
      res.json({ categories: [...new Set([...CATEGORIES, ...customs])] });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/categories', async (req, res) => {
    try {
      const { addCategory } = await import('@sensei/core');
      const slug = addCategory(req.body.name);
      const customs = database.getSetting('custom_categories') || [];
      if (!customs.includes(slug)) {
        database.setSetting('custom_categories', [...customs, slug]);
      }
      // Ensure directory exists
      const catDir = (await import('path')).default.join(services.storage.knowledgePath, slug);
      const fsModule = await import('fs');
      if (!fsModule.existsSync(catDir)) fsModule.mkdirSync(catDir, { recursive: true });
      res.json({ category: slug });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── About / Attribution ──

  router.get('/about', (req, res) => {
    res.json({
      name: 'Sensei',
      version: '1.0.0',
      tagline: 'The self-updating personal knowledge base',
      description: 'Sensei automatically ingests, structures, and connects knowledge from your AI conversations, email, messages, and notes into a unified, observable, AI-queryable knowledge graph backed by plain Markdown files.',
      creator: {
        name: 'Brian Gachichio',
        website: 'https://gachichio.org/',
        x: 'https://x.com/b_gachichio',
        github: 'https://github.com/bgachichio/',
        linkedin: 'https://www.linkedin.com/in/briangachichio/'
      },
      support: 'https://paystack.shop/pay/gachichio',
      licence: 'AGPL-3.0'
    });
  });

  return router;
}
