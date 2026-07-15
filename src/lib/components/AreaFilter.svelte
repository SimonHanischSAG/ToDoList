<!--
  AreaFilter – horizontale Scroll-Leiste mit allen Umfeldern (Areas)
  Zeigt Anzahl offener Tasks pro Area als Badge.
-->
<script>
	import { tasks } from '$lib/stores/taskStore.svelte.js';
</script>

<div class="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
	<!-- "Alle" Button -->
	<button
		onclick={() => tasks.activeArea = ''}
		class="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors
		       {!tasks.activeArea
		         ? 'bg-ibm-blue text-white border-ibm-blue'
		         : 'bg-white text-ibm-text-muted border-ibm-gray-dark hover:border-ibm-blue hover:text-ibm-blue'}"
	>
		All
		<span class="ml-1 opacity-70">
			{Object.values(tasks.countByArea).reduce((a, b) => a + b, 0)}
		</span>
	</button>

	<!-- Ein Button pro Area -->
	{#each tasks.areas as area}
		{@const count = tasks.countByArea[area] ?? 0}
		{#if count > 0}
			<button
				onclick={() => tasks.activeArea = area}
				class="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors
				       {tasks.activeArea === area
				         ? 'bg-ibm-blue text-white border-ibm-blue'
				         : 'bg-white text-ibm-text-muted border-ibm-gray-dark hover:border-ibm-blue hover:text-ibm-blue'}"
			>
				{area}
				<span class="ml-1 opacity-70">{count}</span>
			</button>
		{/if}
	{/each}
</div>
