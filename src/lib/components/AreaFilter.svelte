<!--
  AreaFilter – Area-Zeile, Topic-Zeile und Prio-Zeile.
-->
<script>
	import { tasks } from '$lib/stores/taskStore.svelte.js';

	const PRIOS = [
		{ value: 'urgent',  label: 'Critical', cls: 'border-red-300 text-red-700',     hiddenCls: 'bg-red-50 line-through opacity-50' },
		{ value: 'high',    label: 'High',     cls: 'border-orange-300 text-orange-700', hiddenCls: 'bg-orange-50 line-through opacity-50' },
		{ value: 'normal',  label: 'Normal',   cls: 'border-blue-300 text-blue-700',    hiddenCls: 'bg-blue-50 line-through opacity-50' },
		{ value: 'low',     label: 'Low',      cls: 'border-gray-300 text-gray-500',    hiddenCls: 'bg-gray-100 line-through opacity-50' },
		{ value: 'verylow', label: 'Very Low', cls: 'border-gray-200 text-gray-400',    hiddenCls: 'bg-gray-50 line-through opacity-40' },
	];
</script>

<!-- Area-Filter -->
<div class="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
	<span class="flex-shrink-0 text-xs text-ibm-text-muted self-center">Area:</span>

	<button
		onclick={() => tasks.activeAreas = []}
		class="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors
		       {tasks.activeAreas.length === 0
		         ? 'bg-ibm-blue text-white border-ibm-blue'
		         : 'bg-ibm-gray text-ibm-text-muted border-ibm-gray-dark hover:border-ibm-blue hover:text-ibm-blue'}"
	>
		All
		<span class="ml-1 opacity-70">{Object.values(tasks.countByArea).reduce((a, b) => a + b, 0)}</span>
	</button>

	{#each tasks.areas as area}
		{@const count = tasks.countByArea[area] ?? 0}
		{#if count > 0}
			{@const active = tasks.activeAreas.includes(area)}
			<button
				onclick={() => tasks.toggleArea(area)}
				class="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors
				       {active
				         ? 'bg-ibm-blue text-white border-ibm-blue'
				         : 'bg-ibm-gray text-ibm-text-muted border-ibm-gray-dark hover:border-ibm-blue hover:text-ibm-blue'}"
			>
				{area}
				<span class="ml-1 opacity-70">{count}</span>
			</button>
		{/if}
	{/each}
</div>

<!-- Topic-Filter (nur wenn Topics vorhanden) -->
{#if tasks.topics.length > 0}
	<div class="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide mt-1">
		<span class="flex-shrink-0 text-xs text-ibm-text-muted self-center">Topic:</span>

		<button
			onclick={() => tasks.activeTopics = []}
			class="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors
			       {tasks.activeTopics.length === 0
			         ? 'bg-gray-400 text-white border-gray-400'
			         : 'bg-gray-200 text-ibm-text-muted border-ibm-gray-dark hover:border-gray-400 hover:text-ibm-text'}"
		>
			All
		</button>

		{#each tasks.topics as topic}
			{@const count = tasks.countByTopic[topic] ?? 0}
			{#if count > 0}
				{@const active = tasks.activeTopics.includes(topic)}
				<button
					onclick={() => tasks.toggleTopic(topic)}
					class="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors
					       {active
					         ? 'bg-gray-400 text-white border-gray-400'
					         : 'bg-gray-200 text-ibm-text-muted border-ibm-gray-dark hover:border-gray-400 hover:text-ibm-text'}"
				>
					{topic}
					<span class="ml-1 opacity-70">{count}</span>
				</button>
			{/if}
		{/each}
	</div>
{/if}

<!-- Prio-Filter -->
<div class="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide mt-1">
	<span class="flex-shrink-0 text-xs text-ibm-text-muted self-center">Prio:</span>

	{#each PRIOS as prio}
		{@const hidden = tasks.hiddenPriorities.includes(prio.value)}
		<button
			onclick={() => tasks.togglePriority(prio.value)}
			class="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors
			       {hidden
			         ? prio.hiddenCls + ' border-transparent'
			         : prio.cls + ' bg-white hover:opacity-75'}"
			title={hidden ? `${prio.label} einblenden` : `${prio.label} ausblenden`}
		>
			{hidden ? '✕ ' : ''}{prio.label}
		</button>
	{/each}

	{#if tasks.hiddenPriorities.length > 0}
		<button
			onclick={() => { tasks.hiddenPriorities.forEach(p => tasks.togglePriority(p)); }}
			class="flex-shrink-0 text-xs px-2 py-1.5 text-ibm-text-muted hover:text-ibm-blue transition-colors"
		>
			alle einblenden
		</button>
	{/if}
</div>
