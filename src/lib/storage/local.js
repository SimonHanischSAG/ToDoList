/**
 * Lokaler Storage-Adapter (localStorage + IndexedDB)
 *
 * Fallback wenn Box noch nicht freigeschaltet ist.
 * Daten bleiben lokal im Browser – kein Cloud-Sync.
 *
 * Um später auf Box zu wechseln: in taskStore.svelte.js einfach
 * den Import von './local.js' auf './box.js' ändern.
 */

import { db } from './db.js';

const STORAGE_KEY = 'ibmtodo_local';

// Debounce-Timer
let uploadTimer = null;
const DEBOUNCE_MS = 500;

// ── Öffentliche API (gleiche Signatur wie box.js) ──────────────────────────

/**
 * Lädt Tasks aus localStorage in IndexedDB.
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
		console.error('[LocalStorage] Laden fehlgeschlagen:', err);
	}
}

/**
 * Schreibt den aktuellen IndexedDB-Cache in localStorage.
 * @returns {Promise<void>}
 */
export async function pushToLocal() {
	const tasks = await db.tasks.toArray();
	localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

/**
 * Plant einen debounced Schreibvorgang in localStorage.
 */
export function schedulePush() {
	if (uploadTimer) clearTimeout(uploadTimer);
	uploadTimer = setTimeout(async () => {
		try {
			await pushToLocal();
		} catch (err) {
			console.error('[LocalStorage] Schreiben fehlgeschlagen:', err);
		}
	}, DEBOUNCE_MS);
}

/**
 * Kein Retry nötig bei lokalem Storage – Stub für API-Kompatibilität mit box.js.
 */
export async function retryFailedSyncs() {
	// nichts zu tun
}

/**
 * Exportiert alle Tasks als JSON-Datei (Download).
 * Nützlich um Daten zwischen Geräten zu übertragen.
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
 * Importiert Tasks aus einer JSON-Datei.
 * @param {File} file
 * @returns {Promise<number>} Anzahl importierter Tasks
 */
export async function importFromFile(file) {
	const text = await file.text();
	const tasks = JSON.parse(text);
	await db.tasks.bulkPut(tasks);
	await pushToLocal();
	return tasks.length;
}
