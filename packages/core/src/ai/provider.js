/**
 * AIProvider - Pluggable multi-LLM interface with automatic failover
 * 
 * Supports: OpenRouter, OpenAI, Anthropic, Gemini, Grok, Perplexity, Ollama
 * User configures up to 3 LLMs (primary, secondary, tertiary).
 * If primary fails (timeout, rate limit, token exhaustion), Sensei falls to secondary, then tertiary.
 */

const PROVIDER_CONFIGS = {
  openrouter: {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    chatModel: 'anthropic/claude-sonnet-4-20250514',
    embeddingModel: 'openai/text-embedding-3-small',
    headers: (key) => ({
      'Authorization': `Bearer ${key}`,
      'HTTP-Referer': 'https://github.com/bgachichio/sensei',
      'X-Title': 'Sensei Knowledge Base'
    })
  },
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    chatModel: 'gpt-4o-mini',
    embeddingModel: 'text-embedding-3-small',
    headers: (key) => ({ 'Authorization': `Bearer ${key}` })
  },
  anthropic: {
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    chatModel: 'claude-sonnet-4-20250514',
    embeddingModel: null,
    headers: (key) => ({ 'x-api-key': key, 'anthropic-version': '2023-06-01' }),
    isAnthropicFormat: true
  },
  gemini: {
    name: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    chatModel: 'gemini-2.0-flash',
    embeddingModel: 'text-embedding-004',
    isGeminiFormat: true,
    headers: () => ({})
  },
  grok: {
    name: 'Grok',
    baseUrl: 'https://api.x.ai/v1',
    chatModel: 'grok-3-mini',
    embeddingModel: null,
    headers: (key) => ({ 'Authorization': `Bearer ${key}` })
  },
  perplexity: {
    name: 'Perplexity',
    baseUrl: 'https://api.perplexity.ai',
    chatModel: 'sonar',
    embeddingModel: null,
    headers: (key) => ({ 'Authorization': `Bearer ${key}` })
  },
  ollama: {
    name: 'Ollama',
    baseUrl: 'http://localhost:11434/v1',
    chatModel: 'llama3',
    embeddingModel: 'nomic-embed-text',
    headers: () => ({}),
    noKey: true
  }
};

export class AIProvider {
  constructor(config = {}) {
    if (config.providers && Array.isArray(config.providers)) {
      this.providers = config.providers
        .filter(p => p.provider && (p.apiKey || PROVIDER_CONFIGS[p.provider]?.noKey))
        .sort((a, b) => (a.priority || 0) - (b.priority || 0))
        .map(p => this._buildProvider(p));
    } else if (config.provider) {
      this.providers = [this._buildProvider(config)];
    } else {
      this.providers = [];
    }
    this.embeddingDimension = config.embeddingDimension || 768;
    this.timeout = config.timeout || 30000;
  }

  _buildProvider(config) {
    const template = PROVIDER_CONFIGS[config.provider] || PROVIDER_CONFIGS.openrouter;
    return {
      id: config.provider, name: template.name, apiKey: config.apiKey || '',
      baseUrl: config.baseUrl || template.baseUrl,
      chatModel: config.chatModel || template.chatModel,
      embeddingModel: config.embeddingModel || template.embeddingModel,
      headers: template.headers(config.apiKey || ''),
      isAnthropicFormat: template.isAnthropicFormat || false,
      isGeminiFormat: template.isGeminiFormat || false,
      noKey: template.noKey || false, failCount: 0, lastFailure: null
    };
  }

  get configured() { return this.providers.length > 0; }
  get primaryProvider() { return this.providers[0] || null; }
  get embeddingModel() {
    for (const p of this.providers) { if (p.embeddingModel) return p.embeddingModel; }
    return 'text-embedding-3-small';
  }

