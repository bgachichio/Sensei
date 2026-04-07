import Database from 'better-sqlite3';
import path from 'path';
import { existsSync, mkdirSync } from 'fs';

/**
 * Database manages the SQLite index for search, backlinks, entities, and the knowledge graph.
 * The Markdown files are the source of truth; this is the acceleration layer.
 */
export { SenseiDatabase as Database };

class SenseiDatabase {
  constructor(basePath) {
    const dbDir = path.join(basePath, '.sensei');
    if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });

    this.dbPath = path.join(dbDir, 'index.db');
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this._migrate();
  }

  _migrate() {
    this.db.exec(`
      -- Knowledge articles index
      CREATE TABLE IF NOT EXISTS articles (
        id TEXT PRIMARY KEY,
        path TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        tags TEXT DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        importance TEXT DEFAULT 'normal',
        status TEXT DEFAULT 'active',
        content_hash TEXT,
        word_count INTEGER DEFAULT 0
      );

      -- Full-text search
      CREATE VIRTUAL TABLE IF NOT EXISTS articles_fts USING fts5(
        title, content, tags, content='articles', content_rowid='rowid',
        tokenize='porter unicode61'
      );

      -- Triggers to keep FTS in sync
      CREATE TRIGGER IF NOT EXISTS articles_ai AFTER INSERT ON articles BEGIN
        INSERT INTO articles_fts(rowid, title, content, tags)
        VALUES (new.rowid, new.title, '', new.tags);
      END;

      CREATE TRIGGER IF NOT EXISTS articles_ad AFTER DELETE ON articles BEGIN
        INSERT INTO articles_fts(articles_fts, rowid, title, content, tags)
        VALUES ('delete', old.rowid, old.title, '', old.tags);
      END;

      -- Entity registry
      CREATE TABLE IF NOT EXISTS entities (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        metadata TEXT DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
      CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name);

      -- Entity-article mapping
      CREATE TABLE IF NOT EXISTS article_entities (
        article_id TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        role TEXT DEFAULT 'mentioned',
        PRIMARY KEY (article_id, entity_id),
        FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE,
        FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
      );

      -- Knowledge graph edges
      CREATE TABLE IF NOT EXISTS relations (
        id TEXT PRIMARY KEY,
        source_entity_id TEXT NOT NULL,
        target_entity_id TEXT NOT NULL,
        relation_type TEXT NOT NULL,
        strength REAL DEFAULT 1.0,
        context TEXT,
        source_article_id TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (source_entity_id) REFERENCES entities(id) ON DELETE CASCADE,
        FOREIGN KEY (target_entity_id) REFERENCES entities(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_relations_source ON relations(source_entity_id);
      CREATE INDEX IF NOT EXISTS idx_relations_target ON relations(target_entity_id);

      -- Backlinks (explicit + semantic + entity co-occurrence)
      CREATE TABLE IF NOT EXISTS backlinks (
        source_article_id TEXT NOT NULL,
        target_article_id TEXT NOT NULL,
        link_type TEXT NOT NULL,
        context TEXT,
        strength REAL DEFAULT 1.0,
        created_at TEXT NOT NULL,
        PRIMARY KEY (source_article_id, target_article_id, link_type)
      );

      CREATE INDEX IF NOT EXISTS idx_backlinks_target ON backlinks(target_article_id);

      -- Embeddings (simple float array stored as blob for now; sqlite-vec later)
      CREATE TABLE IF NOT EXISTS embeddings (
        article_id TEXT PRIMARY KEY,
        embedding BLOB NOT NULL,
        model TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
      );

      -- Ingestion log
      CREATE TABLE IF NOT EXISTS ingestion_log (
        id TEXT PRIMARY KEY,
        connector TEXT NOT NULL,
        source_id TEXT,
        status TEXT NOT NULL,
        items_ingested INTEGER DEFAULT 0,
        error_message TEXT,
        started_at TEXT NOT NULL,
        completed_at TEXT
      );

      -- Sync state per connector
      CREATE TABLE IF NOT EXISTS sync_state (
        connector TEXT PRIMARY KEY,
        cursor TEXT,
        last_sync_at TEXT,
        items_total INTEGER DEFAULT 0
      );

      -- User settings (onboarding, preferences)
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      -- API tokens
      CREATE TABLE IF NOT EXISTS tokens (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        token_hash TEXT UNIQUE NOT NULL,
        scope TEXT DEFAULT 'read',
        expires_at TEXT,
        created_at TEXT NOT NULL
      );
    `);
  }

  // ── Articles ──

  upsertArticle(article) {
    const stmt = this.db.prepare(`
      INSERT INTO articles (id, path, title, category, tags, created_at, updated_at, importance, status, content_hash, word_count)
      VALUES (@id, @path, @title, @category, @tags, @created_at, @updated_at, @importance, @status, @content_hash, @word_count)
      ON CONFLICT(id) DO UPDATE SET
        path=@path, title=@title, category=@category, tags=@tags,
        updated_at=@updated_at, importance=@importance, status=@status,
        content_hash=@content_hash, word_count=@word_count
    `);
    stmt.run({
      id: article.id,
      path: article.path,
      title: article.title,
      category: article.category,
      tags: JSON.stringify(article.tags || []),
      created_at: article.created,
      updated_at: article.updated,
      importance: article.importance || 'normal',
      status: article.status || 'active',
      content_hash: article.content_hash || '',
      word_count: article.content ? article.content.split(/\s+/).length : 0
    });
  }

  getArticle(id) {
    return this.db.prepare('SELECT * FROM articles WHERE id = ?').get(id);
  }

  getArticleByPath(path) {
    return this.db.prepare('SELECT * FROM articles WHERE path = ?').get(path);
  }

  listArticles({ category, limit = 50, offset = 0 } = {}) {
    if (category) {
      return this.db.prepare(
        'SELECT * FROM articles WHERE category = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?'
      ).all(category, limit, offset);
    }
    return this.db.prepare(
      'SELECT * FROM articles ORDER BY updated_at DESC LIMIT ? OFFSET ?'
    ).all(limit, offset);
  }

  deleteArticle(id) {
    this.db.prepare('DELETE FROM articles WHERE id = ?').run(id);
  }

  // ── Search ──

  searchFTS(query, limit = 20) {
    return this.db.prepare(`
      SELECT a.*, rank
      FROM articles_fts fts
      JOIN articles a ON a.rowid = fts.rowid
      WHERE articles_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(query, limit);
  }

  updateFTSContent(articleId, content) {
    const article = this.getArticle(articleId);
    if (!article) return;
    // Delete old FTS entry and re-insert with content
    const row = this.db.prepare('SELECT rowid FROM articles WHERE id = ?').get(articleId);
    if (row) {
      this.db.prepare(`
        INSERT INTO articles_fts(articles_fts, rowid, title, content, tags)
        VALUES ('delete', ?, ?, ?, ?)
      `).run(row.rowid, article.title, '', article.tags);
      this.db.prepare(`
        INSERT INTO articles_fts(rowid, title, content, tags)
        VALUES (?, ?, ?, ?)
      `).run(row.rowid, article.title, content, article.tags);
    }
  }

  // ── Entities ──

  upsertEntity({ id, type, name, metadata = {} }) {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO entities (id, type, name, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name=?, metadata=?, updated_at=?
    `).run(id, type, name, JSON.stringify(metadata), now, now, name, JSON.stringify(metadata), now);
  }

  findEntity(name, type = null) {
    if (type) {
      return this.db.prepare('SELECT * FROM entities WHERE LOWER(name) = LOWER(?) AND type = ?').get(name, type);
    }
    return this.db.prepare('SELECT * FROM entities WHERE LOWER(name) = LOWER(?)').get(name);
  }

  listEntities(type = null, limit = 100) {
    if (type) {
      return this.db.prepare('SELECT * FROM entities WHERE type = ? ORDER BY updated_at DESC LIMIT ?').all(type, limit);
    }
    return this.db.prepare('SELECT * FROM entities ORDER BY updated_at DESC LIMIT ?').all(limit);
  }

  linkArticleEntity(articleId, entityId, role = 'mentioned') {
    this.db.prepare(`
      INSERT OR IGNORE INTO article_entities (article_id, entity_id, role) VALUES (?, ?, ?)
    `).run(articleId, entityId, role);
  }

  getArticleEntities(articleId) {
    return this.db.prepare(`
      SELECT e.* FROM entities e
      JOIN article_entities ae ON ae.entity_id = e.id
      WHERE ae.article_id = ?
    `).all(articleId);
  }

  getEntityArticles(entityId) {
    return this.db.prepare(`
      SELECT a.* FROM articles a
      JOIN article_entities ae ON ae.article_id = a.id
      WHERE ae.entity_id = ?
      ORDER BY a.updated_at DESC
    `).all(entityId);
  }

  // ── Relations (Knowledge Graph) ──

  addRelation({ id, sourceEntityId, targetEntityId, relationType, strength = 1.0, context = '', sourceArticleId = null }) {
    this.db.prepare(`
      INSERT OR IGNORE INTO relations (id, source_entity_id, target_entity_id, relation_type, strength, context, source_article_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, sourceEntityId, targetEntityId, relationType, strength, context, sourceArticleId, new Date().toISOString());
  }

  getEntityRelations(entityId) {
    return this.db.prepare(`
      SELECT r.*, e.name as target_name, e.type as target_type
      FROM relations r JOIN entities e ON e.id = r.target_entity_id
      WHERE r.source_entity_id = ?
      UNION ALL
      SELECT r.*, e.name as target_name, e.type as target_type
      FROM relations r JOIN entities e ON e.id = r.source_entity_id
      WHERE r.target_entity_id = ?
    `).all(entityId, entityId);
  }

  // ── Backlinks ──

  addBacklink({ sourceArticleId, targetArticleId, linkType, context = '', strength = 1.0 }) {
    this.db.prepare(`
      INSERT OR REPLACE INTO backlinks (source_article_id, target_article_id, link_type, context, strength, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(sourceArticleId, targetArticleId, linkType, context, strength, new Date().toISOString());
  }

  getBacklinks(articleId) {
    return this.db.prepare(`
      SELECT b.*, a.title as source_title, a.path as source_path, a.category as source_category
      FROM backlinks b JOIN articles a ON a.id = b.source_article_id
      WHERE b.target_article_id = ?
      ORDER BY b.strength DESC
    `).all(articleId);
  }

  getForwardLinks(articleId) {
    return this.db.prepare(`
      SELECT b.*, a.title as target_title, a.path as target_path, a.category as target_category
      FROM backlinks b JOIN articles a ON a.id = b.target_article_id
      WHERE b.source_article_id = ?
      ORDER BY b.strength DESC
    `).all(articleId);
  }

  clearBacklinksForArticle(articleId) {
    this.db.prepare('DELETE FROM backlinks WHERE source_article_id = ?').run(articleId);
  }

  // ── Embeddings ──

  storeEmbedding(articleId, embedding, model) {
    const buffer = Buffer.from(new Float32Array(embedding).buffer);
    this.db.prepare(`
      INSERT OR REPLACE INTO embeddings (article_id, embedding, model, created_at)
      VALUES (?, ?, ?, ?)
    `).run(articleId, buffer, model, new Date().toISOString());
  }

  getEmbedding(articleId) {
    const row = this.db.prepare('SELECT * FROM embeddings WHERE article_id = ?').get(articleId);
    if (!row) return null;
    const floats = new Float32Array(row.embedding.buffer, row.embedding.byteOffset, row.embedding.byteLength / 4);
    return { ...row, embedding: Array.from(floats) };
  }

  getAllEmbeddings() {
    const rows = this.db.prepare('SELECT article_id, embedding FROM embeddings').all();
    return rows.map(row => {
      const floats = new Float32Array(row.embedding.buffer, row.embedding.byteOffset, row.embedding.byteLength / 4);
      return { article_id: row.article_id, embedding: Array.from(floats) };
    });
  }

  // ── Ingestion ──

  logIngestion({ id, connector, sourceId, status, itemsIngested = 0, errorMessage = null }) {
    this.db.prepare(`
      INSERT INTO ingestion_log (id, connector, source_id, status, items_ingested, error_message, started_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, connector, sourceId, status, itemsIngested, errorMessage, new Date().toISOString(), status !== 'running' ? new Date().toISOString() : null);
  }

  getSyncState(connector) {
    return this.db.prepare('SELECT * FROM sync_state WHERE connector = ?').get(connector);
  }

  setSyncState(connector, cursor) {
    this.db.prepare(`
      INSERT INTO sync_state (connector, cursor, last_sync_at, items_total)
      VALUES (?, ?, ?, 0)
      ON CONFLICT(connector) DO UPDATE SET cursor=?, last_sync_at=?
    `).run(connector, cursor, new Date().toISOString(), cursor, new Date().toISOString());
  }

  // ── Settings ──

  getSetting(key) {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? JSON.parse(row.value) : null;
  }

  setSetting(key, value) {
    this.db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value=?
    `).run(key, JSON.stringify(value), JSON.stringify(value));
  }

  getAllSettings() {
    const rows = this.db.prepare('SELECT * FROM settings').all();
    const settings = {};
    for (const row of rows) {
      settings[row.key] = JSON.parse(row.value);
    }
    return settings;
  }

  // ── Stats ──

  getStats() {
    const articles = this.db.prepare('SELECT COUNT(*) as count FROM articles').get().count;
    const entities = this.db.prepare('SELECT COUNT(*) as count FROM entities').get().count;
    const relations = this.db.prepare('SELECT COUNT(*) as count FROM relations').get().count;
    const backlinks = this.db.prepare('SELECT COUNT(*) as count FROM backlinks').get().count;
    const byCategory = this.db.prepare('SELECT category, COUNT(*) as count FROM articles GROUP BY category').all();
    return { articles, entities, relations, backlinks, byCategory };
  }

  close() {
    this.db.close();
  }
}
