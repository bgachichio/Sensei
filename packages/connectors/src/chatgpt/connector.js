import JSZip from 'jszip';

/**
 * ChatGPTConnector - Parses ChatGPT data export
 * Export from: chatgpt.com → Settings → Data controls → Export data
 * Format: ZIP containing conversations.json with a mapping tree structure
 */
export class ChatGPTConnector {

  async parseExport(buffer) {
    const zip = await JSZip.loadAsync(buffer);
    const items = [];

    let conversationsData = null;
    for (const [filename, file] of Object.entries(zip.files)) {
      if (filename.endsWith('conversations.json') && !file.dir) {
        const text = await file.async('text');
        conversationsData = JSON.parse(text);
        break;
      }
    }

    if (!conversationsData || !Array.isArray(conversationsData)) {
      throw new Error('Could not find conversations.json in ChatGPT export');
    }

    for (const conv of conversationsData) {
      try {
        const parsed = this._parseConversation(conv);
        if (parsed && parsed.content.trim().length > 50) {
          items.push(parsed);
        }
      } catch (e) {
        console.warn(`Skipping ChatGPT conversation: ${e.message}`);
      }
    }

    return items;
  }

  _parseConversation(conv) {
    const title = conv.title || 'Untitled ChatGPT Conversation';
    const id = conv.id || '';
    const created = conv.create_time ? new Date(conv.create_time * 1000).toISOString() : new Date().toISOString();
    const updated = conv.update_time ? new Date(conv.update_time * 1000).toISOString() : created;

    // ChatGPT uses a mapping tree structure
    const messages = [];
    if (conv.mapping) {
      // Build ordered message list from the tree
      const nodes = Object.values(conv.mapping)
        .filter(n => n.message && n.message.content && n.message.author)
        .sort((a, b) => (a.message.create_time || 0) - (b.message.create_time || 0));

      for (const node of nodes) {
        const msg = node.message;
        const role = msg.author.role;
        if (role !== 'user' && role !== 'assistant') continue;

        let text = '';
        if (msg.content.parts) {
          text = msg.content.parts.filter(p => typeof p === 'string').join('\n');
        } else if (typeof msg.content.text === 'string') {
          text = msg.content.text;
        }

        if (text.trim()) {
          messages.push({ role, text: text.trim() });
        }
      }
    }

    if (messages.length === 0) return null;

    // Build readable content
    const contentParts = [`# ${title}\n`, `*ChatGPT conversation from ${new Date(created).toLocaleDateString()}*\n`];

    for (const msg of messages) {
      const label = msg.role === 'user' ? '**Human**' : '**ChatGPT**';
      contentParts.push(`### ${label}\n${msg.text}\n`);
    }

    return {
      title,
      content: contentParts.join('\n'),
      category: null,
      tags: ['chatgpt', 'ai-conversation'],
      source: {
        type: 'chatgpt_conversation',
        id,
        date: created,
        platform: 'chatgpt.com'
      }
    };
  }
}
