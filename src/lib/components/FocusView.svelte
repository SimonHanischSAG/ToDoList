<!--
  FocusView – täglicher Focus-Modus
  Zeigt die Top-5 Tasks basierend auf dem berechneten Score.
-->
<script>
	import { tasks, setStatus } from '$lib/stores/taskStore.svelte.js';

	const PRIORITY_EMOJI = { urgent: '🔴', high: '🟠', normal: '🔵', low: '⚪' };
</script>

<div class="space-y-3">
	<div class="bg-ibm-blue text-white rounded-lg p-4">
		<h2 class="font-bold text-base">⭐ Dein Focus für heute</h2>
		<p class="text-blue-100 text-xs mt-1">
			Die {tasks.focus.length} wichtigsten Tasks nach Score
			{#if tasks.activeArea}in <strong>{tasks.activeArea}</strong>{/if}
		</p>
	</div>

	{#if tasks.focus.length === 0}
		<div class="text-center text-ibm-text-muted py-8 text-sm">
			🎉 Alle Tasks erledigt oder blockiert!
		</div>
	{:else}
		<ol class="space-y-2">
			{#each tasks.focus as task, i (task.id)}
				<li class="bg-white border border-ibm-gray-dark rounded-md p-3 flex items-start gap-3">
					<!-- Rang -->
					<span class="text-2xl font-bold text-ibm-gray-dark flex-shrink-0 w-8 text-center leading-tight">
						{i + 1}
					</span>

					<!-- Inhalt -->
					<div class="flex-1 min-w-0">
						<div class="text-sm font-semibold text-ibm-text">
							{PRIORITY_EMOJI[task.priority]} {task.title || '(kein Titel)'}
						</div>
						<div class="flex gap-2 mt-1 text-xs text-ibm-text-muted">
							{#if task.area}<span>{task.area}</span>{/if}
							<span class="font-medium text-ibm-blue">Score: {task.score}</span>
						</div>
					</div>

					<!-- Erledigt-Button -->
					<button
						onclick={() => setStatus(task.id, 'done')}
						class="flex-shrink-0 text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-1 rounded hover:bg-green-100 transition-colors"
					>
						✓ Erledigt
					</button>
				</li>
			{/each}
		</ol>
	{/if}
</div>
