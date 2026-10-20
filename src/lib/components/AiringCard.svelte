<script lang="ts">
	import { relativeDay } from '$lib/format';
	import { formatEpisodeCode } from '$lib/media-types/types';
	import type { UpcomingItem } from '$lib/tracking/types';
	import Img from './Img.svelte';

	let { item }: { item: UpcomingItem } = $props();

	const when = $derived.by(() => {
		const day = relativeDay(item.date);
		if (!item.airAt) return day;
		const time = new Date(item.airAt).toLocaleTimeString(undefined, {
			hour: 'numeric',
			minute: '2-digit'
		});
		return `${day[0].toUpperCase()}${day.slice(1)}, ${time}`;
	});
</script>

<a
	href={item.href}
	class="flex w-64 items-center gap-3 rounded-2xl border border-border bg-surface p-2.5 transition hover:border-accent/50 active:scale-[0.98]"
>
	<Img image={item.poster} alt="" sizes="48px" class="aspect-[2/3] w-12 shrink-0 rounded-lg" />
	<div class="min-w-0">
		<p class="line-clamp-1 text-sm font-semibold">{item.name}</p>
		<p class="text-xs text-muted">
			{item.episode
				? formatEpisodeCode({ season: item.episode.seasonNumber, number: item.episode.number })
				: 'Release'}
		</p>
		<p class="mt-0.5 text-xs font-medium text-accent first-letter:uppercase">{when}</p>
	</div>
</a>
