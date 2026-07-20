<!--
  Root layout
  Box mode: users log in with their own Box account.
-->
<script>
	import '../app.css';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { loadTasks, initialSync, stopSync, tasks } from '$lib/stores/taskStore.svelte.js';
	import { exportToFile, importFromFile, schedulePush } from '$lib/storage/index.js';
	import { login, handleRedirect, getToken, getUser, logout as boxLogout, startTokenRefreshTimer, refreshToken } from '$lib/auth/box.js';
	import StoragePrompt from '$lib/components/StoragePrompt.svelte';

	const STORAGE_CHOICE_KEY = 'ibmtodo_storage_choice'; // 'box' | 'local'

	let { children } = $props();
	let ready = $state(false);
	let showPrompt = $state(false);
	let showImport = $state(false);
	let importMsg = $state('');
	let loggedIn = $state(false);
	let user = $state(/** @type {{ name: string, login: string } | null} */ (null));

	onMount(async () => {
		if (!browser) return;

		// Process OAuth redirect (returning from Box login)
		await handleRedirect();

		// If no valid access token but a refresh token exists
		// → silent background refresh (important on iPhone after closing tab)
		if (!getToken() && localStorage.getItem('box_refresh_token')) {
			await refreshToken();
		}

		loggedIn = !!getToken();
		user = getUser();

		// After successful Box login: save choice and start token refresh timer
		if (loggedIn) {
			localStorage.setItem(STORAGE_CHOICE_KEY, 'box');
			startTokenRefreshTimer();
		}

		// If no choice made yet and not logged in → show prompt
		const choice = localStorage.getItem(STORAGE_CHOICE_KEY);
		if (!choice && !loggedIn) {
			showPrompt = true;
			// Load app content from local cache anyway
			await loadTasks();
			ready = true;
			return;
		}

		await loadTasks();
		await initialSync();
		ready = true;
	});

	/** User selects local storage */
	function chooseLocal() {
		localStorage.setItem(STORAGE_CHOICE_KEY, 'local');
		showPrompt = false;
	}

	/** Logout: stop polling + end Box session */
	function logout() {
		stopSync();
		localStorage.removeItem(STORAGE_CHOICE_KEY);
		loggedIn = false;
		user = null;
		boxLogout();
	}

	/** Formats an ISO timestamp as "HH:MM" for the status indicator */
	function formatTime(iso) {
		if (!iso) return '';
		return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
	}

	/** @param {Event} e */
	async function handleImport(e) {
		const input = /** @type {HTMLInputElement} */ (e.target);
		const file = input.files?.[0];
		if (!file) return;
		const count = await importFromFile(file);
		await loadTasks();
		schedulePush();
		importMsg = `${count} tasks imported ✓`;
		showImport = false;
		setTimeout(() => importMsg = '', 3000);
	}
</script>

<!-- Storage selection on first launch -->
{#if showPrompt}
	<StoragePrompt onlocal={chooseLocal} />
{/if}

{#if !ready}
	<div class="flex items-center justify-center min-h-screen bg-ibm-gray">
		<div class="text-center">
			<div class="text-4xl font-bold text-ibm-blue mb-2">IBM Todo</div>
			<div class="text-ibm-text-muted text-sm">Loading…</div>
		</div>
	</div>

{:else}
	<!-- Outer wrapper: exactly viewport height, no own scrolling -->
	<div class="bg-ibm-gray flex flex-col" style="height: 100dvh; overflow: hidden;">
		<header class="bg-ibm-text shadow-sm px-4 py-3 flex items-center justify-between flex-shrink-0">
			<span class="text-white font-bold text-lg">IBM Todo</span>
			<div class="flex items-center gap-3">
				{#if loggedIn}
					<!-- Logged in: Export / Import / User / Logout -->
					<button
						onclick={exportToFile}
						class="text-gray-400 hover:text-white text-xs transition-colors"
						title="Export all tasks as JSON"
					>
						↓ Export
					</button>
					<label class="text-gray-400 hover:text-white text-xs transition-colors cursor-pointer" title="Import tasks from JSON">
						↑ Import
						<input type="file" accept=".json" onchange={handleImport} class="hidden" />
					</label>
					<!-- Sync indicator: shows last remote sync or active sync spinner -->
					{#if tasks.syncing}
						<span class="text-yellow-400 text-xs" title="Syncing with Box…">⟳ Sync…</span>
					{:else if tasks.lastSync}
						<span class="text-gray-500 text-xs" title="Last synced: {tasks.lastSync}">✓ {formatTime(tasks.lastSync)}</span>
					{/if}
					{#if user}
						<span class="text-gray-400 text-xs">{user.name}</span>
					{/if}
					<button
						onclick={logout}
						class="text-gray-400 hover:text-white text-xs transition-colors"
						title="Box logout"
					>
						Logout
					</button>
				{:else}
					<!-- Not logged in: login button -->
					<button
						onclick={login}
						class="bg-ibm-blue hover:bg-ibm-blue-dark text-white text-xs font-semibold px-3 py-1 rounded transition-colors"
					>
						Sign in with Box
					</button>
				{/if}
			</div>
		</header>

		{#if importMsg}
			<div class="bg-green-50 border-b border-green-200 text-green-800 text-xs px-4 py-2 text-center flex-shrink-0">
				{importMsg}
			</div>
		{/if}

		<!-- Scrollable content area: scrollbar-gutter reserves space permanently -->
		<main class="flex-1 min-h-0" style="overflow-y: auto; scrollbar-gutter: stable;">
			{@render children()}
		</main>
	</div>
{/if}
