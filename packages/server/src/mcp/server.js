import { Router } from 'express';

/**
 * MCP Server for Sensei
 * Implements a simplified MCP-over-HTTP endpoint
 * Tools: sensei_search, sensei_read, sensei_write, sensei_query, sensei_ingest,
 *        sensei_people, sensei_graph, sensei_stats
 */
export function mcpRoutes(services) {
  const router = Router();
  const { storage, database, searchEngine, knowledgeGraph, pipeline } = services;

  const TOOLS = [
    {
      name: 'sensei_search',
      description: 'Search your personal knowledge base. Returns articles matching the query via full-text and semantic search.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Natural language search query' },
          category: { type: 'string', description: 'Filter by category (topics/people/projects/decisions/insights/commitments)' },
          limit: { type: 'number', description: 'Max results (default: 10)' }
        },
        required: ['query']
      }
    },
    {
      name: 'sensei_read',
      description: 'Read a specific knowledge article by its ID or path.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Article ID' },
          path: { type: 'string', description: 'Article path (e.g., topics/kubernetes.md)' }
        }
      }
    },
    {
      name: 'sensei_write',
      description: 'Create a new knowledge article in the knowledge base.',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Article title' },
          content: { type: 'string', description: 'Markdown content' },
          category: { type: 'string', description: 'Category (topics/people/projects/decisions/insights)' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Tags' }
        },
        required: ['title', 'content']
      }
    },
    {
      name: 'sensei_ingest',
      description: 'Ingest content from the current AI conversation into the knowledge base. Sensei will automatically classify, extract entities, and link it.',
      inputSchema: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'Content to ingest' },
          title: { type: 'string', description: 'Optional title' },
          source: { type: 'string', description: 'Source description (e.g., "Claude conversation about X")' }
        },
        required: ['content']
      }
    },
    {
      name: 'sensei_people',
      description: 'Look up a person and get all related context, articles, and relationships.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Person name to look up' }
        },
        required: ['name']
      }
    },
    {
      name: 'sensei_graph',
      description: 'Get knowledge graph data — entities and their relationships.',
      inputSchema: {
        type: 'object',
        properties: {
          entity_type: { type: 'string', description: 'Filter by entity type (person/project/topic/decision)' },
          limit: { type: 'number', description: 'Max entities to return (default: 100)' }
        }
      }
    },
    {
      name: 'sensei_stats',
      description: 'Get statistics about your knowledge base.',
      inputSchema: { type: 'object', properties: {} }
    }
  ];

  // Tool handlers
  const handlers = {
    async sensei_search(args) {
      const results = await searchEngine.search(args.query, {
        category: args.category,
        limit: args.limit || 10
      });
      return results.map(r => ({
        id: r.id, title: r.title, category: r.category, path: r.path,
        relevance: r.relevance, updated: r.updated_at || r.updated
      }));
    },

    async sensei_read(args) {
      let article;
      if (args.id) {
        const dbArticle = database.getArticle(args.id);
        if (dbArticle) article = await storage.read(dbArticle.path);
      } else if (args.path) {
        article = await storage.read(args.path);
      }
      if (!article) return { error: 'Article not found' };

      const backlinks = database.getBacklinks(article.id);
      return { ...article, backlinks: backlinks.map(b => ({ title: b.source_title, path: b.source_path, type: b.link_type })) };
    },

    async sensei_write(args) {
      const article = await storage.write({
        title: args.title,
        content: args.content,
        category: args.category || 'topics',
        tags: args.tags || []
      });
      const contentHash = await storage.contentHash(article.path);
      database.upsertArticle({ ...article.frontmatter, path: article.path, content_hash: contentHash, content: args.content });
      await searchEngine.indexArticle(article.id, `${args.title}\n\n${args.content}`);
      return { success: true, id: article.id, path: article.path };
    },

    async sensei_ingest(args) {
      const result = await pipeline.ingest({
        content: args.content,
        title: args.title,
        source: { type: 'mcp', id: args.source || 'mcp-session' }
      });
      return result;
    },

    async sensei_people(args) {
      const dossier = knowledgeGraph.getPersonDossier(args.name);
      if (!dossier) return { error: `No information found about "${args.name}"` };
      return {
        name: dossier.entity.name,
        articles: dossier.articles.map(a => ({ title: a.title, category: a.category, updated: a.updated_at })),
        relations: dossier.relations.map(r => ({ target: r.target_name, type: r.relation_type }))
      };
    },

    async sensei_graph(args) {
      return knowledgeGraph.getGraphData({ entityType: args.entity_type, limit: args.limit || 100 });
    },

    async sensei_stats() {
      return database.getStats();
    }
  };

  // ── MCP Protocol Endpoints ──

  // List available tools
  router.get('/tools', (req, res) => {
    res.json({ tools: TOOLS });
  });

  // Execute a tool
  router.post('/tools/call', async (req, res) => {
    const { name, arguments: args } = req.body;

    if (!handlers[name]) {
      return res.status(404).json({ error: `Unknown tool: ${name}` });
    }

    try {
      const result = await handlers[name](args || {});
      res.json({
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
      });
    } catch (e) {
      res.status(500).json({
        content: [{ type: 'text', text: `Error: ${e.message}` }],
        isError: true
      });
    }
  });

  // SSE endpoint for MCP streaming (simplified)
  router.get('/sse', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    // Send initial capabilities
    res.write(`data: ${JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
      params: { serverInfo: { name: 'sensei', version: '1.0.0' } }
    })}\n\n`);

    // Keep connection alive
    const heartbeat = setInterval(() => {
      res.write(`: heartbeat\n\n`);
    }, 30000);

    req.on('close', () => clearInterval(heartbeat));
  });

  // MCP JSON-RPC handler
  router.post('/', async (req, res) => {
    const { method, params, id } = req.body;

    try {
      let result;
      switch (method) {
        case 'initialize':
          result = {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'sensei', version: '1.0.0' }
          };
          break;
        case 'tools/list':
          result = { tools: TOOLS };
          break;
        case 'tools/call':
          const handler = handlers[params.name];
          if (!handler) throw new Error(`Unknown tool: ${params.name}`);
          const toolResult = await handler(params.arguments || {});
          result = {
            content: [{ type: 'text', text: JSON.stringify(toolResult, null, 2) }]
          };
          break;
        default:
          throw new Error(`Unknown method: ${method}`);
      }

      res.json({ jsonrpc: '2.0', id, result });
    } catch (e) {
      res.json({ jsonrpc: '2.0', id, error: { code: -32603, message: e.message } });
    }
  });

  return router;
}
