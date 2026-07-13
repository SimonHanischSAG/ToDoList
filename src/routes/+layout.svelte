<!--
  Root-Layout der App
  Lädt MSAL, prüft Login-Status, initialisiert Sync
-->
<script>
	import '../app.css';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { getAccount, login } from '$lib/auth/msal.js';
	import { loadTasks, initialSync } from '$lib/stores/taskStore.svelte.js';

	let { children } = $props();

	/** @type {import('@azure/msal-browser').AccountInfo | null} */
	let account = $state(null);
	let checking = $state(true);

	onMount(async () => {
		if (!browser) return;
		account = await getAccount();
		checking = false;
		if (account) {
			await loadTasks();          // erst lokalen Cache laden (schnell)
			await initialSync();        // dann OneDrive synchronisieren
		}
	});
</script>

{#if checking}
	<!-- Splash Screen während MSAL initialisiert -->
	<div class="flex items-center justify-center min-h-screen bg-ibm-gray">
		<div class="text-center">
			<div class="text-4xl font-bold text-ibm-blue mb-2">IBM Todo</div>
			<div class="text-ibm-text-muted text-sm">Wird geladen…</div>
		</div>
	</div>

{:else if !account}
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
				Mit IBM-Account anmelden
			</button>
			<p class="text-xs text-ibm-text-muted mt-4">
				Deine Daten werden in deinem persönlichen OneDrive gespeichert.
			</p>
		</div>
	</div>

{:else}
	<!-- App-Shell: Navigation + Hauptinhalt -->
	<div class="min-h-screen bg-ibm-gray flex flex-col">
		<!-- Top-Navigation -->
		<header class="bg-ibm-text shadow-sm px-4 py-3 flex items-center justify-between">
			<span class="text-white font-bold text-lg">IBM Todo</span>
			<span class="text-gray-400 text-sm">{account.username}</span>
		</header>

		<!-- Seiteninhalt -->
		<main class="flex-1">
			{@render children()}
		</main>
	</div>
{/if}
