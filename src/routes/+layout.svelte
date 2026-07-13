<!--
  Root-Layout der App
  Verarbeitet Box OAuth Redirect, prüft Login-Status, initialisiert Sync
-->
<script>
	import '../app.css';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { handleRedirect, getUser, login, logout } from '$lib/auth/box.js';
	import { loadTasks, initialSync } from '$lib/stores/taskStore.svelte.js';

	let { children } = $props();

	/** @type {{ name: string, login: string } | null} */
	let user = $state(null);
	let checking = $state(true);

	onMount(async () => {
		if (!browser) return;

		// Redirect von Box verarbeiten (falls code in URL)
		const loggedIn = await handleRedirect();

		user = getUser();
		checking = false;

		if (user || loggedIn) {
			user = getUser();
			await loadTasks();
			await initialSync();
		}
	});
</script>

{#if checking}
	<div class="flex items-center justify-center min-h-screen bg-ibm-gray">
		<div class="text-center">
			<div class="text-4xl font-bold text-ibm-blue mb-2">IBM Todo</div>
			<div class="text-ibm-text-muted text-sm">Wird geladen…</div>
		</div>
	</div>

{:else if !user}
	<!-- Login-Screen -->
	<div class="flex items-center justify-center min-h-screen bg-ibm-gray">
		<div class="bg-white rounded-lg p-10 shadow-sm text-center max-w-sm w-full mx-4">
			<div class="text-3xl font-bold text-ibm-blue mb-1">IBM Todo</div>
			<p class="text-ibm-text-muted text-sm mb-8">
				Intelligente Aufgabenverwaltung für IBM-Mitarbeiter
			</p>
			<button
				onclick={login}
				class="w-full bg-ibm-blue hover:bg-ibm-blue-dark text-white font-semibold py-3 px-6 rounded-md transition-colors"
			>
				Mit IBM Box anmelden
			</button>
			<p class="text-xs text-ibm-text-muted mt-4">
				Deine Daten werden in deinem persönlichen IBM Box-Account gespeichert.
			</p>
		</div>
	</div>

{:else}
	<!-- App-Shell -->
	<div class="min-h-screen bg-ibm-gray flex flex-col">
		<header class="bg-ibm-text shadow-sm px-4 py-3 flex items-center justify-between">
			<span class="text-white font-bold text-lg">IBM Todo</span>
			<div class="flex items-center gap-3">
				<span class="text-gray-400 text-sm">{user.name}</span>
				<button
					onclick={logout}
					class="text-gray-500 hover:text-white text-xs transition-colors"
				>
					Abmelden
				</button>
			</div>
		</header>

		<main class="flex-1">
			{@render children()}
		</main>
	</div>
{/if}
