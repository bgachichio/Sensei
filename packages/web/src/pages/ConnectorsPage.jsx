import React, { useState, useEffect } from 'react';
import { api } from '../lib/api.js';
import { Upload, CheckCircle, AlertCircle, Plug, RefreshCw, Clock, Settings as SettingsIcon } from 'lucide-react';

const SYNC_INTERVALS = [
  { value: 'manual', label: 'Manual only' },
  { value: 'hourly', label: 'Every hour' },
  { value: 'every_4h', label: 'Every 4 hours' },
  { value: 'every_12h', label: 'Every 12 hours' },
  { value: 'daily', label: 'Daily' }
];

const ALL_CONNECTORS = [
  // AI Conversations (import + API key config)
  { id: 'claude', name: 'Claude', category: 'AI Conversations', icon: '🟠', type: 'import', accept: '.zip', help: 'Export: claude.ai → Settings → Privacy → Export Data → download ZIP' },
  { id: 'chatgpt', name: 'ChatGPT', category: 'AI Conversations', icon: '🟢', type: 'import', accept: '.zip', help: 'Export: chatgpt.com → Settings → Data controls → Export data → download ZIP' },
  { id: 'gemini', name: 'Gemini', category: 'AI Conversations', icon: '🔵', type: 'import', accept: '.zip', help: 'Export: takeout.google.com → Select "Gemini Apps" → download ZIP' },
  // Note-Taking (import or API)
  { id: 'obsidian', name: 'Obsidian', category: 'Note-Taking', icon: '💎', type: 'config', fields: [{ key: 'vaultPath', label: 'Vault path on server', placeholder: '/home/user/obsidian-vault' }], help: 'Points to your Obsidian vault directory. Sensei watches for changes.' },
  { id: 'notion', name: 'Notion', category: 'Note-Taking', icon: '📓', type: 'config', fields: [{ key: 'token', label: 'Integration token', placeholder: 'ntn_...' }], help: 'Create an integration at notion.so/my-integrations, then share pages with it.' },
  { id: 'google-docs', name: 'Google Docs', category: 'Note-Taking', icon: '📄', type: 'config', fields: [{ key: 'accessToken', label: 'Access token', placeholder: 'ya29...' }, { key: 'folderId', label: 'Folder ID (optional)', placeholder: '' }], help: 'Google Drive API access token. Syncs documents from your Drive.' },
  { id: 'google-keep', name: 'Google Keep', category: 'Note-Taking', icon: '📝', type: 'import', accept: '.zip', help: 'Export: takeout.google.com → Select "Keep" → download ZIP' },
  { id: 'apple-notes', name: 'Apple Notes', category: 'Note-Taking', icon: '🍎', type: 'config', fields: [{ key: 'dbPath', label: 'NoteStore.sqlite path', placeholder: '~/Library/Group Containers/group.com.apple.notes/NoteStore.sqlite' }], help: 'macOS only. Requires Full Disk Access for your terminal.' },
  // Communication
  { id: 'gmail', name: 'Gmail', category: 'Communication', icon: '✉️', type: 'config', fields: [{ key: 'accessToken', label: 'Gmail API access token', placeholder: 'ya29...' }], help: 'OAuth2 token from Google Cloud Console with Gmail read scope.' },
  { id: 'imessage', name: 'iMessage', category: 'Communication', icon: '💬', type: 'config', fields: [{ key: 'dbPath', label: 'chat.db path', placeholder: '~/Library/Messages/chat.db' }], help: 'macOS only. Requires Full Disk Access.' },
  { id: 'whatsapp', name: 'WhatsApp', category: 'Communication', icon: '📱', type: 'import', accept: '.txt,.zip', help: 'In WhatsApp → Open chat → ⋮ → More → Export chat' },
  { id: 'telegram-import', name: 'Telegram Export', category: 'Communication', icon: '✈️', type: 'import', accept: '.zip,.json', help: 'Telegram Desktop → Settings → Advanced → Export Telegram data' },
  { id: 'slack', name: 'Slack', category: 'Communication', icon: '💼', type: 'config', fields: [{ key: 'token', label: 'Bot User OAuth Token', placeholder: 'xoxb-...' }], help: 'Create a Slack app, add channels:history and channels:read scopes.' },
  { id: 'rss', name: 'RSS Feeds', category: 'Communication', icon: '📡', type: 'config', fields: [{ key: 'feeds', label: 'Feed URLs (one per line)', placeholder: 'https://news.ycombinator.com/rss\nhttps://example.com/feed', multiline: true }], help: 'Add RSS/Atom feed URLs. Sensei polls them on your sync schedule.' },
  // Storage
  { id: 'backblaze-b2', name: 'Backblaze B2', category: 'Storage', icon: '🔥', type: 'config', fields: [{ key: 'account', label: 'B2 Key ID', placeholder: '00xxxxx' }, { key: 'key', label: 'B2 Application Key', placeholder: '' }, { key: 'bucket', label: 'Bucket name', placeholder: 'sensei-kb' }], help: 'Syncs your knowledge base to Backblaze B2 via rclone.' },
  { id: 'google-drive-storage', name: 'Google Drive', category: 'Storage', icon: '📁', type: 'config', fields: [{ key: 'client_id', label: 'Client ID', placeholder: '' }, { key: 'client_secret', label: 'Client Secret', placeholder: '' }, { key: 'folder_id', label: 'Folder ID', placeholder: '' }], help: 'Sync to Google Drive. Run `rclone config` on server for OAuth.' },
  { id: 'dropbox-storage', name: 'Dropbox', category: 'Storage', icon: '📦', type: 'config', fields: [{ key: 'token', label: 'Access token', placeholder: '' }], help: 'Sync to Dropbox via rclone. Run `rclone config` for OAuth setup.' },
  { id: 's3-storage', name: 'S3 / Cloudflare R2', category: 'Storage', icon: '☁️', type: 'config', fields: [{ key: 'access_key_id', label: 'Access Key ID', placeholder: '' }, { key: 'secret_access_key', label: 'Secret Access Key', placeholder: '' }, { key: 'endpoint', label: 'Endpoint URL', placeholder: 'https://xxx.r2.cloudflarestorage.com' }, { key: 'bucket', label: 'Bucket', placeholder: 'sensei-kb' }], help: 'Any S3-compatible storage including Cloudflare R2.' },
  { id: 'local-storage', name: 'Local Sync Path', category: 'Storage', icon: '💾', type: 'config', fields: [{ key: 'path', label: 'Local sync path', placeholder: '/mnt/backup/sensei' }], help: 'Sync knowledge to another local directory (for backup or mobile access).' },
  // Generic
  { id: 'webhook', name: 'Webhook', category: 'Generic', icon: '🔗', type: 'info', help: 'POST JSON to /api/webhook/ingest to push content into Sensei from any source.' }
];

