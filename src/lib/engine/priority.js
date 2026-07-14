/**
 * Intelligente Prioritäts-Engine
 * Berechnet einen Score 0–100 für jeden Task – vollständig clientseitig, kein Server nötig.
 *
 * Score-Formel:
 *   score = basePrio
 *         + deadlineBoost   (je näher die Deadline, desto mehr)
 *         + dependencyBoost (wenn andere Tasks auf mich warten)
 *         + agingBoost      (je älter der Task, desto leicht höher)
 *         - blockedPenalty  (wenn ich selbst blockiert bin)
 */

/** @import { Task } from './task.js' */

const PRIO_BASE = { urgent: 80, high: 60, normal: 40, low: 20 };

/**
 * Berechnet den Score für einen einzelnen Task.
 * @param {Task} task
 * @param {Task[]} allTasks - alle offenen Tasks (für Dependency-Berechnung)
 * @returns {number} Score zwischen 0 und 100
 */
export function calcScore(task, allTasks) {
	if (task.status !== 'open') return 0;

	let score = PRIO_BASE[task.priority] ?? 40;

	// 1. Deadline-Boost
	if (task.dueDate) {
		const daysLeft = daysDiff(new Date(), new Date(task.dueDate));
		if (daysLeft < 0) score += 25; // überfällig
		else if (daysLeft <= 3) score += 20;
		else if (daysLeft <= 7) score += 10;
		else if (daysLeft <= 14) score += 5;
	}

	// 2. Dependency-Boost: Bin ich ein Blocker für andere?
	const isBlockerFor = allTasks.filter(
		(t) => t.status === 'open' && t.blockedBy.includes(task.id)
	);
	if (isBlockerFor.length > 0) {
		score += Math.min(15, isBlockerFor.length * 5);
	}

	// 3. Aging-Boost: Ältere offene Tasks leicht höher priorisieren
	const ageInWeeks = Math.floor(daysDiff(new Date(task.createdAt), new Date()) / 7);
	score += Math.min(20, ageInWeeks);

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
		.sort((a, b) => b.score - a.score);
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
		.sort((a, b) => b.score - a.score)
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

/** @param {Date} from @param {Date} to @returns {number} */
function daysDiff(from, to) {
	return Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}
