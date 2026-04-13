import React, { useState } from 'react';
import { api } from '../lib/api.js';
import { User, Palette, HardDrive, Sparkles, Link, Globe, ChevronRight, ChevronLeft, Check, Plus, X, GripVertical } from 'lucide-react';

const STEPS = ['identity', 'appearance', 'aiProviders', 'storage', 'firstKnowledge', 'domain', 'sources'];
const FONTS = ['Inter', 'Georgia', 'JetBrains Mono', 'system-ui'];
const SIZES = ['14px', '15px', '16px', '18px'];
const AI_PROVIDERS = [
  { id: 'openrouter', name: 'OpenRouter', desc: 'Access all models (recommended)', hasEmbeddings: true },
  { id: 'openai', name: 'OpenAI', desc: 'GPT-4o, embeddings', hasEmbeddings: true },
  { id: 'anthropic', name: 'Anthropic', desc: 'Claude Sonnet/Opus', hasEmbeddings: false },
  { id: 'gemini', name: 'Gemini', desc: 'Google Gemini + embeddings', hasEmbeddings: true },
  { id: 'grok', name: 'Grok', desc: 'xAI Grok models', hasEmbeddings: false },
  { id: 'perplexity', name: 'Perplexity', desc: 'Sonar search-augmented', hasEmbeddings: false },
  { id: 'ollama', name: 'Ollama', desc: 'Local models (no API key needed)', hasEmbeddings: true, noKey: true }
];

