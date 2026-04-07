/**
 * GoogleDocsConnector - Exports Google Docs via Drive API
 */
export class GoogleDocsConnector {
  constructor(config = {}) {
    this.accessToken = config.accessToken || '';
    this.folderId = config.folderId || '';
    this.lastSync = config.lastSync || null;
  }
  async sync() {
    if (!this.accessToken) throw new Error('Google access token not configured');
    const query = this.folderId ? `'${this.folderId}' in parents and ` : '';
    const timeFilter = this.lastSync ? ` and modifiedTime > '${this.lastSync}'` : '';
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`${query}mimeType='application/vnd.google-apps.document'${timeFilter}`)}&fields=files(id,name,modifiedTime)`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${this.accessToken}` } });
    if (!res.ok) throw new Error(`Google Drive API: ${res.status}`);
    const { files } = await res.json();
    const items = [];
    for (const file of (files || [])) {
      try {
        const expRes = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=text/plain`, { headers: { 'Authorization': `Bearer ${this.accessToken}` } });
        if (!expRes.ok) continue;
        const content = await expRes.text();
        if (content.trim().length < 20) continue;
        items.push({ title: file.name, content, category: null, tags: ['google-docs'], source: { type: 'google_docs', id: file.id, date: file.modifiedTime, platform: 'docs.google.com' } });
      } catch { /* skip */ }
    }
    this.lastSync = new Date().toISOString();
    return items;
  }
}

/**
 * GoogleKeepConnector - Parses Google Takeout Keep export
 */
export class GoogleKeepConnector {
  async parseExport(buffer) {
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(buffer);
    const items = [];
    for (const [filename, file] of Object.entries(zip.files)) {
      if (file.dir || !filename.endsWith('.json')) continue;
      try {
        const text = await file.async('text');
        const note = JSON.parse(text);
        const title = note.title || 'Untitled Note';
        const content = note.textContent || (note.listContent || []).map(i => `- [${i.isChecked ? 'x' : ' '}] ${i.text}`).join('\n');
        if (content.trim().length < 10) continue;
        items.push({ title, content, tags: (note.labels || []).map(l => l.name).concat(['google-keep']), category: null, source: { type: 'google_keep', id: filename, platform: 'keep.google.com' } });
      } catch { /* skip malformed */ }
    }
    return items;
  }
}

/**
 * AppleNotesConnector - Reads macOS NoteStore.sqlite (read-only)
 * Requires Full Disk Access on macOS
 */
export class AppleNotesConnector {
  constructor(config = {}) {
    this.dbPath = config.dbPath || `${process.env.HOME}/Library/Group Containers/group.com.apple.notes/NoteStore.sqlite`;
    this.lastSync = config.lastSync || null;
  }
  async sync() {
    const Database = (await import('better-sqlite3')).default;
    const db = new Database(this.dbPath, { readonly: true });
    const rows = db.prepare(`
      SELECT n.ZTITLE as title, n.ZSNIPPET as snippet, n.ZMODIFICATIONDATE as modified,
             nb.ZDATA as data
      FROM ZICCLOUDSYNCINGOBJECT n
      LEFT JOIN ZICNOTEDATA nb ON nb.ZNOTE = n.Z_PK
      WHERE n.ZTITLE IS NOT NULL AND n.ZMARKEDFORDELETION = 0
      ORDER BY n.ZMODIFICATIONDATE DESC LIMIT 200
    `).all();
    db.close();
    return rows.filter(r => r.snippet && r.snippet.length > 20).map(r => ({
      title: r.title || 'Untitled',
      content: r.snippet, // Full protobuf decode would be needed for rich content
      tags: ['apple-notes'], category: null,
      source: { type: 'apple_notes', id: r.title, date: new Date((r.modified + 978307200) * 1000).toISOString(), platform: 'apple-notes' }
    }));
  }
}

/**
 * GmailConnector - Fetches emails via Gmail API
 */
export class GmailConnector {
  constructor(config = {}) {
    this.accessToken = config.accessToken || '';
    this.labels = config.labels || ['INBOX', 'SENT'];
    this.lastSync = config.lastSync || null;
  }
  async sync() {
    if (!this.accessToken) throw new Error('Gmail access token not configured');
    const after = this.lastSync ? `after:${Math.floor(new Date(this.lastSync).getTime() / 1000)}` : '';
    const q = `in:inbox OR in:sent ${after}`.trim();
    const listRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=50`, { headers: { 'Authorization': `Bearer ${this.accessToken}` } });
    if (!listRes.ok) throw new Error(`Gmail API: ${listRes.status}`);
    const { messages } = await listRes.json();
    const items = [];
    for (const msg of (messages || []).slice(0, 30)) {
      try {
        const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`, { headers: { 'Authorization': `Bearer ${this.accessToken}` } });
        if (!msgRes.ok) continue;
        const data = await msgRes.json();
        const subject = (data.payload?.headers || []).find(h => h.name === 'Subject')?.value || 'No Subject';
        const from = (data.payload?.headers || []).find(h => h.name === 'From')?.value || '';
        const body = this._extractBody(data.payload);
        if (body.length < 30) continue;
        items.push({ title: subject, content: `From: ${from}\n\n${body}`, tags: ['email', 'gmail'], category: null, source: { type: 'gmail', id: msg.id, date: new Date(parseInt(data.internalDate)).toISOString(), platform: 'gmail.com' } });
      } catch { /* skip */ }
    }
    this.lastSync = new Date().toISOString();
    return items;
  }
  _extractBody(payload) {
    if (payload.body?.data) return Buffer.from(payload.body.data, 'base64url').toString('utf-8');
    for (const part of (payload.parts || [])) {
      if (part.mimeType === 'text/plain' && part.body?.data) return Buffer.from(part.body.data, 'base64url').toString('utf-8');
      if (part.parts) { const inner = this._extractBody(part); if (inner) return inner; }
    }
    return '';
  }
}

/**
 * WhatsAppConnector - Parses WhatsApp "Export Chat" text files
 */
export class WhatsAppConnector {
  async parseExport(buffer) {
    const text = buffer.toString('utf-8');
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 3) return [];
    // Group messages by conversation
    const content = lines.join('\n');
    const title = `WhatsApp Chat (${lines.length} messages)`;
    return [{ title, content, tags: ['whatsapp', 'messages'], category: null, source: { type: 'whatsapp', id: `wa-${Date.now()}`, platform: 'whatsapp' } }];
  }
}

/**
 * TelegramConnector - Parses Telegram desktop data export (JSON)
 */
export class TelegramConnector {
  async parseExport(buffer) {
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(buffer);
    const items = [];
    for (const [filename, file] of Object.entries(zip.files)) {
      if (file.dir || !filename.endsWith('.json')) continue;
      try {
        const data = JSON.parse(await file.async('text'));
        if (!data.messages || !Array.isArray(data.messages)) continue;
        const name = data.name || 'Telegram Chat';
        const content = data.messages.filter(m => m.type === 'message' && m.text).map(m => {
          const text = typeof m.text === 'string' ? m.text : (m.text || []).map(t => typeof t === 'string' ? t : t.text || '').join('');
          return `[${m.date}] ${m.from || 'Unknown'}: ${text}`;
        }).join('\n');
        if (content.length < 50) continue;
        items.push({ title: name, content, tags: ['telegram', 'messages'], category: null, source: { type: 'telegram', id: filename, platform: 'telegram' } });
      } catch { /* skip */ }
    }
    return items;
  }
}

/**
 * SlackConnector - Fetches channel messages via Slack Web API
 */
export class SlackConnector {
  constructor(config = {}) {
    this.token = config.token || '';
    this.channels = config.channels || [];
    this.lastSync = config.lastSync || null;
  }
  async sync() {
    if (!this.token) throw new Error('Slack token not configured');
    const items = [];
    // If no channels specified, list joined channels
    let channelIds = this.channels;
    if (channelIds.length === 0) {
      const listRes = await fetch('https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=20', { headers: { 'Authorization': `Bearer ${this.token}` } });
      const listData = await listRes.json();
      channelIds = (listData.channels || []).filter(c => c.is_member).map(c => c.id);
    }
    for (const channelId of channelIds.slice(0, 10)) {
      try {
        const oldest = this.lastSync ? `&oldest=${new Date(this.lastSync).getTime() / 1000}` : '';
        const res = await fetch(`https://slack.com/api/conversations.history?channel=${channelId}&limit=50${oldest}`, { headers: { 'Authorization': `Bearer ${this.token}` } });
        const data = await res.json();
        if (!data.ok) continue;
        const messages = (data.messages || []).filter(m => m.text && m.text.length > 20).map(m => `[${new Date(parseFloat(m.ts) * 1000).toISOString()}] ${m.user || 'bot'}: ${m.text}`);
        if (messages.length === 0) continue;
        items.push({ title: `Slack #${channelId}`, content: messages.join('\n'), tags: ['slack', 'messages'], category: null, source: { type: 'slack', id: channelId, platform: 'slack' } });
      } catch { /* skip */ }
    }
    this.lastSync = new Date().toISOString();
    return items;
  }
}

