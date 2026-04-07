/**
 * Extended tests for new features:
 * Multi-LLM failover, connectors, storage manager, media processor, scheduler
 */
import { AIProvider, PROVIDER_CONFIGS, SyncScheduler, Database, StorageEngine, MediaProcessor } from '@sensei/core';
import { ObsidianConnector, NotionConnector, WhatsAppConnector, RSSConnector, GoogleKeepConnector, TelegramConnector, StorageManager, CLOUD_PROVIDERS } from '@sensei/connectors';
import fs from 'fs';
import path from 'path';

const TEST_DIR = '/tmp/sensei-ext-test-' + Date.now();
let passed = 0, failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.error(`  ✗ ${msg}`); }
}

async function runTests() {
  console.log('\n🥋 Sensei Extended Tests\n');

  // ── Multi-LLM Provider ──
  console.log('── Multi-LLM Provider ──');

  assert(Object.keys(PROVIDER_CONFIGS).length === 7, `7 providers configured: ${Object.keys(PROVIDER_CONFIGS).join(', ')}`);
  assert(PROVIDER_CONFIGS.ollama.noKey === true, 'Ollama does not require API key');
  assert(PROVIDER_CONFIGS.gemini.isGeminiFormat === true, 'Gemini uses Gemini format');
  assert(PROVIDER_CONFIGS.anthropic.isAnthropicFormat === true, 'Anthropic uses Anthropic format');
  assert(PROVIDER_CONFIGS.grok.baseUrl === 'https://api.x.ai/v1', 'Grok uses x.ai API');
  assert(PROVIDER_CONFIGS.perplexity.baseUrl === 'https://api.perplexity.ai', 'Perplexity uses correct base URL');

  // Test multi-provider construction
  const multiAI = new AIProvider({
    providers: [
      { provider: 'openrouter', apiKey: 'test-key-1', priority: 0 },
      { provider: 'gemini', apiKey: 'test-key-2', priority: 1 },
      { provider: 'ollama', priority: 2 }
    ]
  });
  assert(multiAI.providers.length === 3, `Built ${multiAI.providers.length} providers`);
  assert(multiAI.providers[0].id === 'openrouter', 'Primary is OpenRouter');
  assert(multiAI.providers[1].id === 'gemini', 'Secondary is Gemini');
  assert(multiAI.providers[2].id === 'ollama', 'Tertiary is Ollama');

  // Test status output
  const status = multiAI.getStatus();
  assert(status.length === 3, 'Status returns all 3 providers');
  assert(status[0].priority === 'primary', 'First provider labeled primary');
  assert(status[1].priority === 'secondary', 'Second provider labeled secondary');
  assert(status[2].priority === 'tertiary', 'Third provider labeled tertiary');

  // Test legacy single-provider format
  const legacyAI = new AIProvider({ provider: 'openai', apiKey: 'test' });
  assert(legacyAI.providers.length === 1, 'Legacy single provider works');
  assert(legacyAI.primaryProvider.id === 'openai', 'Legacy provider ID correct');

  // Test embedding provider selection
  const embAI = new AIProvider({
    providers: [
      { provider: 'perplexity', apiKey: 'pk', priority: 0 }, // No embeddings
      { provider: 'openai', apiKey: 'ok', priority: 1 }      // Has embeddings
    ]
  });
  assert(embAI.embeddingModel === 'text-embedding-3-small', 'Finds first provider with embeddings');

  // ── Sync Scheduler ──
  console.log('\n── Sync Scheduler ──');
  const db = new Database(TEST_DIR);

  const scheduler = new SyncScheduler(db);
  let syncCallCount = 0;
  scheduler.register('test-connector', async () => { syncCallCount++; return { count: 5 }; });
  assert(scheduler.handlers.size === 1, 'Handler registered');

  scheduler.updateConfig('test-connector', { enabled: true, interval: 'manual' });
  const savedConfigs = db.getSetting('sync_configs');
  assert(savedConfigs['test-connector'].enabled === true, 'Config saved to database');

  await scheduler.runSync('test-connector');
  assert(syncCallCount === 1, 'Manual sync executed');

  const syncStatus = scheduler.getStatus();
  assert(syncStatus.connectors.length === 1, 'Status returns 1 connector');
  assert(syncStatus.connectors[0].lastSync !== null, 'Last sync timestamp recorded');

  scheduler.updateGlobalConfig({ interval: 'daily' });
  const globalConfig = db.getSetting('global_sync');
  assert(globalConfig.interval === 'daily', 'Global config saved');

  scheduler.stopAll();

  // ── Obsidian Connector ──
  console.log('\n── Obsidian Connector ──');
  const vaultPath = path.join(TEST_DIR, 'test-vault');
  fs.mkdirSync(path.join(vaultPath, '.obsidian'), { recursive: true });
  fs.writeFileSync(path.join(vaultPath, 'note-one.md'), '---\ntitle: Note One\ntags: [test]\n---\n\n# Note One\n\nThis is a test Obsidian note with enough content to pass the filter.');
  fs.mkdirSync(path.join(vaultPath, 'subfolder'), { recursive: true });
  fs.writeFileSync(path.join(vaultPath, 'subfolder', 'note-two.md'), '---\ntitle: Note Two\n---\n\n# Note Two\n\nAnother note in a subfolder with wikilinks [[note-one]].');

  const obsidian = new ObsidianConnector({ vaultPath });
  const obsidianItems = await obsidian.sync();
  assert(obsidianItems.length === 2, `Obsidian found ${obsidianItems.length} notes`);
  assert(obsidianItems.some(i => i.title === 'Note One'), 'Found Note One');
  assert(obsidianItems.some(i => i.source.type === 'obsidian'), 'Source type is obsidian');

  // ── WhatsApp Connector ──
  console.log('\n── WhatsApp Connector ──');
  const waConnector = new WhatsAppConnector();
  const waBuffer = Buffer.from('[01/04/2026, 10:00] John: Hey, are we meeting today?\n[01/04/2026, 10:05] Me: Yes, 2pm at the usual spot.\n[01/04/2026, 10:06] John: Perfect, see you there.');
  const waItems = await waConnector.parseExport(waBuffer);
  assert(waItems.length === 1, `WhatsApp parsed ${waItems.length} chat`);
  assert(waItems[0].tags.includes('whatsapp'), 'WhatsApp tag applied');

  // ── Google Keep Connector ──
  console.log('\n── Google Keep Connector ──');
  const JSZip = (await import('jszip')).default;
  const keepZip = new JSZip();
  keepZip.file('note1.json', JSON.stringify({ title: 'Shopping List', textContent: 'Milk, eggs, bread, butter, cheese and more items to make it long enough', labels: [{ name: 'groceries' }] }));
  keepZip.file('note2.json', JSON.stringify({ title: 'Todo', listContent: [{ text: 'Build Sensei', isChecked: true }, { text: 'Deploy to VM', isChecked: false }] }));
  const keepBuffer = await keepZip.generateAsync({ type: 'nodebuffer' });
  const keepConnector = new GoogleKeepConnector();
  const keepItems = await keepConnector.parseExport(keepBuffer);
  assert(keepItems.length >= 1, `Google Keep parsed ${keepItems.length} notes`);
  assert(keepItems[0].tags.includes('google-keep'), 'Keep tag applied');

  // ── Telegram Connector ──
  console.log('\n── Telegram Connector ──');
  const teleZip = new JSZip();
  teleZip.file('chat.json', JSON.stringify({
    name: 'Dev Group', messages: [
      { type: 'message', date: '2026-04-01T10:00:00', from: 'Alice', text: 'Has anyone tried the new Sensei knowledge base tool? It looks really promising for personal knowledge management.' },
      { type: 'message', date: '2026-04-01T10:01:00', from: 'Bob', text: 'Yes, I deployed it yesterday. The MCP integration with Claude is incredible for keeping context across conversations.' }
    ]
  }));
  const teleBuffer = await teleZip.generateAsync({ type: 'nodebuffer' });
  const teleConnector = new TelegramConnector();
  const teleItems = await teleConnector.parseExport(teleBuffer);
  assert(teleItems.length === 1, `Telegram parsed ${teleItems.length} chat`);
  assert(teleItems[0].title === 'Dev Group', 'Telegram chat name correct');

  // ── Storage Manager ──
  console.log('\n── Storage Manager ──');
  assert(Object.keys(CLOUD_PROVIDERS).length === 6, `${Object.keys(CLOUD_PROVIDERS).length} cloud providers configured`);
  assert(CLOUD_PROVIDERS.backblaze_b2.name === 'Backblaze B2', 'B2 provider defined');
  assert(CLOUD_PROVIDERS.google_drive.name === 'Google Drive', 'Google Drive provider defined');
  assert(CLOUD_PROVIDERS.dropbox.name === 'Dropbox', 'Dropbox provider defined');
  assert(CLOUD_PROVIDERS.box.name === 'Box', 'Box provider defined');
  assert(CLOUD_PROVIDERS.s3.name === 'S3 / R2 (compatible)', 'S3/R2 provider defined');
  assert(CLOUD_PROVIDERS.local.name === 'Local Path', 'Local provider defined');

  const storageMgr = new StorageManager(db, path.join(TEST_DIR, 'knowledge'));
  const storageConfig = storageMgr.getConfig();
  assert(storageConfig.providers !== undefined, 'Storage config returns providers');
  assert(storageConfig.primaryCloud === null, 'No cloud configured initially');

  storageMgr.setPrimaryCloud('backblaze_b2', { account: 'test', key: 'test', bucket: 'sensei-test' });
  const cloudConfig = db.getSetting('storage_primary_cloud');
  assert(cloudConfig.provider === 'backblaze_b2', 'Primary cloud saved as B2');

  storageMgr.setPrimaryLocal('/tmp/sensei-local-sync');
  const localConfig = db.getSetting('storage_primary_local');
  assert(localConfig.path === '/tmp/sensei-local-sync', 'Primary local path saved');

  // ── Media Processor ──
  console.log('\n── Media Processor ──');
  const storage = new StorageEngine(TEST_DIR);
  const mediaProcessor = new MediaProcessor({ storage, database: db, aiProvider: null });
  assert(mediaProcessor.mediaPath.includes('media'), 'Media path set');

  // Create a small test image (1x1 red PNG)
  const pngBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64');
  const imageResult = await mediaProcessor.processImage(pngBuffer, 'test-image.png', 'image/png');
  assert(imageResult.path.startsWith('media/'), `Image stored at: ${imageResult.path}`);
  assert(imageResult.originalName === 'test-image.png', 'Original name preserved');
  assert(imageResult.mimeType === 'image/png', 'MIME type preserved');
  assert(imageResult.size === pngBuffer.length, 'Size recorded');
  assert(fs.existsSync(path.join(TEST_DIR, 'knowledge', imageResult.path)), 'Image file exists on disk');

  // ── RSS Connector (mock) ──
  console.log('\n── RSS Connector ──');
  const rssConnector = new RSSConnector({ feeds: [] });
  const rssItems = await rssConnector.sync();
  assert(Array.isArray(rssItems), 'RSS returns array (empty for no feeds)');

  // Cleanup
  db.close();
  fs.rmSync(TEST_DIR, { recursive: true, force: true });

  console.log(`\n${'─'.repeat(40)}`);
  console.log(`  ✓ ${passed} passed`);
  if (failed > 0) console.log(`  ✗ ${failed} failed`);
  console.log(`${'─'.repeat(40)}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(e => { console.error('Test error:', e); process.exit(1); });
