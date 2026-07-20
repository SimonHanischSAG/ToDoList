/**
 * Box Content API – storage adapter
 *
 * All todos are stored as a single JSON file in the user's Box account:
 *   /IBMTodoStorage/todos.json
 *
 * Reads go against the local IndexedDB cache (Dexie).
 * Writes are applied locally immediately and synced to Box with debounce.
 *
 * Concurrent safety (optimistic locking):
 *   - Each file version has an ETag (SHA-1 of the file in Box).
 *   - On upload we check via If-Match whether the file has changed in the meantime.
 *   - On a 412 conflict we first download the remote state, merge locally and
 *     retry (max. 3 attempts).
 *   - startPolling() checks the ETag every 30 seconds (no body download)
 *     and only reloads when the file has changed.
 */

import { getToken, logout, refreshToken } from '../auth/box.js';
import { db } from './db.js';

const BOX_API = 'https://api.box.com/2.0';
const FOLDER_NAME    = 'IBMTodoStorage';
const FILE_NAME      = 'todos.json';
const README_NAME    = 'README.txt';
const README_CONTENT = `IBMTodoStorage – data folder of the IBM Todo App
=================================================

This folder is automatically created and managed by the IBM Todo App:
https://simonhanischsag.github.io/ToDoList/

Contents
--------
todos.json   All your tasks as a JSON file (UTF-8)
README.txt   This file

What happens if you delete this folder or todos.json?
------------------------------------------------------
- On the next app start ALL tasks will be permanently deleted.
- The app will recreate the folder and an empty todos.json.
- Recovery is only possible if you previously created a backup
  (export as JSON via the app).

Backup / Restore
----------------
The app (top right) has Export and Import buttons.
Use them to create a local backup as a JSON file and restore it if needed.

Please do NOT rename or move this folder.
`;

// ── Internal state ─────────────────────────────────────────────────────────

/** Debounce timer for uploads */
let uploadTimer = null;
const UPLOAD_DEBOUNCE_MS = 2000;

/** Cached IDs to avoid repeated folder lookups */
let folderId = null;
let fileId   = null;
let readmeId = null;

/**
 * Last known ETag of todos.json in Box.
 * Updated after every successful download or upload.
 * Used as optimistic lock: we send If-Match on upload.
 * @type {string | null}
 */
let knownEtag = null;

/** Polling interval handle */
let pollTimer = null;
const POLL_INTERVAL_MS = 30_000; // 30 seconds

/**
 * Callback invoked when polling has detected a remote change
 * and the local data has been reloaded.
 * @type {(() => void) | null}
 */
let onRemoteChange = null;

// ── Box API helpers ────────────────────────────────────────────────────────

/**
 * Performs an authenticated Box API request.
 * On 401 (expired token) it silently retries once after a refresh.
 * @param {string} url
 * @param {RequestInit} options
 * @param {boolean} _retry
 * @returns {Promise<Response>}
 */
async function boxFetch(url, options = {}, _retry = true) {
	const token = getToken();
	if (!token) throw new Error('Not logged in');
	const res = await fetch(url, {
		...options,
		headers: {
			Authorization: `Bearer ${token}`,
			...(options.headers ?? {})
		}
	});
	if (res.status === 401 && _retry) {
		const ok = await refreshToken();
		if (ok) return boxFetch(url, options, false);
		logout();
		throw new Error('SESSION_EXPIRED');
	}
	return res;
}

/**
 * Finds or creates the IBMTodoStorage folder in the user's root.
 * @returns {Promise<string>} Folder ID
 */
async function getOrCreateFolder() {
	if (folderId) return folderId;

	const res = await boxFetch(
		`${BOX_API}/folders/0/items?fields=id,name,type&limit=100`
	);
	if (!res.ok) throw new Error(`Box API error: ${res.status} – ${await res.text()}`);
	const data = await res.json();

	const existing = data.entries?.find(
		(e) => e.type === 'folder' && e.name === FOLDER_NAME
	);

	if (existing) {
		folderId = existing.id;
		return folderId;
	}

	const createRes = await boxFetch(`${BOX_API}/folders`, {
		method:  'POST',
		headers: { 'Content-Type': 'application/json' },
		body:    JSON.stringify({ name: FOLDER_NAME, parent: { id: '0' } })
	});
	if (!createRes.ok) throw new Error(`Box folder creation failed: ${createRes.status}`);
	const folder = await createRes.json();
	folderId = folder.id;
	return folderId;
}

/**
 * Creates README.txt in the folder if it does not yet exist.
 * @param {string} folder Folder ID
 */
async function ensureReadme(folder) {
	if (readmeId) return;

	const res = await boxFetch(
		`${BOX_API}/folders/${folder}/items?fields=id,name,type&limit=100`
	);
	if (!res.ok) return;
	const data = await res.json();

	const existing = data.entries?.find(
		(e) => e.type === 'file' && e.name === README_NAME
	);
	if (existing) {
		readmeId = existing.id;
		return;
	}

	const form = new FormData();
	form.append('attributes', JSON.stringify({ name: README_NAME, parent: { id: folder } }));
	form.append('file', new Blob([README_CONTENT], { type: 'text/plain' }), README_NAME);
	const upload = await boxFetch('https://upload.box.com/api/2.0/files/content', {
		method: 'POST',
		body: form
	});
	if (upload.ok) {
		const result = await upload.json();
		readmeId = result.entries?.[0]?.id ?? null;
	}
}

