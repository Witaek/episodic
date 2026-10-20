<script lang="ts">
	import type { Episode } from '$lib/catalog/types';
	import { formatDate, formatDateTime, formatRuntime, isPast, relativeDay } from '$lib/format';
	import Img from './Img.svelte';

	interface Props {
		episode: Episode;
		/** False when no episode in the list has a still, so rows stay compact. */
		showStill?: boolean;
	}

	let { episode, showStill = true }: Props = $props();

	const aired = $derived(
		episode.airAt ? new Date(episode.airAt) <= new Date() : isPast(episode.airDate)
	);
	const when = $derived.by(() => {
		if (aired) return formatDate(episode.airDate ?? episode.airAt);
		if (episode.airAt) return `Airs ${formatDateTime(episode.airAt)}`;
		if (episode.airDate) return `Airs ${relativeDay(episode.airDate)}`;
		return 'Date to be announced';
	});
</script>

<article class="flex gap-3 md:gap-4 {showStill ? 'py-3' : 'py-2.5'} {aired ? '' : 'opacity-60'}">
	{#if showStill}
		<Img
			image={episode.still}
			alt=""
			sizes="(min-width: 768px) 176px, 128px"
			class="aspect-video w-32 shrink-0 rounded-lg md:w-44"
		/>
	{/if}
	<div class="min-w-0 flex-1">
		<h3 class="text-[15px] leading-snug font-medium">
			<span class="text-muted tabular-nums">{episode.number}.</span>
			{episode.name ?? `Episode ${episode.number}`}
		</h3>
		<p class="mt-0.5 text-xs text-muted">
			{when}{episode.runtime ? ` · ${formatRuntime(episode.runtime)}` : ''}
		</p>
		{#if episode.overview}
			<p class="mt-1.5 line-clamp-2 text-sm text-muted">{episode.overview}</p>
		{/if}
	</div>
</article>