export default function ConnectorsPage() {
  const [importing, setImporting] = useState(null);
  const [results, setResults] = useState({});
  const [configs, setConfigs] = useState({});
  const [syncConfigs, setSyncConfigs] = useState({});
  const [globalSync, setGlobalSync] = useState('every_4h');
  const [expandedConnector, setExpandedConnector] = useState(null);
  const [savingConfig, setSavingConfig] = useState(null);

  useEffect(() => {
    loadConfigs();
  }, []);

  async function loadConfigs() {
    try {
      const settings = await api.getSettings();
      const s = settings.settings || {};
      setConfigs(s.connector_configs || {});
      setSyncConfigs(s.sync_configs || {});
      setGlobalSync(s.global_sync?.interval || 'every_4h');
    } catch (e) { console.error(e); }
  }

  async function handleImport(connectorId, file) {
    setImporting(connectorId);
    setResults(prev => ({ ...prev, [connectorId]: null }));
    try {
      const result = await api.importConnector(connectorId, file);
      setResults(prev => ({ ...prev, [connectorId]: { success: true, ...result } }));
    } catch (e) {
      setResults(prev => ({ ...prev, [connectorId]: { success: false, error: e.message } }));
    }
    setImporting(null);
  }

  async function saveConnectorConfig(connectorId) {
    setSavingConfig(connectorId);
    try {
      const allConfigs = { ...configs };
      await api.saveSettings({ connector_configs: allConfigs });
      setResults(prev => ({ ...prev, [connectorId]: { success: true, message: 'Configuration saved' } }));
    } catch (e) {
      setResults(prev => ({ ...prev, [connectorId]: { success: false, error: e.message } }));
    }
    setSavingConfig(null);
  }

  async function saveSyncConfig(connectorId, interval) {
    const updated = { ...syncConfigs, [connectorId]: { enabled: interval !== 'manual', interval } };
    setSyncConfigs(updated);
    try {
      await api.setSyncConfig(connectorId, { enabled: interval !== 'manual', interval });
    } catch (e) { console.error(e); }
  }

  async function saveGlobalSync(interval) {
    setGlobalSync(interval);
    try {
      await api.saveSettings({ global_sync: { interval } });
    } catch (e) { console.error(e); }
  }

  function updateConfig(connectorId, key, value) {
    setConfigs(prev => ({
      ...prev,
      [connectorId]: { ...(prev[connectorId] || {}), [key]: value }
    }));
  }

  const categories = [...new Set(ALL_CONNECTORS.map(c => c.category))];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <Plug size={20} className="text-sensei-500" /> Connectors
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Connect your knowledge sources to Sensei.</p>
        </div>
      </div>

      {/* Global sync interval */}
      <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium flex items-center gap-1.5"><Clock size={14} /> Default Sync Interval</div>
            <div className="text-xs text-gray-500 mt-0.5">Applies to all connectors unless overridden individually.</div>
          </div>
          <select value={globalSync} onChange={e => saveGlobalSync(e.target.value)}
            className="bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-xs focus:border-sensei-500 focus:outline-none">
            {SYNC_INTERVALS.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
          </select>
        </div>
      </div>

      {/* Connectors by category */}
      {categories.map(category => (
        <div key={category}>
          <h2 className="text-xs text-gray-500 uppercase tracking-wide mb-2">{category}</h2>
          <div className="space-y-2">
            {ALL_CONNECTORS.filter(c => c.category === category).map(conn => {
              const isExpanded = expandedConnector === conn.id;
              const connConfig = configs[conn.id] || {};
              const connSync = syncConfigs[conn.id] || {};

              return (
                <div key={conn.id} className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
                  {/* Header row */}
                  <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={() => setExpandedConnector(isExpanded ? null : conn.id)}>
                    <span className="text-xl">{conn.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{conn.name}</div>
                      <div className="text-xs text-gray-500 truncate">{conn.help}</div>
                    </div>

                    {/* Quick action: import button for import-type connectors */}
                    {conn.type === 'import' && (
                      <label className="shrink-0 flex items-center gap-1.5 bg-sensei-500 hover:bg-sensei-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition"
                        onClick={e => e.stopPropagation()}>
                        {importing === conn.id ? 'Importing...' : <><Upload size={12} /> Import</>}
                        <input type="file" accept={conn.accept || '.zip'} className="hidden" disabled={importing === conn.id}
                          onChange={e => { if (e.target.files[0]) handleImport(conn.id, e.target.files[0]); e.target.value = ''; }} />
                      </label>
                    )}

                    {conn.type === 'config' && (
                      <div className={`w-2 h-2 rounded-full ${Object.keys(connConfig).length > 0 ? 'bg-sensei-500' : 'bg-gray-600'}`} />
                    )}

                    {conn.type === 'info' && (
                      <span className="text-xs text-gray-600">Always on</span>
                    )}
                  </div>

                  {/* Result message */}
                  {results[conn.id] && (
                    <div className={`mx-4 mb-3 flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${results[conn.id].success ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                      {results[conn.id].success ? <CheckCircle size={12} /> : <AlertCircle size={12} />}
                      {results[conn.id].message || (results[conn.id].imported !== undefined ? `Imported ${results[conn.id].imported} of ${results[conn.id].total}` : results[conn.id].error)}
                    </div>
                  )}

                  {/* Expanded config panel */}
                  {isExpanded && conn.type === 'config' && (
                    <div className="px-4 pb-4 space-y-3 border-t border-gray-200 dark:border-gray-800 pt-3">
                      {conn.fields.map(field => (
                        <div key={field.key}>
                          <label className="block text-xs text-gray-500 mb-1">{field.label}</label>
                          {field.multiline ? (
                            <textarea value={connConfig[field.key] || ''} placeholder={field.placeholder} rows={3}
                              onChange={e => updateConfig(conn.id, field.key, e.target.value)}
                              className="w-full bg-gray-100 dark:bg-gray-800 border border-transparent rounded-lg px-3 py-2 text-sm resize-y focus:border-sensei-500 focus:outline-none" />
                          ) : (
                            <input type={field.key.includes('token') || field.key.includes('Token') ? 'password' : 'text'}
                              value={connConfig[field.key] || ''} placeholder={field.placeholder}
                              onChange={e => updateConfig(conn.id, field.key, e.target.value)}
                              className="w-full bg-gray-100 dark:bg-gray-800 border border-transparent rounded-lg px-3 py-2 text-sm focus:border-sensei-500 focus:outline-none" />
                          )}
                        </div>
                      ))}

                      {/* Sync interval for this connector */}
                      <div className="flex items-center justify-between pt-2">
                        <div className="text-xs text-gray-500">Sync interval</div>
                        <select value={connSync.interval || globalSync}
                          onChange={e => saveSyncConfig(conn.id, e.target.value)}
                          className="bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 text-xs focus:border-sensei-500 focus:outline-none">
                          {SYNC_INTERVALS.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
                        </select>
                      </div>

                      <button onClick={() => saveConnectorConfig(conn.id)} disabled={savingConfig === conn.id}
                        className="w-full flex items-center justify-center gap-1.5 bg-sensei-500 hover:bg-sensei-600 text-white py-2 rounded-lg text-xs font-medium transition">
                        {savingConfig === conn.id ? 'Saving...' : <><SettingsIcon size={12} /> Save Configuration</>}
                      </button>
                    </div>
                  )}

                  {/* Expanded info for webhook */}
                  {isExpanded && conn.type === 'info' && (
                    <div className="px-4 pb-4 border-t border-gray-200 dark:border-gray-800 pt-3">
                      <pre className="bg-gray-100 dark:bg-gray-800 rounded-lg p-3 text-xs font-mono overflow-x-auto">
{`POST /api/webhook/ingest
Content-Type: application/json

{
  "content": "Your knowledge here",
  "title": "Optional title",
  "tags": ["optional", "tags"]
}`}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* MCP Config */}
      <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
        <h3 className="text-sm font-medium mb-1">📡 MCP Server</h3>
        <p className="text-xs text-gray-500 mb-3">Connect Claude Desktop, Cursor, or any MCP client.</p>
        <pre className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-3 py-2 rounded-lg text-xs font-mono overflow-x-auto">
{`{
  "mcpServers": {
    "sensei": {
      "type": "http",
      "url": "${typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8082'}/mcp"
    }
  }
}`}
        </pre>
      </div>
    </div>
  );
}
