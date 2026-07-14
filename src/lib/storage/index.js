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

// Aktives Backend: Lokaler Storage (kein Login, kein Cloud-Sync)
export { syncFromLocal as syncFromStorage, schedulePush, retryFailedSyncs, exportToFile, importFromFile } from './local.js';

// Box Cloud-Sync (aktivieren sobald IBM Box-App freigegeben):
// export { syncFromBox as syncFromStorage, schedulePush, retryFailedSyncs } from './box.js';
