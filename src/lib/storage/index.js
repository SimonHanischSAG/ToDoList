/**
 * Storage configuration
 *
 * Defines which storage backend is active.
 *
 * ── Switch to Box (once IBM access is available) ───────────────────────────
 * 1. Comment out this line:   export { syncFromLocal as syncFromStorage, ... } from './local.js';
 * 2. Activate this line:      export { syncFromBox as syncFromStorage, ... } from './box.js';
 * 3. Commit + Push → done.
 * ──────────────────────────────────────────────────────────────────────────
 */

// Active backend: Box cloud sync
export { syncFromBox as syncFromStorage, schedulePush, retryFailedSyncs, startPolling, stopPolling, loadPrefs, savePrefs, schedulePrefs } from './box.js';

// Export/Import functions are always provided from local.js (independent of backend)
export { exportToFile, importFromFile } from './local.js';

// Local storage (fallback, no login, no cloud sync):
// export { syncFromLocal as syncFromStorage, schedulePush, retryFailedSyncs, exportToFile, importFromFile } from './local.js';
