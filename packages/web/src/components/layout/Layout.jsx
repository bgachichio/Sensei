import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Search, Home, Network, Plug, Settings, Menu, X, Sun, Moon, Monitor, PlusCircle, Heart } from 'lucide-react';
import { api } from '../../lib/api.js';

export default function Layout({ children, settings, theme, setTheme }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const location = useLocation();

  const userName = settings?.user_profile?.preferredName || settings?.user_profile?.fullName || 'Sensei';

  const navItems = [
    { path: '/', icon: Home, label: 'Dashboard' },
    { path: '/graph', icon: Network, label: 'Graph' },
    { path: '/connectors', icon: Plug, label: 'Connectors' },
    { path: '/settings', icon: Settings, label: 'Settings' },
    { path: '/about', icon: Heart, label: 'About' }
  ];

  const themeIcons = { dark: Moon, light: Sun, auto: Monitor };

  async function handleSearch(e) {
    e.preventDefault();
    if (!searchQuery.trim()) { setSearchResults(null); return; }
    try {
      const data = await api.search(searchQuery);
      setSearchResults(data.results || []);
    } catch {
      setSearchResults([]);
    }
  }

  function cycleTheme() {
    const themes = ['dark', 'light', 'auto'];
    const idx = themes.indexOf(theme);
    const next = themes[(idx + 1) % themes.length];
    setTheme(next);
    api.saveSettings({ appearance: { ...settings?.appearance, theme: next } });
  }

  const ThemeIcon = themeIcons[theme] || Moon;

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-56 bg-gray-950 border-r border-gray-800 transform transition-transform lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center gap-2.5 px-4 h-14 border-b border-gray-800">
          <span className="text-xl">🥋</span>
          <span className="font-semibold text-sm tracking-tight">Sensei</span>
        </div>

        <nav className="p-3 space-y-0.5">
          {navItems.map(item => {
            const Icon = item.icon;
            const active = location.pathname === item.path;
            return (
              <Link key={item.path} to={item.path} onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition ${active ? 'bg-sensei-500/15 text-sensei-400' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-900'}`}>
                <Icon size={16} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-gray-800">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-xs text-gray-500">{userName}</span>
            <button onClick={cycleTheme} className="text-gray-500 hover:text-gray-300 transition" title={`Theme: ${theme}`}>
              <ThemeIcon size={14} />
            </button>
          </div>
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Main content */}
      <main className="flex-1 lg:ml-56">
        {/* Header */}
        <header className="sticky top-0 z-20 h-14 flex items-center gap-3 px-4 bg-white/80 dark:bg-gray-950/80 backdrop-blur border-b border-gray-200 dark:border-gray-800">
          <button className="lg:hidden text-gray-500" onClick={() => setSidebarOpen(true)}>
            <Menu size={20} />
          </button>

          {/* Search */}
          <form onSubmit={handleSearch} className="flex-1 max-w-md relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Search your knowledge..." value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); if (!e.target.value) setSearchResults(null); }}
              className="w-full bg-gray-100 dark:bg-gray-900 border border-transparent focus:border-sensei-500 rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none transition" />
          </form>

          <Link to="/create" className="flex items-center gap-1.5 bg-sensei-500 hover:bg-sensei-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition">
            <PlusCircle size={14} /> New
          </Link>
        </header>

        {/* Search results overlay */}
        {searchResults && (
          <div className="mx-4 mt-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-lg max-h-80 overflow-y-auto">
            {searchResults.length === 0 ? (
              <div className="p-4 text-sm text-gray-500 text-center">No results found</div>
            ) : (
              searchResults.map(r => (
                <Link key={r.id} to={`/article/${r.id}`} onClick={() => { setSearchResults(null); setSearchQuery(''); }}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-100 dark:border-gray-800 last:border-0 transition">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{r.title}</div>
                    <div className="text-xs text-gray-500">{r.category} · {r.searchType || ''}</div>
                  </div>
                  {r.relevance && <span className="text-xs text-sensei-500">{(r.relevance * 100).toFixed(0)}%</span>}
                </Link>
              ))
            )}
          </div>
        )}

        <div className="p-4 lg:p-6">{children}</div>
      </main>
    </div>
  );
}
