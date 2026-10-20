<script lang="ts">
	import { goto } from '$app/navigation';
	import { Library } from '@lucide/svelte';
	import LibraryCard from '$lib/components/LibraryCard.svelte';
	import { LIBRARY_STATUSES, VIDEO_STATUS_LABELS } from '$lib/media-types/types';

	let { data } = $props();

	const types = [
		{ id: 'all', label: 'All' },
		{ id: 'tv', label: 'TV shows' },
		{ id: 'anime', label: 'Anime' },
		{ id: 'movie', label: 'Movies' }
	];
	const sorts = [
		{ id: 'activity', label: 'Recently watched' },
		{ id: 'added', label: 'Recently added' },
		{ id: 'name', label: 'A–Z' }
	];

	function urlWith(changes: Record<string, string>) {
		const params = new URLSearchParams({
			status: data.status,
			type: data.type,
			sort: data.sort,
			...changes
		});
		if (params.get('type') === 'all') params.delete('type');
		if (params.get('sort') === 'activity') params.delete('sort');
		return `/library?${params}`;
	}

	const empty: Record<string, string> = {
		in_progress: 'Shows you start watching appear here.',
		planned: 'Add titles from search to plan what to watch next.',
		completed: 'Finished shows and watched movies appear here.',
		on_hold: 'Shows you pause appear here.',
		dropped: "Shows you've given up on appear here."
	};
</script>

<svelte:head><title>Library · Episodic</title></svelte:head>

<div
	class="sticky top-0 z-20 space-y-3 border-b border-border/60 bg-bg/85 px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-3 backdrop-blur-xl md:px-8"
>
	<div class="flex items-center justify-between gap-3">
		<h1 class="text-2xl font-bold tracking-tight">Library</h1>
		<select
			value={data.sort}
			onchange={(event) =>
				goto(urlWith({ sort: event.currentTarget.value }), { replaceState: true, noScroll: true })}
			class="rounded-xl border border-border bg-surface px-3 py-1.5 text-sm text-fg outline-none focus:border-accent/60"
			aria-label="Sort"
		>
			{#each sorts as sort (sort.id)}
				<option value={sort.id}>{sort.label}</option>
			{/each}
		</select>
	</div>

	<nav
		class="-mx-4 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4 md:mx-0 md:px-0"
		aria-label="Status"
	>
		{#each LIBRARY_STATUSES as status (status)}
			{@const active = data.status === status}
			<a
				href={urlWith({ status })}
				data-sveltekit-replacestate
				data-sveltekit-noscroll
				aria-current={active ? 'page' : undefined}
				class="flex shrink-0 items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors {active
					? 'bg-fg text-bg'
					: 'bg-surface-2 text-muted hover:text-fg'}"
			>
				{VIDEO_STATUS_LABELS[status]}
				<span class="text-xs tabular-nums {active ? 'text-bg/60' : 'text-muted/70'}"
					>{data.counts[status]}</span
				>
			</a>
		{/each}
	</nav>

	<nav class="flex gap-4 text-sm" aria-label="Type">
		{#each types as type (type.id)}
			<a
				href={urlWith({ type: type.id })}
				data-sveltekit-replacestate
				data-sveltekit-noscroll
				class="pb-0.5 font-medium transition-colors {data.type === type.id
					? 'border-b-2 border-accent text-fg'
					: 'text-muted hover:text-fg'}">{type.label}</a
			>
		{/each}
	</nav>
</div>

<div class="px-4 py-5 md:px-8">
	{#if data.items.length}
		<ul
			class="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8"
		>
			{#each data.items as item, i (item.titleId)}
				<li><LibraryCard {item} eager={i < 8} /></li>
			{/each}
		</ul>
	{:else}
		<div class="grid place-items-center py-20 text-center">
			<div class="mb-4 grid size-14 place-items-center rounded-2xl bg-surface-2 text-muted">
				<Library class="size-7" />
			</div>
			<p class="font-medium">Nothing here yet</p>
			<p class="mt-1 max-w-xs text-sm text-muted">{empty[data.status]}</p>
			<a href="/search" class="mt-5 text-sm font-semibold text-accent hover:underline"
				>Search the catalog</a
			>
		</div>
	{/if}
</div>
