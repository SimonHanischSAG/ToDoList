/**
 * Task-Datenmodell
 * Zentrale Typdefinitionen für die gesamte App
 */

/** @typedef {'open' | 'done' | 'optional' | 'archived'} TaskStatus */
/** @typedef {'critical' | 'high' | 'medium-high' | 'normal' | 'low' | 'verylow' | 'someday'} TaskPriority */

/**
* @typedef {Object} Task
* @property {string}       id          - UUID v4
* @property {string}       title       - Kurzer Titel (erste Zeile des ToDo)
* @property {string}       description - Mehrzeilige Beschreibung / Details
* @property {string}       comments    - Interne Kommentare / Notizen
* @property {TaskStatus}   status
* @property {TaskPriority} priority
* @property {string}       area        - Umfeld (z.B. "MFT", "SelfEdi")
* @property {string}       topic       - Thema (z.B. "Review", "Deployment") – optional
* @property {string[]}     tags        - Freie Tags
* @property {string[]}     blockedBy   - IDs von Tasks, die diesen Task blockieren
* @property {string|null}  dueDate     - ISO-Datum "YYYY-MM-DD" oder null
* @property {string}       createdAt   - ISO 8601
* @property {string}       updatedAt   - ISO 8601
* @property {number}       score       - Berechneter Prio-Score (0–100, read-only)
*/

/**
 * Erstellt einen neuen leeren Task mit Defaults
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
 * Normalisiert einen rohen JSON-Eintrag (z.B. aus Excel-Import)
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
	const map = { offen: 'open', erledigt: 'done', optional: 'optional', archiviert: 'archived' };
	return map[String(s).toLowerCase()] ?? 'open';
}

/** @param {unknown} p @returns {TaskPriority} */
function mapPriority(p) {
	// Direkte String-Werte (z.B. aus JSON-Import) durchreichen
	const valid = ['critical', 'high', 'medium-high', 'normal', 'low', 'verylow', 'someday'];
	if (typeof p === 'string' && valid.includes(p)) return /** @type {TaskPriority} */ (p);
	// Legacy: 'urgent' auf 'critical' mappen
	if (p === 'urgent') return 'critical';
	// Legacy: numerische Werte aus Excel-Import
	const n = Number(p);
	if (isNaN(n)) return 'normal';
	if (n > 100) return 'critical';
	if (n > 75)  return 'high';
	if (n > 50)  return 'medium-high';
	if (n >= 0)  return 'normal';
	return 'low';
}
