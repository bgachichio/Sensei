import { nanoid } from 'nanoid';
import { createArticle } from '../storage/article.js';

/**
 * IngestionPipeline - The main pipeline for ingesting content into Sensei
 * SOURCE → NORMALISE → CLASSIFY → EXTRACT → STORE → INDEX → LINK
 */
export class IngestionPipeline {
  constructor({ storage, database, searchEngine, knowledgeGraph, linkDiscovery, aiProvider }) {
    this.storage = storage;
    this.db = database;
    this.search = searchEngine;
    this.graph = knowledgeGraph;
    this.links = linkDiscovery;
    this.ai = aiProvider;
  }

  /**
   * Ingest a single piece of content through the full pipeline
   */
  async ingest({ content, title = null, category = null, tags = [], source = {}, metadata = {} }) {
    const logId = nanoid(8);
    const connector = source.type || 'manual';

    this.db.logIngestion({ id: logId, connector, sourceId: source.id, status: 'running' });

    try {
      // 1. Classify (if no category provided)
      if (!category && this.ai) {
        category = await this.ai.classify(content);
      }
      category = category || 'topics';

      // 2. Extract entities using AI
      let extraction = { entities: [], decisions: [], commitments: [], tags: [], importance: 'normal', summary: '' };
      if (this.ai) {
        extraction = await this.ai.extractEntities(content);
      }

      // 3. Generate title if not provided
      if (!title) {
        title = extraction.summary || content.substring(0, 60).replace(/\n/g, ' ').trim() || 'Untitled';
      }

      // 4. Merge tags
      const allTags = [...new Set([...tags, ...(extraction.tags || [])])];

      // 5. Store as Markdown file
      const article = await this.storage.write({
        title,
        category,
        content,
        tags: allTags,
        sources: [source],
        entities: (extraction.entities || []).map(e => ({ type: e.type, name: e.name })),
        importance: extraction.importance || 'normal'
      });

      // 6. Index in database
      const contentHash = await this.storage.contentHash(article.path);
      this.db.upsertArticle({
        ...article.frontmatter,
        path: article.path,
        content_hash: contentHash,
        content
      });

      // 7. Update FTS + embeddings
      await this.search.indexArticle(article.id, `${title}\n\n${content}`);

      // 8. Process entities and build graph
      this.graph.processExtraction(article.id, extraction);

      // 9. Discover and create links
      await this.links.discoverLinks(article.id, content, article.path);

      // 10. Log success
      this.db.logIngestion({
        id: `${logId}-done`,
        connector,
        sourceId: source.id,
        status: 'success',
        itemsIngested: 1
      });

      return { success: true, article };

    } catch (error) {
      this.db.logIngestion({
        id: `${logId}-err`,
        connector,
        sourceId: source.id,
        status: 'failed',
        errorMessage: error.message
      });
      console.error(`Ingestion failed:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Batch ingest multiple items
   */
  async ingestBatch(items) {
    const results = [];
    for (const item of items) {
      const result = await this.ingest(item);
      results.push(result);
      // Small delay to avoid overwhelming AI API
      if (this.ai) await sleep(200);
    }
    return results;
  }

  /**
   * Re-index all existing articles (rebuild search index + embeddings)
   */
  async reindexAll() {
    const articles = await this.storage.list();
    let indexed = 0;

    for (const article of articles) {
      try {
        const contentHash = await this.storage.contentHash(article.path);
        this.db.upsertArticle({ ...article, content_hash: contentHash });
        await this.search.indexArticle(article.id, `${article.title}\n\n${article.content}`);
        await this.links.discoverLinks(article.id, article.content, article.path);
        indexed++;
      } catch (e) {
        console.error(`Reindex failed for ${article.path}:`, e.message);
      }

      if (this.ai) await sleep(500); // Rate limiting
    }

    return { indexed, total: articles.length };
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
