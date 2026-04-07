/**
 * SearchEngine - Full-text + semantic search over the knowledge base
 */
export class SearchEngine {
  constructor(database, aiProvider = null) {
    this.db = database;
    this.ai = aiProvider;
  }

  /**
   * Full-text search using FTS5
   */
  fullText(query, limit = 20) {
    try {
      return this.db.searchFTS(query, limit);
    } catch {
      return [];
    }
  }

  /**
   * Semantic search using embeddings + cosine similarity
   */
  async semantic(query, limit = 10) {
    if (!this.ai) return [];

    try {
      const queryEmbedding = await this.ai.embed(query);
      const allEmbeddings = this.db.getAllEmbeddings();

      if (allEmbeddings.length === 0) return [];

      // Compute cosine similarity against all stored embeddings
      const scored = allEmbeddings.map(row => ({
        article_id: row.article_id,
        score: cosineSimilarity(queryEmbedding, row.embedding)
      }));

      scored.sort((a, b) => b.score - a.score);
      const topIds = scored.slice(0, limit);

      // Fetch full article data
      return topIds
        .filter(s => s.score > 0.3) // minimum relevance threshold
        .map(s => {
          const article = this.db.getArticle(s.article_id);
          return article ? { ...article, relevance: s.score } : null;
        })
        .filter(Boolean);
    } catch (e) {
      console.error('Semantic search failed:', e.message);
      return [];
    }
  }

  /**
   * Hybrid search - combines FTS + semantic results
   */
  async search(query, { limit = 20, category = null } = {}) {
    const ftsResults = this.fullText(query, limit);
    const semanticResults = await this.semantic(query, limit);

    // Merge and deduplicate, preferring semantic scores
    const seen = new Set();
    const merged = [];

    for (const r of semanticResults) {
      if (!seen.has(r.id) && (!category || r.category === category)) {
        seen.add(r.id);
        merged.push({ ...r, searchType: 'semantic' });
      }
    }
    for (const r of ftsResults) {
      if (!seen.has(r.id) && (!category || r.category === category)) {
        seen.add(r.id);
        merged.push({ ...r, relevance: 0.5, searchType: 'fts' });
      }
    }

    return merged.slice(0, limit);
  }

  /**
   * Find semantically similar articles to a given article
   */
  async findSimilar(articleId, limit = 5, threshold = 0.65) {
    const source = this.db.getEmbedding(articleId);
    if (!source) return [];

    const allEmbeddings = this.db.getAllEmbeddings();
    const scored = allEmbeddings
      .filter(r => r.article_id !== articleId)
      .map(row => ({
        article_id: row.article_id,
        score: cosineSimilarity(source.embedding, row.embedding)
      }))
      .filter(s => s.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return scored.map(s => {
      const article = this.db.getArticle(s.article_id);
      return article ? { ...article, similarity: s.score } : null;
    }).filter(Boolean);
  }

  /**
   * Index an article's content for search
   */
  async indexArticle(articleId, content) {
    // Update FTS
    this.db.updateFTSContent(articleId, content);

    // Generate and store embedding
    if (this.ai && content.trim().length > 20) {
      try {
        const truncated = content.substring(0, 8000); // limit for embedding API
        const embedding = await this.ai.embed(truncated);
        this.db.storeEmbedding(articleId, embedding, this.ai.embeddingModel);
      } catch (e) {
        console.error(`Failed to embed article ${articleId}:`, e.message);
      }
    }
  }
}

/**
 * Cosine similarity between two vectors
 */
function cosineSimilarity(a, b) {
  if (a.length !== b.length) return 0;
  let dotProduct = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dotProduct / denom;
}
