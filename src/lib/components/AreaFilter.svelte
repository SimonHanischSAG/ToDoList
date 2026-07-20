<!--
  AreaFilter – area row, topic row and score slider filter.

  The score slider filters by calculated score (0–100), not by priority category.
  This automatically accounts for aging: a 6-month-old Medium-High task
  (score ~40) is already filtered out at slider value 45, even though its
  nominal priority is higher.
-->
<script>
	import { tasks } from '$lib/stores/taskStore.svelte.js';

	/**
	 * Priority markers on the slider scale.
	 * basePrio values from priority.js – show the "fresh" score of a category.
	 * Aging can shift the actual score downward.
	 */
	const SCORE_MARKS = [
		{ score: 90, label: 'Critical', short: 'Crit',  color: 'text-red-600' },
		{ score: 75, label: 'High',     short: 'High',  color: 'text-orange-500' },
		{ score: 60, label: 'Med-High', short: 'M-H',   color: 'text-yellow-600' },
		{ score: 45, label: 'Normal',   short: 'Norm',  color: 'text-blue-600' },
		{ score: 30, label: 'Low',      short: 'Low',   color: 'text-gray-500' },
		{ score: 15, label: 'Very Low', short: 'VLow',  color: 'text-gray-400' },
		{ score:  5, label: 'Someday',  short: 'Some',  color: 'text-slate-300' },
	];

	/**
	 * Which priority category corresponds to the current minScore?
	 * We look for the marker with the highest score still <= minScore
	 * (= the category level the slider is currently at).
	 * Example: minScore=50 → between Normal(45) and Med-High(60) → shows "Med-High"
	 * because 60 is the next category being let through.
	 */
	function activeLabel(minScore) {
		if (minScore === 0) return null;
		// Smallest marker whose score >= minScore (= lowest visible category)
		// SCORE_MARKS is sorted descending → search from the end
		const mark = [...SCORE_MARKS].reverse().find(m => m.score >= minScore);
		return mark ?? SCORE_MARKS[0]; // Fallback: Critical
	}

	/** Hint text when aging may have hidden some tasks */
	function agingHint(minScore) {
		if (minScore <= 0) return '';
		if (minScore > 40 && minScore <= 60) return ' · aged Med-High tasks may be hidden';
		if (minScore > 25 && minScore <= 45) return ' · aged Normal/Med-High tasks may be hidden';
		if (minScore > 10 && minScore <= 30) return ' · only recent or high-priority tasks visible';
		return '';
	}

	// Bind slider value directly to tasks.minScore
	let sliderValue = $derived(tasks.minScore);
	// Percentage for the track gradient (0–100)
	let trackPct = $derived(Math.round((sliderValue / 90) * 100));

	function onSliderInput(e) {
		tasks.minScore = Number(/** @type {HTMLInputElement} */ (e.target).value);
	}
</script>

<!-- Area-Filter -->
<div class="filter-row-wrapper">
	<span class="flex-shrink-0 text-xs text-ibm-text-muted self-center pr-1">Area:</span>
	<div class="filter-row">
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
</div>

