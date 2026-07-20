<!--
  Root-Layout der App
  Box-Modus: Nutzer loggt sich mit eigenem Box-Account ein.
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

		// OAuth-Redirect verarbeiten (falls gerade nach Box-Login zurückgekehrt)
		await handleRedirect();

		// Falls kein gültiger Access Token vorhanden, aber ein Refresh Token existiert
		// → stiller Hintergrund-Refresh (wichtig auf iPhone nach Tab-Schließen)
		if (!getToken() && localStorage.getItem('box_refresh_token')) {
			await refreshToken();
		}

		loggedIn = !!getToken();
		user = getUser();

		// Nach erfolgreichem Box-Login Wahl merken und Token-Refresh-Timer starten
		if (loggedIn) {
			localStorage.setItem(STORAGE_CHOICE_KEY, 'box');
			startTokenRefreshTimer();
		}

		// Wenn noch keine Wahl getroffen und nicht gerade eingeloggt → Prompt zeigen
		const choice = localStorage.getItem(STORAGE_CHOICE_KEY);
		if (!choice && !loggedIn) {
			showPrompt = true;
			// App-Inhalt trotzdem schon laden (aus lokalem Cache)
			await loadTasks();
			ready = true;
			return;
		}

		await loadTasks();
		await initialSync();
		ready = true;
	});

	/** Nutzer wählt lokalen Storage */
	function chooseLocal() {
		localStorage.setItem(STORAGE_CHOICE_KEY, 'local');
		showPrompt = false;
	}

	/** Logout: Polling stoppen + Box-Session beenden */
	function logout() {
		stopSync();
		localStorage.removeItem(STORAGE_CHOICE_KEY);
		loggedIn = false;
		user = null;
		boxLogout();
	}

	/** Formatiert einen ISO-Zeitstempel als "HH:MM" für die Statusanzeige */
	function formatTime(iso) {
		if (!iso) return '';
		return new Date(iso).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' });
	}

	/** @param {Event} e */
	async function handleImport(e) {
		const input = /** @type {HTMLInputElement} */ (e.target);
		const file = input.files?.[0];
		if (!file) return;
		const count = await importFromFile(file);
		await loadTasks();
		schedulePush();
		importMsg = `${count} Tasks importiert ✓`;
		showImport = false;
		setTimeout(() => importMsg = '', 3000);
	}
</script>

<!-- Storage-Auswahl beim ersten Start -->
{#if showPrompt}
	<StoragePrompt onlocal={chooseLocal} />
{/if}

{#if !ready}
	<div class="flex items-center justify-center min-h-screen bg-ibm-gray">
		<div class="text-center">
			<div class="text-4xl font-bold text-ibm-blue mb-2">IBM Todo</div>
			<div class="text-ibm-text-muted text-sm">Wird geladen…</div>
		</div>
	</div>

{:else}
	<div class="min-h-screen bg-ibm-gray flex flex-col overflow-y-scroll">
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
					<!-- Sync-Indikator: zeigt letzten Remote-Sync oder aktiven Sync-Spinner -->
					{#if tasks.syncing}
						<span class="text-yellow-400 text-xs" title="Synchronisiere mit Box …">⟳ Sync…</span>
					{:else if tasks.lastSync}
						<span class="text-gray-500 text-xs" title="Zuletzt synchronisiert: {tasks.lastSync}">✓ {formatTime(tasks.lastSync)}</span>
					{/if}
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