/**
 * Finds todos.json in the IBMTodo folder.
 * Returns null if it does not exist.
 * @returns {Promise<string | null>} File ID or null
 */
async function findFile() {
	if (fileId) return fileId;

	const folder = await getOrCreateFolder();
	const res = await boxFetch(
		`${BOX_API}/folders/${folder}/items?fields=id,name,type&limit=100`
	);
	if (!res.ok) return null;
	const data = await res.json();

	const file = data.entries?.find(
		(e) => e.type === 'file' && e.name === FILE_NAME
	);
	if (file) {
		fileId = file.id;
		return fileId;
	}
	return null;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Downloads todos.json from Box and writes everything to the local cache.
 * Saves the file ETag for later optimistic locking.
 * @returns {Promise<void>}
 */
export async function syncFromBox() {
	const id = await findFile();

	if (!id) {
		await db.tasks.clear();
		return;
	}

	const res = await boxFetch(`${BOX_API}/files/${id}/content`);
	if (!res.ok) throw new Error(`Box download error: ${res.status}`);

	// Save ETag (Box delivers it in the content response header)
	knownEtag = res.headers.get('etag') ?? knownEtag;

	/** @type {import('../model/task.js').Task[]} */
	const tasks = await res.json();
	await db.tasks.clear();
	await db.tasks.bulkPut(tasks);
}

/**
 * Reads the current ETag of todos.json via metadata endpoint (no body download).
 * Returns null if no ETag is available or the file does not exist.
 * @returns {Promise<string | null>}
 */
async function fetchRemoteEtag() {
	const id = await findFile();
	if (!id) return null;
	try {
		// Box does not return an ETag on HEAD; use the file metadata endpoint instead
		// (sequence_id changes with every new version).
		const res = await boxFetch(`${BOX_API}/files/${id}?fields=id,etag,sequence_id`);
		if (!res.ok) return null;
		const data = await res.json();
		return data.etag ?? null;
	} catch {
		return null;
	}
}

/**
 * Merges remote and local tasks using "last-writer-wins" based on updatedAt.
 * Remote-only tasks (not present locally) are added.
 * @param {import('../model/task.js').Task[]} remote
 * @param {import('../model/task.js').Task[]} local
 * @returns {import('../model/task.js').Task[]}
 */
function mergeTasks(remote, local) {
	const byId = new Map(local.map(t => [t.id, t]));
	for (const rt of remote) {
		const lt = byId.get(rt.id);
		if (!lt) {
			// Remote-only → take over
			byId.set(rt.id, rt);
		} else {
			// Both present → newer wins
			const remoteTs = new Date(rt.updatedAt ?? 0).getTime();
			const localTs  = new Date(lt.updatedAt ?? 0).getTime();
			if (remoteTs > localTs) byId.set(rt.id, rt);
		}
	}
	return Array.from(byId.values());
}

/**
 * Writes the current local cache as todos.json to Box.
 * Uses optimistic locking (If-Match with known ETag).
 * On 412 conflict: download remote, merge, retry (max. 3 attempts).
 * @param {number} attempt
 * @returns {Promise<void>}
 */
export async function pushToBox(attempt = 0) {
	if (attempt > 2) throw new Error('Box sync: too many conflicts – upload aborted');

	const local  = await db.tasks.toArray();
	const body   = JSON.stringify(local, null, 2);
	const folder = await getOrCreateFolder();
	await ensureReadme(folder);
	const id     = await findFile();

	const formData = new FormData();
	formData.append(
		'attributes',
		JSON.stringify(
			id
				? { name: FILE_NAME }
				: { name: FILE_NAME, parent: { id: folder } }
		)
	);
	formData.append('file', new Blob([body], { type: 'application/json' }), FILE_NAME);

	const url = id
		? `https://upload.box.com/api/2.0/files/${id}/content`
		: `https://upload.box.com/api/2.0/files/content`;

	/** @type {Record<string, string>} */
	const extraHeaders = {};
	// Set If-Match only when updating an existing file
	if (id && knownEtag) {
		extraHeaders['If-Match'] = knownEtag;
	}

	const res = await boxFetch(url, {
		method: 'POST',
		body: formData,
		headers: extraHeaders
	});

	// 412 Precondition Failed → file was changed on another device
	if (res.status === 412) {
		console.warn('[Box] Write conflict (412) – downloading remote, merging, retrying…');
		// Download remote state
		const remoteRes = await boxFetch(`${BOX_API}/files/${id}/content`);
		if (remoteRes.ok) {
			knownEtag = remoteRes.headers.get('etag') ?? knownEtag;
			const remote = /** @type {import('../model/task.js').Task[]} */ (await remoteRes.json());
			const merged = mergeTasks(remote, local);
			// Save merge locally
			await db.tasks.clear();
			await db.tasks.bulkPut(merged);
		}
		// Retry with fresh file ID lookup (etag has changed)
		fileId = null; // clear cache so findFile() picks up the new version
		return pushToBox(attempt + 1);
	}

	if (!res.ok) throw new Error(`Box upload error: ${res.status} ${await res.text()}`);

	// Save new ETag from the response
	const result = await res.json();
	fileId    = result.entries?.[0]?.id    ?? fileId;
	knownEtag = result.entries?.[0]?.etag  ?? knownEtag;
}

/**
 * Schedules a debounced upload to Box.
 */
export function schedulePush() {
	if (uploadTimer) clearTimeout(uploadTimer);
	uploadTimer = setTimeout(async () => {
		try {
			await pushToBox();
		} catch (err) {
			console.error('[Box] Push failed:', err);
			await db.syncQueue.add({ timestamp: new Date().toISOString(), error: String(err) });
		}
	}, UPLOAD_DEBOUNCE_MS);
}

/**
 * Attempts to process pending sync queue entries.
 */
export async function retryFailedSyncs() {
	const pending = await db.syncQueue.toArray();
	if (pending.length === 0) return;
	try {
		await pushToBox();
		await db.syncQueue.clear();
	} catch {
		// Still offline
	}
}

/**
 * Starts automatic polling for remote changes.
 * Every 30 seconds the ETag is checked. If it has changed,
 * the data is reloaded and `callback` is called.
 *
 * @param {() => void} callback  Called after new remote data has been loaded
 */
export function startPolling(callback) {
	onRemoteChange = callback;
	if (pollTimer) return; // already active

	pollTimer = setInterval(async () => {
		if (!getToken()) return; // not logged in
		try {
			const remoteEtag = await fetchRemoteEtag();
			if (remoteEtag === null) return;
			if (knownEtag !== null && remoteEtag === knownEtag) return; // no change

			console.info('[Box] Remote change detected – reloading…');
			await syncFromBox();
			knownEtag = remoteEtag;
			onRemoteChange?.();
		} catch (err) {
			// Network error during polling → ignore, retry in 30s
			console.warn('[Box] Polling error:', err);
		}
	}, POLL_INTERVAL_MS);
}

/**
 * Stops polling (e.g. on logout).
 */
export function stopPolling() {
	if (pollTimer) {
		clearInterval(pollTimer);
		pollTimer = null;
	}
	onRemoteChange = null;
	knownEtag = null;
}

// ── UI preferences (prefs.json) ────────────────────────────────────────────

const PREFS_FILE_NAME = 'prefs.json';

/** Cached file ID for prefs.json */
let prefsFileId = null;
/** Debounce timer for prefs upload */
let prefsUploadTimer = null;
const PREFS_DEBOUNCE_MS = 1500;

/**
 * @typedef {{ minScore: number, activeAreas: string[], activeTopics: string[], showDone: boolean }} UIPrefs
 */

/**
 * Loads prefs.json from Box.
 * Returns null if no preferences have been saved yet.
 * @returns {Promise<UIPrefs | null>}
 */
export async function loadPrefs() {
	try {
		const folder = await getOrCreateFolder();
		const res = await boxFetch(
			`${BOX_API}/folders/${folder}/items?fields=id,name,type&limit=100`
		);
		if (!res.ok) return null;
		const data = await res.json();
		const file = data.entries?.find((e) => e.type === 'file' && e.name === PREFS_FILE_NAME);
		if (!file) return null;
		prefsFileId = file.id;

		const content = await boxFetch(`${BOX_API}/files/${file.id}/content`);
		if (!content.ok) return null;
		return /** @type {UIPrefs} */ (await content.json());
	} catch {
		return null;
	}
}

/**
 * Saves the UI preferences as prefs.json to Box.
 * @param {UIPrefs} prefs
 * @returns {Promise<void>}
 */
export async function savePrefs(prefs) {
	try {
		const folder = await getOrCreateFolder();
		const body = JSON.stringify(prefs, null, 2);
		const formData = new FormData();
		formData.append(
			'attributes',
			JSON.stringify(
				prefsFileId
					? { name: PREFS_FILE_NAME }
					: { name: PREFS_FILE_NAME, parent: { id: folder } }
			)
		);
		formData.append('file', new Blob([body], { type: 'application/json' }), PREFS_FILE_NAME);
		const url = prefsFileId
			? `https://upload.box.com/api/2.0/files/${prefsFileId}/content`
			: `https://upload.box.com/api/2.0/files/content`;
		const res = await boxFetch(url, { method: 'POST', body: formData });
		if (res.ok) {
			const result = await res.json();
			prefsFileId = result.entries?.[0]?.id ?? prefsFileId;
		}
	} catch (err) {
		console.warn('[Box] Prefs save failed:', err);
	}
}

/**
 * Schedules a debounced prefs upload.
 * @param {UIPrefs} prefs
 */
export function schedulePrefs(prefs) {
	if (prefsUploadTimer) clearTimeout(prefsUploadTimer);
	prefsUploadTimer = setTimeout(() => savePrefs(prefs), PREFS_DEBOUNCE_MS);
}
