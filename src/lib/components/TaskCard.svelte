<!--
  TaskCard – zeigt einen einzelnen Task in der Liste an
  Klick auf Titel → Inline-Edit-Modus
-->
<script>
	import TaskForm from './TaskForm.svelte';

	/** @type {{ task: import('$lib/model/task.js').Task, verbose?: boolean, ondone: () => void, ondelete: () => void }} */
	let { task, verbose = false, ondone, ondelete } = $props();

	const PRIORITY_COLORS = {
		urgent: 'bg-red-100 text-red-800 border-red-200',
		high:   'bg-orange-100 text-orange-800 border-orange-200',
		normal: 'bg-blue-50 text-blue-800 border-blue-200',
		low:    'bg-gray-100 text-gray-600 border-gray-200'
	};

	const PRIORITY_LABELS = { urgent: 'Kritisch', high: 'Hoch', normal: 'Normal', low: 'Niedrig' };

	function scoreColor(score) {
		if (score >= 75) return 'bg-red-500';
		if (score >= 50) return 'bg-orange-400';
		if (score >= 30) return 'bg-blue-400';
		return 'bg-gray-300';
	}

	function deadlineText(dueDate) {
		if (!dueDate) return null;
		const days = Math.round((new Date(dueDate) - new Date()) / 86400000);
		if (days < 0) return `${Math.abs(days)} Tage überfällig`;
		if (days === 0) return 'Heute fällig';
		if (days === 1) return 'Morgen fällig';
		return `In ${days} Tagen fällig`;
	}

	let _expanded = $state(false);
	let editing   = $state(false);

	// Im Verbose-Mode immer aufgeklappt; sonst manuell steuerbar
	const expanded = $derived(verbose || _expanded);

	const deadline  = $derived(deadlineText(task.dueDate));
	const isOverdue = $derived(!!task.dueDate && new Date(task.dueDate) < new Date());
</script>

<!-- Edit-Modal -->
{#if editing}
	<TaskForm task={task} onclose={() => editing = false} />
{/if}

<div class="bg-white border border-ibm-gray-dark rounded-md overflow-hidden hover:shadow-sm transition-shadow">
	<!-- Score-Balken oben -->
	<div class="h-1 {scoreColor(task.score)}" style="width: {task.score}%"></div>

	<div class="p-3">
		<div class="flex items-start gap-3">
			<!-- Done-Checkbox -->
			<button
				onclick={ondone}
				class="mt-0.5 w-5 h-5 rounded border-2 border-ibm-gray-dark flex-shrink-0 hover:border-ibm-blue hover:bg-ibm-gray transition-colors"
				title="Als erledigt markieren"
				aria-label="Erledigt"
			></button>

			<!-- Hauptinhalt -->
			<div class="flex-1 min-w-0">
				<!-- Titel: Klick → Edit -->
				<button
					onclick={() => editing = true}
					class="text-left w-full group"
					title="Task bearbeiten"
				>
					<span class="text-sm font-medium text-ibm-text leading-snug block group-hover:text-ibm-blue transition-colors">
						{task.title || '(kein Titel)'}
					</span>
				</button>

				<!-- Meta-Zeile -->
				<div class="flex flex-wrap items-center gap-1.5 mt-1.5">
					{#if task.area}
						<span class="text-xs bg-ibm-gray text-ibm-text-muted px-2 py-0.5 rounded">{task.area}</span>
					{/if}
					<span class="text-xs border px-2 py-0.5 rounded {PRIORITY_COLORS[task.priority]}">
						{PRIORITY_LABELS[task.priority]}
					</span>
					{#if task.topic}
						<span class="text-xs bg-gray-200 text-ibm-text-muted px-2 py-0.5 rounded">{task.topic}</span>
					{/if}
					{#if deadline}
						<span class="text-xs {isOverdue ? 'text-red-600 font-semibold' : 'text-orange-600'}">
							⏰ {deadline}
						</span>
					{/if}
					<span class="text-xs text-ibm-text-muted ml-auto">Score: {task.score}</span>
				</div>

				<!-- Expanded: Beschreibung + Tags + Blockiert-durch -->
				{#if expanded && (task.description || task.tags.length > 0 || task.blockedBy.length > 0 || task.dueDate)}
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
						{#if task.tags.length > 0}
							<div class="flex flex-wrap gap-1">
								{#each task.tags as tag}
									<span class="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">#{tag}</span>
								{/each}
							</div>
						{/if}
						{#if task.blockedBy.length > 0}
							<p class="text-xs text-red-600">🔒 Blockiert durch {task.blockedBy.length} Task(s)</p>
						{/if}
					</div>
				{/if}
			</div>

			<!-- Aktionen: Details + Löschen -->
				<div class="flex items-center gap-1 flex-shrink-0">
					{#if !verbose && (task.description || task.tags.length > 0)}
						<button
							onclick={() => _expanded = !_expanded}
							class="text-ibm-text-muted hover:text-ibm-text transition-colors p-1 text-xs"
							title={_expanded ? 'Weniger anzeigen' : 'Details anzeigen'}
							aria-label="Details"
						>{_expanded ? '▲' : '▼'}</button>
					{/if}
				<button
					onclick={ondelete}
					class="text-ibm-gray-dark hover:text-red-500 transition-colors p-1"
					title="Task löschen"
					aria-label="Löschen"
				>✕</button>
			</div>
		</div>
	</div>
</div>
