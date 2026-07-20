<!--
  TaskCard – displays a single task in the list
  Click → opens edit modal
-->
<script>
	import TaskForm from './TaskForm.svelte';
	import { updateTask } from '$lib/stores/taskStore.svelte.js';

	/** @type {{ task: import('$lib/model/task.js').Task, verbose?: boolean, done?: boolean, ondone: () => void, ondelete: () => void }} */
	let { task, verbose = false, done = false, ondone, ondelete } = $props();

	const PRIORITY_COLORS = {
		critical:      'bg-red-100 text-red-800 border-red-200',
		high:          'bg-orange-100 text-orange-800 border-orange-200',
		'medium-high': 'bg-yellow-50 text-yellow-800 border-yellow-200',
		normal:        'bg-blue-50 text-blue-700 border-blue-200',
		low:           'bg-gray-100 text-gray-600 border-gray-200',
		verylow:       'bg-gray-50 text-gray-400 border-gray-100',
		someday:       'bg-slate-50 text-slate-300 border-slate-100'
	};

	const PRIORITY_LABELS = {
		critical:      'Critical',
		high:          'High',
		'medium-high': 'Med-High',
		normal:        'Normal',
		low:           'Low',
		verylow:       'Very Low',
		someday:       'Someday'
	};

	/** Reihenfolge: critical > high > medium-high > normal > low > verylow > someday */
	const PRIORITY_ORDER = ['critical', 'high', 'medium-high', 'normal', 'low', 'verylow', 'someday'];

	function raisePriority() {
		const idx = PRIORITY_ORDER.indexOf(task.priority);
		if (idx > 0) updateTask(task.id, { priority: PRIORITY_ORDER[idx - 1] });
	}

	function lowerPriority() {
		const idx = PRIORITY_ORDER.indexOf(task.priority);
		if (idx < PRIORITY_ORDER.length - 1) updateTask(task.id, { priority: PRIORITY_ORDER[idx + 1] });
	}

	function scoreColor(score) {
		if (score >= 75) return 'bg-red-500';
		if (score >= 50) return 'bg-orange-400';
		if (score >= 30) return 'bg-blue-400';
		return 'bg-gray-300';
	}

	/** Parses "YYYY-MM-DD" as local end-of-day (not UTC), so that
	 *  today's date is only considered overdue after 23:59:59 local time. */
	function localEndOfDay(dateStr) {
		const [y, m, d] = dateStr.split('-').map(Number);
		return new Date(y, m - 1, d, 23, 59, 59, 999);
	}

	function deadlineText(dueDate) {
		if (!dueDate) return null;
		const days = Math.round((localEndOfDay(dueDate) - new Date()) / 86400000);
		if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`;
		if (days === 0) return 'Due today';
		if (days === 1) return 'Due tomorrow';
		return `Due in ${days} days`;
	}

	let _expanded     = $state(false);
	let editing       = $state(false);
	let confirmDelete = $state(false);

	// Im Verbose-Mode immer aufgeklappt; sonst manuell steuerbar
	const expanded = $derived(verbose || _expanded);

	const deadline  = $derived(deadlineText(task.dueDate));
	const isOverdue = $derived(!!task.dueDate && localEndOfDay(task.dueDate) < new Date());
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
	class="border border-ibm-gray-dark rounded-md overflow-hidden hover:shadow-sm transition-shadow cursor-pointer {done ? 'bg-gray-50 opacity-70' : 'bg-white'}"
	onclick={() => editing = true}
>
	<!-- Score-Balken oben -->
	<div class="h-1 {done ? 'bg-gray-200' : scoreColor(task.score)}" style="width: {done ? '100' : task.score}%"></div>

	<div class="p-3">
		<div class="flex items-start gap-3">
			<!-- Done-Checkbox / Rueckgaengig-Button -->
			<button
				onclick={(e) => { e.stopPropagation(); ondone(); }}
				class="mt-0.5 w-5 h-5 rounded border-2 flex-shrink-0 transition-colors
					{done
						? 'border-green-400 bg-green-400 hover:bg-green-300 hover:border-green-300'
						: 'border-ibm-gray-dark hover:border-ibm-blue hover:bg-ibm-gray'}"
				title={done ? 'Mark as open' : 'Mark as done'}
					aria-label={done ? 'Reopen' : 'Done'}
			>
				{#if done}<span class="text-white text-xs leading-none flex items-center justify-center h-full">✓</span>{/if}
			</button>

			<!-- Hauptinhalt -->
			<div class="flex-1 min-w-0">
				<!-- Titel -->
					<div class="text-sm font-medium leading-snug block transition-colors
						{done ? 'line-through text-ibm-text-muted' : 'text-ibm-text'}">
						{task.title || '(no title)'}
					</div>

				<!-- Meta row -->
					<div class="flex flex-wrap items-center gap-1.5 mt-1.5">
						<!-- Priority + arrows -->
						<span class="text-xs border px-2 py-0.5 rounded inline-block text-center w-20 whitespace-nowrap {PRIORITY_COLORS[task.priority]}">
							{PRIORITY_LABELS[task.priority]}
						</span>
						<div class="flex flex-row gap-0.5">
							<button
								onclick={(e) => { e.stopPropagation(); raisePriority(); }}
								disabled={task.priority === 'critical'}
								class="text-red-500 hover:text-red-700 disabled:opacity-25 leading-none text-base px-0.5"
								title="Increase priority"
							>&#8679;</button>
							<button
								onclick={(e) => { e.stopPropagation(); lowerPriority(); }}
								disabled={task.priority === 'someday'}
								class="text-green-500 hover:text-green-700 disabled:opacity-25 leading-none text-base px-0.5"
								title="Decrease priority"
							>&#8681;</button>
						</div>
						<span class="w-2"></span>
						<!-- Area + topic -->
						{#if task.area}
							<span class="text-xs bg-ibm-gray text-ibm-text-muted px-2 py-0.5 rounded">{task.area}</span>
						{/if}
						{#if task.topic}
							<span class="text-xs bg-gray-200 text-ibm-text-muted px-2 py-0.5 rounded">{task.topic}</span>
						{/if}
						{#if deadline}
							<span class="text-xs {isOverdue ? 'text-red-600 font-semibold' : 'text-orange-600'}">
								⏰ {deadline}
							</span>
						{/if}
						<!-- Tags in Kompakt-Ansicht (nur wenn nicht bereits expanded) -->
						{#if !expanded && task.tags.length > 0}
							{#each task.tags as tag}
								<span class="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">#{tag}</span>
							{/each}
						{/if}
						<span class="text-xs text-ibm-text-muted ml-auto">Score: {task.score}</span>
					</div>

				<!-- Expanded: Beschreibung + Comments + Tags + Blockiert-durch -->
				{#if expanded && (task.description || task.comments || task.tags.length > 0 || task.blockedBy.length > 0 || task.dueDate)}
					<div class="mt-2 pt-2 border-t border-ibm-gray-dark space-y-1.5">
						{#if verbose && task.dueDate}
							<p class="text-xs text-ibm-text-muted">
								Deadline: <span class="{isOverdue ? 'text-red-600 font-semibold' : 'text-orange-600'}">{task.dueDate}</span>
							</p>
						{/if}
						{#if task.description && task.description !== task.title}
							<!-- eslint-disable-next-line svelte/no-at-html-tags -->
							<div class="text-xs text-ibm-text-muted leading-relaxed rich-content">
								{@html task.description}
							</div>
						{/if}
						{#if task.comments}
							<div class="text-xs text-ibm-text-muted leading-relaxed rich-content border-l-2 border-ibm-gray-dark pl-2">
								<!-- eslint-disable-next-line svelte/no-at-html-tags -->
								{@html task.comments}
							</div>
						{/if}
						{#if task.tags.length > 0}
							<div class="flex flex-wrap gap-1">
								{#each task.tags as tag}
									<span class="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">#{tag}</span>
								{/each}
							</div>
						{/if}
						{#if task.blockedBy.length > 0}
							<p class="text-xs text-red-600">🔒 Blocked by {task.blockedBy.length} task(s)</p>
						{/if}
					</div>
				{/if}
			</div>

			<!-- Actions: details + delete -->
				<div class="flex items-center gap-1 flex-shrink-0">
					{#if !verbose && (task.description || task.comments || task.tags.length > 0)}
						<button
							onclick={(e) => { e.stopPropagation(); _expanded = !_expanded; }}
							class="text-ibm-text-muted hover:text-ibm-text transition-colors p-1 text-xs"
							title={_expanded ? 'Show less' : 'Show details'}
							aria-label="Details"
						>{_expanded ? '▲' : '▼'}</button>
					{/if}
					<button
							onclick={(e) => { e.stopPropagation(); confirmDelete = true; }}
							class="text-ibm-gray-dark hover:text-red-500 transition-colors p-1"
							title="Delete task"
							aria-label="Delete"
						>🗑</button>
				</div>
		</div>
	</div>
</div>

<!-- Edit-Modal -->
{#if editing}
	<TaskForm task={task} onclose={() => editing = false} />
{/if}

<!-- Delete-Confirmation-Modal -->
{#if confirmDelete}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
		onclick={() => confirmDelete = false}
	>
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div
			class="bg-white rounded-lg shadow-xl w-80 p-5 space-y-4"
			onclick={(e) => e.stopPropagation()}
		>
			<div class="flex items-start gap-3">
				<span class="text-red-500 text-xl leading-none mt-0.5">⚠</span>
				<div>
					<p class="text-sm font-semibold text-ibm-text">Delete task?</p>
					<p class="text-xs text-ibm-text-muted mt-1 break-words">
						"{task.title || 'no title'}" will be permanently deleted.
					</p>
				</div>
			</div>
			<div class="flex justify-end gap-2">
				<button
					onclick={() => confirmDelete = false}
					class="text-sm px-3 py-1.5 rounded border border-ibm-gray-dark text-ibm-text hover:bg-ibm-gray transition-colors"
				>
					Cancel
				</button>
				<button
					onclick={() => { confirmDelete = false; ondelete(); }}
					class="text-sm px-3 py-1.5 rounded bg-red-600 text-white hover:bg-red-700 transition-colors font-semibold"
				>
					Delete
				</button>
			</div>
		</div>
	</div>
{/if}