<!-- Topic-Filter (nur wenn Topics vorhanden) -->
{#if tasks.visibleTopics.length > 0}
	<div class="filter-row-wrapper mt-1">
		<span class="flex-shrink-0 text-xs text-ibm-text-muted self-center pr-1">Topic:</span>
		<div class="filter-row">
			<button
				onclick={() => tasks.activeTopics = []}
				class="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors
				       {tasks.activeTopics.length === 0
				         ? 'bg-gray-400 text-white border-gray-400'
				         : 'bg-gray-200 text-ibm-text-muted border-ibm-gray-dark hover:border-gray-400 hover:text-ibm-text'}"
			>
				All
			</button>

			{#each tasks.visibleTopics as topic}
				{@const count = tasks.countByTopicFiltered[topic] ?? 0}
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
			{/each}
		</div>
	</div>
{/if}

<!-- Score-Slider-Filter -->
<div class="mt-2 px-0.5">
	<!-- Fixed 3-column row: left label | centre score | right reset -->
	<!-- All slots always rendered → no layout shift on show/hide -->
	<div class="flex items-center mb-1">
		<span class="text-xs text-ibm-text-muted shrink-0">Min. Score:</span>

		<span class="flex-1 text-center text-xs">
			{#if tasks.minScore === 0}
				<span class="text-ibm-text-muted">all tasks visible</span>
			{:else}
				{@const mark = activeLabel(tasks.minScore)}
				<span class="font-semibold {mark?.color ?? ''}">
					≥ {tasks.minScore}
					{#if mark}
						<span class="font-normal text-ibm-text-muted">(~{mark.label})</span>
					{/if}
				</span>
			{/if}
		</span>

		<button
			onclick={() => tasks.minScore = 0}
			class="text-xs text-ibm-text-muted hover:text-ibm-blue transition-colors shrink-0 ml-2
			       {tasks.minScore === 0 ? 'invisible' : ''}"
			title="Reset filter"
		>✕ reset</button>
	</div>

	<!-- Slider -->
	<div class="relative">
		<input
			type="range"
			min="0"
			max="90"
			step="5"
			value={sliderValue}
			oninput={onSliderInput}
			class="score-slider w-full h-1.5 rounded-full appearance-none cursor-pointer"
			style="background: linear-gradient(to right, #3b82d4 {trackPct}%, #e5e7eb {trackPct}%)"
			aria-label="Minimum Score Filter"
		/>

		<!-- Prio-Markierungen unter dem Slider -->
		<div class="relative mt-1 h-5">
			{#each SCORE_MARKS as mark}
				{@const pct = (mark.score / 90) * 100}
				{@const active = tasks.minScore > 0 && mark.score >= tasks.minScore}
				<span
					class="absolute -translate-x-1/2 text-[10px] leading-none transition-opacity
					       {active ? mark.color + ' font-semibold' : 'text-gray-300'}"
					style="left: {pct}%"
					title="{mark.label} (Score ~{mark.score})"
				>
					{mark.short}
				</span>
			{/each}
		</div>
	</div>

	<!-- Aging hint: always rendered, invisible when empty → no layout shift -->
	<p class="text-[10px] text-orange-500 mt-0.5 leading-tight h-3
	          {agingHint(tasks.minScore) ? '' : 'invisible'}">
		⏱{agingHint(tasks.minScore)}
	</p>
</div>

<style>
	/* ── Filter row (Area / Topic) ── */
	.filter-row-wrapper {
		display: flex;
		align-items: center;
		gap: 4px;
		min-width: 0;
	}

	.filter-row {
		display: flex;
		align-items: center;
		gap: 8px;
		overflow-x: auto;
		padding-bottom: 4px;
		/* Make scrollbar visible on desktop (thin, subtle) */
		scrollbar-width: thin;
		scrollbar-color: #cbd5e1 transparent;
		scroll-snap-type: x proximity;
		flex: 1;
		min-width: 0;
	}

	.filter-row::-webkit-scrollbar {
		height: 4px;
	}
	.filter-row::-webkit-scrollbar-thumb {
		background: #cbd5e1;
		border-radius: 2px;
	}
	.filter-row::-webkit-scrollbar-track {
		background: transparent;
	}

	/* Score-Slider */
	.score-slider::-webkit-slider-thumb {
		appearance: none;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: #3b82d4;
		border: 2px solid white;
		box-shadow: 0 1px 3px rgba(0,0,0,0.2);
		cursor: pointer;
		margin-top: -6px; /* zentriert den Thumb auf dem 6px-Track */
	}
	.score-slider::-moz-range-thumb {
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: #3b82d4;
		border: 2px solid white;
		box-shadow: 0 1px 3px rgba(0,0,0,0.2);
		cursor: pointer;
	}

	/* Track-Farbe: bereits passierte Werte blau, Rest grau */
	.score-slider::-webkit-slider-runnable-track {
		height: 6px;
		border-radius: 3px;
		background: #e5e7eb;
	}
	.score-slider::-moz-range-track {
		height: 6px;
		border-radius: 3px;
		background: #e5e7eb;
	}
	/* Linke Seite (Firefox) */
	.score-slider::-moz-range-progress {
		height: 6px;
		border-radius: 3px;
		background: #3b82d4;
	}
</style>
