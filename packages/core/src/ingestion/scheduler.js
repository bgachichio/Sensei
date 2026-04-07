/**
 * SyncScheduler - Manages connector sync schedules
 * 
 * Each connector can have its own interval or use the global default.
 * Options: hourly, every_4h, every_12h, daily, custom_time, manual
 */

const INTERVAL_MS = {
  hourly: 60 * 60 * 1000,
  every_4h: 4 * 60 * 60 * 1000,
  every_12h: 12 * 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  manual: null // No auto-sync
};

export class SyncScheduler {
  constructor(database) {
    this.db = database;
    this.timers = new Map();
    this.handlers = new Map();
    this.running = new Set();
  }

  /**
   * Register a connector with its sync handler
   */
  register(connectorId, handler) {
    this.handlers.set(connectorId, handler);
  }

  /**
   * Start scheduling based on saved configs
   */
  startAll() {
    const configs = this.db.getSetting('sync_configs') || {};
    const globalConfig = this.db.getSetting('global_sync') || { interval: 'every_4h' };

    for (const [connectorId, handler] of this.handlers) {
      const config = configs[connectorId] || { interval: globalConfig.interval, enabled: false };
      if (config.enabled && config.interval !== 'manual') {
        this.schedule(connectorId, config);
      }
    }
  }

  /**
   * Schedule a connector for periodic sync
   */
  schedule(connectorId, config) {
    this.stop(connectorId); // Clear existing timer

    const interval = config.interval || 'every_4h';
    const ms = INTERVAL_MS[interval];
    if (!ms) return; // Manual or unknown

    // If custom_time, calculate next occurrence
    if (interval === 'custom_time' && config.time) {
      this._scheduleAtTime(connectorId, config.time, config.days || ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
      return;
    }

    const timer = setInterval(() => this.runSync(connectorId), ms);
    this.timers.set(connectorId, timer);
    console.log(`[Scheduler] ${connectorId}: syncing every ${interval}`);
  }

  _scheduleAtTime(connectorId, time, days) {
    const [hours, minutes] = time.split(':').map(Number);
    const dayMap = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
    const activeDays = new Set(days.map(d => dayMap[d.toLowerCase()]));

    const check = () => {
      const now = new Date();
      if (activeDays.has(now.getDay()) && now.getHours() === hours && now.getMinutes() === minutes) {
        this.runSync(connectorId);
      }
    };

    const timer = setInterval(check, 60 * 1000); // Check every minute
    this.timers.set(connectorId, timer);
    console.log(`[Scheduler] ${connectorId}: syncing at ${time} on ${days.join(', ')}`);
  }

  /**
   * Run sync for a connector
   */
  async runSync(connectorId) {
    if (this.running.has(connectorId)) return; // Prevent overlap
    this.running.add(connectorId);

    const handler = this.handlers.get(connectorId);
    if (!handler) { this.running.delete(connectorId); return; }

    try {
      console.log(`[Scheduler] Starting sync: ${connectorId}`);
      const result = await handler();
      this.db.setSyncState(connectorId, new Date().toISOString());
      console.log(`[Scheduler] Sync complete: ${connectorId} — ${result?.count || 0} items`);
    } catch (e) {
      console.error(`[Scheduler] Sync failed: ${connectorId} — ${e.message}`);
    }

    this.running.delete(connectorId);
  }

  /**
   * Stop scheduling for a connector
   */
  stop(connectorId) {
    const timer = this.timers.get(connectorId);
    if (timer) clearInterval(timer);
    this.timers.delete(connectorId);
  }

  /**
   * Stop all schedulers
   */
  stopAll() {
    for (const [id, timer] of this.timers) {
      clearInterval(timer);
    }
    this.timers.clear();
  }

  /**
   * Update sync config for a connector or globally
   */
  updateConfig(connectorId, config) {
    const configs = this.db.getSetting('sync_configs') || {};
    configs[connectorId] = { ...configs[connectorId], ...config };
    this.db.setSetting('sync_configs', configs);

    if (config.enabled && config.interval !== 'manual') {
      this.schedule(connectorId, configs[connectorId]);
    } else {
      this.stop(connectorId);
    }
  }

  /**
   * Set global sync config (applies to all connectors without individual settings)
   */
  updateGlobalConfig(config) {
    this.db.setSetting('global_sync', config);
    // Restart all with new default
    this.stopAll();
    this.startAll();
  }

  /**
   * Get sync status for all connectors
   */
  getStatus() {
    const configs = this.db.getSetting('sync_configs') || {};
    const globalConfig = this.db.getSetting('global_sync') || { interval: 'every_4h' };
    const status = [];

    for (const [connectorId] of this.handlers) {
      const config = configs[connectorId] || { interval: globalConfig.interval, enabled: false };
      const syncState = this.db.getSyncState(connectorId);
      status.push({
        id: connectorId,
        enabled: config.enabled || false,
        interval: config.interval || globalConfig.interval,
        lastSync: syncState?.last_sync_at || null,
        isRunning: this.running.has(connectorId),
        isScheduled: this.timers.has(connectorId)
      });
    }

    return { connectors: status, global: globalConfig };
  }
}

export { INTERVAL_MS };
