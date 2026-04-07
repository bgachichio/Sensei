import React, { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api.js';
import { Network, Filter, ZoomIn, ZoomOut, Maximize } from 'lucide-react';

export default function GraphView() {
  const [graphData, setGraphData] = useState({ nodes: [], edges: [] });
  const [filter, setFilter] = useState('');
  const canvasRef = useRef(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadGraph(); }, [filter]);

  async function loadGraph() {
    setLoading(true);
    try {
      const data = await api.getGraph({ type: filter || undefined, limit: 300 });
      setGraphData(data);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (graphData.nodes.length > 0) renderGraph();
  }, [graphData]);

  function renderGraph() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const w = canvas.parentElement.clientWidth;
    const h = 500;
    canvas.width = w * 2;
    canvas.height = h * 2;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.scale(2, 2);

    // Simple force-directed layout
    const nodes = graphData.nodes.map((n, i) => ({
      ...n,
      x: w/2 + (Math.random() - 0.5) * w * 0.6,
      y: h/2 + (Math.random() - 0.5) * h * 0.6,
      vx: 0, vy: 0
    }));

    const nodeMap = {};
    nodes.forEach(n => nodeMap[n.id] = n);

    const typeColors = {
      person: '#a78bfa', project: '#34d399', topic: '#60a5fa',
      decision: '#fbbf24', commitment: '#f87171', location: '#fb923c',
      insight: '#f472b6', default: '#6b7280'
    };

    // Run simulation
    for (let tick = 0; tick < 100; tick++) {
      // Repulsion between all nodes
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].x - nodes[i].x;
          const dy = nodes[j].y - nodes[i].y;
          const d = Math.max(Math.sqrt(dx*dx + dy*dy), 1);
          const force = 800 / (d * d);
          nodes[i].vx -= dx/d * force;
          nodes[i].vy -= dy/d * force;
          nodes[j].vx += dx/d * force;
          nodes[j].vy += dy/d * force;
        }
      }

      // Attraction along edges
      for (const edge of graphData.edges) {
        const s = nodeMap[edge.source];
        const t = nodeMap[edge.target];
        if (!s || !t) continue;
        const dx = t.x - s.x;
        const dy = t.y - s.y;
        const d = Math.max(Math.sqrt(dx*dx + dy*dy), 1);
        const force = d * 0.01;
        s.vx += dx/d * force;
        s.vy += dy/d * force;
        t.vx -= dx/d * force;
        t.vy -= dy/d * force;
      }

      // Apply velocity with damping
      for (const n of nodes) {
        n.vx *= 0.85;
        n.vy *= 0.85;
        n.x += n.vx;
        n.y += n.vy;
        n.x = Math.max(30, Math.min(w - 30, n.x));
        n.y = Math.max(30, Math.min(h - 30, n.y));
      }
    }

    // Draw
    ctx.clearRect(0, 0, w, h);

    // Edges
    ctx.strokeStyle = 'rgba(100,100,100,0.15)';
    ctx.lineWidth = 0.5;
    for (const edge of graphData.edges) {
      const s = nodeMap[edge.source];
      const t = nodeMap[edge.target];
      if (!s || !t) continue;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);
      ctx.stroke();
    }

    // Nodes
    for (const n of nodes) {
      const color = typeColors[n.type] || typeColors.default;
      const radius = 5;

      ctx.beginPath();
      ctx.arc(n.x, n.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      // Label
      ctx.fillStyle = 'rgba(200,200,200,0.7)';
      ctx.font = '9px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(n.label.substring(0, 20), n.x, n.y + radius + 11);
    }
  }

  const entityTypes = ['', 'person', 'project', 'topic', 'decision', 'commitment', 'insight'];

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold flex items-center gap-2">
          <Network size={20} className="text-sensei-500" /> Knowledge Graph
        </h1>
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-gray-500" />
          <select value={filter} onChange={e => setFilter(e.target.value)}
            className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-1.5 text-xs focus:border-sensei-500 focus:outline-none">
            <option value="">All types</option>
            {entityTypes.filter(Boolean).map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden relative">
        {loading ? (
          <div className="flex items-center justify-center h-[500px] text-gray-500 text-sm">Loading graph...</div>
        ) : graphData.nodes.length === 0 ? (
          <div className="flex items-center justify-center h-[500px] text-gray-500 text-sm">No entities yet. Ingest some knowledge to see your graph.</div>
        ) : (
          <canvas ref={canvasRef} className="w-full" />
        )}
      </div>

      <div className="flex flex-wrap gap-3 text-xs">
        {[
          { type: 'person', color: '#a78bfa' },
          { type: 'project', color: '#34d399' },
          { type: 'topic', color: '#60a5fa' },
          { type: 'decision', color: '#fbbf24' },
          { type: 'commitment', color: '#f87171' },
          { type: 'insight', color: '#f472b6' }
        ].map(t => (
          <div key={t.type} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: t.color }} />
            <span className="text-gray-500 capitalize">{t.type}</span>
          </div>
        ))}
        <span className="text-gray-600 ml-2">{graphData.nodes.length} entities · {graphData.edges.length} connections</span>
      </div>
    </div>
  );
}
