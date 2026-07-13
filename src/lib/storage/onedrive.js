/**
 * OneDrive-Anbindung via Microsoft Graph API
 *
 * Alle Todos werden als einzelne JSON-Datei im OneDrive des Nutzers gespeichert:
 *   /Apps/IBMTodo/todos.json
 *
 * Lesezugriffe gehen gegen den lokalen IndexedDB-Cache (Dexie).
 * Schreibzugriffe werden sofort lokal angewendet und debounced nach OneDrive synchronisiert.
 */

import { getGraphToken } from '../auth/msal.js';
import { db } from './db.js';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const TODO_FILE_PATH = '/me/drive/root:/Apps/IBMTodo/todos.json:/content';

// Debounce-Timer für den Upload
let uploadTimer = null;
const UPLOAD_DEBOUNCE_MS = 2000;

// ── Microsoft Graph Helpers ────────────────────────────────────────────────

/**
 * Führt einen authentifizierten Graph-Request aus.
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

// ── Öffentliche API ────────────────────────────────────────────────────────

/**
 * Lädt todos.json aus OneDrive und schreibt alles in den lokalen Cache.
 * @returns {Promise<void>}
 */
export async function syncFromOneDrive() {
	const res = await graphFetch(`${GRAPH_BASE}${TODO_FILE_PATH}`);

	if (res.status === 404) {
		// Datei existiert noch nicht → leere Liste initialisieren
		await db.tasks.clear();
		return;
	}

	if (!res.ok) throw new Error(`Graph API Fehler: ${res.status} ${res.statusText}`);

	/** @type {import('../model/task.js').Task[]} */
	const tasks = await res.json();
	await db.tasks.clear();
	await db.tasks.bulkPut(tasks);
}

/**
 * Schreibt den aktuellen lokalen Cache als todos.json nach OneDrive.
 * Wird intern mit Debounce aufgerufen.
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

	if (!res.ok) throw new Error(`Graph Upload Fehler: ${res.status} ${res.statusText}`);
}

/**
 * Plant einen debounced Upload nach OneDrive.
 * Verhindert zu viele API-Calls bei schnellen Aufeinanderfolgen von Änderungen.
 */
export function schedulePush() {
	if (uploadTimer) clearTimeout(uploadTimer);
	uploadTimer = setTimeout(async () => {
		try {
			await pushToOneDrive();
		} catch (err) {
			console.error('[OneDrive] Push fehlgeschlagen:', err);
			// Fehler in Sync-Queue schreiben für späteren Retry
			await db.syncQueue.add({ timestamp: new Date().toISOString(), error: String(err) });
		}
	}, UPLOAD_DEBOUNCE_MS);
}

/**
 * Versucht alle ausstehenden Sync-Queue-Einträge zu verarbeiten.
 * Wird beim App-Start und bei "online"-Event aufgerufen.
 */
export async function retryFailedSyncs() {
	const pending = await db.syncQueue.toArray();
	if (pending.length === 0) return;

	try {
		await pushToOneDrive();
		await db.syncQueue.clear();
	} catch {
		// Noch offline – wird beim nächsten Start erneut versucht
	}
}
