/* Overview Watch — background service worker.
 * Listens for capture events and updates the action badge with the total count
 * so the user has a glanceable indicator that captures are accumulating.
 */

async function updateBadge() {
  try {
    const result = await chrome.storage.local.get(['meta:count', 'meta:settings']);
    const count = result['meta:count'] || 0;
    const settings = result['meta:settings'] || { showBadge: true };
    if (!settings.showBadge) {
      await chrome.action.setBadgeText({ text: '' });
      return;
    }
    let badgeText = '';
    if (count > 0) {
      badgeText = count > 999 ? '999+' : String(count);
    }
    await chrome.action.setBadgeText({ text: badgeText });
    await chrome.action.setBadgeBackgroundColor({ color: '#c66544' });
  } catch (e) {
    console.error('[Overview Watch] Badge update failed:', e);
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'capture_saved') {
    updateBadge();
    sendResponse({ ok: true });
  }
  return false;
});

// Update badge on startup
chrome.runtime.onStartup.addListener(updateBadge);
chrome.runtime.onInstalled.addListener(() => {
  updateBadge();
});

// Also update when storage changes (e.g., user clears captures from options)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes['meta:count'] || changes['meta:settings'])) {
    updateBadge();
  }
});
