import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { ArrowLeft, Edit3, Save, Trash2, Link as LinkIcon, Users, Tag, Clock, ExternalLink } from 'lucide-react';

export default function ArticleView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadArticle(); }, [id]);

  async function loadArticle() {
    try {
      const result = await api.getArticle(id);
      setData(result);
      setEditContent(result.article?.content || '');
      setEditTitle(result.article?.title || '');
    } catch (e) {
      console.error(e);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await api.updateArticle(id, { title: editTitle, content: editContent });
      setEditing(false);
      loadArticle();
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!confirm('Delete this article? This cannot be undone.')) return;
    try {
      await api.deleteArticle(id);
      navigate('/');
    } catch (e) {
      console.error(e);
    }
  }

  if (!data) return <div className="text-center py-12 text-gray-500">Loading...</div>;

  const { article, backlinks = [], forwardLinks = [], entities = [] } = data;

  // Render wikilinks in content
  function renderContent(text) {
    return text.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (match, link, display) => {
      return `<a class="wikilink" href="#" data-link="${link}">${display || link}</a>`;
    });
  }

  const categoryColors = {
    topics: 'bg-blue-500/15 text-blue-400',
    people: 'bg-purple-500/15 text-purple-400',
    projects: 'bg-sensei-500/15 text-sensei-400',
    decisions: 'bg-amber-500/15 text-amber-400',
    insights: 'bg-pink-500/15 text-pink-400'
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-gray-300 transition">
          <ArrowLeft size={18} />
        </button>
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${categoryColors[article.category] || 'bg-gray-500/15 text-gray-400'}`}>
          {article.category}
        </span>
        <div className="flex-1" />
        {!editing && (
          <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-sensei-400 transition">
            <Edit3 size={14} /> Edit
          </button>
        )}
        {editing && (
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-1.5 bg-sensei-500 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition">
            <Save size={12} /> {saving ? 'Saving...' : 'Save'}
          </button>
        )}
        <button onClick={handleDelete} className="text-gray-600 hover:text-red-400 transition">
          <Trash2 size={14} />
        </button>
      </div>

      <div className="flex gap-6 flex-col lg:flex-row">
        {/* Main content */}
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="space-y-3">
              <input type="text" value={editTitle} onChange={e => setEditTitle(e.target.value)}
                className="w-full text-2xl font-bold bg-transparent border-b border-gray-800 pb-2 focus:border-sensei-500 focus:outline-none" />
              <textarea value={editContent} onChange={e => setEditContent(e.target.value)}
                rows={20}
                className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4 font-mono text-sm resize-y focus:border-sensei-500 focus:outline-none" />
            </div>
          ) : (
            <div>
              <h1 className="text-2xl font-bold mb-4">{article.title}</h1>
              <div className="flex items-center gap-3 text-xs text-gray-500 mb-6">
                <span className="flex items-center gap-1"><Clock size={12} /> {new Date(article.updated).toLocaleDateString()}</span>
                {article.tags?.length > 0 && (
                  <span className="flex items-center gap-1">
                    <Tag size={12} /> {article.tags.join(', ')}
                  </span>
                )}
              </div>
              <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: renderContent(article.content || '') }} />

              {/* Sources */}
              {article.sources?.length > 0 && (
                <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-800">
                  <h3 className="text-xs text-gray-500 uppercase tracking-wide mb-2">Sources</h3>
                  {article.sources.map((s, i) => (
                    <div key={i} className="text-xs text-gray-500 flex items-center gap-1.5">
                      <ExternalLink size={10} /> {s.type} · {s.date || s.id}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right panel: Backlinks + Entities */}
        <div className="lg:w-64 space-y-4 shrink-0">
          {/* Entities */}
          {entities.length > 0 && (
            <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
              <h3 className="text-xs text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Users size={12} /> Entities
              </h3>
              <div className="space-y-1.5">
                {entities.map(e => (
                  <div key={e.id} className="text-sm">
                    <span className="text-xs text-gray-500">{e.type}:</span>{' '}
                    <span className="text-gray-300">{e.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Backlinks */}
          {backlinks.length > 0 && (
            <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
              <h3 className="text-xs text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <LinkIcon size={12} /> Linked From ({backlinks.length})
              </h3>
              <div className="space-y-1.5">
                {backlinks.map((b, i) => (
                  <Link key={i} to={`/article/${b.source_article_id}`}
                    className="block text-sm text-sensei-500 hover:text-sensei-400 transition truncate">
                    {b.source_title}
                    <span className="text-xs text-gray-600 ml-1.5">({b.link_type})</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Forward links */}
          {forwardLinks.length > 0 && (
            <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
              <h3 className="text-xs text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <LinkIcon size={12} /> Links To ({forwardLinks.length})
              </h3>
              <div className="space-y-1.5">
                {forwardLinks.map((b, i) => (
                  <Link key={i} to={`/article/${b.target_article_id}`}
                    className="block text-sm text-sensei-500 hover:text-sensei-400 transition truncate">
                    {b.target_title}
                    <span className="text-xs text-gray-600 ml-1.5">({b.link_type})</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
