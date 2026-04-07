#!/usr/bin/env node

import { StorageEngine, Database, SearchEngine, AIProvider, KnowledgeGraph, LinkDiscovery, IngestionPipeline } from '@sensei/core';
import path from 'path';

const DATA_DIR = process.env.SENSEI_DATA_DIR || path.join(process.env.HOME || '/home/sensei', 'sensei-data');
const args = process.argv.slice(2);
const command = args[0];

// Lazy init
let storage, database, searchEngine, pipeline;

function init() {
  storage = new StorageEngine(DATA_DIR);
  database = new Database(DATA_DIR);
  const aiConfig = database.getSetting('ai_provider');
  const ai = aiConfig ? new AIProvider(aiConfig) : null;
  searchEngine = new SearchEngine(database, ai);
  const graph = new KnowledgeGraph(database);
  const links = new LinkDiscovery(database, searchEngine);
  pipeline = new IngestionPipeline({ storage, database, searchEngine, knowledgeGraph: graph, linkDiscovery: links, aiProvider: ai });
}

async function main() {
  if (!command || command === 'help' || command === '--help') {
    console.log(`
  🥋 Sensei CLI v0.1.0

  Usage: sensei <command> [options]

  Commands:
    search <query>          Search your knowledge base
    add <text>              Quick capture a piece of knowledge
    list [category]         List recent articles
    read <id>               Read an article by ID
    stats                   Show knowledge base statistics
    reindex                 Rebuild search index and embeddings
    help                    Show this help message

  Environment:
    SENSEI_DATA_DIR         Knowledge base directory (default: ~/sensei-data)
    `);
    process.exit(0);
  }

  init();

  switch (command) {
    case 'search': {
      const query = args.slice(1).join(' ');
      if (!query) { console.error('Usage: sensei search <query>'); process.exit(1); }
      const results = await searchEngine.search(query, { limit: 10 });
      if (results.length === 0) { console.log('No results found.'); break; }
      for (const r of results) {
        const score = r.relevance ? ` (${(r.relevance * 100).toFixed(0)}%)` : '';
        console.log(`  [${r.category}] ${r.title}${score}`);
        console.log(`    ID: ${r.id}  Path: ${r.path}`);
      }
      break;
    }

    case 'add': {
      const text = args.slice(1).join(' ');
      if (!text) { console.error('Usage: sensei add <text>'); process.exit(1); }
      const result = await pipeline.ingest({ content: text, source: { type: 'cli' } });
      if (result.success) {
        console.log(`✓ Captured: ${result.article.frontmatter.title}`);
        console.log(`  Category: ${result.article.frontmatter.category}`);
        console.log(`  Path: ${result.article.path}`);
      } else {
        console.error(`✗ Failed: ${result.error}`);
      }
      break;
    }

    case 'list': {
      const category = args[1] || null;
      const articles = database.listArticles({ category, limit: 20 });
      if (articles.length === 0) { console.log('No articles found.'); break; }
      for (const a of articles) {
        console.log(`  [${a.category}] ${a.title}`);
        console.log(`    ID: ${a.id}  Updated: ${a.updated_at}`);
      }
      break;
    }

    case 'read': {
      const id = args[1];
      if (!id) { console.error('Usage: sensei read <id>'); process.exit(1); }
      const dbArticle = database.getArticle(id);
      if (!dbArticle) { console.error('Article not found.'); process.exit(1); }
      const article = await storage.read(dbArticle.path);
      console.log(`\n# ${article.title}\n`);
      console.log(`Category: ${article.category}  Tags: ${(article.tags || []).join(', ')}`);
      console.log(`Created: ${article.created}  Updated: ${article.updated}\n`);
      console.log(article.content);
      break;
    }

    case 'stats': {
      const s = database.getStats();
      console.log(`\n  🥋 Sensei Knowledge Base`);
      console.log(`  ─────────────────────────`);
      console.log(`  Articles:    ${s.articles}`);
      console.log(`  Entities:    ${s.entities}`);
      console.log(`  Relations:   ${s.relations}`);
      console.log(`  Connections: ${s.backlinks}`);
      if (s.byCategory.length > 0) {
        console.log(`\n  By Category:`);
        for (const c of s.byCategory) {
          console.log(`    ${c.category}: ${c.count}`);
        }
      }
      console.log('');
      break;
    }

    case 'reindex': {
      console.log('Re-indexing all articles...');
      const result = await pipeline.reindexAll();
      console.log(`✓ Indexed ${result.indexed} of ${result.total} articles.`);
      break;
    }

    default:
      console.error(`Unknown command: ${command}. Run 'sensei help' for usage.`);
      process.exit(1);
  }

  database.close();
}

main().catch(e => { console.error(e.message); process.exit(1); });
