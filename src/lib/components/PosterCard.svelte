<script lang="ts">
	import { Star } from '@lucide/svelte';
	import type { SearchResult } from '$lib/catalog/types';
	import { mediaType } from '$lib/media-types/registry';
	import Img from './Img.svelte';

	interface Props {
		item: SearchResult;
		sizes?: string;
		eager?: boolean;
	}

	let { item, sizes = '(min-width: 1024px) 180px, 33vw', eager = false }: Props = $props();
</script>

<a href={item.href} class="group block focus-visible:outline-none" title={item.name}>
	<div
		class="relative overflow-hidden rounded-xl shadow-md ring-1 ring-white/5 transition duration-300 group-hover:-translate-y-1 group-hover:shadow-xl group-focus-visible:ring-2 group-focus-visible:ring-accent group-active:scale-[0.98]"
	>
		<Img image={item.poster} alt="" {sizes} {eager} class="aspect-[2/3]" />
		{#if !item.poster}
			<span class="absolute inset-0 grid place-items-center p-3 text-center text-sm text-muted">
				{item.name}
			</span>
		{/if}
		{#if item.rating}
			<span
				class="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-black/65 px-2 py-0.5 text-xs font-medium text-white backdrop-blur"
			>
				<Star class="size-3 fill-amber-400 text-amber-400" />
				{item.rating.toFixed(1)}
			</span>
		{/if}
	</div>
	<div class="mt-2 px-0.5">
		<p class="line-clamp-2 text-sm leading-snug font-medium">{item.name}</p>
		<p class="mt-0.5 text-xs text-muted">
			{[item.year, item.badge ?? mediaType(item.mediaType).label].filter(Boolean).join(' · ')}
		</p>
	</div>
</a>
