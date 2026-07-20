/**
 * Task data model
 * Central type definitions for the entire app
 */

/** @typedef {'open' | 'done' | 'optional' | 'archived'} TaskStatus */
/** @typedef {'critical' | 'high' | 'medium-high' | 'normal' | 'low' | 'verylow' | 'someday'} TaskPriority */

/**
* @typedef {Object} Task
* @property {string}       id          - UUID v4
* @property {string}       title       - Short title (first line of the to-do)
* @property {string}       description - Multi-line description / details
* @property {string}       comments    - Internal comments / notes
* @property {TaskStatus}   status
* @property {TaskPriority} priority
* @property {string}       area        - Context (e.g. "MFT", "SelfEdi")
* @property {string}       topic       - Topic (e.g. "Review", "Deployment") – optional
* @property {string[]}     tags        - Free tags
* @property {string[]}     blockedBy   - IDs of tasks blocking this task
* @property {string|null}  dueDate     - ISO date "YYYY-MM-DD" or null
* @property {string}       createdAt   - ISO 8601
* @property {string}       updatedAt   - ISO 8601
* @property {number}       score       - Calculated priority score (0–100, read-only)
*/

/**
 * Creates a new empty task with defaults
 * @param {Partial<Task>} overrides
 * @returns {Task}
 */
export function createTask(overrides = {}) {
	const now = new Date().toISOString();
	return {
		id: crypto.randomUUID(),
		title: '',
		description: '',
		comments: '',
		status: 'open',
		priority: 'normal',
		area: '',
		topic: '',
		tags: [],
		blockedBy: [],
		dueDate: null,
		createdAt: now,
		updatedAt: now,
		score: 40,
		...overrides
	};
}

/**
 * Normalises a raw JSON entry (e.g. from Excel import)
 * @param {Record<string, unknown>} raw
 * @returns {Task}
 */
export function normalizeTask(raw) {
	return createTask({
		id: typeof raw.id === 'string' ? raw.id : crypto.randomUUID(),
		title: String(raw.title ?? raw.ToDo ?? '').split('\n')[0].slice(0, 200),
		description: String(raw.description ?? raw.ToDo ?? ''),
		comments: String(raw.comments ?? ''),
		status: mapStatus(raw.status ?? raw.Status),
		priority: mapPriority(raw.priority ?? raw.Prio),
		area:  String(raw.area  ?? raw.Umfeld ?? ''),
		topic: String(raw.topic ?? raw.Kunde  ?? ''),
		tags: Array.isArray(raw.tags) ? raw.tags : [],
		blockedBy: Array.isArray(raw.blockedBy) ? raw.blockedBy : [],
		dueDate: raw.dueDate ? String(raw.dueDate) : null,
		createdAt: raw.createdAt ? String(raw.createdAt) : new Date().toISOString(),
		updatedAt: raw.updatedAt ? String(raw.updatedAt) : new Date().toISOString()
	});
}

/** @param {unknown} s @returns {TaskStatus} */
function mapStatus(s) {
	// Support legacy German status values from older exports
	const map = { offen: 'open', erledigt: 'done', optional: 'optional', archiviert: 'archived' };
	return map[String(s).toLowerCase()] ?? 'open';
}

/** @param {unknown} p @returns {TaskPriority} */
function mapPriority(p) {
	// Pass through direct string values (e.g. from JSON import)
	const valid = ['critical', 'high', 'medium-high', 'normal', 'low', 'verylow', 'someday'];
	if (typeof p === 'string' && valid.includes(p)) return /** @type {TaskPriority} */ (p);
	// Legacy: map 'urgent' to 'critical'
	if (p === 'urgent') return 'critical';
	// Legacy: numeric values from Excel import
	const n = Number(p);
	if (isNaN(n)) return 'normal';
	if (n > 100) return 'critical';
	if (n > 75)  return 'high';
	if (n > 50)  return 'medium-high';
	if (n >= 0)  return 'normal';
	return 'low';
}
