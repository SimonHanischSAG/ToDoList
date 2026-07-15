<!--
  Haupt-Seite: Task-Liste mit Filter, Suche und Score-Anzeige
-->
<script>
	import { tasks, setStatus, deleteTask } from '$lib/stores/taskStore.svelte.js';
	import TaskCard from '$lib/components/TaskCard.svelte';
	import AreaFilter from '$lib/components/AreaFilter.svelte';
	import FocusView from '$lib/components/FocusView.svelte';
	import TaskForm from '$lib/components/TaskForm.svelte';

	let showFocus   = $state(false);
	let showVerbose = $state(false);
	let showForm    = $state(false);
</script>

<div class="max-w-2xl mx-auto px-4 py-4">

	<!-- Sync-Indicator -->
	{#if tasks.syncing}
		<div class="bg-blue-50 border border-blue-200 text-blue-800 text-xs px-3 py-2 rounded mb-3">
			⟳ Synchronisiere mit OneDrive…
		</div>
	{/if}

	{#if tasks.error}
		<div class="bg-red-50 border border-red-200 text-red-800 text-xs px-3 py-2 rounded mb-3">
			⚠ {tasks.error}
		</div>
	{/if}

	<!-- Aktionsleiste -->
	<div class="flex gap-2 mb-4">
		<button
			onclick={() => { showFocus = !showFocus; if (showFocus) showVerbose = false; }}
			class="flex-1 bg-ibm-blue text-white text-sm font-semibold py-2 px-3 rounded-md hover:bg-ibm-blue-dark transition-colors"
		>
			{showFocus ? '← Alle Tasks' : '⭐ Focus'}
		</button>
		<button
			onclick={() => { showVerbose = !showVerbose; if (showVerbose) showFocus = false; }}
			class="flex-1 text-sm font-semibold py-2 px-3 rounded-md border transition-colors
				{showVerbose
					? 'bg-ibm-blue text-white border-ibm-blue hover:bg-ibm-blue-dark'
					: 'bg-white border-ibm-gray-dark text-ibm-text hover:bg-ibm-gray'}"
		>
			{showVerbose ? '← Kompakt' : '☰ Verbose'}
		</button>
		<button
			onclick={() => showForm = true}
			class="bg-white border border-ibm-gray-dark text-ibm-text text-sm font-semibold py-2 px-4 rounded-md hover:bg-ibm-gray transition-colors"
		>
			+ Neu
		</button>
	</div>

	{#if showFocus}
		<!-- Focus-Modus: Nur die Top-5 für heute -->
		<FocusView />
	{:else}
		<!-- Normale Listenansicht -->
		<div class="mb-4 space-y-2">
			<!-- Suche -->
			<input
				type="search"
				placeholder="Tasks durchsuchen…"
				bind:value={tasks.searchQuery}
				class="w-full border border-ibm-gray-dark rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ibm-blue"
			/>
			<!-- Area-Filter -->
			<AreaFilter />
		</div>

		<!-- Statistik-Zeile -->
		<div class="text-xs text-ibm-text-muted mb-3">
			{tasks.filtered.length} offene Tasks
			{#if tasks.activeArea} in <strong>{tasks.activeArea}</strong>{/if}
		</div>

		<!-- Task-Liste -->
		{#if tasks.loading}
			<div class="text-center text-ibm-text-muted py-12 text-sm">Lädt…</div>
		{:else if tasks.filtered.length === 0}
			<div class="text-center text-ibm-text-muted py-12 text-sm">
				Keine offenen Tasks {tasks.activeArea ? `in "${tasks.activeArea}"` : ''}.
			</div>
		{:else}
			<ul class="space-y-2">
					{#each tasks.filtered as task (task.id)}
						<li>
							<TaskCard
								{task}
								verbose={showVerbose}
								ondone={() => setStatus(task.id, 'done')}
								ondelete={() => deleteTask(task.id)}
							/>
						</li>
					{/each}
				</ul>
		{/if}
	{/if}
</div>

<!-- Neue-Task-Modal -->
{#if showForm}
	<TaskForm onclose={() => showForm = false} />
{/if}
