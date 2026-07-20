/**
 * OneDrive integration via Microsoft Graph API
 *
 * All todos are stored as a single JSON file in the user's OneDrive:
 *   /Apps/IBMTodo/todos.json
 *
 * Reads go against the local IndexedDB cache (Dexie).
 * Writes are applied locally immediately and synced to OneDrive with debounce.
 */

import { getGraphToken } from '../auth/msal.js';
import { db } from './db.js';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const TODO_FILE_PATH = '/me/drive/root:/Apps/IBMTodo/todos.json:/content';

// Debounce timer for uploads
let uploadTimer = null;
const UPLOAD_DEBOUNCE_MS = 2000;

// ── Microsoft Graph Helpers ────────────────────────────────────────────────

/**
 * Performs an authenticated Graph request.
 * @param {string} url
 * @param {RequestInit} options
 * @returns {Promise<Response>}
 */
async function graphFetch(url, options = {}) {
	const token = await getGraphToken();
	return fetch(url, {
		...options,
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
			...(options.headers ?? {})
		}
	});
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Loads todos.json from OneDrive and writes everything to the local cache.
 * @returns {Promise<void>}
 */
export async function syncFromOneDrive() {
	const res = await graphFetch(`${GRAPH_BASE}${TODO_FILE_PATH}`);

	if (res.status === 404) {
		// File does not exist yet → initialise with empty list
		await db.tasks.clear();
		return;
	}

	if (!res.ok) throw new Error(`Graph API error: ${res.status} ${res.statusText}`);

	/** @type {import('../model/task.js').Task[]} */
	const tasks = await res.json();
	await db.tasks.clear();
	await db.tasks.bulkPut(tasks);
}

/**
 * Writes the current local cache as todos.json to OneDrive.
 * Called internally with debounce.
 * @returns {Promise<void>}
 */
export async function pushToOneDrive() {
	const tasks = await db.tasks.toArray();
	const body = JSON.stringify(tasks, null, 2);

	const res = await graphFetch(`${GRAPH_BASE}${TODO_FILE_PATH}`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/octet-stream' },
		body
	});

	if (!res.ok) throw new Error(`Graph upload error: ${res.status} ${res.statusText}`);
}

/**
 * Schedules a debounced upload to OneDrive.
 * Prevents excessive API calls on rapid consecutive changes.
 */
export function schedulePush() {
	if (uploadTimer) clearTimeout(uploadTimer);
	uploadTimer = setTimeout(async () => {
		try {
			await pushToOneDrive();
		} catch (err) {
			console.error('[OneDrive] Push failed:', err);
			// Write error to sync queue for later retry
			await db.syncQueue.add({ timestamp: new Date().toISOString(), error: String(err) });
		}
	}, UPLOAD_DEBOUNCE_MS);
}

/**
 * Attempts to process all pending sync queue entries.
 * Called on app start and on the "online" event.
 */
export async function retryFailedSyncs() {
	const pending = await db.syncQueue.toArray();
	if (pending.length === 0) return;

	try {
		await pushToOneDrive();
		await db.syncQueue.clear();
	} catch {
		// Still offline – will be retried on next start
	}
}
