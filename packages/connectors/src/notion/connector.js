/**
 * NotionConnector - Pulls pages from Notion via the official API
 * Requires: Integration token + page/database access granted
 */
export class NotionConnector {
  constructor(config = {}) {
    this.token = config.token || '';
    this.baseUrl = 'https://api.notion.com/v1';
    this.version = '2022-06-28';
    this.lastSync = config.lastSync || null;
  }

  _headers() {
    return {
      'Authorization': `Bearer ${this.token}`,
      'Notion-Version': this.version,
      'Content-Type': 'application/json'
    };
  }

  async sync() {
    if (!this.token) throw new Error('Notion token not configured');

    const filter = this.lastSync
      ? { filter: { timestamp: 'last_edited_time', last_edited_time: { after: this.lastSync } } }
      : {};

    const res = await fetch(`${this.baseUrl}/search`, {
      method: 'POST', headers: this._headers(),
      body: JSON.stringify({ ...filter, page_size: 100, sort: { direction: 'descending', timestamp: 'last_edited_time' } })
    });
    if (!res.ok) throw new Error(`Notion API: ${res.status}`);
    const data = await res.json();

    const items = [];
    for (const page of data.results || []) {
      if (page.object !== 'page') continue;
      try {
        const title = this._extractTitle(page);
        const content = await this._getPageContent(page.id);
        if (content.trim().length < 20) continue;

        items.push({
          title, content, category: null,
          tags: ['notion'],
          source: { type: 'notion', id: page.id, date: page.last_edited_time, platform: 'notion.so' }
        });
      } catch { /* skip individual pages that fail */ }
    }

    this.lastSync = new Date().toISOString();
    return items;
  }

  _extractTitle(page) {
    const props = page.properties || {};
    for (const prop of Object.values(props)) {
      if (prop.type === 'title' && prop.title?.length > 0) {
        return prop.title.map(t => t.plain_text).join('');
      }
    }
    return 'Untitled Notion Page';
  }

  async _getPageContent(pageId) {
    const res = await fetch(`${this.baseUrl}/blocks/${pageId}/children?page_size=100`, { headers: this._headers() });
    if (!res.ok) return '';
    const data = await res.json();
    return (data.results || []).map(block => this._blockToMarkdown(block)).filter(Boolean).join('\n\n');
  }

  _blockToMarkdown(block) {
    const richTextToMd = (rt) => (rt || []).map(t => t.plain_text).join('');
    switch (block.type) {
      case 'paragraph': return richTextToMd(block.paragraph?.rich_text);
      case 'heading_1': return `# ${richTextToMd(block.heading_1?.rich_text)}`;
      case 'heading_2': return `## ${richTextToMd(block.heading_2?.rich_text)}`;
      case 'heading_3': return `### ${richTextToMd(block.heading_3?.rich_text)}`;
      case 'bulleted_list_item': return `- ${richTextToMd(block.bulleted_list_item?.rich_text)}`;
      case 'numbered_list_item': return `1. ${richTextToMd(block.numbered_list_item?.rich_text)}`;
      case 'to_do': return `- [${block.to_do?.checked ? 'x' : ' '}] ${richTextToMd(block.to_do?.rich_text)}`;
      case 'toggle': return `> ${richTextToMd(block.toggle?.rich_text)}`;
      case 'code': return `\`\`\`${block.code?.language || ''}\n${richTextToMd(block.code?.rich_text)}\n\`\`\``;
      case 'quote': return `> ${richTextToMd(block.quote?.rich_text)}`;
      case 'divider': return '---';
      case 'callout': return `> ${richTextToMd(block.callout?.rich_text)}`;
      default: return '';
    }
  }
}
