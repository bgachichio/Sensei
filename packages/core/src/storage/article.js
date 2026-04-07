import matter from 'gray-matter';
import { nanoid } from 'nanoid';

export const DEFAULT_CATEGORIES = [
  'topics', 'people', 'projects', 'decisions',
  'insights', 'commitments', 'preferences', 'raw'
];

// Mutable — user can add custom categories at runtime
export let CATEGORIES = [...DEFAULT_CATEGORIES];

export function addCategory(name) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!CATEGORIES.includes(slug)) CATEGORIES.push(slug);
  return slug;
}

export function setCategories(list) {
  CATEGORIES = [...new Set([...DEFAULT_CATEGORIES, ...list])];
}

/**
 * Create a new knowledge article with frontmatter
 */
export function createArticle({ title, category = 'topics', content = '', tags = [], sources = [], entities = [], importance = 'normal' }) {
  const id = nanoid(12);
  const now = new Date().toISOString();
  const slug = slugify(title);
  const path = `${category}/${slug}.md`;

  const frontmatter = {
    id,
    title,
    category,
    tags,
    created: now,
    updated: now,
    sources,
    entities,
    importance,
    status: 'active'
  };

  const md = matter.stringify(content ? `\n# ${title}\n\n${content}` : `\n# ${title}\n`, frontmatter);

  return { id, path, slug, frontmatter, markdown: md };
}

/**
 * Parse a markdown file with frontmatter into structured data
 */
export function parseArticle(markdownContent, filePath = '') {
  const { data, content } = matter(markdownContent);
  return {
    id: data.id || nanoid(12),
    path: filePath,
    title: data.title || extractTitle(content) || 'Untitled',
    category: data.category || inferCategory(filePath),
    tags: data.tags || [],
    created: data.created || new Date().toISOString(),
    updated: data.updated || new Date().toISOString(),
    sources: data.sources || [],
    entities: data.entities || [],
    importance: data.importance || 'normal',
    status: data.status || 'active',
    content: content.trim(),
    frontmatter: data
  };
}

/**
 * Extract wikilinks from markdown content
 */
export function extractWikilinks(content) {
  const regex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  const links = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    links.push(match[1].trim());
  }
  return [...new Set(links)];
}

/**
 * Update the 'updated' timestamp in an article's frontmatter
 */
export function touchArticle(markdownContent) {
  const { data, content } = matter(markdownContent);
  data.updated = new Date().toISOString();
  return matter.stringify(content, data);
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 80);
}

function extractTitle(content) {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

function inferCategory(filePath) {
  for (const cat of CATEGORIES) {
    if (filePath.includes(`${cat}/`)) return cat;
  }
  return 'topics';
}
