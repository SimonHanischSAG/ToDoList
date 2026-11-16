/**
 * Local folder storage adapter (File System Access API)
 *
 * todos.json and prefs.json live in a folder chosen by the user, typically the
 * Box Drive folder  C:\Users\<user>\Box\IBMTodoStorage  – Box Drive then syncs
 * and protects the files, the app needs no Box OAuth client.
 *
 * Same public API as storage/box.js.
 *
 * Concurrency: the file's lastModified timestamp replaces the Box ETag.
 * Before every write the file is compared with the last known timestamp; if it
 * changed meanwhile (other device via Box Drive, other tab) the remote tasks are
 * merged with the local ones (newer updatedAt wins per task) before writing.
 */

import { getDirHandle, ensureDirHandle } from '../auth/folder.js';
import { db } from './db.js';

const FILE_NAME  = 'todos.json';
const PREFS_NAME = 'prefs.json';

const UPLOAD_DEBOUNCE_MS = 2000;
const PREFS_DEBOUNCE_MS  = 1500;
const POLL_INTERVAL_MS   = 15_000;

/** Notifies other tabs of the same browser after a successful write */
const bc = new BroadcastChannel('todos-sync');

let uploadTimer = null;
let prefsUploadTimer = null;
let isUploading = false;
let pollTimer = null;

/** lastModified (ms) of todos.json at our last read/write */
let knownModified = null;

/** @type {(() => void) | null} */
let onRemoteChange = null;

// ── File helpers ───────────────────────────────────────────────────────────

/**
 * Returns the directory handle or throws SESSION_EXPIRED when the folder is
 * not connected / the permission was lost (handled like an expired session).
 * @returns {Promise<FileSystemDirectoryHandle>}
 */
async function dir() {
	const handle = await ensureDirHandle();
	if (!handle) {
		console.warn('[Folder] No folder connected or permission not granted.');
		throw new Error('SESSION_EXPIRED');
	}
	// @ts-ignore – queryPermission is not in the default TS DOM typings
	const perm = await handle.queryPermission({ mode: 'readwrite' });
	if (perm !== 'granted') {
		console.warn('[Folder] Folder permission is "' + perm + '".');
		throw new Error('SESSION_EXPIRED');
	}
	return handle;
}

/**
 * Reads a file from the data folder.
 * @param {string} name
 * @returns {Promise<{ text: string, modified: number } | null>} null if missing or empty
 */
async function readFile(name) {
	const d = await dir();
	let fh;
	try {
		fh = await d.getFileHandle(name);
	} catch (err) {
		if (/** @type {Error} */ (err).name === 'NotFoundError') return null;
		throw err;
	}
	const file = await fh.getFile();
	const text = await file.text();
	if (!text.trim()) return null;
	return { text, modified: file.lastModified };
}

/**
 * Writes a file to the data folder.
 * @param {string} name
 * @param {string} text
 * @returns {Promise<number>} new lastModified
 */
async function writeFile(name, text) {
	const d = await dir();
	const fh = await d.getFileHandle(name, { create: true });
	const writable = await fh.createWritable();
	await writable.write(text);
	await writable.close();
	return (await fh.getFile()).lastModified;
}

/** @returns {Promise<number | null>} lastModified of todos.json without reading it */
async function getRemoteModified() {
	const d = await dir();
	try {
		const fh = await d.getFileHandle(FILE_NAME);
		return (await fh.getFile()).lastModified;
	} catch (err) {
		if (/** @type {Error} */ (err).name === 'NotFoundError') return null;
		throw err;
	}
}

/**
 * Merges two task arrays by taking the version with the newer updatedAt per id.
 * @param {import('../model/task.js').Task[]} local
 * @param {import('../model/task.js').Task[]} remote
 * @returns {import('../model/task.js').Task[]}
 */
