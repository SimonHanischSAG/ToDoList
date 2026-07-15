<!--
  AreaFilter – horizontale Scroll-Leiste mit allen Umfeldern (Areas) und Topics.
  Areas: Mehrfachauswahl möglich.
  Topic: Einfachauswahl (Toggle).
-->
<script>
	import { tasks } from '$lib/stores/taskStore.svelte.js';
</script>

<!-- Area-Filter -->
<div class="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
	<!-- "Alle" Button -->
	<button
		onclick={() => tasks.activeAreas = []}
		class="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors
		       {tasks.activeAreas.length === 0
		         ? 'bg-ibm-blue text-white border-ibm-blue'
		         : 'bg-white text-ibm-text-muted border-ibm-gray-dark hover:border-ibm-blue hover:text-ibm-blue'}"
	>
		All
		<span class="ml-1 opacity-70">
			{Object.values(tasks.countByArea).reduce((a, b) => a + b, 0)}
		</span>
	</button>

	<!-- Ein Button pro Area (Mehrfachauswahl) -->
	{#each tasks.areas as area}
		{@const count = tasks.countByArea[area] ?? 0}
		{#if count > 0}
			{@const active = tasks.activeAreas.includes(area)}
			<button
				onclick={() => tasks.toggleArea(area)}
				class="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors
				       {active
				         ? 'bg-ibm-blue text-white border-ibm-blue'
				         : 'bg-white text-ibm-text-muted border-ibm-gray-dark hover:border-ibm-blue hover:text-ibm-blue'}"
			>
				{area}
				<span class="ml-1 opacity-70">{count}</span>
			</button>
		{/if}
	{/each}
</div>

<!-- Topic-Filter (nur wenn Topics vorhanden) -->
{#if tasks.topics.length > 0}
	<div class="flex gap-2 overflow-x-auto pb-1 scrollbar-hide mt-1">
		<!-- Label -->
		<span class="flex-shrink-0 text-xs text-ibm-text-muted self-center pr-1">Topic:</span>

		<!-- "Alle Topics" Button -->
		<button
			onclick={() => tasks.activeTopic = ''}
			class="flex-shrink-0 text-xs px-3 py-1 rounded-full border transition-colors
			       {!tasks.activeTopic
			         ? 'bg-ibm-gray-dark text-ibm-text border-ibm-gray-dark'
			         : 'bg-white text-ibm-text-muted border-ibm-gray-dark hover:border-ibm-blue hover:text-ibm-blue'}"
		>
			All
		</button>

		{#each tasks.topics as topic}
			{@const count = tasks.countByTopic[topic] ?? 0}
			{#if count > 0}
				<button
					onclick={() => tasks.activeTopic = tasks.activeTopic === topic ? '' : topic}
					class="flex-shrink-0 text-xs px-3 py-1 rounded-full border transition-colors
					       {tasks.activeTopic === topic
					         ? 'bg-ibm-gray-dark text-ibm-text border-ibm-gray-dark'
					         : 'bg-white text-ibm-text-muted border-ibm-gray-dark hover:border-ibm-blue hover:text-ibm-blue'}"
				>
					{topic}
					<span class="ml-1 opacity-70">{count}</span>
				</button>
			{/if}
		{/each}
	</div>
{/if}
