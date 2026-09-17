<!--
  One-time welcome modal on first app launch.
  Asks the user whether to use Box cloud sync or local browser storage.
  The choice is saved in localStorage and not shown again.
-->
<script>
	import { login } from '$lib/auth/box.js';

	/** @type {{ onlocal: () => void }} */
	let { onlocal } = $props();
</script>

<!-- Backdrop -->
<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
	<div class="bg-white rounded-lg shadow-lg max-w-md w-full p-6">

		<!-- Title -->
		<div class="text-lg font-bold text-ibm-text mb-1">Welcome to IBM ToDo List</div>
		<p class="text-sm text-ibm-text-muted mb-5">
			Where should your tasks be stored?
		</p>

		<!-- Option 1: Box -->
		<button
			onclick={login}
			class="w-full bg-ibm-blue hover:bg-ibm-blue-dark text-white text-sm font-semibold py-3 px-4 rounded-md transition-colors mb-3 text-left"
		>
			<div class="font-semibold mb-0.5">☁ Sign in with Box (recommended)</div>
			<div class="text-xs font-normal opacity-90">
				Data is stored securely in your personal IBM Box account –
				available across all devices, no data loss.
			</div>
		</button>

		<!-- Option 2: Local -->
		<button
			onclick={onlocal}
			class="w-full bg-white border border-ibm-gray-dark hover:bg-ibm-gray text-ibm-text text-sm font-semibold py-3 px-4 rounded-md transition-colors text-left"
		>
			<div class="font-semibold mb-0.5">💾 Continue without signing in</div>
			<div class="text-xs font-normal text-ibm-text-muted">
				Data stays in this browser only. It will be lost if you clear the browser cache,
				uninstall the browser, or switch to a different device.
			</div>
		</button>

	</div>
</div>
