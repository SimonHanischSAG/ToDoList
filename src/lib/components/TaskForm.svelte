<!--
  TaskForm – Modal zum Erstellen oder Bearbeiten eines Tasks
  Wird mit task-Prop aufgerufen → Edit-Modus (vorausgefüllt)
  Wird ohne task-Prop aufgerufen → Neu-Modus (leer)
-->
<script>
	import { addTask, updateTask, tasks } from '$lib/stores/taskStore.svelte.js';
	import RichTextEditor from './RichTextEditor.svelte';

	/**
	 * @type {{
	 *   task?: import('$lib/model/task.js').Task,
	 *   onclose: () => void
	 * }}
	 */
	let { task = undefined, onclose } = $props();

	// task-Prop ist beim Öffnen fix → einmalige Initialisierung ist korrekt
	const t      = task;
	const isEdit = !!t;

	let title       = $state(t?.title       ?? '');
	let description = $state(t?.description ?? '');
	let priority    = $state(/** @type {import('$lib/model/task.js').TaskPriority} */ (t?.priority ?? 'normal'));
	let area        = $state(t?.area        ?? tasks.activeArea ?? '');
	let topic       = $state(t?.topic       ?? '');
	let dueDate     = $state(t?.dueDate     ?? '');
	let saving      = $state(false);

	/** Gibt ein Datum als YYYY-MM-DD-String zurück */
	function toDateStr(date) {
		return date.toISOString().slice(0, 10);
	}

	const quickDates = [
		{
			label: 'Today',
			fn: () => toDateStr(new Date())
		},
		{
			label: 'This week',
			fn: () => {
				const d = new Date();
				const day = d.getDay(); // 0 = Sun
				const diff = day === 0 ? 0 : 7 - day;
				d.setDate(d.getDate() + diff);
				return toDateStr(d);
			}
		},
		{
			label: 'This month',
			fn: () => {
				const d = new Date();
				return toDateStr(new Date(d.getFullYear(), d.getMonth() + 1, 0));
			}
		},
		{
			label: 'This quarter',
			fn: () => {
				const d = new Date();
				const quarterEndMonth = Math.floor(d.getMonth() / 3) * 3 + 3;
				return toDateStr(new Date(d.getFullYear(), quarterEndMonth, 0));
			}
		}
	];

	async function handleSubmit() {
		if (!title.trim()) return;
		saving = true;
		try {
			if (isEdit && t) {
				await updateTask(t.id, {
					title:       title.trim(),
					description: description.trim(),
					priority,
					area:        area.trim(),
					topic:       topic.trim(),
					dueDate:     dueDate || null
				});
			} else {
				await addTask({
					title:       title.trim(),
					description: description.trim(),
					priority,
					area:        area.trim(),
					topic:       topic.trim(),
					dueDate:     dueDate || null
				});
			}
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
	aria-label={isEdit ? 'Edit task' : 'New task'}
	onclick={(e) => e.target === e.currentTarget && onclose()}
	open
>
	<div class="bg-white rounded-t-2xl sm:rounded-xl w-full max-w-2xl p-8 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto">
		<div class="flex items-center justify-between">
			<h2 class="font-bold text-ibm-text">{isEdit ? 'Edit task' : 'New task'}</h2>
				<button onclick={onclose} class="text-ibm-text-muted hover:text-ibm-text" aria-label="Close">✕</button>
		</div>

		<form onsubmit={handleSubmit} class="space-y-3">
			<!-- Titel -->
			<div>
				<label class="block text-xs font-semibold text-ibm-text-muted mb-1" for="task-title">Title *</label>
					<input
						id="task-title"
						type="text"
						bind:value={title}
						placeholder="What needs to be done?"
					required
					class="w-full border border-ibm-gray-dark rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ibm-blue"
				/>
			</div>

			<!-- Beschreibung -->
			<div>
				<label class="block text-xs font-semibold text-ibm-text-muted mb-1">Details (optional)</label>
				<RichTextEditor bind:value={description} />
			</div>

			<!-- Priority + Area (2 columns) -->
				<div class="grid grid-cols-2 gap-3">
					<div>
						<label class="block text-xs font-semibold text-ibm-text-muted mb-1" for="task-prio">Priority</label>
						<select
							id="task-prio"
							bind:value={priority}
							class="w-full border border-ibm-gray-dark rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ibm-blue bg-white"
						>
							<option value="urgent">🔴 Critical</option>
							<option value="high">🟠 High</option>
							<option value="normal">🔵 Normal</option>
							<option value="low">⚪ Low</option>
						</select>
					</div>
					<div>
						<label class="block text-xs font-semibold text-ibm-text-muted mb-1" for="task-area">Area</label>
					<input
						id="task-area"
						type="text"
						bind:value={area}
						list="area-suggestions"
						class="w-full border border-ibm-gray-dark rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ibm-blue"
					/>
					<datalist id="area-suggestions">
						{#each tasks.areas as a}<option value={a}></option>{/each}
					</datalist>
				</div>
			</div>

			<!-- Topic + Deadline (2 columns) -->
				<div class="grid grid-cols-2 gap-3">
					<div>
						<label class="block text-xs font-semibold text-ibm-text-muted mb-1" for="task-topic">Topic</label>
					<input
						id="task-topic"
						type="text"
						bind:value={topic}
						list="topic-suggestions"
						class="w-full border border-ibm-gray-dark rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ibm-blue"
					/>
					<datalist id="topic-suggestions">
						{#each tasks.topics as tp}<option value={tp}></option>{/each}
					</datalist>
				</div>
				<div>
					<label class="block text-xs font-semibold text-ibm-text-muted mb-1" for="task-due">Due date</label>
					<input
						id="task-due"
						type="date"
						bind:value={dueDate}
						class="w-full border border-ibm-gray-dark rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ibm-blue"
					/>
					<div class="flex flex-wrap gap-1 mt-1.5">
						{#each quickDates as qd}
							<button
								type="button"
								onclick={() => (dueDate = qd.fn())}
								class="text-xs px-2 py-0.5 rounded border border-ibm-gray-dark text-ibm-text-muted hover:border-ibm-blue hover:text-ibm-blue transition-colors"
							>{qd.label}</button>
						{/each}
					</div>
				</div>
			</div>

			<!-- Speichern -->
			<button
				type="submit"
				disabled={saving || !title.trim()}
				class="w-full bg-ibm-blue hover:bg-ibm-blue-dark disabled:opacity-50 text-white font-semibold py-2.5 rounded-md text-sm transition-colors"
			>
				{saving ? 'Saving...' : isEdit ? 'Save changes' : 'Save task'}
			</button>
		</form>
	</div>
</dialog>
