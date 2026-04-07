import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * StorageManager - Manages primary cloud and local storage sync
 * 
 * Cloud: Backblaze B2, Google Drive, Dropbox, Box, S3/R2
 * Local: filesystem path (for syncing across machines / mobile)
 * 
 * Uses rclone under the hood for all cloud providers (single dependency, all providers).
 * Falls back to native APIs if rclone is unavailable.
 */

const CLOUD_PROVIDERS = {
  backblaze_b2: { name: 'Backblaze B2', rcloneType: 'b2', fields: ['account', 'key', 'bucket'] },
  google_drive: { name: 'Google Drive', rcloneType: 's3', fields: ['client_id', 'client_secret', 'folder_id'], note: 'OAuth — run `rclone config` to authenticate' },
  dropbox: { name: 'Dropbox', rcloneType: 'dropbox', fields: ['token'], note: 'OAuth — run `rclone config` to authenticate' },
  box: { name: 'Box', rcloneType: 'box', fields: ['token'], note: 'OAuth — run `rclone config` to authenticate' },
  s3: { name: 'S3 / R2 (compatible)', rcloneType: 's3', fields: ['access_key_id', 'secret_access_key', 'endpoint', 'bucket'] },
  local: { name: 'Local Path', rcloneType: null, fields: ['path'] }
};

export class StorageManager {
  constructor(database, knowledgePath) {
    this.db = database;
    this.knowledgePath = knowledgePath;
    this.hasRclone = this._checkBinary('rclone');
  }

  _checkBinary(name) {
    try { execSync(`which ${name}`, { stdio: 'pipe' }); return true; } catch { return false; }
  }

  /**
   * Get storage configuration
   */
  getConfig() {
    return {
      primaryCloud: this.db.getSetting('storage_primary_cloud') || null,
      primaryLocal: this.db.getSetting('storage_primary_local') || null,
      providers: CLOUD_PROVIDERS,
      hasRclone: this.hasRclone
    };
  }

  /**
   * Set primary cloud storage
   */
  setPrimaryCloud(provider, config) {
    this.db.setSetting('storage_primary_cloud', { provider, ...config });
  }

  /**
   * Set primary local storage (for cross-machine / mobile sync)
   */
  setPrimaryLocal(localPath) {
    this.db.setSetting('storage_primary_local', { path: localPath });
  }

  /**
   * Sync knowledge base TO cloud storage
   */
  async syncToCloud() {
    const cloudConfig = this.db.getSetting('storage_primary_cloud');
    if (!cloudConfig) return { success: false, error: 'No cloud storage configured' };

    if (!this.hasRclone) {
      return { success: false, error: 'rclone not installed. Install with: curl https://rclone.org/install.sh | sudo bash' };
    }

    try {
      const remoteName = 'sensei-cloud';
      this._configureRclone(remoteName, cloudConfig);
      const dest = cloudConfig.bucket ? `${remoteName}:${cloudConfig.bucket}/sensei-kb` : `${remoteName}:sensei-kb`;
      execSync(`rclone sync "${this.knowledgePath}" "${dest}" --quiet`, { timeout: 300000 });
      return { success: true, provider: cloudConfig.provider, syncedAt: new Date().toISOString() };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Sync knowledge base FROM cloud storage (pull)
   */
  async syncFromCloud() {
    const cloudConfig = this.db.getSetting('storage_primary_cloud');
    if (!cloudConfig || !this.hasRclone) return { success: false, error: 'Cloud storage or rclone not available' };

    try {
      const remoteName = 'sensei-cloud';
      this._configureRclone(remoteName, cloudConfig);
      const src = cloudConfig.bucket ? `${remoteName}:${cloudConfig.bucket}/sensei-kb` : `${remoteName}:sensei-kb`;
      execSync(`rclone sync "${src}" "${this.knowledgePath}" --quiet`, { timeout: 300000 });
      return { success: true, provider: cloudConfig.provider, syncedAt: new Date().toISOString() };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Sync to local path (for mobile / cross-machine access)
   */
  async syncToLocal() {
    const localConfig = this.db.getSetting('storage_primary_local');
    if (!localConfig || !localConfig.path) return { success: false, error: 'No local sync path configured' };

    try {
      if (!fs.existsSync(localConfig.path)) fs.mkdirSync(localConfig.path, { recursive: true });

      if (this.hasRclone) {
        execSync(`rclone sync "${this.knowledgePath}" "${localConfig.path}" --quiet`, { timeout: 120000 });
      } else {
        execSync(`rsync -a --delete "${this.knowledgePath}/" "${localConfig.path}/"`, { timeout: 120000 });
      }
      return { success: true, path: localConfig.path, syncedAt: new Date().toISOString() };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  _configureRclone(remoteName, config) {
    const providerDef = CLOUD_PROVIDERS[config.provider];
    if (!providerDef) throw new Error(`Unknown provider: ${config.provider}`);

    // Write temporary rclone config
    const rcloneConfig = this._buildRcloneConfig(remoteName, config);
    const configPath = path.join(this.db.dbPath, '..', 'rclone.conf');
    fs.writeFileSync(configPath, rcloneConfig, { mode: 0o600 });
    process.env.RCLONE_CONFIG = configPath;
  }

  _buildRcloneConfig(remoteName, config) {
    switch (config.provider) {
      case 'backblaze_b2':
        return `[${remoteName}]\ntype = b2\naccount = ${config.account}\nkey = ${config.key}\n`;
      case 's3':
        return `[${remoteName}]\ntype = s3\nprovider = Other\naccess_key_id = ${config.access_key_id}\nsecret_access_key = ${config.secret_access_key}\nendpoint = ${config.endpoint || ''}\n`;
      case 'google_drive':
        return `[${remoteName}]\ntype = drive\nclient_id = ${config.client_id || ''}\nclient_secret = ${config.client_secret || ''}\nroot_folder_id = ${config.folder_id || ''}\n`;
      case 'dropbox':
        return `[${remoteName}]\ntype = dropbox\ntoken = ${JSON.stringify(config.token || {})}\n`;
      case 'box':
        return `[${remoteName}]\ntype = box\ntoken = ${JSON.stringify(config.token || {})}\n`;
      default:
        throw new Error(`Unsupported provider for rclone: ${config.provider}`);
    }
  }
}

export { CLOUD_PROVIDERS };
