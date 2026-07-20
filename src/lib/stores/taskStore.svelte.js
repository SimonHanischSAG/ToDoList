/**
 * Reaktiver Task-Store (Svelte 5 Runes)
 * Storage-Backend: Box statt OneDrive
 */

import { db } from '../storage/db.js';
import { schedulePush, syncFromStorage, retryFailedSyncs, startPolling, stopPolling, loadPrefs, schedulePrefs } from '../storage/index.js';
import { getToken, login as boxLogin } from '../auth/box.js';
import { rankTasks, getFocusTasks, getAreas, getTopics } from '../engine/priority.js';
import { createTask, normalizeTask } from '../model/task.js';

// ── State (Svelte 5 Runes) ─────────────────────────────────────────────────
let _tasks = $state(/** @type {import('../model/task.js').Task[]} */ ([]));
let _activeAreas = $state(/** @type {string[]} */ ([]));
let _activeTopics = $state(/** @type {string[]} */ ([]));
let _minScore = $state(0);
let _searchQuery = $state('');
let _showDone = $state(false);
let _loading = $state(false);
let _syncing = $state(false);
let _error = $state(/** @type {string | null} */ (null));
let _sessionExpired = $state(false);
/** Zeitstempel des letzten erfolgreichen Remote-Syncs (für UI-Indikator) */
let _lastSync = $state(/** @type {string | null} */ (null));

