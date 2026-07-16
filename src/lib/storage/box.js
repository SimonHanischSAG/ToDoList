/**
 * Box Content API – Storage-Anbindung
 *
 * Alle Todos werden als einzelne JSON-Datei im Box-Account des Nutzers gespeichert:
 *   /IBMTodoStorage/todos.json
 *
 * Lesezugriffe gehen gegen den lokalen IndexedDB-Cache (Dexie).
 * Schreibzugriffe werden sofort lokal angewendet und debounced nach Box synchronisiert.
 *
 * Concurrent-Safety (Optimistic Locking):
 *   - Jede Dateiversion hat einen ETag (SHA-1 der Datei in Box).
 *   - Beim Upload prüfen wir per If-Match, ob sich die Datei zwischenzeitlich geändert hat.
 *   - Tritt ein 412-Konflikt auf, laden wir zuerst den Remote-Stand, mergen lokal und
 *     versuchen es erneut (max. 3 Versuche).
 *   - startPolling() prüft alle 30 Sekunden den ETag-Header (HEAD-Request, kein Download)
 *     und lädt nur dann neu, wenn sich die Datei geändert hat.
 */

import { getToken, logout, refreshToken } from '../auth/box.js';
import { db } from './db.js';

const BOX_API = 'https://api.box.com/2.0';
const FOLDER_NAME    = 'IBMTodoStorage';
const FILE_NAME      = 'todos.json';
const README_NAME    = 'README.txt';
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

// ── Interne Zustandsvariablen ──────────────────────────────────────────────

/** Debounce-Timer für den Upload */
let uploadTimer = null;
const UPLOAD_DEBOUNCE_MS = 2000;

/** Gecachte IDs um wiederholte Folder-Lookups zu vermeiden */
let folderId = null;
let fileId   = null;
let readmeId = null;

/**
 * Letzter bekannter ETag der todos.json in Box.
 * Wird nach jedem erfolgreichen Download oder Upload aktualisiert.
 * Dient als Optimistic-Lock: Wir senden If-Match beim Upload.
 * @type {string | null}
 */
let knownEtag = null;

/** Polling-Interval-Handle */
let pollTimer = null;
const POLL_INTERVAL_MS = 30_000; // 30 Sekunden

/**
 * Callback der aufgerufen wird, wenn Polling eine Remote-Änderung entdeckt hat
 * und die lokalen Daten neu geladen wurden.
 * @type {(() => void) | null}
 */
let onRemoteChange = null;

// ── Box API Helpers ────────────────────────────────────────────────────────

/**
 * Führt einen authentifizierten Box-API-Request aus.
 * Bei 401 (abgelaufener Token) wird einmalig still refresht.
 * @param {string} url
 * @param {RequestInit} options
 * @param {boolean} _retry
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
	if (res.status === 401 && _retry) {
		const ok = await refreshToken();
		if (ok) return boxFetch(url, options, false);
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
 * Sucht die todos.json im IBMTodo-Ordner.
 * Gibt null zurück wenn sie nicht existiert.
 * @returns {Promise<string | null>} File ID oder null
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
 * Speichert den ETag der Datei für späteres Optimistic Locking.
 * @returns {Promise<void>}
 */
export async function syncFromBox() {
	const id = await findFile();

	if (!id) {
		await db.tasks.clear();
		return;
	}

	const res = await boxFetch(`${BOX_API}/files/${id}/content`);
	if (!res.ok) throw new Error(`Box Download Fehler: ${res.status}`);

	// ETag merken (Box liefert ihn im Content-Response-Header)
	knownEtag = res.headers.get('etag') ?? knownEtag;

	/** @type {import('../model/task.js').Task[]} */
	const tasks = await res.json();
	await db.tasks.clear();
	await db.tasks.bulkPut(tasks);
}

/**
 * Liest den aktuellen ETag der todos.json per HEAD-Request (ohne Body-Download).
 * Gibt null zurück wenn kein ETag verfügbar oder Datei nicht existiert.
 * @returns {Promise<string | null>}
 */
async function fetchRemoteEtag() {
	const id = await findFile();
	if (!id) return null;
	try {
		// Box liefert bei HEAD kein ETag im Standard-Header; stattdessen nutzen wir
		// den Datei-Metadaten-Endpunkt (sequence_id ändert sich bei jeder Version).
		const res = await boxFetch(`${BOX_API}/files/${id}?fields=id,etag,sequence_id`);
		if (!res.ok) return null;
		const data = await res.json();
		return data.etag ?? null;
	} catch {
		return null;
	}
}

