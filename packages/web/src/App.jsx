import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { api } from './lib/api.js';
import Onboarding from './pages/Onboarding.jsx';
import Dashboard from './pages/Dashboard.jsx';
import ArticleView from './pages/ArticleView.jsx';
import CreateArticle from './pages/CreateArticle.jsx';
import GraphView from './pages/GraphView.jsx';
import ConnectorsPage from './pages/ConnectorsPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import AboutPage from './pages/AboutPage.jsx';
import Layout from './components/layout/Layout.jsx';

export default function App() {
  const [isOnboarded, setIsOnboarded] = useState(null);
  const [settings, setSettings] = useState({});
  const [theme, setTheme] = useState('dark');
  const [animationsEnabled, setAnimationsEnabled] = useState(true);

  useEffect(() => {
    checkOnboarding();
  }, []);

  useEffect(() => {
    applyTheme(theme);
    // Listen for system theme changes when set to auto
    if (theme === 'auto') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = (e) => document.documentElement.classList.toggle('dark', e.matches);
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
  }, [theme]);

  useEffect(() => {
    document.documentElement.classList.toggle('no-animations', !animationsEnabled);
    document.documentElement.style.setProperty('--animation-enabled', animationsEnabled ? '1' : '0');
  }, [animationsEnabled]);

  async function checkOnboarding() {
    try {
      const data = await api.getSettings();
      setSettings(data.settings || {});
      setIsOnboarded(data.isOnboarded);

      if (data.settings?.appearance) {
        const { theme: t, fontFamily, fontSize, animations } = data.settings.appearance;
        if (t) setTheme(t);
        if (fontFamily) document.documentElement.style.setProperty('--font-family', `'${fontFamily}', system-ui, sans-serif`);
        if (fontSize) document.documentElement.style.setProperty('--font-size', fontSize);
        if (animations !== undefined) setAnimationsEnabled(animations);
      }
    } catch {
      setIsOnboarded(false);
    }
  }

  function applyTheme(t) {
    if (t === 'auto') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.classList.toggle('dark', prefersDark);
    } else {
      document.documentElement.classList.toggle('dark', t === 'dark');
    }
  }

  function handleOnboardingComplete() {
    setIsOnboarded(true);
    checkOnboarding();
  }

  // Loading state
  if (isOnboarded === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="text-center">
          <div className="text-4xl mb-4">🥋</div>
          <div className="text-gray-400 animate-pulse">Loading Sensei...</div>
        </div>
      </div>
    );
  }

  // Not onboarded - show wizard
  if (!isOnboarded) {
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  // Main app
  return (
    <Layout settings={settings} theme={theme} setTheme={setTheme} animationsEnabled={animationsEnabled} setAnimationsEnabled={setAnimationsEnabled}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/article/:id" element={<ArticleView />} />
        <Route path="/create" element={<CreateArticle />} />
        <Route path="/graph" element={<GraphView />} />
        <Route path="/connectors" element={<ConnectorsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Layout>
  );
}
