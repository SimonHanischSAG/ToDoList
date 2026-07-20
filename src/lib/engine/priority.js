/**
 * Smart priority engine
 * Calculates a score 0–100 for each task – fully client-side, no server needed.
 *
 * Score formula:
 *   score = basePrio
 *         + deadlineBoost    (the closer the deadline, the higher)
 *         + dependencyBoost  (when other tasks are waiting on me)
 *         + agingBoost       (Critical/High only: +max 10 when very old)
 *         - agingPenalty     (Medium-High and below: older since last update → lower score)
 *         - blockedPenalty   (when I am blocked myself)
 *
 * Aging penalty (based on updatedAt):
 *   - Applies to: medium-high, normal, low, verylow, someday
 *   - Critical / High: no aging effect
 *   - After ~3 months (13 weeks): approx. 1 category lower in score
 *   - After ~6 months (26 weeks): approx. 2 categories lower (maximum, no further drop)
 *   - "1 category" = gap between two adjacent basePrio values (≈ 10 points)
 */

/** @import { Task } from './task.js' */

/**
 * Base scores for the 7 priority levels.
 * Gaps are intentionally equal (10 points) so that the aging penalty
 * is intuitively readable in "category jumps".
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
 * Priority levels subject to aging penalty (descending inclusive).
 * Critical and High are exempt.
 */
const AGING_PENALTY_PRIOS = new Set(['medium-high', 'normal', 'low', 'verylow', 'someday']);

/**
 * Maximum aging penalty in score points (= 2 categories × 10 points).
 * A task can never drop more than 2 levels due to aging.
 */
const MAX_AGING_PENALTY = 20;

/**
 * Weeks until 1 category penalty is reached.
 * 13 weeks ≈ 3 months → -10 points (1 category).
 * 26 weeks ≈ 6 months → -20 points (2 categories = maximum).
 */
const WEEKS_PER_CATEGORY = 13;

/**
 * Calculates the score for a single task.
 * @param {Task} task
 * @param {Task[]} allTasks - all open tasks (for dependency calculation)
 * @returns {number} Score between 0 and 100
 */
export function calcScore(task, allTasks) {
	if (task.status !== 'open') return 0;

	let score = PRIO_BASE[task.priority] ?? 45;

	// 1. Deadline boost (granular by exact days, so "today" > "in 1 day" > "in 2 days" etc.)
	if (task.dueDate) {
		const daysLeft = daysDiff(new Date(), localEndOfDay(task.dueDate));
		if (daysLeft < 0)        score += 25; // overdue
		else if (daysLeft === 0) score += 22; // today
		else if (daysLeft === 1) score += 20; // tomorrow
		else if (daysLeft === 2) score += 18; // day after tomorrow
		else if (daysLeft === 3) score += 16;
		else if (daysLeft <= 7)  score += 10;
		else if (daysLeft <= 14) score += 5;
	}

	// 2. Dependency boost: am I a blocker for others?
	const isBlockerFor = allTasks.filter(
		(t) => t.status === 'open' && t.blockedBy.includes(task.id)
	);
	if (isBlockerFor.length > 0) {
		score += Math.min(15, isBlockerFor.length * 5);
	}

	// 3. Aging – depends on priority level
	const weeksOld = Math.floor(
		daysDiff(new Date(task.updatedAt ?? task.createdAt), new Date()) / 7
	);

	if (AGING_PENALTY_PRIOS.has(task.priority)) {
		// Medium-High and below: penalty grows linearly with age since last update
		// grows linearly to the maximum (2 categories = 20 points)
		const penalty = Math.min(MAX_AGING_PENALTY, Math.floor(weeksOld / WEEKS_PER_CATEGORY) * 10);
		score -= penalty;
	} else {
		// Critical / High: small boost for very old open tasks (max +10)
		// so truly forgotten urgent tasks remain visible
		score += Math.min(10, Math.floor(weeksOld / 4));
	}

	// 4. Blocked penalty: am I blocked myself?
	const isBlocked = task.blockedBy.some((id) => {
		const blocker = allTasks.find((t) => t.id === id);
		return blocker && blocker.status === 'open';
	});
	if (isBlocked) score -= 30;

	return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Calculates scores for all tasks and returns them sorted.
 * @param {Task[]} tasks
 * @returns {Task[]} Tasks with updated score, sorted descending
 */
export function rankTasks(tasks) {
	const open = tasks.filter((t) => t.status === 'open');
	return tasks
		.map((task) => ({ ...task, score: calcScore(task, open) }))
		.sort((a, b) => b.score - a.score || dueDateSort(a, b) || new Date(b.createdAt) - new Date(a.createdAt));
}

/**
 * Daily focus mode: top-N tasks for the active context.
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
 * Returns all available areas from the tasks.
 * @param {Task[]} tasks
 * @returns {string[]}
 */
export function getAreas(tasks) {
	return [...new Set(tasks.map((t) => t.area).filter(Boolean))].sort();
}

/**
 * Returns all topics used across the tasks.
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
 * Secondary sort by due date: earlier due date = higher up.
 * Tasks without a due date come after tasks with one.
 * @param {Task} a @param {Task} b @returns {number}
 */
function dueDateSort(a, b) {
	if (a.dueDate && b.dueDate) return new Date(a.dueDate) - new Date(b.dueDate);
	if (a.dueDate) return -1;
	if (b.dueDate) return 1;
	return 0;
}

/** @param {Date} from @param {Date} to @returns {number} */
/** Parses "YYYY-MM-DD" as local end-of-day (23:59:59),
 *  so that today's date is not considered overdue. */
function localEndOfDay(dateStr) {
	const [y, m, d] = String(dateStr).split('-').map(Number);
	return new Date(y, m - 1, d, 23, 59, 59, 999);
}

function daysDiff(from, to) {
	return Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}
