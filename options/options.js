/* Overview Watch — options page logic. */

(async function () {
  const STORAGE = window.OW_STORAGE;
  await STORAGE.init();

  const statusEl = document.getElementById('status');
  const storageInfo = document.getElementById('storage-info');

  function showStatus(msg) {
    statusEl.textContent = msg;
    statusEl.classList.add('visible');
    setTimeout(() => statusEl.classList.remove('visible'), 3000);
  }

  // Load current settings
  async function loadSettings() {
    const settings = await STORAGE.getSettings();
    document.querySelectorAll('.toggle').forEach(t => {
      const key = t.dataset.setting;
      if (settings[key]) t.classList.add('on');
      else t.classList.remove('on');
    });
    await updateStorageInfo();
  }

  async function updateStorageInfo() {
    const count = await STORAGE.getCount();
    const bytes = await STORAGE.getStorageUsage();
    let str = `${count} captures`;
    if (bytes !== null) {
      const mb = (bytes / (1024 * 1024)).toFixed(2);
      str += ` · ${mb} MB used`;
    }
    storageInfo.textContent = str;
  }

  // Toggle handler
  document.querySelectorAll('.toggle').forEach(t => {
    t.addEventListener('click', async () => {
      const key = t.dataset.setting;
      t.classList.toggle('on');
      const settings = await STORAGE.getSettings();
      settings[key] = t.classList.contains('on');
      await STORAGE.setSettings(settings);
      showStatus(`${key}: ${settings[key] ? 'enabled' : 'disabled'}`);
    });
  });

  // Export
  document.getElementById('export-btn').addEventListener('click', async () => {
    const data = await STORAGE.exportAsJSON();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `overview-watch-export-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showStatus(`Exported ${data.captures.length} captures`);
  });

  // Clear all
  document.getElementById('clear-btn').addEventListener('click', async () => {
    if (!confirm('Delete all captures? This cannot be undone. You may want to export first.')) return;
    await STORAGE.deleteAll();
    await updateStorageInfo();
    showStatus('All captures deleted');
  });

  await loadSettings();
})();
