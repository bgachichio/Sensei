/**
 * Sensei Integration Test
 * Tests: StorageEngine, Database, SearchEngine, KnowledgeGraph, LinkDiscovery, IngestionPipeline, Connectors
 */
import { StorageEngine, Database, SearchEngine, KnowledgeGraph, LinkDiscovery, IngestionPipeline, AIProvider, createArticle, parseArticle } from '@sensei/core';
import { ClaudeConnector, ChatGPTConnector, GeminiConnector } from '@sensei/connectors';
import fs from 'fs';
import path from 'path';

const TEST_DIR = '/tmp/sensei-test-' + Date.now();
let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.error(`  ✗ ${msg}`); }
}

async function runTests() {
  console.log('\n🥋 Sensei Integration Tests\n');

  // ── Test 1: Article Model ──
  console.log('── Article Model ──');
  const article = createArticle({ title: 'Test Article', category: 'topics', content: 'Hello world', tags: ['test'] });
  assert(article.id.length > 0, 'Article has ID');
  assert(article.path === 'topics/test-article.md', `Article path is correct: ${article.path}`);
  assert(article.markdown.includes('title: Test Article'), 'Article markdown has frontmatter');
  assert(article.markdown.includes('Hello world'), 'Article markdown has content');

  const parsed = parseArticle(article.markdown, article.path);
  assert(parsed.title === 'Test Article', 'Parsed title matches');
  assert(parsed.category === 'topics', 'Parsed category matches');
  assert(parsed.tags.includes('test'), 'Parsed tags match');

  // ── Test 2: Wikilink Extraction ──
  console.log('\n── Wikilink Extraction ──');
  const { extractWikilinks } = await import('@sensei/core/src/storage/article.js');
  const links = extractWikilinks('See [[projects/sensei]] and [[people/brian|Brian]] for details on [[kubernetes]]');
  assert(links.length === 3, `Extracted ${links.length} wikilinks`);
  assert(links.includes('projects/sensei'), 'Found projects/sensei link');
  assert(links.includes('people/brian'), 'Found people/brian link (stripped display text)');
  assert(links.includes('kubernetes'), 'Found kubernetes link');

  // ── Test 3: Storage Engine ──
  console.log('\n── Storage Engine ──');
  const storage = new StorageEngine(TEST_DIR);
  const written = await storage.write({ title: 'Kubernetes Networking', category: 'topics', content: 'Pod-to-pod networking uses a flat model.', tags: ['k8s', 'networking'] });
  assert(fs.existsSync(path.join(TEST_DIR, 'knowledge', written.path)), 'File created on disk');

  const read = await storage.read(written.path);
  assert(read !== null, 'Article readable from disk');
  assert(read.title === 'Kubernetes Networking', 'Read title matches');
  assert(read.content.includes('Pod-to-pod'), 'Read content matches');

  const updated = await storage.update(written.path, { tags: ['k8s', 'networking', 'updated'] });
  assert(updated.tags.includes('updated'), 'Article updated with new tag');

  const listed = await storage.list('topics');
  assert(listed.length >= 1, `Listed ${listed.length} articles in topics`);

  const hash = await storage.contentHash(written.path);
  assert(hash && hash.length === 64, `Content hash generated: ${hash.substring(0, 16)}...`);

  // ── Test 4: Database ──
  console.log('\n── Database ──');
  const db = new Database(TEST_DIR);

  db.upsertArticle({
    id: written.id, path: written.path, title: 'Kubernetes Networking',
    category: 'topics', tags: ['k8s'], created: new Date().toISOString(),
    updated: new Date().toISOString(), content_hash: hash, content: 'Pod-to-pod networking'
  });

  const dbArticle = db.getArticle(written.id);
  assert(dbArticle !== null, 'Article found in database');
  assert(dbArticle.title === 'Kubernetes Networking', 'DB title matches');

  const byPath = db.getArticleByPath(written.path);
  assert(byPath !== null, 'Article found by path');

  // ── Test 5: FTS Search ──
  console.log('\n── Full-Text Search ──');
  db.updateFTSContent(written.id, 'Pod-to-pod networking uses a flat model. Kubernetes services provide stable endpoints.');

  const ftsResults = db.searchFTS('kubernetes networking');
  assert(ftsResults.length > 0, `FTS found ${ftsResults.length} results for "kubernetes networking"`);

  // ── Test 6: Entities & Knowledge Graph ──
  console.log('\n── Entities & Knowledge Graph ──');
  const graph = new KnowledgeGraph(db);

  const personEntity = graph.upsertEntity('person', 'Brian Gachichio', { role: 'builder' });
  assert(personEntity.id.startsWith('person_'), 'Person entity created');

  const projectEntity = graph.upsertEntity('project', 'Sensei', { status: 'building' });
  assert(projectEntity.id.startsWith('project_'), 'Project entity created');

  graph.addRelation(personEntity.id, projectEntity.id, 'works_on', { context: 'Building Sensei' });

  const relations = db.getEntityRelations(personEntity.id);
  assert(relations.length > 0, `Found ${relations.length} relations for Brian`);

  db.linkArticleEntity(written.id, personEntity.id, 'author');
  const articleEntities = db.getArticleEntities(written.id);
  assert(articleEntities.length > 0, 'Article-entity link created');

  const entityArticles = db.getEntityArticles(personEntity.id);
  assert(entityArticles.length > 0, 'Entity-article lookup works');

  // ── Test 7: Backlinks ──
  console.log('\n── Backlinks ──');
  const article2 = await storage.write({ title: 'Platform Migration', category: 'projects', content: 'See [[topics/kubernetes-networking]] for details.' });
  db.upsertArticle({
    id: article2.id, path: article2.path, title: 'Platform Migration',
    category: 'projects', tags: [], created: new Date().toISOString(),
    updated: new Date().toISOString(), content_hash: 'abc', content: ''
  });

  db.addBacklink({
    sourceArticleId: article2.id, targetArticleId: written.id,
    linkType: 'explicit', context: 'Wikilink: [[topics/kubernetes-networking]]'
  });

  const backlinks = db.getBacklinks(written.id);
  assert(backlinks.length > 0, `Found ${backlinks.length} backlink(s) to Kubernetes Networking`);
  assert(backlinks[0].source_title === 'Platform Migration', 'Backlink source title correct');

  const forwardLinks = db.getForwardLinks(article2.id);
  assert(forwardLinks.length > 0, 'Forward links work');

  // ── Test 8: Entity Extraction (AI mock) ──
  console.log('\n── Entity Graph Processing ──');
  const extraction = {
    entities: [
      { type: 'person', name: 'John Smith', role: 'discussed with' },
      { type: 'project', name: 'Sensei', role: 'main project' }
    ],
    decisions: [{ what: 'Use SQLite for storage', context: 'Simpler than Postgres' }],
    commitments: [{ what: 'Ship v1 by end of April', who: 'Brian' }],
    tags: ['architecture'],
    importance: 'high',
    summary: 'Architecture discussion about Sensei storage layer'
  };

  graph.processExtraction(written.id, extraction);
  const allEntities = db.listEntities(null, 100);
  assert(allEntities.length >= 4, `Created ${allEntities.length} entities (expected ≥4: person, project, decision, commitment)`);

  // ── Test 9: Settings ──
  console.log('\n── Settings ──');
  db.setSetting('user_profile', { fullName: 'Brian Gachichio', preferredName: 'Brian' });
  const profile = db.getSetting('user_profile');
  assert(profile.fullName === 'Brian Gachichio', 'Setting saved and retrieved');

  db.setSetting('appearance', { theme: 'dark', fontFamily: 'Inter', fontSize: '16px' });
  const allSettings = db.getAllSettings();
  assert(Object.keys(allSettings).length >= 2, `${Object.keys(allSettings).length} settings stored`);

  // ── Test 10: Stats ──
  console.log('\n── Stats ──');
  const stats = db.getStats();
  assert(stats.articles >= 2, `Stats: ${stats.articles} articles`);
  assert(stats.entities >= 4, `Stats: ${stats.entities} entities`);
  assert(stats.relations >= 1, `Stats: ${stats.relations} relations`);
  assert(stats.backlinks >= 1, `Stats: ${stats.backlinks} backlinks`);
  assert(stats.byCategory.length >= 1, `Stats: ${stats.byCategory.length} categories`);

  // ── Test 11: Search Engine (hybrid) ──
  console.log('\n── Search Engine (no AI) ──');
  const search = new SearchEngine(db, null);
  const searchResults = await search.search('kubernetes', { limit: 5 });
  assert(searchResults.length > 0, `Hybrid search (FTS only, no AI) found ${searchResults.length} results`);

  // ── Test 12: Link Discovery ──
  console.log('\n── Link Discovery ──');
  const linkDiscovery = new LinkDiscovery(db, search);
  await linkDiscovery.discoverLinks(article2.id, 'See [[topics/kubernetes-networking]] for details.', article2.path);
  // Entity co-occurrence links should also be created
  const discoveredBacklinks = db.getBacklinks(written.id);
  assert(discoveredBacklinks.length >= 1, `Link discovery found ${discoveredBacklinks.length} links to Kubernetes article`);

  const orphans = linkDiscovery.getOrphans();
  console.log(`  ℹ ${orphans.length} orphan articles`);

  // ── Test 13: Ingestion Pipeline (without AI) ──
  console.log('\n── Ingestion Pipeline (no AI) ──');
  const pipeline = new IngestionPipeline({
    storage, database: db, searchEngine: search,
    knowledgeGraph: graph, linkDiscovery, aiProvider: null
  });

  const ingestResult = await pipeline.ingest({
    content: 'We decided to use Caddy as our reverse proxy because it handles TLS automatically.',
    title: 'Caddy Decision',
    category: 'decisions',
    tags: ['infrastructure'],
    source: { type: 'test', id: 'test-1' }
  });
  assert(ingestResult.success, 'Ingestion pipeline succeeded');
  assert(ingestResult.article.path.startsWith('decisions/'), 'Ingested article in correct category');

  // ── Test 14: Connector Parsers (Claude mock) ──
  console.log('\n── Connector: Claude ──');
  const claudeConnector = new ClaudeConnector();
  // Create a mock Claude export
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  zip.file('conversations.json', JSON.stringify([
    {
      uuid: 'conv-001',
      name: 'Kubernetes Architecture',
      created_at: '2026-04-05T10:00:00Z',
      chat_messages: [
        { sender: 'human', text: 'How does Kubernetes networking work?' },
        { sender: 'assistant', text: 'Kubernetes uses a flat networking model where every pod gets its own IP address.' }
      ]
    },
    {
      uuid: 'conv-002',
      name: 'Short Chat',
      created_at: '2026-04-06T12:00:00Z',
      chat_messages: [{ sender: 'human', text: 'Hi' }]
    }
  ]));
  const claudeZip = await zip.generateAsync({ type: 'nodebuffer' });
  const claudeItems = await claudeConnector.parseExport(claudeZip);
  assert(claudeItems.length === 1, `Claude connector parsed ${claudeItems.length} conversations (skipped short ones)`);
  assert(claudeItems[0].title === 'Kubernetes Architecture', 'Claude conversation title correct');
  assert(claudeItems[0].tags.includes('claude'), 'Claude tag applied');

  // ── Test 15: Connector Parsers (ChatGPT mock) ──
  console.log('\n── Connector: ChatGPT ──');
  const chatgptConnector = new ChatGPTConnector();
  const gptZip = new JSZip();
  gptZip.file('conversations.json', JSON.stringify([
    {
      id: 'gpt-001',
      title: 'React Performance Tips',
      create_time: 1712300000,
      update_time: 1712400000,
      mapping: {
        'msg-1': {
          message: {
            author: { role: 'user' },
            content: { parts: ['How can I optimize React rendering?'] },
            create_time: 1712300001
          }
        },
        'msg-2': {
          message: {
            author: { role: 'assistant' },
            content: { parts: ['Use React.memo, useMemo, and useCallback to prevent unnecessary re-renders.'] },
            create_time: 1712300002
          }
        }
      }
    }
  ]));
  const gptBuffer = await gptZip.generateAsync({ type: 'nodebuffer' });
  const gptItems = await chatgptConnector.parseExport(gptBuffer);
  assert(gptItems.length === 1, `ChatGPT connector parsed ${gptItems.length} conversations`);
  assert(gptItems[0].title === 'React Performance Tips', 'ChatGPT title correct');

  // ── Test 16: Connector Parsers (Gemini mock) ──
  console.log('\n── Connector: Gemini ──');
  const geminiConnector = new GeminiConnector();
  const gemZip = new JSZip();
  gemZip.file('Takeout/Gemini Apps/conversation.json', JSON.stringify({
    title: 'Python Best Practices',
    createTime: '2026-04-01T08:00:00Z',
    turns: [
      { role: 'USER', parts: [{ text: 'What are Python best practices?' }] },
      { role: 'MODEL', parts: [{ text: 'Use type hints, write tests, follow PEP 8 style guidelines.' }] }
    ]
  }));
  const gemBuffer = await gemZip.generateAsync({ type: 'nodebuffer' });
  const gemItems = await geminiConnector.parseExport(gemBuffer);
  assert(gemItems.length === 1, `Gemini connector parsed ${gemItems.length} conversations`);
  assert(gemItems[0].tags.includes('gemini'), 'Gemini tag applied');

  // ── Test 17: Batch Ingestion ──
  console.log('\n── Batch Ingestion ──');
  const batchResults = await pipeline.ingestBatch(claudeItems);
  assert(batchResults.length === 1, 'Batch ingested 1 item');
  assert(batchResults[0].success, 'Batch item succeeded');

  // ── Test 18: Full Stats After All Tests ──
  console.log('\n── Final Stats ──');
  const finalStats = db.getStats();
  console.log(`  Articles:    ${finalStats.articles}`);
  console.log(`  Entities:    ${finalStats.entities}`);
  console.log(`  Relations:   ${finalStats.relations}`);
  console.log(`  Connections: ${finalStats.backlinks}`);
  for (const c of finalStats.byCategory) {
    console.log(`    ${c.category}: ${c.count}`);
  }

  // Cleanup
  db.close();
  fs.rmSync(TEST_DIR, { recursive: true, force: true });

  // Summary
  console.log(`\n${'─'.repeat(40)}`);
  console.log(`  ✓ ${passed} passed`);
  if (failed > 0) console.log(`  ✗ ${failed} failed`);
  console.log(`${'─'.repeat(40)}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(e => { console.error('Test runner error:', e); process.exit(1); });