/**
 * RSSConnector - Polls RSS/Atom feeds
 */
export class RSSConnector {
  constructor(config = {}) {
    this.feeds = config.feeds || [];
  }
  async sync() {
    const items = [];
    for (const feed of this.feeds) {
      try {
        const res = await fetch(feed.url);
        const text = await res.text();
        // Simple XML parsing for RSS items
        const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
        let match;
        while ((match = itemRegex.exec(text)) !== null) {
          const xml = match[1];
          const title = (xml.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/)?.[1] || '').trim();
          const desc = (xml.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/)?.[1] || '').replace(/<[^>]+>/g, '').trim();
          const link = (xml.match(/<link>(.*?)<\/link>/)?.[1] || '').trim();
          if (title && desc.length > 30) {
            items.push({ title, content: `${desc}\n\nSource: ${link}`, tags: ['rss', feed.category || 'feed'], category: null, source: { type: 'rss', id: link, platform: feed.url } });
          }
        }
      } catch { /* skip failed feeds */ }
    }
    return items;
  }
}

/**
 * iMessageConnector - Reads macOS chat.db (read-only)
 */
export class IMessageConnector {
  constructor(config = {}) {
    this.dbPath = config.dbPath || `${process.env.HOME}/Library/Messages/chat.db`;
    this.lastSync = config.lastSync || null;
  }
  async sync() {
    const Database = (await import('better-sqlite3')).default;
    const db = new Database(this.dbPath, { readonly: true });
    const since = this.lastSync ? new Date(this.lastSync).getTime() / 1000 - 978307200 : 0;
    const rows = db.prepare(`
      SELECT m.text, m.date, m.is_from_me, h.id as handle_id, c.display_name
      FROM message m
      LEFT JOIN handle h ON m.handle_id = h.ROWID
      LEFT JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
      LEFT JOIN chat c ON c.ROWID = cmj.chat_id
      WHERE m.text IS NOT NULL AND m.text != '' AND m.date > ?
      ORDER BY m.date DESC LIMIT 200
    `).all(since);
    db.close();

    // Group by chat
    const chats = {};
    for (const row of rows) {
      const chatKey = row.display_name || row.handle_id || 'unknown';
      if (!chats[chatKey]) chats[chatKey] = [];
      const date = new Date((row.date / 1e9 + 978307200) * 1000);
      chats[chatKey].push(`[${date.toISOString()}] ${row.is_from_me ? 'Me' : chatKey}: ${row.text}`);
    }

    const items = [];
    for (const [chatName, messages] of Object.entries(chats)) {
      if (messages.join('\n').length < 50) continue;
      items.push({ title: `iMessage: ${chatName}`, content: messages.reverse().join('\n'), tags: ['imessage', 'messages'], category: null, source: { type: 'imessage', id: chatName, platform: 'imessage' } });
    }

    this.lastSync = new Date().toISOString();
    return items;
  }
}