  async _withFailover(operation) {
    const errors = [];
    for (const provider of this.providers) {
      try {
        const result = await Promise.race([
          operation(provider),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), this.timeout))
        ]);
        provider.failCount = 0;
        return result;
      } catch (e) {
        provider.failCount++;
        provider.lastFailure = new Date().toISOString();
        errors.push({ provider: provider.id, error: e.message });
        console.warn(`[Sensei AI] ${provider.name} failed: ${e.message}. Trying next...`);
      }
    }
    throw new Error(`All providers failed: ${errors.map(e => `${e.provider}: ${e.error}`).join('; ')}`);
  }

  async chat(messages, { temperature = 0.3, maxTokens = 2000, responseFormat = null } = {}) {
    return this._withFailover(async (provider) => {
      if (provider.isAnthropicFormat) return this._chatAnthropic(provider, messages, { temperature, maxTokens });
      if (provider.isGeminiFormat) return this._chatGemini(provider, messages, { temperature, maxTokens });
      return this._chatOpenAI(provider, messages, { temperature, maxTokens, responseFormat });
    });
  }

  async _chatOpenAI(provider, messages, opts) {
    const body = { model: provider.chatModel, messages, temperature: opts.temperature, max_tokens: opts.maxTokens };
    if (opts.responseFormat) body.response_format = opts.responseFormat;
    const res = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...provider.headers }, body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).substring(0, 200)}`);
    return (await res.json()).choices[0].message.content;
  }

  async _chatAnthropic(provider, messages, opts) {
    const systemMsg = messages.find(m => m.role === 'system');
    const body = { model: provider.chatModel, max_tokens: opts.maxTokens, temperature: opts.temperature, messages: messages.filter(m => m.role !== 'system') };
    if (systemMsg) body.system = systemMsg.content;
    const res = await fetch(`${provider.baseUrl}/messages`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...provider.headers }, body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).substring(0, 200)}`);
    return (await res.json()).content[0].text;
  }

  async _chatGemini(provider, messages, opts) {
    const contents = messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }]
    }));
    const body = { contents, generationConfig: { temperature: opts.temperature, maxOutputTokens: opts.maxTokens } };
    const sys = messages.find(m => m.role === 'system');
    if (sys) body.systemInstruction = { parts: [{ text: sys.content }] };
    const res = await fetch(`${provider.baseUrl}/models/${provider.chatModel}:generateContent?key=${provider.apiKey}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).substring(0, 200)}`);
    return (await res.json()).candidates[0].content.parts[0].text;
  }

  async embed(text) {
    const embeddingProviders = this.providers.filter(p => p.embeddingModel);
    if (embeddingProviders.length === 0) throw new Error('No providers support embeddings');
    const errors = [];
    for (const provider of embeddingProviders) {
      try {
        if (provider.isGeminiFormat) return await this._embedGemini(provider, text);
        return await this._embedOpenAI(provider, text);
      } catch (e) { errors.push({ provider: provider.id, error: e.message }); }
    }
    throw new Error(`Embedding failed: ${errors.map(e => `${e.provider}: ${e.error}`).join('; ')}`);
  }

  async _embedOpenAI(provider, text) {
    const res = await fetch(`${provider.baseUrl}/embeddings`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...provider.headers },
      body: JSON.stringify({ model: provider.embeddingModel, input: text })
    });
    if (!res.ok) throw new Error(`${res.status}`);
    const data = await res.json();
    return Array.isArray(text) ? data.data.map(d => d.embedding) : data.data[0].embedding;
  }

  async _embedGemini(provider, text) {
    const res = await fetch(`${provider.baseUrl}/models/${provider.embeddingModel}:embedContent?key=${provider.apiKey}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: `models/${provider.embeddingModel}`, content: { parts: [{ text }] } })
    });
    if (!res.ok) throw new Error(`${res.status}`);
    return (await res.json()).embedding.values;
  }

  async extractEntities(text) {
    const prompt = `Extract entities from this text. Return ONLY valid JSON.\n\nText:\n${text.substring(0, 3000)}\n\nJSON format: {"entities":[{"type":"person|project|topic|decision|commitment|location","name":"Name","role":"context"}],"decisions":[{"what":"Decision","context":"Why"}],"commitments":[{"what":"Action","who":"Person","deadline":"When"}],"tags":["tag"],"importance":"low|normal|high|critical","summary":"One sentence"}`;
    try {
      const response = await this.chat([
        { role: 'system', content: 'Return only valid JSON. No markdown fences.' },
        { role: 'user', content: prompt }
      ], { temperature: 0.1 });
      return JSON.parse(response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
    } catch {
      return { entities: [], decisions: [], commitments: [], tags: [], importance: 'normal', summary: '' };
    }
  }

  async classify(text) {
    try {
      const response = await this.chat([{ role: 'user', content: `Classify into ONE category (topics/people/projects/decisions/insights/commitments/preferences/raw). Return ONLY the word.\n\nText: ${text.substring(0, 1000)}\n\nCategory:` }], { temperature: 0, maxTokens: 20 });
      const cat = response.trim().toLowerCase().replace(/[^a-z]/g, '');
      return ['topics','people','projects','decisions','insights','commitments','preferences','raw'].includes(cat) ? cat : 'topics';
    } catch { return 'topics'; }
  }

  async describeImage(base64Data, mimeType = 'image/jpeg') {
    return this._withFailover(async (provider) => {
      if (provider.isGeminiFormat) {
        const res = await fetch(`${provider.baseUrl}/models/${provider.chatModel}:generateContent?key=${provider.apiKey}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: 'Describe this image concisely. List any visible text.' }, { inlineData: { mimeType, data: base64Data } }] }] })
        });
        if (!res.ok) throw new Error(`${res.status}`);
        return (await res.json()).candidates[0].content.parts[0].text;
      }
      if (provider.isAnthropicFormat) {
        const res = await fetch(`${provider.baseUrl}/messages`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...provider.headers },
          body: JSON.stringify({ model: provider.chatModel, max_tokens: 500, messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: mimeType, data: base64Data } }, { type: 'text', text: 'Describe this image concisely. List any visible text.' }] }] })
        });
        if (!res.ok) throw new Error(`${res.status}`);
        return (await res.json()).content[0].text;
      }
      const res = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...provider.headers },
        body: JSON.stringify({ model: provider.chatModel, max_tokens: 500, messages: [{ role: 'user', content: [{ type: 'text', text: 'Describe this image concisely. List any visible text.' }, { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Data}` } }] }] })
      });
      if (!res.ok) throw new Error(`${res.status}`);
      return (await res.json()).choices[0].message.content;
    });
  }

  getStatus() {
    return this.providers.map((p, i) => ({
      provider: p.id, name: p.name,
      priority: i === 0 ? 'primary' : i === 1 ? 'secondary' : 'tertiary',
      chatModel: p.chatModel, embeddingModel: p.embeddingModel,
      hasEmbeddings: !!p.embeddingModel, failCount: p.failCount, lastFailure: p.lastFailure
    }));
  }

  async healthCheck() {
    try {
      await this.chat([{ role: 'user', content: 'Say "ok"' }], { maxTokens: 5 });
      return { status: 'ok', providers: this.getStatus() };
    } catch (e) {
      return { status: 'error', error: e.message, providers: this.getStatus() };
    }
  }
}

export { PROVIDER_CONFIGS };
