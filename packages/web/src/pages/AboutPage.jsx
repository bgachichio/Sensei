import React, { useState, useEffect } from 'react';
import { api } from '../lib/api.js';
import { Heart, ExternalLink, Github, Linkedin } from 'lucide-react';

export default function AboutPage() {
  const [about, setAbout] = useState(null);

  useEffect(() => {
    api.health().then(setAbout).catch(() => {});
  }, []);

  return (
    <div className="max-w-md mx-auto py-8">
      <div className="text-center mb-8">
        <div className="text-5xl mb-4">🥋</div>
        <h1 className="text-2xl font-bold mb-2">Sensei</h1>
        <p className="text-gray-400 text-sm leading-relaxed max-w-xs mx-auto">
          A self-updating personal knowledge base that automatically ingests, structures, and connects knowledge from your digital life into an AI-queryable graph.
        </p>
        {about && (
          <div className="text-xs text-gray-600 mt-3">v{about.version} · {about.articles || 0} articles · {about.entities || 0} entities</div>
        )}
      </div>

      <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-sensei-500/20 flex items-center justify-center text-sensei-400 font-bold text-sm">BG</div>
          <div>
            <div className="font-medium text-sm">Brian Gachichio</div>
            <div className="text-xs text-gray-500">Creator</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <a href="https://gachichio.org/" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-xs transition">
            <ExternalLink size={12} /> Website
          </a>
          <a href="https://x.com/b_gachichio" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-xs transition">
            𝕏 Twitter
          </a>
          <a href="https://github.com/bgachichio/" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-xs transition">
            <Github size={12} /> GitHub
          </a>
          <a href="https://www.linkedin.com/in/briangachichio/" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-xs transition">
            <Linkedin size={12} /> LinkedIn
          </a>
        </div>
      </div>

      <a href="https://paystack.shop/pay/gachichio" target="_blank" rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 w-full bg-sensei-500 hover:bg-sensei-600 text-white py-3 rounded-xl text-sm font-medium transition">
        <Heart size={16} /> Support Sensei
      </a>

      <div className="text-center mt-6 text-xs text-gray-600">
        Made with ❤️ by Brian Gachichio · AGPL-3.0
      </div>
    </div>
  );
}
