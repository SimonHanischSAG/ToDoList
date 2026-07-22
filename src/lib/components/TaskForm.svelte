<!--
  TaskForm – modal for creating or editing a task
  Called with task prop → edit mode (pre-filled)
  Called without task prop → new task mode (empty)
-->
<script>
	import { onMount } from 'svelte';
	import { addTask, updateTask, setStatus, tasks } from '$lib/stores/taskStore.svelte.js';
	import RichTextEditor from './RichTextEditor.svelte';

	/**
	 * @type {{
	 *   task?: import('$lib/model/task.js').Task,
	 *   onclose: () => void
	 * }}
	 */
	let { task = undefined, onclose } = $props();

	/** @type {HTMLInputElement} */
	let titleEl;

	// Autofocus: focus programmatically – autofocus attribute does not work
	// reliably inside <dialog> elements across all browsers
	onMount(() => titleEl?.focus());


	// task prop is fixed when opening → one-time initialisation is correct
	const t      = task;
	const isEdit = !!t;

	let title       = $state(t?.title       ?? '');
	let description = $state(t?.description ?? '');
	let comments    = $state(t?.comments    ?? '');
	let priority    = $state(/** @type {import('$lib/model/task.js').TaskPriority} */ (t?.priority ?? 'normal'));
	let area        = $state(t?.area        ?? tasks.activeArea ?? '');
	let topic       = $state(t?.topic       ?? '');
	let dueDate     = $state(t?.dueDate     ?? '');
	let tags        = $state(/** @type {string[]} */ ([...(Array.isArray(t?.tags) ? t.tags : [])]));
	let tagInput    = $state('');
	let saving      = $state(false);

	/** Suggestions: all known tags, filtered by current input value */
	const tagSuggestions = $derived(
		tagInput.trim().length === 0
			? []
			: tasks.allTags.filter(
				tg => tg.toLowerCase().includes(tagInput.toLowerCase()) && !tags.includes(tg)
			)
	);

	// Area / Topic: custom dropdown (datalist is not supported on iOS)
	let areaFocused   = $state(false);
	let topicFocused  = $state(false);

	const areaSuggestions = $derived(
		areaFocused
			? tasks.areas.filter(a => a.toLowerCase().includes(area.toLowerCase()))
			: []
	);

	const topicSuggestions = $derived(
		topicFocused
			? tasks.topics.filter(tp => tp.toLowerCase().includes(topic.toLowerCase()))
			: []
	);

	/** Add a tag (prevent duplicates) */
	function addTag(value) {
		const v = value.trim().replace(/^#+/, '');
		if (v && !tags.includes(v)) tags = [...tags, v];
		tagInput = '';
	}

	function removeTag(tag) {
		tags = tags.filter(tg => tg !== tag);
	}

	function handleTagKeydown(e) {
		if (e.key === 'Enter' || e.key === ',') {
			e.preventDefault();
			addTag(tagInput);
		} else if (e.key === 'Backspace' && tagInput === '' && tags.length > 0) {
			tags = tags.slice(0, -1);
		}
	}
	let markAsDone = $state(false);

	/** Gibt true zurück, wenn der Nutzer etwas geändert hat */
	function isDirty() {
		if (!isEdit) {
			// Neuer Task: dirty wenn irgendetwas befüllt wurde
			return (
				title.trim() !== '' ||
				description.trim() !== '' ||
				comments.trim() !== '' ||
				priority !== 'normal' ||
				area.trim() !== (tasks.activeArea ?? '') ||
				topic.trim() !== '' ||
				dueDate !== '' ||
				tags.length > 0
			);
		}
		// Edit: dirty wenn sich etwas gegenüber dem Original geändert hat
		return (
			title.trim()       !== (t?.title       ?? '') ||
			description.trim() !== (t?.description ?? '') ||
			comments.trim()    !== (t?.comments    ?? '') ||
			priority           !== (t?.priority    ?? 'normal') ||
			area.trim()        !== (t?.area        ?? '') ||
			topic.trim()       !== (t?.topic       ?? '') ||
			dueDate            !== (t?.dueDate      ?? '') ||
			JSON.stringify(tags) !== JSON.stringify(t?.tags ?? [])
		);
	}

	/** Returns a date as a YYYY-MM-DD string */
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

	/** Ctrl+S speichert aus jedem Feld heraus */
	function handleKeydown(e) {
		if (e.ctrlKey && e.key === 's') {
			e.preventDefault();
			handleSubmit();
		}
	}

	async function handleSubmit(e) {
		e?.preventDefault();
		if (!title.trim()) return;
		saving = true;
		try {
			if (isEdit && t) {
					await updateTask(t.id, {
						title:       title.trim(),
						description: description.trim(),
						comments:    comments.trim(),
						priority,
						area:        area.trim(),
						topic:       topic.trim(),
						tags:        [...tags],
						dueDate:     dueDate || null
					});
					if (markAsDone) {
						await setStatus(t.id, 'done');
					}
				} else {
					await addTask({
						title:       title.trim(),
						description: description.trim(),
						comments:    comments.trim(),
						priority,
						area:        area.trim(),
						topic:       topic.trim(),
						tags:        [...tags],
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
	class="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-start justify-center p-4 pt-8 sm:pt-6 m-0 w-full h-full max-w-none max-h-none border-0"
	aria-label={isEdit ? 'Edit task' : 'New task'}
	onmousedown={(e) => { if (e.target === e.currentTarget && !isDirty()) onclose(); }}
	open
>
	<div class="bg-white rounded-t-2xl sm:rounded-xl w-full max-w-2xl p-8 space-y-4 shadow-xl max-h-[95vh] overflow-y-auto">
		<div class="flex items-center justify-between">
			<h2 class="font-bold text-ibm-text">{isEdit ? 'Edit task' : 'New task'}</h2>
				<button onclick={onclose} tabindex="-1" class="text-ibm-text-muted hover:text-ibm-text" aria-label="Close" title="Close window">✕</button>
		</div>

		<form onsubmit={handleSubmit} onkeydown={handleKeydown} class="space-y-3">
				<!-- Titel: autofocus + tabindex 1 -->
				<div>
					<label class="block text-xs font-semibold text-ibm-text-muted mb-1" for="task-title">Title *</label>
					<input
						id="task-title"
						type="text"
						bind:value={title}
						bind:this={titleEl}
						placeholder="What needs to be done?"
						required
						tabindex="1"
						autofocus
						class="w-full border border-ibm-gray-dark rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ibm-blue"
					/>
				</div>
		
				<!-- Beschreibung: tabindex 2 (im RichTextEditor) -->
				<div>
					<label class="block text-xs font-semibold text-ibm-text-muted mb-1">Details (optional)</label>
					<RichTextEditor bind:value={description} tabindex={2} />
				</div>
	
				<!-- Comments: tabindex 3 (im RichTextEditor) -->
				<div>
					<label class="block text-xs font-semibold text-ibm-text-muted mb-1">Comments (optional)</label>
					<RichTextEditor bind:value={comments} tabindex={3} placeholder="Internal notes, follow-ups, context..." />
				</div>
	
				<!-- Priority + Area (2 columns) -->
				<div class="grid grid-cols-2 gap-3">
					<div>
						<label class="block text-xs font-semibold text-ibm-text-muted mb-1" for="task-prio">Priority</label>
						<select
							id="task-prio"
							bind:value={priority}
							tabindex="4"
							class="w-full border border-ibm-gray-dark rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ibm-blue bg-white"
						>
							<option value="critical">🔴 Critical</option>
							<option value="high">🟠 High</option>
							<option value="medium-high">🟡 Medium-High</option>
							<option value="normal">🔵 Normal</option>
							<option value="low">🟢 Low</option>
							<option value="verylow">⚪ Very Low</option>
							<option value="someday">🩶 Someday</option>
						</select>
					</div>
					<div class="relative">
						<label class="block text-xs font-semibold text-ibm-text-muted mb-1" for="task-area">Area</label>
						<input
							id="task-area"
							type="text"
							bind:value={area}
							tabindex="5"
							autocomplete="off"
							onfocus={() => (areaFocused = true)}
							onblur={() => setTimeout(() => (areaFocused = false), 150)}
							class="w-full border border-ibm-gray-dark rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ibm-blue"
						/>
						{#if areaSuggestions.length > 0}
							<ul class="absolute z-50 left-0 right-0 mt-0.5 bg-white border border-ibm-gray-dark rounded-md shadow-md max-h-40 overflow-y-auto text-sm">
								{#each areaSuggestions as suggestion}
									<li>
										<button
											type="button"
											class="w-full text-left px-3 py-2 hover:bg-blue-50 hover:text-ibm-blue"
											onmousedown={() => { area = suggestion; areaFocused = false; }}
										>{suggestion}</button>
									</li>
								{/each}
							</ul>
						{/if}
					</div>
				</div>
		
				<!-- Topic + Deadline (2 columns) -->
				<div class="grid grid-cols-2 gap-3">
					<div class="relative">
						<label class="block text-xs font-semibold text-ibm-text-muted mb-1" for="task-topic">Topic</label>
						<input
							id="task-topic"
							type="text"
							bind:value={topic}
							tabindex="6"
							autocomplete="off"
							onfocus={() => (topicFocused = true)}
							onblur={() => setTimeout(() => (topicFocused = false), 150)}
							class="w-full border border-ibm-gray-dark rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ibm-blue"
						/>
						{#if topicSuggestions.length > 0}
							<ul class="absolute z-50 left-0 right-0 mt-0.5 bg-white border border-ibm-gray-dark rounded-md shadow-md max-h-40 overflow-y-auto text-sm">
								{#each topicSuggestions as suggestion}
									<li>
										<button
											type="button"
											class="w-full text-left px-3 py-2 hover:bg-blue-50 hover:text-ibm-blue"
											onmousedown={() => { topic = suggestion; topicFocused = false; }}
										>{suggestion}</button>
									</li>
								{/each}
							</ul>
						{/if}
					</div>
					<div>
						<label class="block text-xs font-semibold text-ibm-text-muted mb-1" for="task-due">Due date</label>
						<input
							id="task-due"
							type="date"
							bind:value={dueDate}
							tabindex="-1"
							class="w-full border border-ibm-gray-dark rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ibm-blue"
						/>
						<div class="flex flex-wrap gap-1 mt-1.5">
							{#each quickDates as qd}
								<button
									type="button"
									tabindex="-1"
									onclick={() => (dueDate = qd.fn())}
									class="text-xs px-2 py-0.5 rounded border border-ibm-gray-dark text-ibm-text-muted hover:border-ibm-blue hover:text-ibm-blue transition-colors"
								>{qd.label}</button>
							{/each}
						</div>
					</div>
				</div>
		
				<!-- Tags -->
				<div>
					<label class="block text-xs font-semibold text-ibm-text-muted mb-1" for="task-tags">Tags (optional)</label>
					<!-- Hinzugefügte Tags als Pills -->
					{#if tags.length > 0}
						<div class="flex flex-wrap gap-1 mb-1.5">
							{#each tags as tag}
								<span class="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded">
									#{tag}
									<button
										type="button"
										tabindex="-1"
										onclick={() => removeTag(tag)}
										class="text-blue-400 hover:text-blue-700 leading-none"
										aria-label="Tag entfernen"
									>×</button>
								</span>
							{/each}
						</div>
					{/if}
					<input
						id="task-tags"
						type="text"
						bind:value={tagInput}
						list="tag-suggestions"
						onkeydown={handleTagKeydown}
						onchange={() => { if (tagInput.trim()) addTag(tagInput); }}
						placeholder="Enter tag, press Enter or , to add…"
						tabindex="7"
						class="w-full border border-ibm-gray-dark rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ibm-blue"
					/>
					<datalist id="tag-suggestions">
						{#each tagSuggestions as tg}<option value={tg}></option>{/each}
					</datalist>
				</div>
	
				<!-- Mark as Done Checkbox (nur im Edit-Modus) -->
				{#if isEdit}
					<label class="flex items-center gap-2 cursor-pointer select-none text-sm text-ibm-text">
						<input
							type="checkbox"
							bind:checked={markAsDone}
							tabindex="8"
							class="w-4 h-4 rounded border-ibm-gray-dark accent-ibm-blue cursor-pointer"
						/>
						Mark as Done
					</label>
				{/if}
	
				<!-- Speichern: tabindex 9 -->
				<button
					type="submit"
					tabindex={isEdit ? 9 : 8}
					disabled={saving || !title.trim()}
					title="Speichern (Ctrl+S)"
					class="relative group w-full bg-ibm-blue hover:bg-ibm-blue-dark disabled:opacity-50 text-white font-semibold py-2.5 rounded-md text-sm transition-colors"
				>
					{saving ? 'Saving...' : 'Save'}
					<span class="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-800 px-2 py-0.5 text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity">
						Ctrl+S
					</span>
				</button>
			</form>
	</div>
</dialog>
