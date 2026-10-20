<script lang="ts">
	import type { SearchResult } from '$lib/catalog/types';
	import PosterCard from './PosterCard.svelte';

	let { title, items, href }: { title: string; items: SearchResult[]; href?: string } = $props();
</script>

<section class="space-y-3">
	<header class="flex items-baseline justify-between px-4 md:px-8">
		<h2 class="text-lg font-semibold tracking-tight md:text-xl">{title}</h2>
		{#if href}
			<a {href} class="text-sm text-muted hover:text-fg">See all</a>
		{/if}
	</header>
	<ul
		class="flex snap-x snap-mandatory scroll-px-4 [scrollbar-width:none] gap-3 overflow-x-auto px-4 pb-2 md:scroll-px-8 md:px-8 [&::-webkit-scrollbar]:hidden"
	>
		{#each items as item (item.href)}
			<li class="w-[30vw] max-w-40 shrink-0 snap-start sm:w-36 lg:w-40">
				<PosterCard {item} sizes="160px" />
			</li>
		{/each}
	</ul>
</section>
