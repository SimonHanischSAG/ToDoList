<!--
  Root-Layout der App
  Box-Modus: Nutzer loggt sich mit eigenem Box-Account ein.
-->
<script>
	import '../app.css';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { loadTasks, initialSync } from '$lib/stores/taskStore.svelte.js';
	import { exportToFile, importFromFile } from '$lib/storage/index.js';
	import { login, handleRedirect, getToken, getUser, logout } from '$lib/auth/box.js';

	let { children } = $props();
	let ready = $state(false);
	let showImport = $state(false);
	let importMsg = $state('');
	let loggedIn = $state(false);
	let user = $state(/** @type {{ name: string, login: string } | null} */ (null));

	onMount(async () => {
		if (!browser) return;
		// OAuth-Redirect verarbeiten (falls gerade nach Box-Login zurückgekehrt)
		await handleRedirect();
		loggedIn = !!getToken();
		user = getUser();
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
				{#if loggedIn}
					<!-- Eingeloggt: Export / Import / Nutzer / Logout -->
					<button
						onclick={exportToFile}
						class="text-gray-400 hover:text-white text-xs transition-colors"
						title="Alle Tasks als JSON exportieren"
					>
						↓ Export
					</button>
					<label class="text-gray-400 hover:text-white text-xs transition-colors cursor-pointer" title="Tasks aus JSON importieren">
						↑ Import
						<input type="file" accept=".json" onchange={handleImport} class="hidden" />
					</label>
					{#if user}
						<span class="text-gray-400 text-xs">{user.name}</span>
					{/if}
					<button
						onclick={logout}
						class="text-gray-400 hover:text-white text-xs transition-colors"
						title="Box-Logout"
					>
						Logout
					</button>
				{:else}
					<!-- Nicht eingeloggt: Login-Button -->
					<button
						onclick={login}
						class="bg-ibm-blue hover:bg-ibm-blue-dark text-white text-xs font-semibold px-3 py-1 rounded transition-colors"
					>
						Mit Box anmelden
					</button>
				{/if}
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
