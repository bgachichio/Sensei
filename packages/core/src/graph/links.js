import { extractWikilinks } from '../storage/article.js';

/**
 * LinkDiscovery - Automatic link detection, backlink management, semantic connections
 */
export class LinkDiscovery {
  constructor(database, searchEngine) {
    this.db = database;
    this.search = searchEngine;
  }

  /**
   * Run the full link discovery pipeline for an article
   */
  async discoverLinks(articleId, content, path) {
    // Clear existing links from this source
    this.db.clearBacklinksForArticle(articleId);

    // 1. Explicit wikilinks
    this._processWikilinks(articleId, content);

    // 2. Entity co-occurrence links
    this._processEntityCooccurrence(articleId);

    // 3. Semantic similarity links
    await this._processSemanticLinks(articleId);
  }

  /**
   * Process [[wikilinks]] and create explicit backlinks
   */
  _processWikilinks(articleId, content) {
    const links = extractWikilinks(content);

    for (const link of links) {
      // Resolve link to an article path
      const targetPath = this._resolveWikilink(link);
      if (!targetPath) continue;

      const target = this.db.getArticleByPath(targetPath);
      if (!target || target.id === articleId) continue;

      this.db.addBacklink({
        sourceArticleId: articleId,
        targetArticleId: target.id,
        linkType: 'explicit',
        context: `Wikilink: [[${link}]]`,
        strength: 1.0
      });
    }
  }

  /**
   * Articles sharing entities are linked through entity co-occurrence
   */
  _processEntityCooccurrence(articleId) {
    const entities = this.db.getArticleEntities(articleId);

    for (const entity of entities) {
      const relatedArticles = this.db.getEntityArticles(entity.id);
      for (const related of relatedArticles) {
        if (related.id === articleId) continue;

        this.db.addBacklink({
          sourceArticleId: articleId,
          targetArticleId: related.id,
          linkType: 'entity',
          context: `Shared entity: ${entity.name} (${entity.type})`,
          strength: 0.7
        });
      }
    }
  }

  /**
   * Find semantically similar articles and create links
   */
  async _processSemanticLinks(articleId) {
    if (!this.search) return;

    try {
      const similar = await this.search.findSimilar(articleId, 5, 0.7);
      for (const article of similar) {
        this.db.addBacklink({
          sourceArticleId: articleId,
          targetArticleId: article.id,
          linkType: 'semantic',
          context: `Semantic similarity: ${(article.similarity * 100).toFixed(0)}%`,
          strength: article.similarity
        });
      }
    } catch (e) {
      // Semantic links are optional; don't fail the pipeline
    }
  }

  /**
   * Resolve a wikilink string to an article path
   * Supports: [[category/slug]], [[slug]], [[slug#heading]]
   */
  _resolveWikilink(link) {
    // Remove heading anchors
    const base = link.split('#')[0].trim();
    if (!base) return null;

    // If it contains a slash, treat as category/slug
    if (base.includes('/')) {
      const candidate = base.endsWith('.md') ? base : `${base}.md`;
      const article = this.db.getArticleByPath(candidate);
      if (article) return candidate;
    }

    // Search by slug across all categories
    const slug = base.toLowerCase().replace(/\s+/g, '-');
    const articles = this.db.listArticles({ limit: 500 });
    for (const a of articles) {
      if (a.path.endsWith(`/${slug}.md`) || a.path === `${slug}.md`) {
        return a.path;
      }
      // Also match by title
      if (a.title.toLowerCase() === base.toLowerCase()) {
        return a.path;
      }
    }

    return null;
  }

  /**
   * Get all orphan articles (no backlinks, no forward links)
   */
  getOrphans() {
    const articles = this.db.listArticles({ limit: 1000 });
    return articles.filter(a => {
      const backlinks = this.db.getBacklinks(a.id);
      const forwardLinks = this.db.getForwardLinks(a.id);
      return backlinks.length === 0 && forwardLinks.length === 0;
    });
  }
}
