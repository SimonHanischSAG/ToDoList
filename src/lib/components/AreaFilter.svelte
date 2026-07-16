<!--
  AreaFilter – Area-Zeile, Topic-Zeile und Score-Slider-Filter.

  Der Score-Slider filtert nach berechnetem Score (0-100), nicht nach Prio-Kategorie.
  Damit wird Aging automatisch berücksichtigt: ein 6 Monate alter Medium-High-Task
  (Score ~40) wird beim Slider-Wert 45 bereits herausgefiltert, obwohl seine
  nominelle Prio höher ist.
-->
<script>
	import { tasks } from '$lib/stores/taskStore.svelte.js';

	/**
	 * Prio-Markierungen auf der Slider-Skala.
	 * basePrio-Werte aus priority.js – zeigen den "frischen" Score einer Kategorie.
	 * Aging kann den tatsächlichen Score nach unten verschieben.
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

	/** Welcher Prio-Bereich liegt knapp über dem aktuellen minScore? */
	function activeLabel(minScore) {
		if (minScore === 0) return null;
		// Nächste Markierung, die >= minScore ist
		const above = SCORE_MARKS.find(m => m.score >= minScore);
		return above ?? SCORE_MARKS[SCORE_MARKS.length - 1];
	}

	/** Hinweis-Text, wenn Aging einen Task verschoben haben könnte */
	function agingHint(minScore) {
		if (minScore <= 0) return '';
		// Unterhalb von Normal-Basis (45) könnten gealterte Med-High-Tasks wegfallen
		if (minScore > 40 && minScore <= 60) return ' · gealterte Med-High ggfs. ausgeblendet';
		if (minScore > 25 && minScore <= 45) return ' · gealterte Normal/Med-High ggfs. ausgeblendet';
		if (minScore > 10 && minScore <= 30) return ' · nur frische oder höhere Prios sichtbar';
		return '';
	}

	// Slider-Wert direkt an tasks.minScore binden
	let sliderValue = $derived(tasks.minScore);
	// Prozentwert für den Track-Gradient (0–100)
	let trackPct = $derived(Math.round((sliderValue / 90) * 100));

	function onSliderInput(e) {
		tasks.minScore = Number(/** @type {HTMLInputElement} */ (e.target).value);
	}
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

<!-- Score-Slider-Filter -->
<div class="mt-2 px-0.5">
	<div class="flex items-center justify-between mb-1">
		<span class="text-xs text-ibm-text-muted">Min. Score:</span>

		{#if tasks.minScore === 0}
			<span class="text-xs text-ibm-text-muted">alle Tasks sichtbar</span>
		{:else}
			{@const mark = activeLabel(tasks.minScore)}
			<span class="text-xs font-semibold {mark?.color ?? ''}">
				≥ {tasks.minScore}
				{#if mark}
					<span class="font-normal text-ibm-text-muted">(~{mark.label})</span>
				{/if}
			</span>
			<button
				onclick={() => tasks.minScore = 0}
				class="text-xs text-ibm-text-muted hover:text-ibm-blue transition-colors ml-2"
				title="Filter zurücksetzen"
			>✕ reset</button>
		{/if}
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

	<!-- Aging-Hinweis -->
	{#if agingHint(tasks.minScore)}
		<p class="text-[10px] text-orange-500 mt-0.5 leading-tight">
			⏱{agingHint(tasks.minScore)}
		</p>
	{/if}
</div>

<style>
	.score-slider::-webkit-slider-thumb {
		appearance: none;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: #3b82d4;
		border: 2px solid white;
		box-shadow: 0 1px 3px rgba(0,0,0,0.2);
		cursor: pointer;
	}
	.score-slider::-moz-range-thumb {
		width: 14px;
		height: 14px;
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
