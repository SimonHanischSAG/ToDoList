<!--
  Main page: task list with filter, search and score display
-->
<script>
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { tasks, setStatus, deleteTask } from '$lib/stores/taskStore.svelte.js';
	import { login } from '$lib/auth/box.js';
	import TaskCard from '$lib/components/TaskCard.svelte';
	import AreaFilter from '$lib/components/AreaFilter.svelte';
	import FocusView from '$lib/components/FocusView.svelte';
	import TaskForm from '$lib/components/TaskForm.svelte';

	let showFocus = $state(false);
	let showForm  = $state(false);

	onMount(() => {
		if (!browser) return;
		function handleKey(e) {
			// Ctrl+Y – open new task (only when no modal is open and no input is focused)
			if (e.ctrlKey && e.key === 'y' && !showForm) {
				const tag = document.activeElement?.tagName;
				if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !document.activeElement?.closest('[contenteditable]')) {
					e.preventDefault();
					showForm = true;
				}
			}
		}
		window.addEventListener('keydown', handleKey);
		return () => window.removeEventListener('keydown', handleKey);
	});
</script>

<div class="max-w-3xl mx-auto px-4 py-4">

	<!-- Sync indicator -->
	{#if tasks.syncing}
		<div class="bg-blue-50 border border-blue-200 text-blue-800 text-xs px-3 py-2 rounded mb-3">
			⟳ Syncing with Box...
		</div>
	{/if}

	{#if tasks.pushError}
		<div class="bg-red-50 border border-red-300 text-red-900 text-sm px-4 py-3 rounded mb-3 flex items-start justify-between gap-3">
			<span>⚠ <strong>Save failed:</strong> {tasks.pushError}</span>
			<button
				onclick={() => tasks.dismissPushError()}
				class="shrink-0 text-red-400 hover:text-red-700 font-bold text-base leading-none"
				aria-label="Dismiss"
				title="Dismiss"
			>✕</button>
		</div>
	{/if}

	{#if tasks.sessionExpired}
		<div class="bg-amber-50 border border-amber-300 text-amber-900 text-sm px-4 py-3 rounded mb-3 flex items-center justify-between gap-3">
			<span>⚠ Your session has expired. Please sign in again.</span>
			<button
				onclick={login}
				class="shrink-0 bg-ibm-blue hover:bg-ibm-blue-dark text-white text-xs font-semibold px-3 py-1.5 rounded transition-colors"
			>
				Sign in
			</button>
		</div>
	{:else if tasks.error}
		<div class="bg-red-50 border border-red-200 text-red-800 text-xs px-3 py-2 rounded mb-3">
			⚠ {tasks.error}
		</div>
	{/if}

	<!-- Action bar -->
	<div class="flex gap-2 mb-4">
		<button
			onclick={() => { showFocus = !showFocus; if (showFocus) tasks.showVerbose = false; }}
			class="flex-1 bg-ibm-blue text-white text-sm font-semibold py-2 px-3 rounded-md hover:bg-ibm-blue-dark transition-colors"
		>
			{showFocus ? '← All tasks' : '⭐ Focus'}
		</button>
		<button
			onclick={() => { tasks.showVerbose = !tasks.showVerbose; if (tasks.showVerbose) showFocus = false; }}
			class="flex-1 text-sm font-semibold py-2 px-3 rounded-md border transition-colors
				{tasks.showVerbose
					? 'bg-ibm-blue text-white border-ibm-blue hover:bg-ibm-blue-dark'
					: 'bg-white border-ibm-gray-dark text-ibm-text hover:bg-ibm-gray'}"
		>
			{tasks.showVerbose ? '← Compact' : '☰ Verbose'}
		</button>
		<button
			onclick={() => showForm = true}
			title="New task (Ctrl+Y)"
			class="relative group bg-white border border-ibm-gray-dark text-ibm-text text-sm font-semibold py-2 px-4 rounded-md hover:bg-ibm-gray transition-colors"
		>
			+ New
			<span class="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-800 px-2 py-0.5 text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity">
				Ctrl+Y
			</span>
		</button>
	</div>

	{#if showFocus}
		<!-- Focus mode: top-5 tasks for today -->
		<FocusView />
	{:else}
		<!-- Standard list view -->
		<div class="mb-4 space-y-2">
			<!-- Search -->
			<input
				type="search"
				placeholder="Search tasks..."
				bind:value={tasks.searchQuery}
				class="w-full border border-ibm-gray-dark rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ibm-blue"
			/>
			<!-- Area filter -->
			<AreaFilter />
		</div>

		<!-- Stats row -->
		<div class="text-xs text-ibm-text-muted mb-3 flex items-center justify-between">
			<span>
				{tasks.filtered.length} open task{tasks.filtered.length === 1 ? '' : 's'}
				{#if tasks.activeAreas.length > 0}
					in <strong>{tasks.activeAreas.join(', ')}</strong>
				{/if}
				{#if tasks.activeTopics.length > 0}
					· Topic: <strong>{tasks.activeTopics.join(', ')}</strong>
				{/if}
			</span>
			<button
				onclick={() => tasks.showDone = !tasks.showDone}
				class="text-xs px-2 py-0.5 rounded border transition-colors
					{tasks.showDone
						? 'bg-green-50 border-green-300 text-green-700'
						: 'border-ibm-gray-dark text-ibm-text-muted hover:border-ibm-blue hover:text-ibm-blue'}"
			>
				{tasks.showDone ? '✓ Hide completed' : '✓ Show completed'}
				{#if tasks.filteredDone.length > 0}
					<span class="ml-1 font-semibold">({tasks.filteredDone.length})</span>
				{/if}
			</button>
		</div>

		<!-- Open tasks -->
		{#if tasks.loading}
			<div class="text-center text-ibm-text-muted py-12 text-sm">Loading...</div>
		{:else if tasks.filtered.length === 0}
			<div class="text-center text-ibm-text-muted py-12 text-sm">
				No open tasks{tasks.activeAreas.length > 0 ? ` in "${tasks.activeAreas.join(', ')}"` : ''}{tasks.activeTopics.length > 0 ? ` · Topic: "${tasks.activeTopics.join(', ')}"` : ''}.
			</div>
		{:else}
			<ul class="space-y-2">
				{#each tasks.filtered as task (task.id)}
					<li>
						<TaskCard
							{task}
							verbose={tasks.showVerbose}
							ondone={() => setStatus(task.id, 'done')}
							ondelete={() => deleteTask(task.id)}
						/>
					</li>
				{/each}
			</ul>
		{/if}

		<!-- Completed tasks -->
		{#if tasks.showDone && tasks.filteredDone.length > 0}
			<div class="mt-6">
				<h3 class="text-xs font-semibold text-ibm-text-muted uppercase tracking-wide mb-2">
						Completed ({tasks.filteredDone.length})
					</h3>
				<ul class="space-y-2">
					{#each tasks.filteredDone as task (task.id)}
						<li>
							<TaskCard
								{task}
								done
								verbose={tasks.showVerbose}
								ondone={() => setStatus(task.id, 'open')}
								ondelete={() => deleteTask(task.id)}
							/>
						</li>
					{/each}
				</ul>
			</div>
		{/if}
	{/if}
</div>

<!-- New task modal -->
{#if showForm}
	<TaskForm onclose={() => showForm = false} />
{/if}
