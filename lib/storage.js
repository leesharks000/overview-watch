/* Overview Watch — local storage wrapper.
 * Uses chrome.storage.local with the unlimited quota that comes with the
 * storage permission. Each capture is a separate keyed record so we can read
 * recent captures without loading the full history.
 *
 * Key naming convention:
 *   meta:version       — schema version
 *   meta:count         — total captures
 *   meta:settings      — user settings
 *   cap:<timestamp>    — capture record, sorted lexically = sorted chronologically
 */

const OW_STORAGE = (function () {
  const SCHEMA_VERSION = 1;

  async function init() {
    const existing = await chrome.storage.local.get('meta:version');
    if (!existing['meta:version']) {
      await chrome.storage.local.set({
        'meta:version': SCHEMA_VERSION,
        'meta:count': 0,
        'meta:settings': {
          enabled: true,
          captureGoogleOverview: true,
          captureGoogleAIMode: true,
          showBadge: true,
          retainDays: 365 // captures older than this can be pruned manually
        }
      });
    }
  }

  async function saveCapture(record) {
    // Timestamp is the storage key suffix. ISO-8601 with a tail to disambiguate.
    const ts = record.timestamp || new Date().toISOString();
    const key = `cap:${ts}_${Math.random().toString(36).slice(2, 8)}`;
    record._key = key;
    await chrome.storage.local.set({ [key]: record });
    // Increment count
    const meta = await chrome.storage.local.get('meta:count');
    await chrome.storage.local.set({ 'meta:count': (meta['meta:count'] || 0) + 1 });
    return key;
  }

  async function getRecentCaptures(limit = 50) {
    const all = await chrome.storage.local.get(null);
    const captures = Object.entries(all)
      .filter(([k]) => k.startsWith('cap:'))
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, limit)
      .map(([k, v]) => ({ ...v, _key: k }));
    return captures;
  }

  async function getAllCaptures() {
    const all = await chrome.storage.local.get(null);
    return Object.entries(all)
      .filter(([k]) => k.startsWith('cap:'))
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([k, v]) => ({ ...v, _key: k }));
  }

  async function getCount() {
    const meta = await chrome.storage.local.get('meta:count');
    return meta['meta:count'] || 0;
  }

  async function getSettings() {
    const meta = await chrome.storage.local.get('meta:settings');
    return meta['meta:settings'] || {
      enabled: true,
      captureGoogleOverview: true,
      captureGoogleAIMode: true,
      showBadge: true,
      retainDays: 365
    };
  }

  async function setSettings(settings) {
    await chrome.storage.local.set({ 'meta:settings': settings });
  }

  async function deleteCapture(key) {
    await chrome.storage.local.remove(key);
  }

  async function deleteAll() {
    const all = await chrome.storage.local.get(null);
    const captureKeys = Object.keys(all).filter(k => k.startsWith('cap:'));
    if (captureKeys.length > 0) {
      await chrome.storage.local.remove(captureKeys);
    }
    await chrome.storage.local.set({ 'meta:count': 0 });
  }

  async function exportAsJSON() {
    const captures = await getAllCaptures();
    const settings = await getSettings();
    return {
      _meta: {
        exportedAt: new Date().toISOString(),
        schemaVersion: SCHEMA_VERSION,
        totalCaptures: captures.length,
        extension: 'Overview Watch',
        version: chrome.runtime.getManifest().version
      },
      _settings: settings,
      captures
    };
  }

  async function getStorageUsage() {
    if (chrome.storage.local.getBytesInUse) {
      const bytes = await chrome.storage.local.getBytesInUse(null);
      return bytes;
    }
    return null;
  }

  return {
    init,
    saveCapture,
    getRecentCaptures,
    getAllCaptures,
    getCount,
    getSettings,
    setSettings,
    deleteCapture,
    deleteAll,
    exportAsJSON,
    getStorageUsage,
    SCHEMA_VERSION
  };
})();

// Expose for content scripts and popup
if (typeof window !== 'undefined') {
  window.OW_STORAGE = OW_STORAGE;
}
if (typeof self !== 'undefined' && typeof window === 'undefined') {
  // service worker context
  self.OW_STORAGE = OW_STORAGE;
}
