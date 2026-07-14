<!--
  Root-Layout der App
  Lokaler Modus: kein Login nötig.
  Box-Modus: wird aktiviert sobald IBM Box-App freigegeben ist.
-->
<script>
	import '../app.css';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { loadTasks, initialSync } from '$lib/stores/taskStore.svelte.js';
	import { exportToFile, importFromFile } from '$lib/storage/index.js';

	let { children } = $props();
	let ready = $state(false);
	let showImport = $state(false);
	let importMsg = $state('');

	onMount(async () => {
		if (!browser) return;
		await loadTasks();
		await initialSync();
		ready = true;
	});

	/** @param {Event} e */
	async function handleImport(e) {
		const input = /** @type {HTMLInputElement} */ (e.target);
		const file = input.files?.[0];
		if (!file) return;
		const count = await importFromFile(file);
		await loadTasks();
		importMsg = `${count} Tasks importiert ✓`;
		showImport = false;
		setTimeout(() => importMsg = '', 3000);
	}
</script>

{#if !ready}
	<div class="flex items-center justify-center min-h-screen bg-ibm-gray">
		<div class="text-center">
			<div class="text-4xl font-bold text-ibm-blue mb-2">IBM Todo</div>
			<div class="text-ibm-text-muted text-sm">Wird geladen…</div>
		</div>
	</div>

{:else}
	<div class="min-h-screen bg-ibm-gray flex flex-col">
		<header class="bg-ibm-text shadow-sm px-4 py-3 flex items-center justify-between">
			<span class="text-white font-bold text-lg">IBM Todo</span>
			<div class="flex items-center gap-3">
				<!-- Export -->
				<button
					onclick={exportToFile}
					class="text-gray-400 hover:text-white text-xs transition-colors"
					title="Alle Tasks als JSON exportieren"
				>
					↓ Export
				</button>
				<!-- Import -->
				<label class="text-gray-400 hover:text-white text-xs transition-colors cursor-pointer" title="Tasks aus JSON importieren">
					↑ Import
					<input type="file" accept=".json" onchange={handleImport} class="hidden" />
				</label>
			</div>
		</header>

		{#if importMsg}
			<div class="bg-green-50 border-b border-green-200 text-green-800 text-xs px-4 py-2 text-center">
				{importMsg}
			</div>
		{/if}

		<main class="flex-1">
			{@render children()}
		</main>
	</div>
{/if}
