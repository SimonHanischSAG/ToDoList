/**
 * Folder "authentication" (File System Access API)
 *
 * Replacement for the Box OAuth login: instead of a token the user grants the
 * browser read/write access to a local folder (e.g. the Box Drive folder
 * C:\Users\<user>\Box\IBMTodoStorage). Box Drive takes care of syncing and
 * protecting the data – the app itself needs no OAuth client any more.
 *
 * The directory handle is persisted in IndexedDB. After a browser restart the
 * permission usually has to be confirmed again with one click ("Connect folder").
 *
 * Exposes the same function names as auth/box.js so the rest of the app is
 * unchanged.
 *
 * Requires a Chromium based browser (Edge, Chrome) on desktop.
 */

import Dexie from 'dexie';
import { browser } from '$app/environment';

const kvDb = new Dexie('IBMTodoFolder');
kvDb.version(1).stores({ kv: 'key' });

const HANDLE_KEY = 'dir';

/** @type {FileSystemDirectoryHandle | null} */
let _handle = null;

/**
 * Returns the connected directory handle or null.
 * @returns {FileSystemDirectoryHandle | null}
 */
export function getDirHandle() {
	return _handle;
}

/**
 * Like getDirHandle(), but lazily restores the stored handle from IndexedDB
 * if the module state was lost (e.g. after HMR or a late start).
 * Only returns a handle whose permission is currently granted.
 * @returns {Promise<FileSystemDirectoryHandle | null>}
 */
export async function ensureDirHandle() {
	if (_handle) return _handle;
	if (!browser) return null;
	try {
		const row = await kvDb.table('kv').get(HANDLE_KEY);
		const handle = row?.handle;
		if (handle && (await handle.queryPermission({ mode: 'readwrite' })) === 'granted') {
			_handle = handle;
		}
	} catch (err) {
		console.warn('[Folder Auth] ensureDirHandle failed:', err);
	}
	return _handle;
}

/**
 * Restores a previously selected folder if its permission is still granted.
 * Called on app start (same name as in auth/box.js).
 * @returns {Promise<boolean>} true if a folder is connected
 */
export async function handleRedirect() {
	if (!browser) return false;
	const t0 = performance.now();
	const ms = () => Math.round(performance.now() - t0) + ' ms';
	try {
		console.info('[Folder Auth] Reading stored handle from IndexedDB…');
		const row = await kvDb.table('kv').get(HANDLE_KEY);
		const handle = row?.handle;
		console.info(`[Folder Auth] IndexedDB read done after ${ms()} – handle ${handle ? 'found' : 'missing'}`);
		if (handle) {
			const perm = await handle.queryPermission({ mode: 'readwrite' });
			console.info(`[Folder Auth] queryPermission = "${perm}" after ${ms()}`);
			if (perm === 'granted') {
				_handle = handle;
				return true;
			}
		}
	} catch (err) {
		console.warn('[Folder Auth] Restore failed:', err);
	}
	return false;
}

/**
 * Connects the data folder. Must be called from a user gesture (button click).
 * Re-uses the stored folder if possible, otherwise opens the folder picker.
 * Does NOT reload the page (the permission may not survive a reload);
 * instead it dispatches the window event 'folder-connected'.
 */
export async function login() {
	if (!browser) return;
	if (!('showDirectoryPicker' in window)) {
		alert('This browser does not support local folder access. Please use Microsoft Edge or Google Chrome on desktop.');
		return;
	}
	try {
		const row = await kvDb.table('kv').get(HANDLE_KEY);
		const stored = row?.handle;
		if (stored && (await stored.requestPermission({ mode: 'readwrite' })) === 'granted') {
			_handle = stored;
		} else {
			// @ts-ignore – not yet part of the default TS DOM typings
			const picked = await window.showDirectoryPicker({ id: 'ibmtodo', mode: 'readwrite' });
			await kvDb.table('kv').put({ key: HANDLE_KEY, handle: picked });
			_handle = picked;
		}
	} catch (err) {
		if (/** @type {Error} */ (err)?.name === 'AbortError') return; // picker cancelled
		throw err;
	}
	window.dispatchEvent(new CustomEvent('folder-connected'));
}

/**
 * Returns a truthy value while a folder is connected (replaces the Box token).
 * @returns {string | null}
 */
export function getToken() {
	return _handle ? 'folder' : null;
}

/** @returns {{ name: string, login: string } | null} */
export function getUser() {
	return _handle ? { name: `Folder: ${_handle.name}`, login: '' } : null;
}

/** Disconnects the folder (forgets the stored handle) and reloads the app. */
export async function logout() {
	try {
		await kvDb.table('kv').delete(HANDLE_KEY);
	} catch { /* ignore */ }
	_handle = null;
	window.location.reload();
}

/** No tokens → nothing to refresh (API compatibility with auth/box.js). */
export function startTokenRefreshTimer() {}
export function stopTokenRefreshTimer() {}
export async function refreshToken() {
	return false;
}
