import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import matter from 'gray-matter';

/**
 * ObsidianConnector - Watches an Obsidian vault directory for .md files
 * Obsidian vaults are just folders of Markdown — simplest connector.
 */
export class ObsidianConnector {
  constructor(config = {}) {
    this.vaultPath = config.vaultPath || '';
    this.lastSync = config.lastSync || null;
  }

  async sync() {
    if (!this.vaultPath || !fs.existsSync(this.vaultPath)) {
      throw new Error(`Obsidian vault not found: ${this.vaultPath}`);
    }

    const files = await glob(path.join(this.vaultPath, '**/*.md'), {
      ignore: ['**/.obsidian/**', '**/node_modules/**', '**/.trash/**']
    });

    const items = [];
    for (const file of files) {
      const stat = fs.statSync(file);
      if (this.lastSync && stat.mtimeMs < new Date(this.lastSync).getTime()) continue;

      const content = fs.readFileSync(file, 'utf-8');
      const { data, content: body } = matter(content);
      const relPath = path.relative(this.vaultPath, file);
      const title = data.title || path.basename(file, '.md').replace(/-/g, ' ');

      items.push({
        title,
        content: body.trim(),
        tags: data.tags || [],
        category: null,
        source: { type: 'obsidian', id: relPath, date: stat.mtime.toISOString(), platform: 'obsidian' }
      });
    }

    this.lastSync = new Date().toISOString();
    return items;
  }
}
