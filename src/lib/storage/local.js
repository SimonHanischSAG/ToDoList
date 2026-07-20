/**
 * Local storage adapter (localStorage + IndexedDB)
 *
 * Fallback when Box is not yet available.
 * Data stays local in the browser – no cloud sync.
 *
 * To switch to Box later: change the import in taskStore.svelte.js
 * from './local.js' to './box.js'.
 */

import { db } from './db.js';

const STORAGE_KEY = 'ibmtodo_local';

// Debounce timer
let uploadTimer = null;
const DEBOUNCE_MS = 500;

// ── Public API (same signature as box.js) ─────────────────────────────────

/**
 * Loads tasks from localStorage into IndexedDB.
 * @returns {Promise<void>}
 */
export async function syncFromLocal() {
	const raw = localStorage.getItem(STORAGE_KEY);
	if (!raw) return;

	try {
		/** @type {import('../model/task.js').Task[]} */
		const tasks = JSON.parse(raw);
		await db.tasks.clear();
		await db.tasks.bulkPut(tasks);
	} catch (err) {
		console.error('[LocalStorage] Load failed:', err);
	}
}

/**
 * Writes the current IndexedDB cache to localStorage.
 * @returns {Promise<void>}
 */
export async function pushToLocal() {
	const tasks = await db.tasks.toArray();
	localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

/**
 * Schedules a debounced write to localStorage.
 */
export function schedulePush() {
	if (uploadTimer) clearTimeout(uploadTimer);
	uploadTimer = setTimeout(async () => {
		try {
			await pushToLocal();
		} catch (err) {
			console.error('[LocalStorage] Write failed:', err);
		}
	}, DEBOUNCE_MS);
}

/**
 * No retry needed for local storage – stub for API compatibility with box.js.
 */
export async function retryFailedSyncs() {
	// nothing to do
}

/**
 * Exports all tasks as a JSON file (download).
 * Useful for transferring data between devices.
 */
export async function exportToFile() {
	const tasks = await db.tasks.toArray();
	const blob = new Blob([JSON.stringify(tasks, null, 2)], { type: 'application/json' });
	const url  = URL.createObjectURL(blob);
	const a    = document.createElement('a');
	a.href     = url;
	a.download = `ibmtodo-export-${new Date().toISOString().slice(0, 10)}.json`;
	a.click();
	URL.revokeObjectURL(url);
}

/**
 * Imports tasks from a JSON file.
 * @param {File} file
 * @returns {Promise<number>} Number of imported tasks
 */
export async function importFromFile(file) {
	const text = await file.text();
	const tasks = JSON.parse(text);
	await db.tasks.bulkPut(tasks);
	await pushToLocal();
	return tasks.length;
}
