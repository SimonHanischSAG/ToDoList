<!--
  TaskCard – zeigt einen einzelnen Task in der Liste an
  Zeigt Score als farbigen Balken, Priority-Badge, Area und Deadline.
-->
<script>
	/** @type {{ task: import('$lib/model/task.js').Task, ondone: () => void, ondelete: () => void }} */
	let { task, ondone, ondelete } = $props();

	const PRIORITY_COLORS = {
		urgent: 'bg-red-100 text-red-800 border-red-200',
		high:   'bg-orange-100 text-orange-800 border-orange-200',
		normal: 'bg-blue-50 text-blue-800 border-blue-200',
		low:    'bg-gray-100 text-gray-600 border-gray-200'
	};

	const PRIORITY_LABELS = { urgent: 'Kritisch', high: 'Hoch', normal: 'Normal', low: 'Niedrig' };

	/** Farbe des Score-Balkens */
	function scoreColor(score) {
		if (score >= 75) return 'bg-red-500';
		if (score >= 50) return 'bg-orange-400';
		if (score >= 30) return 'bg-blue-400';
		return 'bg-gray-300';
	}

	/** Deadline-Text */
	function deadlineText(dueDate) {
		if (!dueDate) return null;
		const days = Math.round((new Date(dueDate) - new Date()) / 86400000);
		if (days < 0) return `${Math.abs(days)} Tage überfällig`;
		if (days === 0) return 'Heute fällig';
		if (days === 1) return 'Morgen fällig';
		return `In ${days} Tagen fällig`;
	}

	let expanded = $state(false);
	const deadline = $derived(deadlineText(task.dueDate));
	const isOverdue = $derived(task.dueDate && new Date(task.dueDate) < new Date());
</script>

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
				<!-- Titel -->
				<button
					onclick={() => expanded = !expanded}
					class="text-left w-full"
				>
					<span class="text-sm font-medium text-ibm-text leading-snug block">{task.title || '(kein Titel)'}</span>
				</button>

				<!-- Meta-Zeile -->
				<div class="flex flex-wrap items-center gap-1.5 mt-1.5">
					{#if task.area}
						<span class="text-xs bg-ibm-gray text-ibm-text-muted px-2 py-0.5 rounded">{task.area}</span>
					{/if}
					<span class="text-xs border px-2 py-0.5 rounded {PRIORITY_COLORS[task.priority]}">
						{PRIORITY_LABELS[task.priority]}
					</span>
					{#if task.customer}
						<span class="text-xs text-ibm-text-muted">Kunde: {task.customer}</span>
					{/if}
					{#if deadline}
						<span class="text-xs {isOverdue ? 'text-red-600 font-semibold' : 'text-orange-600'}">
							⏰ {deadline}
						</span>
					{/if}
					<span class="text-xs text-ibm-text-muted ml-auto">Score: {task.score}</span>
				</div>

				<!-- Expanded: Beschreibung + Tags + Blockiert-durch -->
				{#if expanded && (task.description || task.tags.length > 0 || task.blockedBy.length > 0)}
					<div class="mt-2 pt-2 border-t border-ibm-gray-dark space-y-1.5">
						{#if task.description && task.description !== task.title}
							<p class="text-xs text-ibm-text-muted whitespace-pre-wrap leading-relaxed">
								{task.description.slice(0, 400)}{task.description.length > 400 ? '…' : ''}
							</p>
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

			<!-- Löschen -->
			<button
				onclick={ondelete}
				class="text-ibm-gray-dark hover:text-red-500 transition-colors flex-shrink-0 p-1"
				title="Task löschen"
				aria-label="Löschen"
			>✕</button>
		</div>
	</div>
</div>
