/**
 * Reactive task store (Svelte 5 Runes)
 * Storage backend: Box cloud sync
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
/** Push error – set when a local change could not be saved to Box.
 *  Survives poll cycles and loadTasks calls; only cleared by explicit user dismiss. */
let _pushError = $state(/** @type {string | null} */ (null));
let _sessionExpired = $state(false);
/** Timestamp of last successful remote sync (for UI indicator) */
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
		// Remove active topics that are no longer visible
		const visibleTopicSet = new Set(
			_tasks
				.filter(t => t.status === 'open' && (v.length === 0 || v.includes(t.area)) && t.topic)
				.map(t => t.topic)
		);
		_activeTopics = _activeTopics.filter(tp => visibleTopicSet.has(tp));
		_savePrefs();
	},

	/** Toggle a single area (multi-select); remove topics that no longer exist in the new selection */
	toggleArea(area) {
		if (_activeAreas.includes(area)) {
			_activeAreas = _activeAreas.filter(a => a !== area);
		} else {
			_activeAreas = [..._activeAreas, area];
		}
		// Keep only topics still visible after the area change
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

	/** Toggle a single topic (multi-select) */
	toggleTopic(topic) {
		if (_activeTopics.includes(topic)) {
			_activeTopics = _activeTopics.filter(t => t !== topic);
		} else {
			_activeTopics = [..._activeTopics, topic];
		}
		_savePrefs();
	},

	/** Minimum score threshold for the slider filter (0 = show all) */
	get minScore() { return _minScore; },
	set minScore(v) { _minScore = v; _savePrefs(); },

	get searchQuery() { return _searchQuery; },
	set searchQuery(v) { _searchQuery = v; },
	get showDone() { return _showDone; },
	set showDone(v) { _showDone = v; _savePrefs(); },
	get loading() { return _loading; },
	get syncing() { return _syncing; },
	get error() { return _error; },
	get pushError() { return _pushError; },
	dismissPushError() { _pushError = null; },
	get sessionExpired() { return _sessionExpired; },
	/** Triggers a new Box login (when session has expired). */
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
			const key = t.area || '(no area)';
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
	 * Tasks relevant for the topic filter row:
	 * open + active areas + active search query (without topic filter itself).
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

	/** Topics still available after area and search filter (sorted alphabetically) */
	get visibleTopics() {
		const set = new Set(this._topicBase.filter(t => t.topic).map(t => t.topic));
		return [...set].sort();
	},

	/** All unique tags across all tasks (sorted alphabetically) */
	get allTags() {
		const set = new Set(_tasks.flatMap(t => t.tags ?? []));
		return [...set].sort();
	},

	/** Topic counts restricted to the filtered base tasks */
	get countByTopicFiltered() {
		/** @type {Record<string, number>} */
		const counts = {};
		for (const t of this._topicBase.filter(t => t.topic)) {
			counts[t.topic] = (counts[t.topic] ?? 0) + 1;
		}
		return counts;
	}
};

// ── Actions ────────────────────────────────────────────────────────────────

/**
 * Internal helper: saves current UI settings debounced to Box.
 * Only called when a token is present (= logged in).
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
	// Skip sync if no token present – user must log in first
	if (!getToken()) return;

	_syncing = true;
	_error = null;
	_sessionExpired = false;
	try {
		await retryFailedSyncs();
		// Load prefs and tasks in parallel
		const [prefs] = await Promise.all([loadPrefs(), syncFromStorage()]);
		// Apply saved UI settings (only if value is valid)
		if (prefs) {
			if (typeof prefs.minScore === 'number')       _minScore     = prefs.minScore;
			if (Array.isArray(prefs.activeAreas))         _activeAreas  = prefs.activeAreas;
			if (Array.isArray(prefs.activeTopics))        _activeTopics = prefs.activeTopics;
			if (typeof prefs.showDone === 'boolean')      _showDone     = prefs.showDone;
		}
		await loadTasks();
		_lastSync = new Date().toISOString();
		// Start polling: check for remote changes every 30s
		startPolling(async () => {
			await loadTasks();
			_lastSync = new Date().toISOString();
		});
	} catch (err) {
		const msg = String(err);
		// SESSION_EXPIRED is thrown by boxFetch on 401 + no refresh possible.
		// "Load failed" / "Failed to fetch" / "NetworkError" occurs on iOS when
		// the token has expired and the browser blocks the request.
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
 * Reset polling and sync state (call on logout).
 */
export function stopSync() {
	stopPolling();
	_lastSync = null;
	_sessionExpired = false;
	// Reset UI settings on logout
	_minScore     = 0;
	_activeAreas  = [];
	_activeTopics = [];
	_showDone     = false;
}

/**
 * Central error callback passed to schedulePush.
 * Sets _pushError (not _error) so the banner persists across poll cycles
 * and is only dismissed by the user explicitly.
 * @param {Error} err
 */
function _onPushError(err) {
	const msg = String(err.message ?? err);
	if (msg.startsWith('CONFLICT')) {
		_pushError = 'Sync conflict: another device saved changes at the same time. Your local changes are kept. The remote version will be reloaded on the next sync.';
	} else {
		_pushError = `Your changes could not be saved: ${msg}`;
	}
}

/** @param {Partial<import('../model/task.js').Task>} data */
export async function addTask(data) {
	const task = createTask({ ...data, area: data.area ?? (_activeAreas[0] ?? '') });
	await db.tasks.add(task);
	_tasks = rankTasks([..._tasks, task]);
	schedulePush(_onPushError);
}

/**
 * @param {string} id
 * @param {Partial<import('../model/task.js').Task>} changes
 */
export async function updateTask(id, changes) {
	const updated = { ...changes, updatedAt: new Date().toISOString() };
	await db.tasks.update(id, updated);
	_tasks = rankTasks(_tasks.map(t => t.id === id ? { ...t, ...updated } : t));
	schedulePush(_onPushError);
}

/** @param {string} id @param {import('../model/task.js').TaskStatus} status */
export async function setStatus(id, status) {
	await updateTask(id, { status });
}

/** @param {string} id */
export async function deleteTask(id) {
	await db.tasks.delete(id);
	_tasks = _tasks.filter(t => t.id !== id);
	schedulePush(_onPushError);
}

/** @param {unknown[]} rawTasks */
export async function importTasks(rawTasks) {
	const normalized = rawTasks.map(normalizeTask);
	await db.tasks.bulkPut(normalized);
	_tasks = rankTasks([..._tasks, ...normalized]);
	schedulePush(_onPushError);
}
