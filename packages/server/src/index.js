import express from 'express';
import cors from 'cors';
import compression from 'compression';
import path from 'path';
import { fileURLToPath } from 'url';
import { StorageEngine, Database, SearchEngine, KnowledgeGraph, LinkDiscovery, IngestionPipeline, MediaProcessor, SyncScheduler, ProactiveEngine, AIProvider } from '@sensei/core';
import { StorageManager } from '@sensei/connectors';
import { apiRoutes } from './routes/api.js';
import { mcpRoutes } from './mcp/server.js';
import { SenseiTelegramBot } from './telegram/bot.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.SENSEI_PORT || 8082;
const DATA_DIR = process.env.SENSEI_DATA_DIR || path.join(process.env.HOME || '/home/sensei', 'sensei-data');

// ── Initialise core services ──

const storage = new StorageEngine(DATA_DIR);
const database = new Database(DATA_DIR);

// AI provider — supports multi-LLM with failover
let aiProvider = null;
const aiConfig = database.getSetting('ai_provider');
if (aiConfig) {
  aiProvider = new AIProvider(aiConfig);
}

const searchEngine = new SearchEngine(database, aiProvider);
const knowledgeGraph = new KnowledgeGraph(database);
const linkDiscovery = new LinkDiscovery(database, searchEngine);
const pipeline = new IngestionPipeline({
  storage, database, searchEngine, knowledgeGraph, linkDiscovery, aiProvider
});
const mediaProcessor = new MediaProcessor({ storage, database, aiProvider });
const syncScheduler = new SyncScheduler(database);
const storageManager = new StorageManager(database, path.join(DATA_DIR, 'knowledge'));
const proactiveEngine = new ProactiveEngine({
  database, storage, searchEngine, knowledgeGraph, linkDiscovery, pipeline, aiProvider
});
const telegramBot = new SenseiTelegramBot({
  database, pipeline, searchEngine, proactiveEngine, aiProvider
});

// Share services across routes
const services = {
  storage, database, searchEngine, knowledgeGraph, linkDiscovery,
  pipeline, aiProvider, mediaProcessor, syncScheduler, storageManager, proactiveEngine, telegramBot
};

// ── Express app ──

const app = express();

// Security: trust reverse proxy (Caddy/nginx) for HTTPS
app.set('trust proxy', 1);

app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// Health check
app.get('/health', (req, res) => {
  const stats = database.getStats();
  const aiStatus = aiProvider ? aiProvider.getStatus() : [];
  res.json({ status: 'ok', version: '1.0.0', ...stats, ai: aiStatus, uptime: process.uptime() | 0 });
});

// API routes
app.use('/api', apiRoutes(services));

// MCP endpoint
app.use('/mcp', mcpRoutes(services));

// Global error handler — catches unhandled errors elegantly
app.use((err, req, res, _next) => {
  console.error(`[Error] ${req.method} ${req.path}:`, err.message);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    path: req.path
  });
});

// Serve static frontend (built React app)
const webDist = path.join(__dirname, '../../web/dist');
app.use(express.static(webDist));
app.get('/{*path}', (req, res) => {
  if (!req.path.startsWith('/api') && !req.path.startsWith('/mcp')) {
    res.sendFile(path.join(webDist, 'index.html'));
  }
});

// ── Start ──

app.listen(PORT, () => {
  const aiDesc = aiProvider
    ? `${aiProvider.providers.length} provider(s): ${aiProvider.getStatus().map(p => `${p.name} [${p.priority}]`).join(', ')}`
    : 'Not configured';
  console.log(`\n  🥋 Sensei v1.0.0`);
  console.log(`  ─────────────────────────`);
  console.log(`  Server:  http://localhost:${PORT}`);
  console.log(`  MCP:     http://localhost:${PORT}/mcp`);
  console.log(`  Data:    ${DATA_DIR}`);
  console.log(`  AI:      ${aiDesc}`);
  console.log(`  Stats:   ${database.getStats().articles} articles\n`);

  // Start proactive intelligence (background, quiet)
  proactiveEngine.start();
  // Start Telegram bot (if configured)
  telegramBot.start();
});

// Graceful shutdown
process.on('SIGTERM', () => { telegramBot.stop(); proactiveEngine.stop(); syncScheduler.stopAll(); database.close(); process.exit(0); });
process.on('SIGINT', () => { telegramBot.stop(); proactiveEngine.stop(); syncScheduler.stopAll(); database.close(); process.exit(0); });
