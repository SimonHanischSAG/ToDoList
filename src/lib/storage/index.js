/**
 * Storage-Konfiguration
 *
 * Hier wird festgelegt welches Storage-Backend aktiv ist.
 *
 * ── Auf Box umschalten (sobald IBM-Freigabe vorliegt) ──────────────────────
 * 1. Diese Zeile auskommentieren:   export { syncFromLocal as syncFromStorage, ... } from './local.js';
 * 2. Diese Zeile aktivieren:        export { syncFromBox as syncFromStorage, ... } from './box.js';
 * 3. Commit + Push → fertig.
 * ──────────────────────────────────────────────────────────────────────────
 */

// Aktives Backend: Box Cloud-Sync
export { syncFromBox as syncFromStorage, schedulePush, retryFailedSyncs, startPolling, stopPolling } from './box.js';

// Export/Import-Funktionen werden immer aus local.js bereitgestellt (unabhängig vom Backend)
export { exportToFile, importFromFile } from './local.js';

// Lokaler Storage (Fallback, kein Login, kein Cloud-Sync):
// export { syncFromLocal as syncFromStorage, schedulePush, retryFailedSyncs, exportToFile, importFromFile } from './local.js';