// ── Derived State ──────────────────────────────────────────────────────────
export const tasks = {
	get all() { return _tasks; },
	get ranked() { return rankTasks(_tasks); },
	get focus() { return getFocusTasks(_tasks, { area: _activeAreas[0] ?? '' }); },
	get areas()  { return getAreas(_tasks); },
	get topics() { return getTopics(_tasks); },

	/** @returns {string[]} */
	get activeAreas() { return _activeAreas; },
	/** @param {string[]} v */
	set activeAreas(v) {
		_activeAreas = v;
		// Aktive Topics bereinigen
		const visibleTopicSet = new Set(
			_tasks
				.filter(t => t.status === 'open' && (v.length === 0 || v.includes(t.area)) && t.topic)
				.map(t => t.topic)
		);
		_activeTopics = _activeTopics.filter(tp => visibleTopicSet.has(tp));
		_savePrefs();
	},

	/** Einzelne Area togglen (Mehrfachauswahl); Topics zurücksetzen wenn sie in neuer Auswahl nicht mehr existieren */
	toggleArea(area) {
		if (_activeAreas.includes(area)) {
			_activeAreas = _activeAreas.filter(a => a !== area);
		} else {
			_activeAreas = [..._activeAreas, area];
		}
		// Aktive Topics bereinigen: nur Topics behalten, die noch sichtbar sind
		const visibleTopicSet = new Set(
			_tasks
				.filter(t => t.status === 'open' && (_activeAreas.length === 0 || _activeAreas.includes(t.area)) && t.topic)
				.map(t => t.topic)
		);
		_activeTopics = _activeTopics.filter(tp => visibleTopicSet.has(tp));
		_savePrefs();
	},

	/** @returns {string[]} */
	get activeTopics() { return _activeTopics; },
	/** @param {string[]} v */
	set activeTopics(v) { _activeTopics = v; _savePrefs(); },

	/** Einzelnes Topic togglen (Mehrfachauswahl) */
	toggleTopic(topic) {
		if (_activeTopics.includes(topic)) {
			_activeTopics = _activeTopics.filter(t => t !== topic);
		} else {
			_activeTopics = [..._activeTopics, topic];
		}
		_savePrefs();
	},

	/** Score-Mindestgrenze für den Slider-Filter (0 = alles anzeigen) */
	get minScore() { return _minScore; },
	set minScore(v) { _minScore = v; _savePrefs(); },

	get searchQuery() { return _searchQuery; },
	set searchQuery(v) { _searchQuery = v; },
	get showDone() { return _showDone; },
	set showDone(v) { _showDone = v; _savePrefs(); },
	get loading() { return _loading; },
	get syncing() { return _syncing; },
	get error() { return _error; },
	get sessionExpired() { return _sessionExpired; },
	/** Löst direkt einen neuen Box-Login aus (bei abgelaufener Sitzung). */
	reLogin() { boxLogin(); },
	get lastSync() { return _lastSync; },

	get filtered() {
		let result = _tasks.filter(t => t.status === 'open');
		if (_activeAreas.length > 0) result = result.filter(t => _activeAreas.includes(t.area));
		if (_activeTopics.length > 0) result = result.filter(t => _activeTopics.includes(t.topic));
		if (_minScore > 0) result = result.filter(t => t.score >= _minScore);
		if (_searchQuery.trim()) {
			const q = _searchQuery.toLowerCase();
			result = result.filter(t =>
				t.title.toLowerCase().includes(q) ||
				t.description.toLowerCase().includes(q) ||
				t.area.toLowerCase().includes(q) ||
				(t.topic ?? '').toLowerCase().includes(q) ||
				t.tags.some(tag => tag.toLowerCase().includes(q))
			);
		}
		return rankTasks(result);
	},

	get filteredDone() {
		let result = _tasks.filter(t => t.status === 'done');
		if (_activeAreas.length > 0) result = result.filter(t => _activeAreas.includes(t.area));
		if (_activeTopics.length > 0) result = result.filter(t => _activeTopics.includes(t.topic));
		if (_searchQuery.trim()) {
			const q = _searchQuery.toLowerCase();
			result = result.filter(t =>
				t.title.toLowerCase().includes(q) ||
				t.description.toLowerCase().includes(q) ||
				t.area.toLowerCase().includes(q) ||
				(t.topic ?? '').toLowerCase().includes(q) ||
				t.tags.some(tag => tag.toLowerCase().includes(q))
			);
		}
		return rankTasks(result);
	},

	get countByArea() {
		/** @type {Record<string, number>} */
		const counts = {};
		for (const t of _tasks.filter(t => t.status === 'open')) {
			const key = t.area || '(kein Bereich)';
			counts[key] = (counts[key] ?? 0) + 1;
		}
		return counts;
	},

	get countByTopic() {
		/** @type {Record<string, number>} */
		const counts = {};
		for (const t of _tasks.filter(t => t.status === 'open' && t.topic)) {
			counts[t.topic] = (counts[t.topic] ?? 0) + 1;
		}
		return counts;
	},

	/**
	 * Tasks die für die Topic-Filterzeile relevant sind:
	 * open + aktive Areas + aktiver Suchbegriff (ohne Topic-Filter selbst).
	 */
	get _topicBase() {
		let result = _tasks.filter(t => t.status === 'open');
		if (_activeAreas.length > 0) result = result.filter(t => _activeAreas.includes(t.area));
		if (_searchQuery.trim()) {
			const q = _searchQuery.toLowerCase();
			result = result.filter(t =>
				t.title.toLowerCase().includes(q) ||
				t.description.toLowerCase().includes(q) ||
				t.area.toLowerCase().includes(q) ||
				(t.topic ?? '').toLowerCase().includes(q) ||
				t.tags.some(tag => tag.toLowerCase().includes(q))
			);
		}
		return result;
	},

	/** Topics die nach Area- und Suche-Filter noch existieren (alphabetisch sortiert) */
	get visibleTopics() {
		const set = new Set(this._topicBase.filter(t => t.topic).map(t => t.topic));
		return [...set].sort();
	},

	/** Alle einzigartigen Tags über alle Tasks (alphabetisch sortiert) */
	get allTags() {
		const set = new Set(_tasks.flatMap(t => t.tags ?? []));
		return [...set].sort();
	},

	/** Zählung der Topics, beschränkt auf gefilterte Basis-Tasks */
	get countByTopicFiltered() {
		/** @type {Record<string, number>} */
		const counts = {};
		for (const t of this._topicBase.filter(t => t.topic)) {
			counts[t.topic] = (counts[t.topic] ?? 0) + 1;
		}
		return counts;
	}
};

// ── Aktionen ───────────────────────────────────────────────────────────────

/**
 * Interne Hilfsfunktion: speichert die aktuellen UI-Einstellungen debounced nach Box.
 * Wird nur aufgerufen wenn ein Token vorhanden ist (= eingeloggt).
 */
