import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { FileText, Users, GitBranch, Link as LinkIcon, PlusCircle, ArrowRight, Sparkles, AlertCircle } from 'lucide-react';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [articles, setArticles] = useState([]);
  const [quickContent, setQuickContent] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [statsData, articlesData] = await Promise.all([
        api.getStats(),
        api.listArticles({ limit: 10 })
      ]);
      setStats(statsData);
      setArticles(articlesData.articles || []);
    } catch (e) {
      console.error(e);
    }
  }

  async function handleQuickCapture(e) {
    e.preventDefault();
    if (!quickContent.trim()) return;
    setLoading(true);
    try {
      await api.ingest({ content: quickContent, source: { type: 'quick_capture' } });
      setQuickContent('');
      loadData();
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  const [urlInput, setUrlInput] = useState('');
  const [parsingUrl, setParsingUrl] = useState(false);
  const [parseResult, setParseResult] = useState(null);

  async function handleParseUrl(e) {
    e.preventDefault();
    if (!urlInput.trim()) return;
    setParsingUrl(true);
    setParseResult(null);
    try {
      const result = await api.parseUrl(urlInput);
      if (result.success) {
        setParseResult({ success: true, title: result.article?.frontmatter?.title || result.parsed?.title || 'Parsed' });
        setUrlInput('');
        loadData();
      } else {
        setParseResult({ success: false, error: result.error || 'Parse failed' });
      }
    } catch (e) {
      setParseResult({ success: false, error: e.message || 'AI provider not configured. Add an API key in Settings.' });
    }
    setParsingUrl(false);
    setTimeout(() => setParseResult(null), 5000);
  }

  const categoryColors = {
    topics: 'bg-blue-500/15 text-blue-400',
    people: 'bg-purple-500/15 text-purple-400',
    projects: 'bg-sensei-500/15 text-sensei-400',
    decisions: 'bg-amber-500/15 text-amber-400',
    insights: 'bg-pink-500/15 text-pink-400',
    commitments: 'bg-red-500/15 text-red-400',
    preferences: 'bg-cyan-500/15 text-cyan-400',
    raw: 'bg-gray-500/15 text-gray-400'
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6">
      {/* Quick Capture + URL Parse */}
      <div className="space-y-3">
        <form onSubmit={handleQuickCapture} className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-3 sm:p-4">
          <textarea
            placeholder="What's on your mind? Capture knowledge quickly..."
            value={quickContent} onChange={e => setQuickContent(e.target.value)}
            rows={2}
            className="w-full bg-transparent resize-none focus:outline-none text-sm placeholder:text-gray-400"
          />
        <div className="flex justify-between items-center mt-2">
          <span className="text-xs text-gray-500">Sensei will auto-classify, extract entities, and link this.</span>
          <button type="submit" disabled={!quickContent.trim() || loading}
            className="flex items-center gap-1.5 bg-sensei-500 hover:bg-sensei-600 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition">
            <Sparkles size={12} /> {loading ? 'Processing...' : 'Capture'}
          </button>
        </div>
      </form>

      {/* URL / Link Parser */}
      <form onSubmit={handleParseUrl} className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-3 sm:p-4">
        <div className="flex gap-2">
          <input type="text" placeholder="Paste a link (tweet, article, video) to extract knowledge..."
            value={urlInput} onChange={e => setUrlInput(e.target.value)}
            className="flex-1 bg-transparent focus:outline-none text-sm placeholder:text-gray-400 min-w-0" />
          <button type="submit" disabled={!urlInput.trim() || parsingUrl}
            className="flex items-center gap-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition shrink-0">
            <LinkIcon size={12} /> {parsingUrl ? 'Parsing...' : 'Parse'}
          </button>
        </div>
        {parseResult && (
          <div className={`mt-2 flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${parseResult.success ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
            {parseResult.success ? `✅ ${parseResult.title}` : `❌ ${parseResult.error}`}
          </div>
        )}
      </form>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Articles', value: stats.articles, icon: FileText, color: 'text-blue-400' },
            { label: 'Entities', value: stats.entities, icon: Users, color: 'text-purple-400' },
            { label: 'Relations', value: stats.relations, icon: GitBranch, color: 'text-sensei-400' },
            { label: 'Connections', value: stats.backlinks, icon: LinkIcon, color: 'text-amber-400' }
          ].map(s => (
            <div key={s.label} className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
              <s.icon size={16} className={s.color + ' mb-2'} />
              <div className="text-2xl font-bold">{s.value}</div>
              <div className="text-xs text-gray-500">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Orphan warning */}
      {stats?.orphans > 0 && (
        <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-2.5 text-sm text-amber-400">
          <AlertCircle size={15} />
          {stats.orphans} article{stats.orphans > 1 ? 's' : ''} with no connections. Consider linking them.
        </div>
      )}

      {/* Recent Articles */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Recent Knowledge</h2>
          <Link to="/graph" className="text-xs text-sensei-500 hover:text-sensei-400 flex items-center gap-1 transition">
            View Graph <ArrowRight size={12} />
          </Link>
        </div>

        {articles.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <FileText className="mx-auto mb-3 text-gray-700" size={32} />
            <p className="text-sm">No knowledge yet. Capture something above or import from a connector.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {articles.map(a => (
              <Link key={a.id} to={`/article/${a.id}`}
                className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 transition group">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${categoryColors[a.category] || categoryColors.raw}`}>
                  {a.category}
                </span>
                <span className="flex-1 text-sm truncate group-hover:text-sensei-400 transition">{a.title}</span>
                <span className="text-xs text-gray-600">{new Date(a.updated_at).toLocaleDateString()}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Category Breakdown */}
      {stats?.byCategory?.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">By Category</h2>
          <div className="flex flex-wrap gap-2">
            {stats.byCategory.map(c => (
              <div key={c.category} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${categoryColors[c.category] || categoryColors.raw}`}>
                {c.category}: {c.count}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