/**
 * Merged Remote-Tasks und lokale Tasks nach „last-writer-wins" basierend auf updatedAt.
 * Neue Remote-Tasks (nicht lokal vorhanden) werden hinzugefügt.
 * @param {import('../model/task.js').Task[]} remote
 * @param {import('../model/task.js').Task[]} local
 * @returns {import('../model/task.js').Task[]}
 */
function mergeTasks(remote, local) {
	const byId = new Map(local.map(t => [t.id, t]));
	for (const rt of remote) {
		const lt = byId.get(rt.id);
		if (!lt) {
			// Remote-only → übernehmen
			byId.set(rt.id, rt);
		} else {
			// Beide vorhanden → neueren Stand gewinnt
			const remoteTs = new Date(rt.updatedAt ?? 0).getTime();
			const localTs  = new Date(lt.updatedAt ?? 0).getTime();
			if (remoteTs > localTs) byId.set(rt.id, rt);
		}
	}
	return Array.from(byId.values());
}

/**
 * Schreibt den aktuellen lokalen Cache als todos.json nach Box.
 * Nutzt Optimistic Locking (If-Match mit bekanntem ETag).
 * Bei 412-Konflikt: Remote laden, mergen, nochmal versuchen (max. 3 Versuche).
 * @param {number} attempt
 * @returns {Promise<void>}
 */
export async function pushToBox(attempt = 0) {
	if (attempt > 2) throw new Error('Box Sync: Zu viele Konflikte – Upload abgebrochen');

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
	// If-Match nur beim Update einer bestehenden Datei setzen
	if (id && knownEtag) {
		extraHeaders['If-Match'] = knownEtag;
	}

	const res = await boxFetch(url, {
		method: 'POST',
		body: formData,
		headers: extraHeaders
	});

	// 412 Precondition Failed → Datei wurde von einem anderen Gerät geändert
	if (res.status === 412) {
		console.warn('[Box] Schreib-Konflikt (412) – lade Remote, merge, retry …');
		// Remote-Stand herunterladen
		const remoteRes = await boxFetch(`${BOX_API}/files/${id}/content`);
		if (remoteRes.ok) {
			knownEtag = remoteRes.headers.get('etag') ?? knownEtag;
			const remote = /** @type {import('../model/task.js').Task[]} */ (await remoteRes.json());
			const merged = mergeTasks(remote, local);
			// Merge lokal speichern
			await db.tasks.clear();
			await db.tasks.bulkPut(merged);
		}
		// Erneut versuchen mit erneutem Datei-ID-Lookup (etag hat sich geändert)
		fileId = null; // Cache leeren damit findFile() die neue Version findet
		return pushToBox(attempt + 1);
	}

	if (!res.ok) throw new Error(`Box Upload Fehler: ${res.status} ${await res.text()}`);

	// Neuen ETag aus der Antwort merken
	const result = await res.json();
	fileId    = result.entries?.[0]?.id    ?? fileId;
	knownEtag = result.entries?.[0]?.etag  ?? knownEtag;
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

/**
 * Startet das automatische Polling auf Remote-Änderungen.
 * Alle 30 Sekunden wird der ETag geprüft. Hat er sich geändert, werden
 * die Daten neu geladen und `callback` aufgerufen.
 *
 * @param {() => void} callback  Wird aufgerufen nachdem neue Remote-Daten geladen wurden
 */
export function startPolling(callback) {
	onRemoteChange = callback;
	if (pollTimer) return; // bereits aktiv

	pollTimer = setInterval(async () => {
		if (!getToken()) return; // Nicht eingeloggt
		try {
			const remoteEtag = await fetchRemoteEtag();
			if (remoteEtag === null) return;
			if (knownEtag !== null && remoteEtag === knownEtag) return; // keine Änderung

			console.info('[Box] Remote-Änderung erkannt – lade neu …');
			await syncFromBox();
			knownEtag = remoteEtag;
			onRemoteChange?.();
		} catch (err) {
			// Netzwerk-Fehler beim Polling → ignorieren, nächster Versuch in 30s
			console.warn('[Box] Polling-Fehler:', err);
		}
	}, POLL_INTERVAL_MS);
}

/**
 * Stoppt das Polling (z.B. beim Logout).
 */
export function stopPolling() {
	if (pollTimer) {
		clearInterval(pollTimer);
		pollTimer = null;
	}
	onRemoteChange = null;
	knownEtag = null;
}