function _savePrefs() {
	if (!getToken()) return;
	schedulePrefs({
		minScore:     _minScore,
		activeAreas:  _activeAreas,
		activeTopics: _activeTopics,
		showDone:     _showDone
	});
}

export async function loadTasks() {
	_loading = true;
	_error = null;
	_sessionExpired = false;
	try {
		const rows = await db.tasks.toArray();
		_tasks = rankTasks(rows);
	} catch (err) {
		_error = `Load error: ${err}`;
	} finally {
		_loading = false;
	}
}

export async function initialSync() {
	// Ohne Token keinen Sync versuchen – Nutzer muss sich erst einloggen
	if (!getToken()) return;

	_syncing = true;
	_error = null;
	_sessionExpired = false;
	try {
		await retryFailedSyncs();
		// Prefs und Tasks parallel laden
		const [prefs] = await Promise.all([loadPrefs(), syncFromStorage()]);
		// Gespeicherte UI-Einstellungen anwenden (nur wenn Wert sinnvoll ist)
		if (prefs) {
			if (typeof prefs.minScore === 'number')       _minScore     = prefs.minScore;
			if (Array.isArray(prefs.activeAreas))         _activeAreas  = prefs.activeAreas;
			if (Array.isArray(prefs.activeTopics))        _activeTopics = prefs.activeTopics;
			if (typeof prefs.showDone === 'boolean')      _showDone     = prefs.showDone;
		}
		await loadTasks();
		_lastSync = new Date().toISOString();
		// Polling starten: alle 30s auf Remote-Änderungen prüfen
		startPolling(async () => {
			await loadTasks();
			_lastSync = new Date().toISOString();
		});
	} catch (err) {
		const msg = String(err);
		// SESSION_EXPIRED wird von boxFetch geworfen wenn 401 + kein Refresh möglich.
		// "Load failed" / "Failed to fetch" / "NetworkError" tritt auf iOS auf wenn
		// der Token abgelaufen ist und der Browser den Request blockiert.
		const isAuthError =
			msg.includes('SESSION_EXPIRED') ||
			msg.includes('Load failed') ||
			msg.includes('Failed to fetch') ||
			msg.includes('NetworkError') ||
			msg.includes('Nicht eingeloggt');
		if (isAuthError) {
			_sessionExpired = true;
			_error = null;
		} else {
			_error = `Sync error: ${err}`;
		}
	} finally {
		_syncing = false;
	}
}

/**
 * Polling und Sync-Zustand zurücksetzen (beim Logout aufrufen).
 */
export function stopSync() {
	stopPolling();
	_lastSync = null;
	_sessionExpired = false;
	// UI-Einstellungen beim Logout zurücksetzen
	_minScore     = 0;
	_activeAreas  = [];
	_activeTopics = [];
	_showDone     = false;
}

/** @param {Partial<import('../model/task.js').Task>} data */
export async function addTask(data) {
	const task = createTask({ ...data, area: data.area ?? (_activeAreas[0] ?? '') });
	await db.tasks.add(task);
	_tasks = rankTasks([..._tasks, task]);
	schedulePush();
}

/**
 * @param {string} id
 * @param {Partial<import('../model/task.js').Task>} changes
 */
export async function updateTask(id, changes) {
	const updated = { ...changes, updatedAt: new Date().toISOString() };
	await db.tasks.update(id, updated);
	_tasks = rankTasks(_tasks.map(t => t.id === id ? { ...t, ...updated } : t));
	schedulePush();
}

/** @param {string} id @param {import('../model/task.js').TaskStatus} status */
export async function setStatus(id, status) {
	await updateTask(id, { status });
}

/** @param {string} id */
export async function deleteTask(id) {
	await db.tasks.delete(id);
	_tasks = _tasks.filter(t => t.id !== id);
	schedulePush();
}

/** @param {unknown[]} rawTasks */
export async function importTasks(rawTasks) {
	const normalized = rawTasks.map(normalizeTask);
	await db.tasks.bulkPut(normalized);
	_tasks = rankTasks([..._tasks, ...normalized]);
	schedulePush();
}
