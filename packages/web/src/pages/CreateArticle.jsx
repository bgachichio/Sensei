import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Save, X } from 'lucide-react';

const DEFAULT_CATEGORIES = ['topics', 'people', 'projects', 'decisions', 'insights', 'commitments', 'preferences', 'raw'];

export default function CreateArticle() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('topics');
  const [content, setContent] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getCategories().then(d => {
      if (d.categories?.length) setCategories(d.categories);
    }).catch(() => {});
  }, []);

  async function handleSave(e) {
    e.preventDefault();
    if (!title.trim()) { setError('Title is required'); return; }
    if (!content.trim()) { setError('Content is required'); return; }

    setSaving(true);
    setError('');
    try {
      const tags = tagInput.split(',').map(t => t.trim()).filter(Boolean);
      const result = await api.createArticle({ title, category, content, tags });
      if (result.article) {
        navigate(`/article/${result.article.frontmatter?.id || result.article.id}`);
      } else {
        navigate('/');
      }
    } catch (e) {
      setError(e.message || 'Failed to create article');
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-bold">Create Article</h1>
        <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-gray-300 transition">
          <X size={18} />
        </button>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg px-4 py-2 text-sm">{error}</div>
        )}

        <div>
          <label className="block text-xs text-gray-500 mb-1">Title</label>
          <input type="text" value={title} onChange={e => setTitle(e.target.value)} autoFocus
            placeholder="What is this about?"
            className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg px-4 py-3 text-lg font-medium focus:border-sensei-500 focus:outline-none" />
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">Category</label>
            <select value={category} onChange={e => setCategory(e.target.value)}
              className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2.5 text-sm focus:border-sensei-500 focus:outline-none capitalize">
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">Tags (comma-separated)</label>
            <input type="text" value={tagInput} onChange={e => setTagInput(e.target.value)}
              placeholder="e.g. important, review"
              className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2.5 text-sm focus:border-sensei-500 focus:outline-none" />
          </div>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Content (Markdown)</label>
          <textarea value={content} onChange={e => setContent(e.target.value)}
            placeholder="Write your knowledge here. Use [[wikilinks]] to link to other articles."
            rows={14}
            className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4 font-mono text-sm resize-y focus:border-sensei-500 focus:outline-none" />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={() => navigate(-1)}
            className="px-4 py-2 text-sm text-gray-500 hover:text-gray-300 transition">
            Cancel
          </button>
          <button type="submit" disabled={saving}
            className="flex items-center gap-1.5 bg-sensei-500 hover:bg-sensei-600 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition">
            <Save size={14} /> {saving ? 'Saving...' : 'Create Article'}
          </button>
        </div>
      </form>
    </div>
  );
}
