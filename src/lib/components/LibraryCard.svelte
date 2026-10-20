<script lang="ts">
	import { mediaType } from '$lib/media-types/registry';
	import { formatEpisodeCode } from '$lib/media-types/types';
	import type { LibraryItem } from '$lib/tracking/types';
	import Img from './Img.svelte';
	import ProgressBar from './ProgressBar.svelte';

	let { item, eager = false }: { item: LibraryItem; eager?: boolean } = $props();

	const subtitle = $derived.by(() => {
		const p = item.progress;
		if (item.status === 'in_progress' && p) {
			if (p.nextUp) {
				const code = formatEpisodeCode({ season: p.nextUp.seasonNumber, number: p.nextUp.number });
				return `Next: ${code}`;
			}
			if (p.upToDate) return 'Up to date';
		}
		if (item.status === 'completed' || !p) {
			return [item.year, mediaType(item.mediaType).label].filter(Boolean).join(' · ');
		}
		return `${p.watched}/${p.aired} episodes`;
	});
</script>

<a href={item.href} class="group block focus-visible:outline-none" title={item.name}>
	<div
		class="relative overflow-hidden rounded-xl shadow-md ring-1 ring-white/5 transition duration-300 group-hover:-translate-y-1 group-hover:shadow-xl group-focus-visible:ring-2 group-focus-visible:ring-accent group-active:scale-[0.98]"
	>
		<Img
			image={item.poster}
			alt=""
			sizes="(min-width: 1024px) 180px, 33vw"
			{eager}
			class="aspect-[2/3]"
		/>
		{#if item.progress && item.progress.watched > 0 && item.status !== 'completed'}
			<div
				class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 pt-6"
			>
				<ProgressBar percent={item.progress.percent} />
			</div>
		{/if}
	</div>
	<div class="mt-2 px-0.5">
		<p class="line-clamp-2 text-sm leading-snug font-medium">{item.name}</p>
		<p class="mt-0.5 text-xs text-muted">{subtitle}</p>
	</div>
</a>
