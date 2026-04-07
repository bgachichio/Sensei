import fs from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import { glob } from 'glob';
import { createArticle, parseArticle, extractWikilinks, CATEGORIES } from './article.js';
import crypto from 'crypto';

/**
 * StorageEngine manages the Markdown filesystem knowledge base.
 * All knowledge is stored as .md files — observable, portable, git-friendly.
 */
export class StorageEngine {
  constructor(basePath) {
    this.basePath = basePath;
    this.knowledgePath = path.join(basePath, 'knowledge');
    this.mediaPath = path.join(basePath, 'knowledge', 'media');
    this._ensureDirectories();
  }

  _ensureDirectories() {
    for (const cat of CATEGORIES) {
      const dir = path.join(this.knowledgePath, cat);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    }
    if (!existsSync(this.mediaPath)) mkdirSync(this.mediaPath, { recursive: true });
  }

  /**
   * Write a new knowledge article to the filesystem
   */
  async write(articleData) {
    const article = createArticle(articleData);
    const fullPath = path.join(this.knowledgePath, article.path);
    const dir = path.dirname(fullPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    await fs.writeFile(fullPath, article.markdown, 'utf-8');
    return article;
  }

  /**
   * Read and parse a knowledge article
   */
  async read(relativePath) {
    const fullPath = path.join(this.knowledgePath, relativePath);
    if (!existsSync(fullPath)) return null;
    const content = await fs.readFile(fullPath, 'utf-8');
    return parseArticle(content, relativePath);
  }

  /**
   * Update an existing article. If category changes, moves the file.
   */
  async update(relativePath, updates) {
    const existing = await this.read(relativePath);
    if (!existing) throw new Error(`Article not found: ${relativePath}`);

    const { data, content } = await this._readRaw(relativePath);
    const merged = { ...data, ...updates, updated: new Date().toISOString() };
    const newContent = updates.content !== undefined ? updates.content : content;

    const matter = (await import('gray-matter')).default;
    const md = matter.stringify(`\n${newContent}`, merged);

    // If category changed, move the file
    if (updates.category && updates.category !== existing.category) {
      const newDir = path.join(this.knowledgePath, updates.category);
      if (!existsSync(newDir)) mkdirSync(newDir, { recursive: true });
      const filename = path.basename(relativePath);
      const newPath = path.join(updates.category, filename);
      await fs.writeFile(path.join(this.knowledgePath, newPath), md, 'utf-8');
      await fs.unlink(path.join(this.knowledgePath, relativePath));
      return { ...existing, ...merged, content: newContent, path: newPath, _movedFrom: relativePath };
    }

    await fs.writeFile(path.join(this.knowledgePath, relativePath), md, 'utf-8');
    return { ...existing, ...merged, content: newContent, path: relativePath };
  }

  /**
   * Recategorise an article — moves it to a new category directory
   */
  async recategorise(relativePath, newCategory) {
    return this.update(relativePath, { category: newCategory });
  }

  /**
   * Delete an article
   */
  async delete(relativePath) {
    const fullPath = path.join(this.knowledgePath, relativePath);
    if (existsSync(fullPath)) await fs.unlink(fullPath);
  }

  /**
   * List all articles, optionally filtered by category
   */
  async list(category = null) {
    const pattern = category
      ? path.join(this.knowledgePath, category, '**/*.md')
      : path.join(this.knowledgePath, '**/*.md');

    const files = await glob(pattern, { ignore: ['**/media/**'] });
    const articles = [];

    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const relativePath = path.relative(this.knowledgePath, file);
        articles.push(parseArticle(content, relativePath));
      } catch (e) {
        // Skip malformed files
      }
    }

    return articles.sort((a, b) => new Date(b.updated) - new Date(a.updated));
  }

  /**
   * Get all wikilinks from an article
   */
  async getLinks(relativePath) {
    const article = await this.read(relativePath);
    if (!article) return [];
    return extractWikilinks(article.content);
  }

  /**
   * Compute content hash for change detection
   */
  async contentHash(relativePath) {
    const fullPath = path.join(this.knowledgePath, relativePath);
    if (!existsSync(fullPath)) return null;
    const content = await fs.readFile(fullPath, 'utf-8');
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Store a media file and return its relative path
   */
  async storeMedia(filename, buffer) {
    const ext = path.extname(filename);
    const name = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
    const fullPath = path.join(this.mediaPath, name);
    await fs.writeFile(fullPath, buffer);
    return `media/${name}`;
  }

  async _readRaw(relativePath) {
    const matter = (await import('gray-matter')).default;
    const fullPath = path.join(this.knowledgePath, relativePath);
    const raw = await fs.readFile(fullPath, 'utf-8');
    const { data, content } = matter(raw);
    return { data, content: content.trim() };
  }
}
