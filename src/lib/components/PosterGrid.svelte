<script lang="ts">
	import type { SearchResult } from '$lib/catalog/types';
	import PosterCard from './PosterCard.svelte';

	let { items }: { items: SearchResult[] } = $props();
</script>

<ul
	class="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8"
>
	{#each items as item, i (item.href)}
		<li><PosterCard {item} eager={i < 8} /></li>
	{/each}
</ul>
