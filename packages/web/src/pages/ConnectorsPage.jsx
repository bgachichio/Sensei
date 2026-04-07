import React, { useState } from 'react';
import { api } from '../lib/api.js';
import { Upload, CheckCircle, AlertCircle, FileUp, Bot } from 'lucide-react';

const CONNECTORS = [
  { id: 'claude', name: 'Claude', desc: 'Import Claude conversation export (ZIP)', icon: '🟠', accept: '.zip' },
  { id: 'chatgpt', name: 'ChatGPT', desc: 'Import ChatGPT data export (ZIP)', icon: '🟢', accept: '.zip' },
  { id: 'gemini', name: 'Gemini', desc: 'Import Google Gemini / Takeout (ZIP)', icon: '🔵', accept: '.zip' }
];

export default function ConnectorsPage() {
  const [importing, setImporting] = useState(null);
  const [results, setResults] = useState({});

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

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-lg font-bold flex items-center gap-2">
          <Bot size={20} className="text-sensei-500" /> Connectors
        </h1>
        <p className="text-sm text-gray-500 mt-1">Import your AI conversations into Sensei.</p>
      </div>

      {/* How to export instructions */}
      <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
        <h3 className="text-sm font-medium mb-2">How to export your conversations</h3>
        <div className="text-xs text-gray-500 space-y-1.5">
          <p><strong className="text-gray-400">Claude:</strong> claude.ai → Settings → Privacy → Export Data → download ZIP</p>
          <p><strong className="text-gray-400">ChatGPT:</strong> chatgpt.com → Settings → Data controls → Export data → download ZIP</p>
          <p><strong className="text-gray-400">Gemini:</strong> takeout.google.com → Select "Gemini Apps" → Export → download ZIP</p>
        </div>
      </div>

      {/* Connector cards */}
      <div className="space-y-3">
        {CONNECTORS.map(conn => (
          <div key={conn.id} className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{conn.icon}</span>
              <div className="flex-1">
                <h3 className="text-sm font-medium">{conn.name}</h3>
                <p className="text-xs text-gray-500">{conn.desc}</p>
              </div>

              <label className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium cursor-pointer transition
                ${importing === conn.id ? 'bg-gray-700 text-gray-400' : 'bg-sensei-500 hover:bg-sensei-600 text-white'}`}>
                {importing === conn.id ? (
                  <>Processing...</>
                ) : (
                  <>
                    <Upload size={13} /> Import ZIP
                    <input type="file" accept={conn.accept} className="hidden"
                      onChange={e => { if (e.target.files[0]) handleImport(conn.id, e.target.files[0]); e.target.value = ''; }} />
                  </>
                )}
              </label>
            </div>

            {/* Result */}
            {results[conn.id] && (
              <div className={`mt-3 flex items-center gap-2 text-xs px-3 py-2 rounded-lg
                ${results[conn.id].success ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                {results[conn.id].success ? (
                  <>
                    <CheckCircle size={13} />
                    Imported {results[conn.id].imported} of {results[conn.id].total} conversations
                  </>
                ) : (
                  <>
                    <AlertCircle size={13} />
                    {results[conn.id].error}
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Webhook */}
      <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
        <h3 className="text-sm font-medium mb-1">Webhook Endpoint</h3>
        <p className="text-xs text-gray-500 mb-3">POST any content to this endpoint for automatic ingestion.</p>
        <code className="block bg-gray-800 text-sensei-400 px-3 py-2 rounded text-xs font-mono">
          POST /api/webhook/ingest
        </code>
        <pre className="mt-2 text-xs text-gray-600 font-mono">
{`{
  "content": "Your knowledge content here",
  "title": "Optional title",
  "source": { "type": "webhook", "id": "my-source" }
}`}
        </pre>
      </div>

      {/* MCP Config */}
      <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
        <h3 className="text-sm font-medium mb-1">MCP Server</h3>
        <p className="text-xs text-gray-500 mb-3">Connect Claude Desktop, Cursor, or any MCP client to your knowledge base.</p>
        <pre className="bg-gray-800 text-gray-300 px-3 py-2 rounded text-xs font-mono overflow-x-auto">
{`{
  "mcpServers": {
    "sensei": {
      "type": "http",
      "url": "${window.location.origin}/mcp"
    }
  }
}`}
        </pre>
      </div>
    </div>
  );
}
