/**
 * Intelligente Prioritäts-Engine
 * Berechnet einen Score 0–100 für jeden Task – vollständig clientseitig, kein Server nötig.
 *
 * Score-Formel:
 *   score = basePrio
 *         + deadlineBoost    (je näher die Deadline, desto mehr)
 *         + dependencyBoost  (wenn andere Tasks auf mich warten)
 *         + agingBoost       (nur Critical/High: +max 10 wenn sehr alt)
 *         - agingPenalty     (ab Medium-High abwärts: je älter seit letztem Update, desto weiter hinten)
 *         - blockedPenalty   (wenn ich selbst blockiert bin)
 *
 * Aging-Penalty (basiert auf updatedAt):
 *   - Gilt für: medium-high, normal, low, verylow, someday
 *   - Critical / High: kein Aging-Einfluss
 *   - Nach ~3 Monaten (13 Wochen): ca. 1 Kategorie tiefer im Score
 *   - Nach ~6 Monaten (26 Wochen): ca. 2 Kategorien tiefer (Maximum, danach kein weiterer Abfall)
 *   - "1 Kategorie" = Abstand zwischen zwei benachbarten basePrio-Werten (≈ 10 Punkte)
 */

/** @import { Task } from './task.js' */

/**
 * Basis-Scores der 7 Prio-Stufen.
 * Abstände bewusst gleichmäßig (10 Punkte), damit Aging-Penalty
 * in "Kategorie-Sprüngen" intuitiv ablesbar ist.
 */
const PRIO_BASE = {
	critical:    90,
	high:        75,
	'medium-high': 60,
	normal:      45,
	low:         30,
	verylow:     15,
	someday:      5
};

/**
 * Ab dieser Prio-Stufe gilt der Aging-Penalty (absteigend inkl.).
 * Critical und High sind ausgenommen.
 */
const AGING_PENALTY_PRIOS = new Set(['medium-high', 'normal', 'low', 'verylow', 'someday']);

/**
 * Maximaler Aging-Penalty in Score-Punkten (= 2 Kategorien à 10 Punkte).
 * Ein Task kann nie weiter als 2 Stufen durch Aging fallen.
 */
const MAX_AGING_PENALTY = 20;

/**
 * Wochen bis zum Erreichen von 1 Kategorie Penalty.
 * 13 Wochen ≈ 3 Monate → -10 Punkte (1 Kategorie).
 * 26 Wochen ≈ 6 Monate → -20 Punkte (2 Kategorien = Maximum).
 */
const WEEKS_PER_CATEGORY = 13;

/**
 * Berechnet den Score für einen einzelnen Task.
 * @param {Task} task
 * @param {Task[]} allTasks - alle offenen Tasks (für Dependency-Berechnung)
 * @returns {number} Score zwischen 0 und 100
 */
export function calcScore(task, allTasks) {
	if (task.status !== 'open') return 0;

	let score = PRIO_BASE[task.priority] ?? 45;

	// 1. Deadline-Boost (granular nach exakten Tagen, damit "heute" > "in 1 Tag" > "in 2 Tagen" usw.)
	if (task.dueDate) {
		const daysLeft = daysDiff(new Date(), new Date(task.dueDate));
		if (daysLeft < 0)        score += 25; // überfällig
		else if (daysLeft === 0) score += 22; // heute
		else if (daysLeft === 1) score += 20; // morgen
		else if (daysLeft === 2) score += 18; // übermorgen
		else if (daysLeft === 3) score += 16;
		else if (daysLeft <= 7)  score += 10;
		else if (daysLeft <= 14) score += 5;
	}

	// 2. Dependency-Boost: Bin ich ein Blocker für andere?
	const isBlockerFor = allTasks.filter(
		(t) => t.status === 'open' && t.blockedBy.includes(task.id)
	);
	if (isBlockerFor.length > 0) {
		score += Math.min(15, isBlockerFor.length * 5);
	}

	// 3. Aging – abhängig von der Prio-Stufe
	const weeksOld = Math.floor(
		daysDiff(new Date(task.updatedAt ?? task.createdAt), new Date()) / 7
	);

	if (AGING_PENALTY_PRIOS.has(task.priority)) {
		// Medium-High und niedriger: Penalty je älter seit letztem Update
		// Wächst linear bis zum Maximum (2 Kategorien = 20 Punkte)
		const penalty = Math.min(MAX_AGING_PENALTY, Math.floor(weeksOld / WEEKS_PER_CATEGORY) * 10);
		score -= penalty;
	} else {
		// Critical / High: kleiner Boost für sehr alte offene Tasks (max +10)
		// damit wirklich vergessene dringende Tasks trotzdem sichtbar bleiben
		score += Math.min(10, Math.floor(weeksOld / 4));
	}

	// 4. Blocked-Penalty: Bin ich selbst blockiert?
	const isBlocked = task.blockedBy.some((id) => {
		const blocker = allTasks.find((t) => t.id === id);
		return blocker && blocker.status === 'open';
	});
	if (isBlocked) score -= 30;

	return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Berechnet Scores für alle Tasks und gibt sie sortiert zurück.
 * @param {Task[]} tasks
 * @returns {Task[]} Tasks mit aktualisiertem score, absteigend sortiert
 */
export function rankTasks(tasks) {
	const open = tasks.filter((t) => t.status === 'open');
	return tasks
		.map((task) => ({ ...task, score: calcScore(task, open) }))
		.sort((a, b) => b.score - a.score || dueDateSort(a, b) || new Date(b.createdAt) - new Date(a.createdAt));
}

/**
 * Täglicher Focus-Modus: Top-N Tasks für den aktiven Kontext.
 * @param {Task[]} tasks
 * @param {{ area?: string; maxItems?: number }} options
 * @returns {Task[]}
 */
export function getFocusTasks(tasks, { area = '', maxItems = 5 } = {}) {
	const open = tasks.filter((t) => t.status === 'open');
	return open
		.filter((t) => !area || t.area === area)
		.filter((t) => !isBlocked(t, open))
		.map((t) => ({ ...t, score: calcScore(t, open) }))
		.sort((a, b) => b.score - a.score || dueDateSort(a, b) || new Date(b.createdAt) - new Date(a.createdAt))
		.slice(0, maxItems);
}

/**
 * Gibt alle verfügbaren Areas (Umfelder) aus den Tasks zurück.
 * @param {Task[]} tasks
 * @returns {string[]}
 */
export function getAreas(tasks) {
	return [...new Set(tasks.map((t) => t.area).filter(Boolean))].sort();
}

/**
 * Gibt alle verwendeten Themen aus den Tasks zurück.
 * @param {Task[]} tasks
 * @returns {string[]}
 */
export function getTopics(tasks) {
	return [...new Set(tasks.map((t) => t.topic).filter(Boolean))].sort();
}

/** @param {Task} task @param {Task[]} allTasks @returns {boolean} */
function isBlocked(task, allTasks) {
	return task.blockedBy.some((id) => {
		const blocker = allTasks.find((t) => t.id === id);
		return blocker && blocker.status === 'open';
	});
}

/**
 * Sekundäre Sortierung nach Due-Date: früher fällig = weiter oben.
 * Tasks ohne Due-Date kommen nach Tasks mit Due-Date.
 * @param {Task} a @param {Task} b @returns {number}
 */
function dueDateSort(a, b) {
	if (a.dueDate && b.dueDate) return new Date(a.dueDate) - new Date(b.dueDate);
	if (a.dueDate) return -1;
	if (b.dueDate) return 1;
	return 0;
}

/** @param {Date} from @param {Date} to @returns {number} */
function daysDiff(from, to) {
	return Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}
