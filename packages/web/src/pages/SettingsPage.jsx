import React, { useState, useEffect } from 'react';
import { api } from '../lib/api.js';
import { Settings as SettingsIcon, Save, RefreshCw, CheckCircle } from 'lucide-react';

export default function SettingsPage() {
  const [settings, setSettings] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [reindexing, setReindexing] = useState(false);

  useEffect(() => { loadSettings(); }, []);

  async function loadSettings() {
    const data = await api.getSettings();
    setSettings(data.settings || {});
  }

  async function handleSave() {
    setSaving(true);
    try {
      await api.saveSettings(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  }

  async function handleReindex() {
    setReindexing(true);
    try {
      const result = await api.reindex();
      alert(`Re-indexed ${result.indexed} of ${result.total} articles`);
    } catch (e) {
      console.error(e);
    }
    setReindexing(false);
  }

  function updateNested(key, field, value) {
    setSettings(prev => ({
      ...prev,
      [key]: { ...(prev[key] || {}), [field]: value }
    }));
  }

  const profile = settings.user_profile || {};
  const appearance = settings.appearance || {};
  const aiProvider = settings.ai_provider || {};

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold flex items-center gap-2">
          <SettingsIcon size={20} className="text-sensei-500" /> Settings
        </h1>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-1.5 bg-sensei-500 hover:bg-sensei-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
          {saved ? <><CheckCircle size={14} /> Saved</> : <><Save size={14} /> {saving ? 'Saving...' : 'Save'}</>}
        </button>
      </div>

      {/* Profile */}
      <section className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold">Profile</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Full Name</label>
            <input type="text" value={profile.fullName || ''} onChange={e => updateNested('user_profile', 'fullName', e.target.value)}
              className="w-full bg-gray-100 dark:bg-gray-800 border border-transparent rounded-lg px-3 py-2 text-sm focus:border-sensei-500 focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Preferred Name</label>
            <input type="text" value={profile.preferredName || ''} onChange={e => updateNested('user_profile', 'preferredName', e.target.value)}
              className="w-full bg-gray-100 dark:bg-gray-800 border border-transparent rounded-lg px-3 py-2 text-sm focus:border-sensei-500 focus:outline-none" />
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-gray-500 mb-1">Location</label>
            <input type="text" value={profile.location || ''} onChange={e => updateNested('user_profile', 'location', e.target.value)}
              className="w-full bg-gray-100 dark:bg-gray-800 border border-transparent rounded-lg px-3 py-2 text-sm focus:border-sensei-500 focus:outline-none" />
          </div>
        </div>
      </section>

      {/* Appearance */}
      <section className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 space-y-5">
        <h2 className="text-sm font-semibold">Appearance</h2>

        {/* Theme toggle — beautiful pill style */}
        <div>
          <label className="block text-xs text-gray-500 mb-2">Theme</label>
          <div className="inline-flex bg-gray-200 dark:bg-gray-800 rounded-full p-0.5">
            {[
              { id: 'light', label: '☀️ Light' },
              { id: 'dark', label: '🌙 Dark' },
              { id: 'auto', label: '💻 Auto' }
            ].map(t => (
              <button key={t.id} onClick={() => updateNested('appearance', 'theme', t.id)}
                className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${(appearance.theme || 'dark') === t.id ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Font */}
        <div>
          <label className="block text-xs text-gray-500 mb-2">Font</label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: 'Inter', sample: 'Clean & modern' },
              { id: 'Georgia', sample: 'Classic serif' },
              { id: 'JetBrains Mono', sample: 'Monospace' },
              { id: 'system-ui', sample: 'System default' }
            ].map(f => (
              <button key={f.id} onClick={() => updateNested('appearance', 'fontFamily', f.id)}
                className={`text-left px-3 py-2.5 rounded-lg border transition-all ${(appearance.fontFamily || 'Inter') === f.id ? 'border-sensei-500 bg-sensei-500/10' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}`}>
                <div className="text-sm font-medium" style={{ fontFamily: f.id }}>{f.id === 'system-ui' ? 'System' : f.id}</div>
                <div className="text-xs text-gray-500 mt-0.5" style={{ fontFamily: f.id }}>{f.sample}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Font Size — visual slider-like buttons */}
        <div>
          <label className="block text-xs text-gray-500 mb-2">Font Size</label>
          <div className="flex items-center gap-1 bg-gray-200 dark:bg-gray-800 rounded-lg p-1">
            {[
              { size: '14px', label: 'S' },
              { size: '15px', label: 'M' },
              { size: '16px', label: 'L' },
              { size: '18px', label: 'XL' }
            ].map(s => (
              <button key={s.size} onClick={() => updateNested('appearance', 'fontSize', s.size)}
                className={`flex-1 py-2 rounded-md text-xs font-medium transition-all ${(appearance.fontSize || '16px') === s.size ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
                <span style={{ fontSize: s.size }}>{s.label}</span>
                <div className="text-[10px] text-gray-400 mt-0.5">{s.size}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Animations toggle */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">Animations</div>
            <div className="text-xs text-gray-500">Smooth transitions and effects</div>
          </div>
          <button onClick={() => {
            const newVal = !(appearance.animations !== false);
            updateNested('appearance', 'animations', newVal);
          }}
            className={`relative w-11 h-6 rounded-full transition-all ${(appearance.animations !== false) ? 'bg-sensei-500' : 'bg-gray-400 dark:bg-gray-600'}`}>
            <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${(appearance.animations !== false) ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </div>

        {/* Live preview */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 transition-all"
          style={{ fontFamily: `'${appearance.fontFamily || 'Inter'}', system-ui`, fontSize: appearance.fontSize || '16px' }}>
          <div className="font-semibold mb-1" style={{ color: 'var(--sensei-green)' }}>Preview</div>
          <p className="text-gray-600 dark:text-gray-300 leading-relaxed">This is how your knowledge base will look. Every article, briefing, and search result uses these settings.</p>
        </div>
      </section>

      {/* AI Provider */}
      <section className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold">AI Provider</h2>
        <p className="text-xs text-gray-500">Used for entity extraction, auto-classification, semantic search, and synthesis.</p>
        <div className="grid grid-cols-3 gap-2 mb-3">
          {['openrouter', 'openai', 'anthropic'].map(p => (
            <button key={p} onClick={() => updateNested('ai_provider', 'provider', p)}
              className={`px-3 py-2 rounded-lg border text-xs transition capitalize ${(aiProvider.provider || 'openrouter') === p ? 'border-sensei-500 bg-sensei-500/10 text-sensei-400' : 'border-gray-800 bg-gray-800'}`}>
              {p === 'openrouter' ? 'OpenRouter' : p === 'openai' ? 'OpenAI' : 'Anthropic'}
            </button>
          ))}
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">API Key</label>
          <input type="password" value={aiProvider.apiKey || ''} onChange={e => updateNested('ai_provider', 'apiKey', e.target.value)}
            className="w-full bg-gray-100 dark:bg-gray-800 border border-transparent rounded-lg px-3 py-2 text-sm focus:border-sensei-500 focus:outline-none" />
        </div>
      </section>

      {/* Tone & Style */}
      <section className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold">Sensei's Tone & Style</h2>
        <p className="text-xs text-gray-500">How Sensei speaks to you in briefings, summaries, and chat responses.</p>
        <div>
          <label className="block text-xs text-gray-500 mb-2">Tone</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {[
              { id: 'concise', label: 'Concise', desc: 'Short, direct, no fluff' },
              { id: 'conversational', label: 'Conversational', desc: 'Warm and natural' },
              { id: 'professional', label: 'Professional', desc: 'Formal and structured' },
              { id: 'analytical', label: 'Analytical', desc: 'Data-driven, precise' },
              { id: 'coaching', label: 'Coaching', desc: 'Encouraging, actionable' },
              { id: 'socratic', label: 'Socratic', desc: 'Questions to provoke thought' }
            ].map(t => (
              <button key={t.id} onClick={() => updateNested('tone_style', 'tone', t.id)}
                className={`text-left px-3 py-2 rounded-lg border text-xs transition ${(settings.tone_style?.tone || 'concise') === t.id ? 'border-sensei-500 bg-sensei-500/10 text-sensei-400' : 'border-gray-800 bg-gray-800 dark:bg-gray-800'}`}>
                <div className="font-medium">{t.label}</div>
                <div className="text-gray-600 mt-0.5">{t.desc}</div>
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">Custom instructions (optional)</label>
          <textarea value={settings.tone_style?.customInstructions || ''}
            onChange={e => updateNested('tone_style', 'customInstructions', e.target.value)}
            placeholder="e.g., Always end with a clear next step. Use analogies from physics. Be witty but direct."
            rows={3}
            className="w-full bg-gray-100 dark:bg-gray-800 border border-transparent rounded-lg px-3 py-2 text-sm resize-y focus:border-sensei-500 focus:outline-none" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">Response length</label>
          <div className="flex gap-2">
            {['brief', 'balanced', 'detailed'].map(l => (
              <button key={l} onClick={() => updateNested('tone_style', 'length', l)}
                className={`flex-1 px-3 py-2 rounded-lg border text-xs capitalize transition ${(settings.tone_style?.length || 'balanced') === l ? 'border-sensei-500 bg-sensei-500/10 text-sensei-400' : 'border-gray-800 bg-gray-800'}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Telegram Bot */}
      <section className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold">Telegram Bot</h2>
        <p className="text-xs text-gray-500">Chat with Sensei from Telegram — search, capture, parse links, and receive briefings on the go.</p>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Bot Token</label>
          <input type="password" value={settings.telegram?.botToken || ''}
            onChange={e => updateNested('telegram', 'botToken', e.target.value)}
            placeholder="Paste your Telegram Bot token from @BotFather"
            className="w-full bg-gray-100 dark:bg-gray-800 border border-transparent rounded-lg px-3 py-2 text-sm focus:border-sensei-500 focus:outline-none" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Your Telegram User ID</label>
          <input type="text" value={settings.telegram?.allowedUserId || ''}
            onChange={e => updateNested('telegram', 'allowedUserId', e.target.value)}
            placeholder="Your numeric Telegram user ID (for security)"
            className="w-full bg-gray-100 dark:bg-gray-800 border border-transparent rounded-lg px-3 py-2 text-sm focus:border-sensei-500 focus:outline-none" />
          <p className="text-xs text-gray-600 mt-1">Only this user can interact with your Sensei bot. Get your ID from @userinfobot on Telegram.</p>
        </div>
        {!settings.telegram?.botToken && (
          <div className="bg-gray-800 rounded-lg p-3 space-y-2 text-xs text-gray-400">
            <div className="font-medium text-gray-300">How to set up:</div>
            <div>1. Open Telegram, search for <strong>@BotFather</strong></div>
            <div>2. Send <code className="bg-gray-700 px-1 rounded">/newbot</code> and follow the prompts</div>
            <div>3. Copy the bot token and paste it above</div>
            <div>4. Message <strong>@userinfobot</strong> to get your user ID</div>
            <div>5. Save settings — Sensei will start listening</div>
          </div>
        )}
      </section>

      {/* Maintenance */}
      <section className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold">Maintenance</h2>
        <button onClick={handleReindex} disabled={reindexing}
          className="flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 px-4 py-2 rounded-lg text-sm transition">
          <RefreshCw size={14} className={reindexing ? 'animate-spin' : ''} />
          {reindexing ? 'Re-indexing...' : 'Re-index all articles'}
        </button>
        <p className="text-xs text-gray-600">Rebuilds search index, embeddings, and link discovery for all articles. May take a few minutes.</p>
      </section>
    </div>
  );
}
