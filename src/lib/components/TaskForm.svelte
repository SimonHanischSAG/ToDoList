<!--
  TaskForm – Modal zum Erstellen eines neuen Tasks
-->
<script>
	import { addTask } from '$lib/stores/taskStore.svelte.js';
	import { tasks } from '$lib/stores/taskStore.svelte.js';

	/** @type {{ onclose: () => void }} */
	let { onclose } = $props();

	let title = $state('');
	let description = $state('');
	let priority = $state(/** @type {import('$lib/model/task.js').TaskPriority} */ ('normal'));
	let area = $state(tasks.activeArea ?? '');
	let customer = $state('');
	let dueDate = $state('');
	let saving = $state(false);

	async function handleSubmit() {
		if (!title.trim()) return;
		saving = true;
		try {
			await addTask({
				title: title.trim(),
				description: description.trim(),
				priority,
				area: area.trim(),
				customer: customer.trim(),
				dueDate: dueDate || null
			});
			onclose();
		} finally {
			saving = false;
		}
	}
</script>

<!-- Natives dialog-Element: korrekte Accessibility + Escape-Taste -->
<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
<dialog
	class="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4 m-0 w-full h-full max-w-none max-h-none border-0"
	aria-label="Neuer Task"
	onclick={(e) => e.target === e.currentTarget && onclose()}
	open
>
	<!-- Modal -->
	<div class="bg-white rounded-t-2xl sm:rounded-xl w-full max-w-md p-5 space-y-4 shadow-xl">
		<div class="flex items-center justify-between">
			<h2 class="font-bold text-ibm-text">Neuer Task</h2>
			<button onclick={onclose} class="text-ibm-text-muted hover:text-ibm-text" aria-label="Schließen">✕</button>
		</div>

		<form onsubmit={handleSubmit} class="space-y-3">
			<!-- Titel -->
			<div>
				<label class="block text-xs font-semibold text-ibm-text-muted mb-1" for="task-title">Titel *</label>
				<input
					id="task-title"
					type="text"
					bind:value={title}
					placeholder="Was muss getan werden?"
					required
					class="w-full border border-ibm-gray-dark rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ibm-blue"
				/>
			</div>

			<!-- Beschreibung -->
			<div>
				<label class="block text-xs font-semibold text-ibm-text-muted mb-1" for="task-desc">Details (optional)</label>
				<textarea
					id="task-desc"
					bind:value={description}
					rows="3"
					placeholder="Weitere Details, Kontext, Links…"
					class="w-full border border-ibm-gray-dark rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ibm-blue resize-none"
				></textarea>
			</div>

			<!-- Priorität + Area (2 Spalten) -->
			<div class="grid grid-cols-2 gap-3">
				<div>
					<label class="block text-xs font-semibold text-ibm-text-muted mb-1" for="task-prio">Priorität</label>
					<select
						id="task-prio"
						bind:value={priority}
						class="w-full border border-ibm-gray-dark rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ibm-blue bg-white"
					>
						<option value="urgent">🔴 Kritisch</option>
						<option value="high">🟠 Hoch</option>
						<option value="normal">🔵 Normal</option>
						<option value="low">⚪ Niedrig</option>
					</select>
				</div>
				<div>
					<label class="block text-xs font-semibold text-ibm-text-muted mb-1" for="task-area">Umfeld</label>
					<input
						id="task-area"
						type="text"
						bind:value={area}
						placeholder="z.B. MFT, SelfEdi…"
						list="area-suggestions"
						class="w-full border border-ibm-gray-dark rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ibm-blue"
					/>
					<datalist id="area-suggestions">
						{#each tasks.areas as a}<option value={a}></option>{/each}
					</datalist>
				</div>
			</div>

			<!-- Kunde + Deadline (2 Spalten) -->
			<div class="grid grid-cols-2 gap-3">
				<div>
					<label class="block text-xs font-semibold text-ibm-text-muted mb-1" for="task-customer">Kunde</label>
					<input
						id="task-customer"
						type="text"
						bind:value={customer}
						placeholder="z.B. L, Ö, Int…"
						class="w-full border border-ibm-gray-dark rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ibm-blue"
					/>
				</div>
				<div>
					<label class="block text-xs font-semibold text-ibm-text-muted mb-1" for="task-due">Deadline</label>
					<input
						id="task-due"
						type="date"
						bind:value={dueDate}
						class="w-full border border-ibm-gray-dark rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ibm-blue"
					/>
				</div>
			</div>

			<!-- Speichern -->
			<button
				type="submit"
				disabled={saving || !title.trim()}
				class="w-full bg-ibm-blue hover:bg-ibm-blue-dark disabled:opacity-50 text-white font-semibold py-2.5 rounded-md text-sm transition-colors"
			>
				{saving ? 'Wird gespeichert…' : 'Task speichern'}
			</button>
		</form>
	</div>
</dialog>
