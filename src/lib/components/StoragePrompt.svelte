<!--
  Einmaliges Willkommen-Modal beim ersten App-Start.
  Fragt den Nutzer ob er Box Cloud-Sync oder lokalen Browser-Storage nutzen möchte.
  Die Wahl wird in localStorage gespeichert und nicht erneut gezeigt.
-->
<script>
	import { login } from '$lib/auth/box.js';

	/** @type {{ onlocal: () => void }} */
	let { onlocal } = $props();
</script>

<!-- Backdrop -->
<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
	<div class="bg-white rounded-lg shadow-lg max-w-md w-full p-6">

		<!-- Titel -->
		<div class="text-lg font-bold text-ibm-text mb-1">Willkommen bei IBM Todo</div>
		<p class="text-sm text-ibm-text-muted mb-5">
			Wo sollen deine Aufgaben gespeichert werden?
		</p>

		<!-- Option 1: Box -->
		<button
			onclick={login}
			class="w-full bg-ibm-blue hover:bg-ibm-blue-dark text-white text-sm font-semibold py-3 px-4 rounded-md transition-colors mb-3 text-left"
		>
			<div class="font-semibold mb-0.5">☁ Mit Box anmelden (empfohlen)</div>
			<div class="text-xs font-normal opacity-90">
				Daten werden sicher in deinem persönlichen IBM Box-Account gespeichert –
				geräteübergreifend verfügbar, kein Datenverlust.
			</div>
		</button>

		<!-- Option 2: Lokal -->
		<button
			onclick={onlocal}
			class="w-full bg-white border border-ibm-gray-dark hover:bg-ibm-gray text-ibm-text text-sm font-semibold py-3 px-4 rounded-md transition-colors text-left"
		>
			<div class="font-semibold mb-0.5">💾 Ohne Anmeldung fortfahren</div>
			<div class="text-xs font-normal text-ibm-text-muted">
				Daten bleiben nur in diesem Browser. Sie gehen verloren wenn du den Browser-Cache
				leerst, den Browser deinstallierst oder ein anderes Gerät nutzt.
			</div>
		</button>

	</div>
</div>
