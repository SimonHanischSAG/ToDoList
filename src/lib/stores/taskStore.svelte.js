/**
 * Reaktiver Task-Store (Svelte 5 Runes)
 * Storage-Backend: Box statt OneDrive
 */

import { db } from '../storage/db.js';
import { schedulePush, syncFromStorage, retryFailedSyncs } from '../storage/index.js';
import { getToken } from '../auth/box.js';
import { rankTasks, getFocusTasks, getAreas, getTopics } from '../engine/priority.js';
import { createTask, normalizeTask } from '../model/task.js';

// ── State (Svelte 5 Runes) ─────────────────────────────────────────────────
let _tasks = $state(/** @type {import('../model/task.js').Task[]} */ ([]));
let _activeAreas = $state(/** @type {string[]} */ ([]));
let _activeTopics = $state(/** @type {string[]} */ ([]));
let _searchQuery = $state('');
let _showDone = $state(false);
let _loading = $state(false);
let _syncing = $state(false);
let _error = $state(/** @type {string | null} */ (null));

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
	set activeAreas(v) { _activeAreas = v; },

	/** Einzelne Area togglen (Mehrfachauswahl) */
	toggleArea(area) {
		if (_activeAreas.includes(area)) {
			_activeAreas = _activeAreas.filter(a => a !== area);
		} else {
			_activeAreas = [..._activeAreas, area];
		}
	},
/** @returns {string[]} */
get activeTopics() { return _activeTopics; },
/** @param {string[]} v */
set activeTopics(v) { _activeTopics = v; },

/** Einzelnes Topic togglen (Mehrfachauswahl) */
toggleTopic(topic) {
	if (_activeTopics.includes(topic)) {
		_activeTopics = _activeTopics.filter(t => t !== topic);
	} else {
		_activeTopics = [..._activeTopics, topic];
	}
},


	get searchQuery() { return _searchQuery; },
	set searchQuery(v) { _searchQuery = v; },
	get showDone() { return _showDone; },
	set showDone(v) { _showDone = v; },
	get loading() { return _loading; },
	get syncing() { return _syncing; },
	get error() { return _error; },

	get filtered() {
		let result = _tasks.filter(t => t.status === 'open');
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
	}
};

// ── Aktionen ───────────────────────────────────────────────────────────────

export async function loadTasks() {
	_loading = true;
	_error = null;
	try {
		const rows = await db.tasks.toArray();
		_tasks = rankTasks(rows);
	} catch (err) {
		_error = `Fehler beim Laden: ${err}`;
	} finally {
		_loading = false;
	}
}

export async function initialSync() {
	// Ohne Token keinen Sync versuchen – Nutzer muss sich erst einloggen
	if (!getToken()) return;

	_syncing = true;
	_error = null;
	try {
		await retryFailedSyncs();
		await syncFromStorage();
		await loadTasks();
	} catch (err) {
		_error = `Sync-Fehler: ${err}`;
	} finally {
		_syncing = false;
	}
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
