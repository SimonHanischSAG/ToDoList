/**
 * Storage backend selection – see ../backend.js for how to switch.
 * Must (and does) follow the same switch as ../auth/index.js.
 *
 * 'folder': local Box Drive folder (File System Access API)
 * 'box':    Box Content API via OAuth
 */

import { BACKEND } from '../backend.js';
import * as folder from './folder.js';
import * as box from './box.js';

const impl = BACKEND === 'box'
	? { ...box, syncFromStorage: box.syncFromBox }
	: { ...folder, syncFromStorage: folder.syncFromFolder };

export const syncFromStorage = () => impl.syncFromStorage();
export const schedulePush    = (/** @type {any} */ onError) => impl.schedulePush(onError);
export const retryFailedSyncs = () => impl.retryFailedSyncs();
export const startPolling    = (/** @type {() => void} */ cb) => impl.startPolling(cb);
export const stopPolling     = () => impl.stopPolling();
export const loadPrefs       = () => impl.loadPrefs();
export const savePrefs       = (/** @type {any} */ prefs) => impl.savePrefs(prefs);
export const schedulePrefs   = (/** @type {any} */ prefs) => impl.schedulePrefs(prefs);

// Export/Import functions are always provided from local.js (independent of backend)
export { exportToFile, importFromFile } from './local.js';
