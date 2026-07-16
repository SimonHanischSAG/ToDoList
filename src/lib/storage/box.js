/**
 * Box Content API – Storage-Anbindung
 *
 * Alle Todos werden als einzelne JSON-Datei im Box-Account des Nutzers gespeichert:
 *   /IBMTodo/todos.json
 *
 * Lesezugriffe gehen gegen den lokalen IndexedDB-Cache (Dexie).
 * Schreibzugriffe werden sofort lokal angewendet und debounced nach Box synchronisiert.
 */

import { getToken, logout, refreshToken } from '../auth/box.js';
import { db } from './db.js';

const BOX_API = 'https://api.box.com/2.0';
const FOLDER_NAME   = 'IBMTodoStorage';
const FILE_NAME     = 'todos.json';
const README_NAME   = 'README.txt';
const README_CONTENT = `IBMTodoStorage – Datenordner der IBM Todo App
==============================================

Dieser Ordner wird automatisch von der IBM Todo App angelegt und verwaltet:
https://simonhanischsag.github.io/ToDoList/

Inhalt
------
todos.json   Alle deine Aufgaben als JSON-Datei (UTF-8)
README.txt   Diese Datei

Was passiert, wenn du diesen Ordner oder todos.json löschst?
-------------------------------------------------------------
- Beim nächsten App-Start werden ALLE Aufgaben unwiderruflich gelöscht.
- Die App legt den Ordner und eine leere todos.json neu an.
- Ein Wiederherstellen ist nur möglich, wenn du vorher ein Backup
  (Export als JSON über die App) angelegt hast.

Backup / Restore
----------------
In der App (oben rechts) gibt es Export- und Import-Schaltflächen.
Damit kannst du ein lokales Backup als JSON-Datei erstellen und
bei Bedarf wiederherstellen.

Bitte diesen Ordner NICHT umbenennen oder verschieben.
`;

// Debounce-Timer für den Upload
let uploadTimer = null;
const UPLOAD_DEBOUNCE_MS = 2000;

// gecachte IDs um wiederholte Folder-Lookups zu vermeiden
let folderId   = null;
let fileId     = null;
let readmeId   = null;

// ── Box API Helpers ────────────────────────────────────────────────────────

/**
 * Führt einen authentifizierten Box-API-Request aus.
 * @param {string} url
 * @param {RequestInit} options
 * @returns {Promise<Response>}
 */
async function boxFetch(url, options = {}, _retry = true) {
	const token = getToken();
	if (!token) throw new Error('Nicht eingeloggt');
	const res = await fetch(url, {
		...options,
		headers: {
			Authorization: `Bearer ${token}`,
			...(options.headers ?? {})
		}
	});
	// 401 → Token abgelaufen: einmal still refreshen, dann nochmal versuchen
	if (res.status === 401 && _retry) {
		const ok = await refreshToken();
		if (ok) return boxFetch(url, options, false); // einmaliger Retry mit neuem Token
		logout();
		throw new Error('SESSION_EXPIRED');
	}
	return res;
}

/**
 * Sucht oder erstellt den IBMTodoStorage-Ordner im Root des Nutzers.
 * @returns {Promise<string>} Folder ID
 */
async function getOrCreateFolder() {
	if (folderId) return folderId;

	// Root-Inhalt abrufen und nach IBMTodoStorage-Ordner suchen
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
 * Legt README.txt im Ordner an, falls sie noch nicht existiert.
 * @param {string} folder Folder ID
 */
async function ensureReadme(folder) {
	if (readmeId) return;

	// Ordnerinhalt prüfen
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

	// README hochladen
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
