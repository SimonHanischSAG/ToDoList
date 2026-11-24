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
	import { login, handleRedirect, getToken, getUser, logout as boxLogout, startTokenRefreshTimer, refreshToken, LOGIN_LABEL, LOGOUT_LABEL } from '$lib/auth/index.js';
	import StoragePrompt from '$lib/components/StoragePrompt.svelte';

	const STORAGE_CHOICE_KEY = 'ibmtodo_storage_choice'; // 'box' | 'local'

	let { children } = $props();
	let ready = $state(false);
	let loadingStep = $state('Starting…');
	let showPrompt = $state(false);
	let showImport = $state(false);
	let importMsg = $state('');
	let loggedIn = $state(false);
	let user = $state(/** @type {{ name: string, login: string } | null} */ (null));

	/** After the folder has been (re-)connected by a user click: start syncing without reload */
	async function onFolderConnected() {
		loggedIn = !!getToken();
		user = getUser();
		if (!loggedIn) return;
		localStorage.setItem(STORAGE_CHOICE_KEY, 'box');
		showPrompt = false;
		tasks.dismissPushError();
		await initialSync();
	}

	onMount(() => {
		window.addEventListener('folder-connected', onFolderConnected);
		init().catch((err) => {
			// Never stay on the loading screen because of an unexpected startup error
			console.error('[Init] Startup failed:', err);
			ready = true;
		});
		return () => window.removeEventListener('folder-connected', onFolderConnected);
	});

	/**
	 * Resolves with the promise result, or with `fallback` if it does not settle in time.
	 * Prevents a hanging browser API (IndexedDB, folder permission) from blocking startup.
	 * @template T
	 * @param {string} step
	 * @param {Promise<T>} promise
	 * @param {T} fallback
	 * @param {number} ms
	 * @returns {Promise<T>}
	 */
	function withTimeout(step, promise, fallback, ms = 5000) {
		loadingStep = step;
		return new Promise((resolve) => {
			const timer = setTimeout(() => {
				console.warn(`[Init] "${step}" did not finish within ${ms} ms – continuing.`);
				resolve(fallback);
			}, ms);
			promise.then(
				(v) => { clearTimeout(timer); resolve(v); },
				(err) => { clearTimeout(timer); console.warn(`[Init] "${step}" failed:`, err); resolve(fallback); }
			);
		});
	}

	async function init() {
		if (!browser) return;

		// Process OAuth redirect (returning from Box login) / restore folder handle
		await withTimeout('Restoring connection…', handleRedirect(), false);

		// If no valid access token but a refresh token exists
		// → silent background refresh (important on iPhone after closing tab)
		if (!getToken() && localStorage.getItem('box_refresh_token')) {
			await withTimeout('Refreshing session…', refreshToken(), false);
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
			await withTimeout('Loading local cache…', loadTasks(), undefined, 8000);
			ready = true;
			return;
		}

		// Show the app from the local cache right away; the remote sync runs in the
		// background so a slow/blocked folder (e.g. Box Drive not started yet after
		// a reboot) can never leave the page stuck on "Loading…".
		await withTimeout('Loading local cache…', loadTasks(), undefined, 8000);
		ready = true;
		await initialSync();
	}

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
			<div class="text-4xl font-bold text-ibm-blue mb-2">IBM ToDo List</div>
			<div class="text-ibm-text-muted text-sm">Loading…</div>
			<div class="text-ibm-text-muted text-xs mt-1">{loadingStep}</div>
		</div>
	</div>

{:else}
	<!-- Outer wrapper: exactly viewport height, no own scrolling -->
	<div class="bg-ibm-gray flex flex-col" style="height: 100dvh; overflow: hidden;">
		<header class="bg-ibm-text shadow-sm px-4 py-3 flex items-center justify-between flex-shrink-0">
			<span class="text-white font-bold text-lg">IBM ToDo List</span>
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
						<span class="text-yellow-400 text-xs" title="Syncing with folder…">⟳ Sync…</span>
					{:else if tasks.lastSync}
						<span class="text-gray-500 text-xs" title="Last synced: {tasks.lastSync}">✓ {formatTime(tasks.lastSync)}</span>
					{/if}
					{#if user}
						<span class="text-gray-400 text-xs">{user.name}</span>
					{/if}
					<button
						onclick={logout}
						class="text-gray-400 hover:text-white text-xs transition-colors"
						title={LOGOUT_LABEL}
					>
						{LOGOUT_LABEL}
					</button>
				{:else}
					<!-- Not logged in: login button -->
					<button
						onclick={login}
						class="bg-ibm-blue hover:bg-ibm-blue-dark text-white text-xs font-semibold px-3 py-1 rounded transition-colors"
					>
						{LOGIN_LABEL}
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
