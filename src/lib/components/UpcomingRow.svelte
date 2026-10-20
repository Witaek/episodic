<script lang="ts">
	import { Clapperboard, Sparkles } from '@lucide/svelte';
	import { formatEpisodeCode } from '$lib/media-types/types';
	import type { UpcomingItem } from '$lib/tracking/types';
	import Img from './Img.svelte';

	let { item }: { item: UpcomingItem } = $props();

	const aired = $derived(item.airAt ? new Date(item.airAt) <= new Date() : false);
	const time = $derived(
		item.airAt
			? new Date(item.airAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
			: null
	);
	const premiere = $derived(item.episode?.number === 1);
</script>

<li>
	<a
		href={item.href}
		class="flex items-center gap-3 rounded-xl py-2.5 transition hover:bg-surface/60"
	>
		<Img image={item.poster} alt="" sizes="48px" class="aspect-[2/3] w-12 shrink-0 rounded-md" />
		<div class="min-w-0 flex-1">
			<p class="line-clamp-1 font-medium">{item.name}</p>
			<p class="line-clamp-1 text-sm text-muted">
				{#if item.episode}
					<span class="font-medium text-fg/80"
						>{formatEpisodeCode({
							season: item.episode.seasonNumber,
							number: item.episode.number
						})}</span
					>{item.episode.name ? ` · ${item.episode.name}` : ''}
				{:else}
					<Clapperboard class="mr-1 inline size-3.5 align-[-2px]" />Release
				{/if}
			</p>
			{#if premiere || item.status === 'planned'}
				<p class="mt-1 flex gap-1.5">
					{#if premiere}
						<span
							class="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-accent"
						>
							<Sparkles class="size-3" />
							{item.episode?.seasonNumber === 1 ? 'Series premiere' : 'Season premiere'}
						</span>
					{/if}
					{#if item.status === 'planned'}
						<span class="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted"
							>On your watchlist</span
						>
					{/if}
				</p>
			{/if}
		</div>
		<span class="shrink-0 text-right text-sm tabular-nums {aired ? 'text-success' : 'text-muted'}">
			{aired ? 'Aired' : (time ?? '')}
		</span>
	</a>
</li>
