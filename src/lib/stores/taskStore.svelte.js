/**
 * Reaktiver Task-Store (Svelte 5 Runes)
 *
 * Zentraler State für alle Tasks der App.
 * Kapselt alle Lese- und Schreiboperationen gegen IndexedDB + OneDrive.
 */

import { db } from '../storage/db.js';
import { schedulePush, syncFromOneDrive, retryFailedSyncs } from '../storage/onedrive.js';
import { rankTasks, getFocusTasks, getAreas } from '../engine/priority.js';
import { createTask, normalizeTask } from '../model/task.js';

// ── State (Svelte 5 Runes) ─────────────────────────────────────────────────
let _tasks = $state(/** @type {import('../model/task.js').Task[]} */ ([]));
let _activeArea = $state('');
let _searchQuery = $state('');
let _loading = $state(false);
let _syncing = $state(false);
let _error = $state(/** @type {string | null} */ (null));

// ── Derived State ──────────────────────────────────────────────────────────
export const tasks = {
	get all() { return _tasks; },
	get ranked() { return rankTasks(_tasks); },
	get focus() { return getFocusTasks(_tasks, { area: _activeArea }); },
	get areas() { return getAreas(_tasks); },
	get activeArea() { return _activeArea; },
	set activeArea(v) { _activeArea = v; },
	get searchQuery() { return _searchQuery; },
	set searchQuery(v) { _searchQuery = v; },
	get loading() { return _loading; },
	get syncing() { return _syncing; },
	get error() { return _error; },

	/** Gefilterte Tasks (nach Area + Suchbegriff) */
	get filtered() {
		let result = _tasks.filter(t => t.status === 'open');
		if (_activeArea) result = result.filter(t => t.area === _activeArea);
		if (_searchQuery.trim()) {
			const q = _searchQuery.toLowerCase();
			result = result.filter(t =>
				t.title.toLowerCase().includes(q) ||
				t.description.toLowerCase().includes(q) ||
				t.area.toLowerCase().includes(q) ||
				t.tags.some(tag => tag.toLowerCase().includes(q))
			);
		}
		return rankTasks(result);
	},

	/** Anzahl offener Tasks pro Area */
	get countByArea() {
		/** @type {Record<string, number>} */
		const counts = {};
		for (const t of _tasks.filter(t => t.status === 'open')) {
			counts[t.area || '(kein Bereich)'] = (counts[t.area || '(kein Bereich)'] ?? 0) + 1;
		}
		return counts;
	}
};

// ── Aktionen ───────────────────────────────────────────────────────────────

/** Lädt alle Tasks aus der lokalen IndexedDB */
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

/** Startet den initialen Sync von OneDrive */
export async function initialSync() {
	_syncing = true;
	_error = null;
	try {
		await retryFailedSyncs();
		await syncFromOneDrive();
		await loadTasks();
	} catch (err) {
		_error = `Sync-Fehler: ${err}`;
	} finally {
		_syncing = false;
	}
}

/**
 * Erstellt einen neuen Task
 * @param {Partial<import('../model/task.js').Task>} data
 */
export async function addTask(data) {
	const task = createTask({ ...data, area: data.area ?? _activeArea });
	await db.tasks.add(task);
	_tasks = rankTasks([..._tasks, task]);
	schedulePush();
}

/**
 * Aktualisiert einen bestehenden Task
 * @param {string} id
 * @param {Partial<import('../model/task.js').Task>} changes
 */
export async function updateTask(id, changes) {
	const updated = { ...changes, updatedAt: new Date().toISOString() };
	await db.tasks.update(id, updated);
	_tasks = rankTasks(_tasks.map(t => t.id === id ? { ...t, ...updated } : t));
	schedulePush();
}

/**
 * Setzt den Status eines Tasks
 * @param {string} id
 * @param {import('../model/task.js').TaskStatus} status
 */
export async function setStatus(id, status) {
	await updateTask(id, { status });
}

/**
 * Löscht einen Task permanent
 * @param {string} id
 */
export async function deleteTask(id) {
	await db.tasks.delete(id);
	_tasks = _tasks.filter(t => t.id !== id);
	schedulePush();
}

/**
 * Importiert Tasks aus einem Array (z.B. Excel-Migration)
 * @param {unknown[]} rawTasks
 */
export async function importTasks(rawTasks) {
	const normalized = rawTasks.map(normalizeTask);
	await db.tasks.bulkPut(normalized);
	_tasks = rankTasks([..._tasks, ...normalized]);
	schedulePush();
}
