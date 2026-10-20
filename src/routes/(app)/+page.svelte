<script lang="ts">
	import { Search } from '@lucide/svelte';
	import Img from '$lib/components/Img.svelte';
	import MediaRow from '$lib/components/MediaRow.svelte';
	import SetupNotice from '$lib/components/SetupNotice.svelte';

	let { data } = $props();

	const featured = $derived(
		data.rows.flatMap((row) => row.results).find((item) => item.backdrop && item.overview)
	);
</script>

<svelte:head>
	<title>Episodic</title>
</svelte:head>

{#if featured}
	<a
		href={featured.href}
		class="group relative block h-[56vh] max-h-[560px] min-h-80 overflow-hidden"
	>
		<Img
			image={featured.backdrop}
			alt=""
			sizes="100vw"
			eager
			class="absolute inset-0 transition-transform duration-[2s] group-hover:scale-105"
		/>
		<div class="absolute inset-0 bg-gradient-to-t from-bg via-bg/40 to-bg/10"></div>
		<div class="absolute inset-0 bg-gradient-to-r from-bg/80 via-transparent to-transparent"></div>
		<div class="absolute inset-x-0 bottom-0 max-w-2xl p-4 pb-8 md:p-8 md:pb-10">
			<p class="mb-2 text-xs font-semibold tracking-widest text-accent uppercase">Trending now</p>
			<h1 class="text-3xl font-bold tracking-tight text-balance md:text-5xl">{featured.name}</h1>
			<p class="mt-3 line-clamp-3 text-sm text-fg/80 md:text-base">{featured.overview}</p>
		</div>
	</a>
{:else}
	<div class="h-6"></div>
{/if}

<div class="space-y-8 py-6 md:space-y-10">
	<div class="px-4 md:px-8">
		<a
			href="/search"
			class="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3.5 text-muted transition-colors hover:border-accent/50 hover:text-fg"
		>
			<Search class="size-5" />
			Search shows, anime and movies
		</a>
	</div>

	{#if data.tmdbMissing}
		<div class="px-4 md:px-8"><SetupNotice /></div>
	{/if}

	{#each data.rows as row (row.id)}
		<MediaRow title={row.title} items={row.results} href="/search?type={row.id}" />
	{/each}

	<p class="px-4 text-sm text-muted md:px-8">
		Up Next, your library and one-tap tracking arrive in the next phase.
	</p>
</div>