/** Mini connector card with real upload for onboarding */
function OnboardingConnector({ connector, type }) {
  const [status, setStatus] = React.useState(null); // null | 'uploading' | 'success' | 'error'
  const [result, setResult] = React.useState('');

  async function handleImport(file) {
    setStatus('uploading');
    try {
      const res = await api.importConnector(connector.id, file);
      setStatus('success');
      setResult(`Imported ${res.imported} of ${res.total} items`);
    } catch (e) {
      setStatus('error');
      setResult(e.message || 'Import failed');
    }
  }

  return (
    <div className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 mb-1.5">
      <span className="text-lg">{connector.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-200">{connector.name}</div>
        <div className="text-xs text-gray-600 truncate">{connector.help}</div>
      </div>
      {status === 'success' ? (
        <div className="text-xs text-green-400 flex items-center gap-1"><Check size={12} /> {result}</div>
      ) : status === 'error' ? (
        <div className="text-xs text-red-400">{result}</div>
      ) : status === 'uploading' ? (
        <div className="text-xs text-gray-400 animate-pulse">Importing...</div>
      ) : (
        <label className="shrink-0 flex items-center gap-1 bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg text-xs cursor-pointer transition">
          <Plus size={12} /> Import
          <input type="file" accept=".zip,.txt,.json" className="hidden"
            onChange={e => { if (e.target.files[0]) handleImport(e.target.files[0]); e.target.value = ''; }} />
        </label>
      )}
    </div>
  );
}

export default function Onboarding({ onComplete }) {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const [profile, setProfile] = useState({ fullName: '', preferredName: '', location: '' });
  const [appearance, setAppearance] = useState({ theme: 'dark', fontFamily: 'Inter', fontSize: '16px' });
  const [storagePrefs, setStoragePrefs] = useState({ primary: 'local', path: '', repo: '' });
  const [firstKnowledge, setFirstKnowledge] = useState({ project: '', person: '', decision: '' });
  const [domain, setDomain] = useState({ domain: '', hasCaddy: false });

  // Multi-LLM state: array of up to 3 providers
  const [llmProviders, setLlmProviders] = useState([]);

  const currentDate = new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  function addProvider() {
    if (llmProviders.length >= 3) return;
    setLlmProviders([...llmProviders, { provider: '', apiKey: '', priority: llmProviders.length }]);
  }

  function updateProvider(index, field, value) {
    const updated = [...llmProviders];
    updated[index] = { ...updated[index], [field]: value };
    setLlmProviders(updated);
  }

  function removeProvider(index) {
    setLlmProviders(llmProviders.filter((_, i) => i !== index).map((p, i) => ({ ...p, priority: i })));
  }

  function moveProvider(index, direction) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= llmProviders.length) return;
    const updated = [...llmProviders];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    setLlmProviders(updated.map((p, i) => ({ ...p, priority: i })));
  }

  async function handleComplete() {
    setLoading(true);
    try {
      const aiConfig = llmProviders.length > 0
        ? { providers: llmProviders.filter(p => p.provider && (p.apiKey || AI_PROVIDERS.find(a => a.id === p.provider)?.noKey)) }
        : null;

      await api.onboard({
        userProfile: { ...profile, onboardedAt: new Date().toISOString() },
        appearance,
        storage: storagePrefs,
        aiProvider: aiConfig
      });

      if (domain.domain) {
        await api.saveSettings({ domain_config: domain });
      }

      if (domain.telegramToken) {
        await api.saveSettings({ telegram: { botToken: domain.telegramToken, allowedUserId: domain.telegramUserId || '' } });
      }

      if (firstKnowledge.project) {
        await api.ingest({
          title: firstKnowledge.project,
          content: `# ${firstKnowledge.project}\n\n${firstKnowledge.person ? `Involves: ${firstKnowledge.person}\n\n` : ''}${firstKnowledge.decision ? `## Key Decision\n${firstKnowledge.decision}` : ''}`,
          category: 'projects',
          source: { type: 'onboarding', id: 'first-knowledge' }
        });
      }

      setShowSuccess(true);
    } catch (e) {
      console.error('Onboarding failed:', e);
    }
    setLoading(false);
  }

  function next() { if (step < STEPS.length - 1) setStep(step + 1); }
  function prev() { if (step > 0) setStep(step - 1); }
  function canProceed() {
    if (step === 0) return profile.fullName.trim().length > 0;
    return true;
  }

  const priorityLabels = ['Primary', 'Secondary', 'Tertiary'];

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">

        {/* Success CTA */}
        {showSuccess && (
          <div className="text-center space-y-6 animate-in fade-in">
            <div className="text-5xl mb-2">🥋</div>
            <h1 className="text-2xl font-bold">You're all set!</h1>
            <p className="text-gray-400 text-sm max-w-xs mx-auto">
              Sensei is now running quietly in the background, learning and connecting your knowledge.
            </p>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
              <p className="text-sm text-gray-300">If Sensei is useful to you, consider supporting its development.</p>
              <a href="https://paystack.shop/pay/gachichio" target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full bg-sensei-500 hover:bg-sensei-600 text-white py-3 rounded-lg text-sm font-medium transition">
                ❤️ Support Sensei
              </a>
            </div>

            <button onClick={onComplete}
              className="text-sm text-gray-500 hover:text-gray-300 transition underline underline-offset-2">
              Continue to my Knowledge Base →
            </button>

            <div className="text-xs text-gray-700 mt-4">Made with ❤️ by Brian Gachichio</div>
          </div>
        )}
        {/* Main onboarding content - hidden when showing success */}
        {!showSuccess && (<>
        {/* Progress bar */}
        <div className="flex gap-1.5 mb-8">
          {STEPS.map((_, i) => (
            <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-500 ${i <= step ? 'bg-sensei-500' : 'bg-gray-800'}`} />
          ))}
        </div>

        {/* Step 1: Identity */}
        {step === 0 && (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <div className="text-5xl mb-4">🥋</div>
              <h1 className="text-2xl font-bold mb-2">Welcome to Sensei</h1>
              <p className="text-gray-400">Let's set up your personal knowledge base.</p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Full Name</label>
                <input type="text" autoFocus placeholder="Brian Gachichio Karanja" value={profile.fullName}
                  onChange={e => setProfile({ ...profile, fullName: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 focus:border-sensei-500 focus:outline-none transition" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Preferred Name</label>
                <input type="text" placeholder="Brian" value={profile.preferredName}
                  onChange={e => setProfile({ ...profile, preferredName: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 focus:border-sensei-500 focus:outline-none transition" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Today's Date</label>
                <div className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 text-gray-400">{currentDate}</div>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Primary Location</label>
                <input type="text" placeholder="Nairobi, Kenya" value={profile.location}
                  onChange={e => setProfile({ ...profile, location: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 focus:border-sensei-500 focus:outline-none transition" />
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Appearance */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <Palette className="mx-auto mb-3 text-sensei-500" size={32} />
              <h2 className="text-xl font-bold mb-1">How should Sensei look?</h2>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">Font</label>
              <div className="grid grid-cols-2 gap-2">
                {FONTS.map(f => (
                  <button key={f} onClick={() => setAppearance({ ...appearance, fontFamily: f })}
                    className={`px-4 py-2.5 rounded-lg border text-sm transition ${appearance.fontFamily === f ? 'border-sensei-500 bg-sensei-500/10 text-sensei-400' : 'border-gray-800 bg-gray-900 hover:border-gray-700'}`}
                    style={{ fontFamily: f }}>{f === 'system-ui' ? 'System' : f}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">Font Size</label>
              <div className="flex gap-2">
                {SIZES.map(s => (
                  <button key={s} onClick={() => setAppearance({ ...appearance, fontSize: s })}
                    className={`flex-1 px-3 py-2.5 rounded-lg border text-sm transition ${appearance.fontSize === s ? 'border-sensei-500 bg-sensei-500/10 text-sensei-400' : 'border-gray-800 bg-gray-900'}`}>{s}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">Theme</label>
              <div className="flex gap-2">
                {['dark', 'light', 'auto'].map(t => (
                  <button key={t} onClick={() => setAppearance({ ...appearance, theme: t })}
                    className={`flex-1 px-4 py-2.5 rounded-lg border text-sm capitalize transition ${appearance.theme === t ? 'border-sensei-500 bg-sensei-500/10 text-sensei-400' : 'border-gray-800 bg-gray-900'}`}>{t}</button>
                ))}
              </div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4" style={{ fontFamily: appearance.fontFamily, fontSize: appearance.fontSize }}>
              <p className="text-gray-300">This is how your knowledge base will look with these settings.</p>
            </div>
          </div>
        )}

        {/* Step 3: AI Providers (Multi-LLM) */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <Sparkles className="mx-auto mb-3 text-sensei-500" size={32} />
              <h2 className="text-xl font-bold mb-1">Configure AI Providers</h2>
              <p className="text-gray-400 text-sm">Add up to 3 providers. If one fails, Sensei automatically falls to the next.</p>
            </div>

            {/* Provider list */}
            <div className="space-y-3">
              {llmProviders.map((p, i) => {
                const provDef = AI_PROVIDERS.find(a => a.id === p.provider);
                return (
                  <div key={i} className="bg-gray-900 border border-gray-800 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-medium text-sensei-400 w-16">{priorityLabels[i]}</span>
                      <div className="flex gap-1 ml-auto">
                        {i > 0 && <button onClick={() => moveProvider(i, -1)} className="text-gray-600 hover:text-gray-400 text-xs">▲</button>}
                        {i < llmProviders.length - 1 && <button onClick={() => moveProvider(i, 1)} className="text-gray-600 hover:text-gray-400 text-xs">▼</button>}
                        <button onClick={() => removeProvider(i)} className="text-gray-600 hover:text-red-400 ml-1"><X size={14} /></button>
                      </div>
                    </div>
                    <select value={p.provider} onChange={e => updateProvider(i, 'provider', e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm mb-2 focus:border-sensei-500 focus:outline-none">
                      <option value="">Select provider...</option>
                      {AI_PROVIDERS.map(a => (
                        <option key={a.id} value={a.id}>{a.name} — {a.desc}</option>
                      ))}
                    </select>
                    {p.provider && !AI_PROVIDERS.find(a => a.id === p.provider)?.noKey && (
                      <input type="password" placeholder="API Key" value={p.apiKey}
                        onChange={e => updateProvider(i, 'apiKey', e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-sensei-500 focus:outline-none" />
                    )}
                    {p.provider && AI_PROVIDERS.find(a => a.id === p.provider)?.noKey && (
                      <div className="text-xs text-gray-500 px-1">No API key needed — ensure Ollama is running locally.</div>
                    )}
                    {provDef && !provDef.hasEmbeddings && (
                      <div className="text-xs text-amber-500/70 px-1 mt-1">⚠ No embeddings — pair with a provider that has embeddings for semantic search.</div>
                    )}
                  </div>
                );
              })}

              {llmProviders.length < 3 && (
                <button onClick={addProvider}
                  className="w-full flex items-center justify-center gap-1.5 border border-dashed border-gray-700 rounded-lg py-3 text-sm text-gray-500 hover:text-sensei-400 hover:border-sensei-500/50 transition">
                  <Plus size={14} /> Add {llmProviders.length === 0 ? 'primary' : llmProviders.length === 1 ? 'secondary' : 'tertiary'} provider
                </button>
              )}
            </div>

            <div className="bg-gray-900/50 border border-gray-800 rounded-lg px-4 py-3">
              <p className="text-xs text-gray-500">
                {llmProviders.length === 0
                  ? 'Without AI, Sensei works with full-text search only. You can add providers later in Settings.'
                  : `${llmProviders.length} provider${llmProviders.length > 1 ? 's' : ''} configured. ${llmProviders.length > 1 ? `If ${priorityLabels[0].toLowerCase()} fails, Sensei falls to ${priorityLabels[1].toLowerCase()}${llmProviders.length > 2 ? `, then ${priorityLabels[2].toLowerCase()}` : ''}.` : 'Add more for automatic failover.'}`
                }
              </p>
            </div>
          </div>
        )}

        {/* Step 4: Storage */}
        {step === 3 && (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <HardDrive className="mx-auto mb-3 text-sensei-500" size={32} />
              <h2 className="text-xl font-bold mb-1">Where should Sensei store your knowledge?</h2>
              <p className="text-gray-400 text-sm">Your knowledge is always plain Markdown files.</p>
            </div>
            <div className="space-y-2">
              {[
                { id: 'local', label: 'Local filesystem (this server)', desc: 'Stored in the Sensei data directory' },
                { id: 'github', label: 'GitHub repository (auto-sync)', desc: 'Push to a private repo automatically' },
                { id: 'vm', label: 'Remote VM (via SSH/rsync)', desc: 'Sync to another server' },
                { id: 'cloud', label: 'Cloud storage (B2/R2/S3/Dropbox/GDrive)', desc: 'Sync via rclone to any cloud provider' }
              ].map(opt => (
                <button key={opt.id} onClick={() => setStoragePrefs({ ...storagePrefs, primary: opt.id })}
                  className={`w-full text-left px-4 py-3 rounded-lg border transition ${storagePrefs.primary === opt.id ? 'border-sensei-500 bg-sensei-500/10' : 'border-gray-800 bg-gray-900 hover:border-gray-700'}`}>
                  <div className="font-medium text-sm">{opt.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>
            {storagePrefs.primary === 'github' && (
              <input type="text" placeholder="github.com/user/sensei-kb" value={storagePrefs.repo}
                onChange={e => setStoragePrefs({ ...storagePrefs, repo: e.target.value })}
                className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 text-sm focus:border-sensei-500 focus:outline-none" />
            )}
          </div>
        )}

        {/* Step 5: First Knowledge */}
        {step === 4 && (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <Link className="mx-auto mb-3 text-sensei-500" size={32} />
              <h2 className="text-xl font-bold mb-1">Create your first knowledge</h2>
              <p className="text-gray-400 text-sm">Watch how Sensei connects things automatically.</p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">A project you're working on</label>
                <input type="text" placeholder="e.g., Sensei - personal knowledge base" value={firstKnowledge.project}
                  onChange={e => setFirstKnowledge({ ...firstKnowledge, project: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 focus:border-sensei-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Who's involved?</label>
                <input type="text" placeholder="e.g., Brian Gachichio" value={firstKnowledge.person}
                  onChange={e => setFirstKnowledge({ ...firstKnowledge, person: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 focus:border-sensei-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">A key decision you've made</label>
                <input type="text" placeholder="e.g., Using Markdown files for full observability" value={firstKnowledge.decision}
                  onChange={e => setFirstKnowledge({ ...firstKnowledge, decision: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 focus:border-sensei-500 focus:outline-none" />
              </div>
            </div>
            {firstKnowledge.project && (
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
                <div className="text-xs text-gray-500 mb-3 flex items-center gap-1.5"><Link size={12} /> Knowledge connections preview</div>
                <div className="flex flex-col items-center gap-2 text-sm">
                  {firstKnowledge.person && (
                    <div className="flex items-center gap-3">
                      <span className="bg-purple-500/20 text-purple-400 px-2.5 py-1 rounded-full text-xs">{firstKnowledge.person}</span>
                      <span className="text-gray-600 text-xs">── works_on ──▶</span>
                      <span className="bg-sensei-500/20 text-sensei-400 px-2.5 py-1 rounded-full text-xs">{firstKnowledge.project}</span>
                    </div>
                  )}
                  {firstKnowledge.decision && (
                    <div className="flex items-center gap-3">
                      <span className="bg-amber-500/20 text-amber-400 px-2.5 py-1 rounded-full text-xs truncate max-w-[180px]">{firstKnowledge.decision}</span>
                      <span className="text-gray-600 text-xs">── relates_to ──▶</span>
                      <span className="bg-sensei-500/20 text-sensei-400 px-2.5 py-1 rounded-full text-xs">{firstKnowledge.project}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 6: Domain & HTTPS Setup */}
        {step === 5 && (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <Globe className="mx-auto mb-3 text-sensei-500" size={32} />
              <h2 className="text-xl font-bold mb-1">Set up your domain</h2>
              <p className="text-gray-400 text-sm">Access Sensei from anywhere with HTTPS.</p>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Your domain (optional)</label>
              <input type="text" placeholder="sensei.yourdomain.com" value={domain.domain}
                onChange={e => setDomain({ ...domain, domain: e.target.value })}
                className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 focus:border-sensei-500 focus:outline-none" />
            </div>

            {domain.domain && (
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-4">
                <h3 className="text-sm font-medium">Setup Instructions</h3>

                <div className="space-y-3 text-xs text-gray-400">
                  <div>
                    <span className="text-sensei-400 font-medium">1. DNS:</span> Point <code className="bg-gray-800 px-1.5 py-0.5 rounded">{domain.domain}</code> to your server's IP address (A record).
                  </div>

                  <div>
                    <span className="text-sensei-400 font-medium">2. Install Caddy</span> (if not installed):
                    <pre className="bg-gray-800 rounded-lg p-3 mt-1.5 overflow-x-auto text-gray-300 font-mono">
{`sudo apt install -y caddy`}
                    </pre>
                  </div>

                  <div>
                    <span className="text-sensei-400 font-medium">3. Add to Caddyfile</span> (<code className="bg-gray-800 px-1.5 py-0.5 rounded">/etc/caddy/Caddyfile</code>):
                    <pre className="bg-gray-800 rounded-lg p-3 mt-1.5 overflow-x-auto text-gray-300 font-mono">
{`${domain.domain} {
    reverse_proxy localhost:8082
}`}
                    </pre>
                  </div>

                  <div>
                    <span className="text-sensei-400 font-medium">4. Reload Caddy:</span>
                    <pre className="bg-gray-800 rounded-lg p-3 mt-1.5 overflow-x-auto text-gray-300 font-mono">
{`sudo systemctl reload caddy`}
                    </pre>
                  </div>

                  <div className="bg-sensei-500/10 border border-sensei-500/20 rounded-lg px-3 py-2 text-sensei-400">
                    Caddy automatically provisions a TLS certificate via Let's Encrypt. Your Sensei instance will be accessible at <strong>https://{domain.domain}</strong> within seconds.
                  </div>
                </div>
              </div>
            )}

            {!domain.domain && (
              <div className="text-xs text-gray-600 text-center">
                Skip this step if you're only accessing Sensei locally (http://localhost:8082).
              </div>
            )}

            {/* Telegram Bot Setup */}
            <div className="border-t border-gray-800 pt-5 mt-2">
              <h3 className="text-sm font-medium mb-2 flex items-center gap-2">💬 Chat with Sensei on Telegram <span className="text-xs text-gray-500">(optional)</span></h3>
              <p className="text-xs text-gray-500 mb-3">Access Sensei from your phone — search, capture knowledge, parse links, and get briefings via Telegram.</p>

              <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3 text-xs text-gray-400">
                <div><span className="text-sensei-400 font-medium">1.</span> Open Telegram, search for <strong className="text-gray-300">@BotFather</strong></div>
                <div><span className="text-sensei-400 font-medium">2.</span> Send <code className="bg-gray-800 px-1.5 py-0.5 rounded">/newbot</code>, name it "Sensei", choose a username</div>
                <div><span className="text-sensei-400 font-medium">3.</span> Copy the bot token you receive</div>
                <div><span className="text-sensei-400 font-medium">4.</span> Message <strong className="text-gray-300">@userinfobot</strong> to get your numeric user ID</div>
                <div><span className="text-sensei-400 font-medium">5.</span> Paste both below, or add them later in Settings</div>
              </div>

              <div className="mt-3 space-y-2">
                <input type="password" placeholder="Telegram Bot Token (from @BotFather)" value={domain.telegramToken || ''}
                  onChange={e => setDomain({ ...domain, telegramToken: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-2.5 text-sm focus:border-sensei-500 focus:outline-none" />
                <input type="text" placeholder="Your Telegram User ID (for security)" value={domain.telegramUserId || ''}
                  onChange={e => setDomain({ ...domain, telegramUserId: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-2.5 text-sm focus:border-sensei-500 focus:outline-none" />
              </div>
            </div>
          </div>
        )}

        {/* Step 7: Connect Sources — FUNCTIONAL */}
        {step === 6 && (
          <div className="space-y-5">
            <div className="text-center mb-4">
              <Sparkles className="mx-auto mb-3 text-sensei-500" size={32} />
              <h2 className="text-xl font-bold mb-1">Connect your knowledge sources</h2>
              <p className="text-gray-400 text-sm">Import your data now or configure later in Settings.</p>
            </div>

            {/* AI Conversation Imports */}
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">AI Conversations (ZIP import)</p>
              {[
                { id: 'claude', name: 'Claude', icon: '🟠', help: 'claude.ai → Settings → Privacy → Export Data' },
                { id: 'chatgpt', name: 'ChatGPT', icon: '🟢', help: 'chatgpt.com → Settings → Data controls → Export' },
                { id: 'gemini', name: 'Gemini', icon: '🔵', help: 'takeout.google.com → Select Gemini Apps' }
              ].map(c => (
                <OnboardingConnector key={c.id} connector={c} type="import" />
              ))}
            </div>

            {/* Note-taking imports */}
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Note-Taking Apps</p>
              {[
                { id: 'google-keep', name: 'Google Keep', icon: '📝', help: 'takeout.google.com → Select Keep', type: 'import' },
                { id: 'whatsapp', name: 'WhatsApp', icon: '💬', help: 'WhatsApp → Chat → Export Chat', type: 'import' },
                { id: 'telegram', name: 'Telegram', icon: '✈️', help: 'Telegram Desktop → Export Data', type: 'import' }
              ].map(c => (
                <OnboardingConnector key={c.id} connector={c} type="import" />
              ))}
            </div>

            <p className="text-xs text-gray-600 text-center mt-2">
              More connectors (Obsidian, Notion, Gmail, Slack, RSS) can be configured in Settings → Connectors after onboarding.
            </p>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-8">
          {step > 0 ? (
            <button onClick={prev} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200 transition">
              <ChevronLeft size={16} /> Back
            </button>
          ) : <div />}

          {step < STEPS.length - 1 ? (
            <button onClick={next} disabled={!canProceed()}
              className="flex items-center gap-1.5 bg-sensei-500 hover:bg-sensei-600 disabled:opacity-40 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-lg text-sm font-medium transition">
              Continue <ChevronRight size={16} />
            </button>
          ) : (
            <button onClick={handleComplete} disabled={loading}
              className="flex items-center gap-1.5 bg-sensei-500 hover:bg-sensei-600 disabled:opacity-60 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition">
              {loading ? 'Setting up...' : <><Check size={16} /> Go to my Knowledge Base</>}
            </button>
          )}
        </div>
        </>)}
      </div>
    </div>
  );
}
