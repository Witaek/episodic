<script lang="ts">
	import { formatEpisodeCode } from '$lib/media-types/types';
	import type { LibraryItem } from '$lib/tracking/types';
	import Img from './Img.svelte';
	import ProgressBar from './ProgressBar.svelte';
	import WatchButton from './WatchButton.svelte';

	interface Props {
		item: LibraryItem;
		busy?: boolean;
		onwatch: () => void;
	}

	let { item, busy = false, onwatch }: Props = $props();
	const next = $derived(item.progress?.nextUp ?? null);
	const remaining = $derived(item.progress ? item.progress.aired - item.progress.watched : 0);
</script>

<a
	href={item.href}
	class="group relative block aspect-video overflow-hidden rounded-2xl bg-surface-2 shadow-lg ring-1 ring-white/5 transition hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.99]"
>
	<Img
		image={next?.still ?? item.backdrop ?? item.poster}
		alt=""
		sizes="(min-width: 1024px) 400px, 85vw"
		class="absolute inset-0 transition-transform duration-700 group-hover:scale-105"
	/>
	<div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/5"></div>

	<div class="absolute inset-x-0 bottom-0 flex items-end gap-3 p-4">
		<div class="min-w-0 flex-1 text-white">
			{#if item.logo}
				<img
					src={item.logo.url}
					alt={item.name}
					class="mb-2 max-h-9 max-w-[70%] object-contain object-left drop-shadow"
					loading="lazy"
				/>
			{:else}
				<p class="mb-1 line-clamp-1 text-base font-bold drop-shadow">{item.name}</p>
			{/if}
			{#if next}
				<p class="line-clamp-1 text-sm">
					<span class="font-semibold"
						>{formatEpisodeCode({ season: next.seasonNumber, number: next.number })}</span
					>
					{#if next.name}<span class="text-white/75"> · {next.name}</span>{/if}
				</p>
			{/if}
			{#if item.progress}
				<div class="mt-2 flex items-center gap-2">
					<ProgressBar percent={item.progress.percent} class="flex-1" />
					{#if remaining > 1}
						<span class="text-[11px] whitespace-nowrap text-white/70">{remaining} left</span>
					{/if}
				</div>
			{/if}
		</div>
		{#if next}
			<div class="rounded-full bg-black/30 backdrop-blur">
				<WatchButton
					watched={false}
					size="lg"
					disabled={busy}
					label="Mark {formatEpisodeCode({
						season: next.seasonNumber,
						number: next.number
					})} of {item.name} watched"
					onclick={onwatch}
				/>
			</div>
		{/if}
	</div>
</a>
