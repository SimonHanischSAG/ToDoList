/**
 * Box Content API – Storage-Anbindung
 *
 * Alle Todos werden als einzelne JSON-Datei im Box-Account des Nutzers gespeichert:
 *   /IBMTodo/todos.json
 *
 * Lesezugriffe gehen gegen den lokalen IndexedDB-Cache (Dexie).
 * Schreibzugriffe werden sofort lokal angewendet und debounced nach Box synchronisiert.
 */

import { getToken } from '../auth/box.js';
import { db } from './db.js';

const BOX_API = 'https://api.box.com/2.0';
const FOLDER_NAME = 'IBMTodo';
const FILE_NAME   = 'todos.json';

// Debounce-Timer für den Upload
let uploadTimer = null;
const UPLOAD_DEBOUNCE_MS = 2000;

// gecachte IDs um wiederholte Folder-Lookups zu vermeiden
let folderId = null;
let fileId   = null;

// ── Box API Helpers ────────────────────────────────────────────────────────

/**
 * Führt einen authentifizierten Box-API-Request aus.
 * @param {string} url
 * @param {RequestInit} options
 * @returns {Promise<Response>}
 */
async function boxFetch(url, options = {}) {
	const token = getToken();
	if (!token) throw new Error('Nicht eingeloggt');
	return fetch(url, {
		...options,
		headers: {
			Authorization: `Bearer ${token}`,
			...(options.headers ?? {})
		}
	});
}

/**
 * Sucht oder erstellt den IBMTodo-Ordner im Root des Nutzers.
 * @returns {Promise<string>} Folder ID
 */
async function getOrCreateFolder() {
	if (folderId) return folderId;

	// Root-Inhalt abrufen und nach IBMTodo-Ordner suchen
	const res = await boxFetch(
		`${BOX_API}/folders/0/items?fields=id,name,type&limit=100`
	);
	if (!res.ok) throw new Error(`Box API Fehler: ${res.status} – ${await res.text()}`);
	const data = await res.json();

	const existing = data.entries?.find(
		(e) => e.type === 'folder' && e.name === FOLDER_NAME
	);

	if (existing) {
		folderId = existing.id;
		return folderId;
	}

	// Ordner neu anlegen
	const createRes = await boxFetch(`${BOX_API}/folders`, {
		method:  'POST',
		headers: { 'Content-Type': 'application/json' },
		body:    JSON.stringify({ name: FOLDER_NAME, parent: { id: '0' } })
	});
	if (!createRes.ok) throw new Error(`Box Ordner-Erstellung fehlgeschlagen: ${createRes.status}`);
	const folder = await createRes.json();
	folderId = folder.id;
	return folderId;
}

/**
 * Sucht die todos.json im IBMTodo-Ordner.
 * @returns {Promise<string | null>} File ID oder null wenn nicht vorhanden
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

// ── Öffentliche API ────────────────────────────────────────────────────────

/**
 * Lädt todos.json aus Box und schreibt alles in den lokalen Cache.
 * @returns {Promise<void>}
 */
export async function syncFromBox() {
	const id = await findFile();

	if (!id) {
		// Datei existiert noch nicht → leere Liste
		await db.tasks.clear();
		return;
	}

	const res = await boxFetch(`${BOX_API}/files/${id}/content`);
	if (!res.ok) throw new Error(`Box Download Fehler: ${res.status}`);

	/** @type {import('../model/task.js').Task[]} */
	const tasks = await res.json();
	await db.tasks.clear();
	await db.tasks.bulkPut(tasks);
}

/**
 * Schreibt den aktuellen lokalen Cache als todos.json nach Box.
 * @returns {Promise<void>}
 */
export async function pushToBox() {
	const tasks  = await db.tasks.toArray();
	const body   = JSON.stringify(tasks, null, 2);
	const folder = await getOrCreateFolder();
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

	// Neue Datei anlegen oder bestehende überschreiben
	const url = id
		? `https://upload.box.com/api/2.0/files/${id}/content`
		: `https://upload.box.com/api/2.0/files/content`;

	const res = await boxFetch(url, { method: 'POST', body: formData });

	if (!res.ok) throw new Error(`Box Upload Fehler: ${res.status} ${await res.text()}`);

	// File ID aus der Antwort cachen
	const result = await res.json();
	fileId = result.entries?.[0]?.id ?? fileId;
}

/**
 * Plant einen debounced Upload nach Box.
 */
export function schedulePush() {
	if (uploadTimer) clearTimeout(uploadTimer);
	uploadTimer = setTimeout(async () => {
		try {
			await pushToBox();
		} catch (err) {
			console.error('[Box] Push fehlgeschlagen:', err);
			await db.syncQueue.add({ timestamp: new Date().toISOString(), error: String(err) });
		}
	}, UPLOAD_DEBOUNCE_MS);
}

/**
 * Versucht ausstehende Sync-Queue-Einträge zu verarbeiten.
 */
export async function retryFailedSyncs() {
	const pending = await db.syncQueue.toArray();
	if (pending.length === 0) return;
	try {
		await pushToBox();
		await db.syncQueue.clear();
	} catch {
		// Noch offline
	}
}