function mergeTasks(local, remote) {
	const map = new Map(remote.map(t => [t.id, t]));
	for (const localTask of local) {
		const remoteTask = map.get(localTask.id);
		if (!remoteTask || localTask.updatedAt > remoteTask.updatedAt) {
			map.set(localTask.id, localTask);
		}
	}
	return [...map.values()];
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Loads todos.json from the folder into the local IndexedDB cache.
 * @returns {Promise<void>}
 */
export async function syncFromFolder() {
	const remote = await readFile(FILE_NAME);
	if (!remote) return; // no file yet → keep local state

	/** @type {import('../model/task.js').Task[]} */
	const tasks = JSON.parse(remote.text);
	knownModified = remote.modified;

	// Safety guard: never replace a non-empty local DB with an empty remote list
	if (tasks.length === 0 && (await db.tasks.count()) > 0) {
		console.warn('[Folder] todos.json is empty but local DB has tasks – skipping overwrite.');
		return;
	}

	await db.tasks.clear();
	await db.tasks.bulkPut(tasks);
}

/**
 * Writes the local cache to todos.json (merging first if the file changed).
 * @returns {Promise<void>}
 */
export async function pushToFolder() {
	isUploading = true;
	try {
		let local = await db.tasks.toArray();
		const remote = await readFile(FILE_NAME);

		// Safety guard: never wipe an existing file with an empty list
		if (local.length === 0 && remote) {
			console.warn('[Folder] Refusing to write empty task list – file exists. Skipping.');
			return;
		}

		// File changed since our last read/write (other device / tab) → merge first
		if (remote && remote.modified !== knownModified) {
			console.info('[Folder] File changed externally – merging before write…');
			local = mergeTasks(local, JSON.parse(remote.text));
			await db.tasks.clear();
			await db.tasks.bulkPut(local);
		}

		knownModified = await writeFile(FILE_NAME, JSON.stringify(local, null, 2));
	} finally {
		isUploading = false;
	}
}

/**
 * Schedules a debounced write.
 * @param {((err: Error) => void) | undefined} [onError]
 */
export function schedulePush(onError) {
	if (uploadTimer) clearTimeout(uploadTimer);
	uploadTimer = setTimeout(async () => {
		uploadTimer = null;
		try {
			await pushToFolder();
			bc.postMessage({ type: 'tasks-changed' });
		} catch (err) {
			console.error('[Folder] Write failed:', err);
			await db.syncQueue.add({ timestamp: new Date().toISOString(), error: String(err) });
			onError?.(/** @type {Error} */ (err));
		}
	}, UPLOAD_DEBOUNCE_MS);
}

/** True while a write is scheduled or running. */
export function isPushPending() {
	return uploadTimer !== null || isUploading;
}

/** Retries writes that failed earlier (e.g. folder was not accessible). */
export async function retryFailedSyncs() {
	const pending = await db.syncQueue.toArray();
	if (pending.length === 0) return;
	try {
		await pushToFolder();
		await db.syncQueue.clear();
	} catch {
		// still not accessible
	}
}

/**
 * Polls todos.json for external changes (Box Drive sync, other tabs).
 * @param {() => void} callback  Called after new data has been loaded
 */
export function startPolling(callback) {
	onRemoteChange = callback;

	bc.onmessage = async (e) => {
		if (e.data?.type !== 'tasks-changed') return;
		if (isPushPending()) return;
		await syncFromFolder();
		onRemoteChange?.();
	};

	if (pollTimer) return;

	pollTimer = setInterval(async () => {
		if (!getDirHandle() || isPushPending()) return;
		try {
			const modified = await getRemoteModified();
			if (modified === null || modified === knownModified) return;
			console.info('[Folder] External change detected – reloading…');
			await syncFromFolder();
			onRemoteChange?.();
		} catch (err) {
			console.warn('[Folder] Polling error:', err);
		}
	}, POLL_INTERVAL_MS);
}

export function stopPolling() {
	if (pollTimer) {
		clearInterval(pollTimer);
		pollTimer = null;
	}
	bc.onmessage = null;
	onRemoteChange = null;
	knownModified = null;
}

// ── UI preferences (prefs.json) ────────────────────────────────────────────

/**
 * @typedef {{ minScore: number, activeAreas: string[], activeTopics: string[], showDone: boolean, showVerbose: boolean }} UIPrefs
 */

/** @returns {Promise<UIPrefs | null>} */
export async function loadPrefs() {
	try {
		const file = await readFile(PREFS_NAME);
		return file ? JSON.parse(file.text) : null;
	} catch {
		return null;
	}
}

/** @param {UIPrefs} prefs */
export async function savePrefs(prefs) {
	try {
		await writeFile(PREFS_NAME, JSON.stringify(prefs, null, 2));
	} catch (err) {
		console.warn('[Folder] Prefs save failed:', err);
	}
}

/** @param {UIPrefs} prefs */
export function schedulePrefs(prefs) {
	if (prefsUploadTimer) clearTimeout(prefsUploadTimer);
	prefsUploadTimer = setTimeout(() => savePrefs(prefs), PREFS_DEBOUNCE_MS);
}
