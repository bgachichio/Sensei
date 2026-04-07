import JSZip from 'jszip';

/**
 * GeminiConnector - Parses Google Gemini conversations from Google Takeout
 * Export from: takeout.google.com → Select "Gemini Apps" → Export
 * Format: ZIP containing individual conversation HTML/JSON files
 */
export class GeminiConnector {

  async parseExport(buffer) {
    const zip = await JSZip.loadAsync(buffer);
    const items = [];

    // Gemini Takeout structure: Takeout/Gemini Apps/...
    for (const [filename, file] of Object.entries(zip.files)) {
      if (file.dir) continue;

      try {
        if (filename.endsWith('.json')) {
          const text = await file.async('text');
          const data = JSON.parse(text);
          const parsed = this._parseJSON(data, filename);
          if (parsed && parsed.content.trim().length > 50) {
            items.push(parsed);
          }
        } else if (filename.endsWith('.html')) {
          const text = await file.async('text');
          const parsed = this._parseHTML(text, filename);
          if (parsed && parsed.content.trim().length > 50) {
            items.push(parsed);
          }
        }
      } catch (e) {
        console.warn(`Skipping Gemini file ${filename}: ${e.message}`);
      }
    }

    return items;
  }

  _parseJSON(data, filename) {
    // Handle array of conversations or single conversation
    const conversations = Array.isArray(data) ? data : [data];
    const items = [];

    for (const conv of conversations) {
      const title = conv.title || conv.name || this._filenameToTitle(filename);
      const created = conv.createTime || conv.create_time || new Date().toISOString();

      const messages = [];
      const turns = conv.turns || conv.messages || conv.content || [];

      for (const turn of turns) {
        const role = turn.role || (turn.author === 'USER' ? 'user' : 'model');
        let text = '';

        if (typeof turn.text === 'string') {
          text = turn.text;
        } else if (Array.isArray(turn.parts)) {
          text = turn.parts.filter(p => typeof p === 'string' || p.text).map(p => p.text || p).join('\n');
        } else if (typeof turn.content === 'string') {
          text = turn.content;
        }

        if (text.trim()) {
          messages.push({ role: role === 'USER' || role === 'user' ? 'user' : 'assistant', text: text.trim() });
        }
      }

      if (messages.length === 0) continue;

      const contentParts = [`# ${title}\n`, `*Gemini conversation from ${new Date(created).toLocaleDateString()}*\n`];
      for (const msg of messages) {
        const label = msg.role === 'user' ? '**Human**' : '**Gemini**';
        contentParts.push(`### ${label}\n${msg.text}\n`);
      }

      items.push({
        title,
        content: contentParts.join('\n'),
        category: null,
        tags: ['gemini', 'ai-conversation'],
        source: { type: 'gemini_conversation', id: conv.id || filename, date: created, platform: 'gemini.google.com' }
      });
    }

    return items.length === 1 ? items[0] : items.length > 0 ? items : null;
  }

  _parseHTML(html, filename) {
    // Simple HTML parsing for Gemini Takeout HTML format
    const title = this._filenameToTitle(filename);
    
    // Strip HTML tags for a basic text extraction
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, '\n')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    if (text.length < 50) return null;

    return {
      title,
      content: `# ${title}\n\n*Imported from Gemini (Google Takeout)*\n\n${text}`,
      category: null,
      tags: ['gemini', 'ai-conversation'],
      source: { type: 'gemini_conversation', id: filename, platform: 'gemini.google.com' }
    };
  }

  _filenameToTitle(filename) {
    return filename
      .replace(/^.*[\\/]/, '')  // Remove directory path
      .replace(/\.[^.]+$/, '')  // Remove extension
      .replace(/[-_]/g, ' ')   // Replace separators
      .replace(/\b\w/g, c => c.toUpperCase()); // Title case
  }
}
