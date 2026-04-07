import JSZip from 'jszip';

/**
 * ClaudeConnector - Parses Claude data export (ZIP with conversations.json)
 * Export from: claude.ai → Settings → Privacy → Export Data
 */
export class ClaudeConnector {

  /**
   * Parse a Claude export ZIP buffer into ingestible items
   */
  async parseExport(buffer) {
    const zip = await JSZip.loadAsync(buffer);
    const items = [];

    // Find conversations file (could be conversations.json or in a subdirectory)
    let conversationsData = null;
    for (const [filename, file] of Object.entries(zip.files)) {
      if (filename.endsWith('conversations.json') && !file.dir) {
        const text = await file.async('text');
        conversationsData = JSON.parse(text);
        break;
      }
    }

    if (!conversationsData) {
      // Try parsing the entire ZIP as a single JSON
      const files = Object.keys(zip.files).filter(f => f.endsWith('.json'));
      if (files.length > 0) {
        const text = await zip.files[files[0]].async('text');
        conversationsData = JSON.parse(text);
        if (!Array.isArray(conversationsData)) {
          conversationsData = [conversationsData];
        }
      }
    }

    if (!conversationsData || !Array.isArray(conversationsData)) {
      throw new Error('Could not find conversations data in Claude export');
    }

    for (const conv of conversationsData) {
      try {
        const parsed = this._parseConversation(conv);
        if (parsed) {
          // Filter: at least 2 messages and meaningful content
          const rawLength = parsed._rawLength || 0;
          if (rawLength > 50) {
            delete parsed._rawLength;
            items.push(parsed);
          }
        }
      } catch (e) {
        // Skip malformed conversations
        console.warn(`Skipping conversation: ${e.message}`);
      }
    }

    return items;
  }

  _parseConversation(conv) {
    const title = conv.name || conv.title || 'Untitled Claude Conversation';
    const uuid = conv.uuid || conv.id || '';
    const created = conv.created_at || conv.create_time || new Date().toISOString();
    const updated = conv.updated_at || conv.update_time || created;

    // Extract messages
    const messages = this._extractMessages(conv);
    if (messages.length === 0) return null;

    // Build readable content
    const contentParts = [`# ${title}\n`, `*Claude conversation from ${new Date(created).toLocaleDateString()}*\n`];

    for (const msg of messages) {
      const role = msg.role === 'human' || msg.role === 'user' ? '**Human**' : '**Claude**';
      const text = msg.text || msg.content || '';
      if (text.trim()) {
        contentParts.push(`### ${role}\n${text.trim()}\n`);
      }
    }

    const content = contentParts.join('\n');

    // Track raw message length for filtering
    const rawLength = messages.reduce((sum, m) => sum + (m.text || '').length, 0);

    return {
      title,
      content,
      _rawLength: rawLength,
      category: null, // Let AI classify
      tags: ['claude', 'ai-conversation'],
      source: {
        type: 'claude_conversation',
        id: uuid,
        date: created,
        platform: 'claude.ai'
      }
    };
  }

  _extractMessages(conv) {
    const messages = [];

    // Format 1: conv.chat_messages (array of message objects)
    if (Array.isArray(conv.chat_messages)) {
      for (const msg of conv.chat_messages) {
        const role = msg.sender === 'human' ? 'human' : 'assistant';
        let text = '';

        if (typeof msg.text === 'string') {
          text = msg.text;
        } else if (Array.isArray(msg.content)) {
          text = msg.content
            .filter(c => c.type === 'text')
            .map(c => c.text || '')
            .join('\n');
        } else if (typeof msg.content === 'string') {
          text = msg.content;
        }

        if (text.trim()) {
          messages.push({ role, text: text.trim() });
        }
      }
      return messages;
    }

    // Format 2: conv.mapping (tree structure, similar to ChatGPT)
    if (conv.mapping) {
      const sorted = Object.values(conv.mapping)
        .filter(n => n.message && n.message.content)
        .sort((a, b) => (a.message.create_time || 0) - (b.message.create_time || 0));

      for (const node of sorted) {
        const msg = node.message;
        const role = msg.author?.role || msg.role || 'unknown';
        let text = '';

        if (typeof msg.content === 'string') {
          text = msg.content;
        } else if (msg.content?.parts) {
          text = msg.content.parts.filter(p => typeof p === 'string').join('\n');
        } else if (Array.isArray(msg.content)) {
          text = msg.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
        }

        if (text.trim() && (role === 'user' || role === 'human' || role === 'assistant')) {
          messages.push({ role: role === 'user' ? 'human' : role, text: text.trim() });
        }
      }
      return messages;
    }

    // Format 3: Simple messages array
    if (Array.isArray(conv.messages)) {
      for (const msg of conv.messages) {
        const role = msg.role || msg.sender || 'unknown';
        const text = typeof msg.content === 'string'
          ? msg.content
          : (msg.text || '');

        if (text.trim() && (role === 'user' || role === 'human' || role === 'assistant')) {
          messages.push({ role: role === 'user' ? 'human' : role, text: text.trim() });
        }
      }
    }

    return messages;
  }
}
