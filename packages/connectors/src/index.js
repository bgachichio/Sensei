// AI conversation connectors
export { ClaudeConnector } from './claude/connector.js';
export { ChatGPTConnector } from './chatgpt/connector.js';
export { GeminiConnector } from './gemini/connector.js';

// Note-taking app connectors
export { ObsidianConnector } from './obsidian/connector.js';
export { NotionConnector } from './notion/connector.js';

// Communication & other connectors
export {
  GoogleDocsConnector,
  GoogleKeepConnector,
  AppleNotesConnector,
  GmailConnector,
  WhatsAppConnector,
  TelegramConnector,
  SlackConnector,
  RSSConnector,
  IMessageConnector
} from './all-connectors.js';

// Storage manager
export { StorageManager, CLOUD_PROVIDERS } from './storage/manager.js';
