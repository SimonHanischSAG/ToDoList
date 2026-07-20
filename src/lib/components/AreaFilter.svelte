<!--
  AreaFilter – Area-Zeile, Topic-Zeile und Score-Slider-Filter.

  Der Score-Slider filtert nach berechnetem Score (0-100), nicht nach Prio-Kategorie.
  Damit wird Aging automatisch berücksichtigt: ein 6 Monate alter Medium-High-Task
  (Score ~40) wird beim Slider-Wert 45 bereits herausgefiltert, obwohl seine
  nominelle Prio höher ist.
-->
<script>
	import { tasks } from '$lib/stores/taskStore.svelte.js';

	/** Scrollt eine Filter-Zeile um eine Seite nach links/rechts */
	function scrollRow(el, dir) {
		if (!el) return;
		el.scrollBy({ left: dir * 160, behavior: 'smooth' });
	}

	/** Ref-Variablen für die beiden scrollbaren Zeilen */
	let areaRow = $state(null);
	let topicRow = $state(null);

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

	/**
	 * Welche Prio-Kategorie entspricht dem aktuellen minScore?
	 * Wir suchen die Markierung mit dem höchsten Score der noch <= minScore ist
	 * (= die Kategorie auf deren Niveau der Slider gerade steht).
	 * Beispiel: minScore=50 → liegt zwischen Normal(45) und Med-High(60) → zeigt "Med-High"
	 * weil 60 die nächste Kategorie ist, die man gerade hereinlässt.
	 */
	function activeLabel(minScore) {
		if (minScore === 0) return null;
		// Kleinste Markierung deren Score >= minScore (= niedrigste sichtbare Kategorie)
		// SCORE_MARKS ist absteigend sortiert → von hinten suchen
		const mark = [...SCORE_MARKS].reverse().find(m => m.score >= minScore);
		return mark ?? SCORE_MARKS[0]; // Fallback: Critical
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
<div class="filter-row-wrapper">
	<span class="flex-shrink-0 text-xs text-ibm-text-muted self-center pr-1">Area:</span>
	<div class="filter-row" bind:this={areaRow}>
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
	<button class="scroll-btn" onclick={() => scrollRow(areaRow, -1)} aria-label="Scroll left">‹</button>
	<button class="scroll-btn" onclick={() => scrollRow(areaRow,  1)} aria-label="Scroll right">›</button>
</div>

<!-- Topic-Filter (nur wenn Topics vorhanden) -->
{#if tasks.visibleTopics.length > 0}
	<div class="filter-row-wrapper mt-1">
		<span class="flex-shrink-0 text-xs text-ibm-text-muted self-center pr-1">Topic:</span>
		<div class="filter-row" bind:this={topicRow}>
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
		<button class="scroll-btn" onclick={() => scrollRow(topicRow, -1)} aria-label="Scroll left">‹</button>
		<button class="scroll-btn" onclick={() => scrollRow(topicRow,  1)} aria-label="Scroll right">›</button>
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
	/* ── Filter-Zeile (Area / Topic) ── */
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
		/* Scrollbar auf Desktop sichtbar machen (dünn, dezent) */
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

	/* Pfeil-Buttons nur sichtbar wenn nötig (hover auf wrapper) */
	.scroll-btn {
		flex-shrink: 0;
		width: 20px;
		height: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 16px;
		line-height: 1;
		color: #9ca3af;
		background: transparent;
		border: none;
		padding: 0;
		cursor: pointer;
		transition: color 0.15s;
	}
	.scroll-btn:hover {
		color: #3b82d4;
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
