<script lang="ts">
	import { untrack } from 'svelte';
	import { beforeNavigate, goto } from '$app/navigation';
	import { navigating } from '$app/state';
	import { LoaderCircle, Search, X } from '@lucide/svelte';
	import type { SearchFilter } from '$lib/catalog/types';
	import PosterGrid from '$lib/components/PosterGrid.svelte';
	import PosterGridSkeleton from '$lib/components/PosterGridSkeleton.svelte';
	import SetupNotice from '$lib/components/SetupNotice.svelte';
	import { SEARCH_FILTERS } from '$lib/media-types/registry';
	import { BOOK_LANGUAGES } from '$lib/catalog/types';

	let { data } = $props();

	// Local input state so typing stays instant; the URL follows after a short pause.
	let query = $state(untrack(() => data.query));
	let input: HTMLInputElement;
	let timer: ReturnType<typeof setTimeout> | undefined;

	$effect.pre(() => {
		// Sync from the URL on navigation (back/forward, chip changes).
		if (document.activeElement !== input) query = data.query;
	});

	function urlFor(q: string, filter: SearchFilter, lang: string | null = data.bookLanguage) {
		const params = new URLSearchParams();
		if (q.trim()) params.set('q', q.trim());
		if (filter !== 'all') params.set('type', filter);
		if (filter === 'book' && lang) params.set('lang', lang);
		const search = params.toString();
		return search ? `/search?${search}` : '/search';
	}

	// A pending URL update must not pull the user back here after they open a result.
	beforeNavigate(({ to }) => {
		if (to?.url.pathname !== '/search') clearTimeout(timer);
	});

	function update(q: string, filter: SearchFilter, delay = 300) {
		clearTimeout(timer);
		timer = setTimeout(
			() => goto(urlFor(q, filter), { replaceState: true, keepFocus: true, noScroll: true }),
			delay
		);
	}

	const loading = $derived(navigating.to?.url.pathname === '/search');
	const showSkeleton = $derived(loading && data.results.length === 0);
</script>

<svelte:head>
	<title>{data.query ? `${data.query} · Search` : 'Search'} · Episodic</title>
</svelte:head>

<div
	class="sticky top-0 z-20 space-y-3 border-b border-border/60 bg-bg/85 px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-3 backdrop-blur-xl md:px-8"
>
	<form
		role="search"
		class="relative"
		onsubmit={(event) => {
			event.preventDefault();
			input.blur();
			update(query, data.filter, 0);
		}}
	>
		<Search
			class="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted"
		/>
		<input
			bind:this={input}
			bind:value={query}
			oninput={() => update(query, data.filter)}
			type="search"
			enterkeyhint="search"
			autocomplete="off"
			spellcheck="false"
			placeholder="Shows, anime, movies…"
			aria-label="Search"
			class="w-full rounded-2xl border border-border bg-surface py-3.5 pr-12 pl-12 text-base outline-none placeholder:text-muted focus:border-accent/60 focus:ring-4 focus:ring-accent/15 [&::-webkit-search-cancel-button]:hidden"
		/>
		{#if loading}
			<LoaderCircle
				class="absolute top-1/2 right-4 size-5 -translate-y-1/2 animate-spin text-muted"
			/>
		{:else if query}
			<button
				type="button"
				class="absolute top-1/2 right-2 grid size-9 -translate-y-1/2 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"
				aria-label="Clear search"
				onclick={() => {
					query = '';
					input.focus();
					update('', data.filter, 0);
				}}
			>
				<X class="size-5" />
			</button>
		{/if}
	</form>

	<div class="flex [scrollbar-width:none] gap-2 overflow-x-auto" role="tablist" aria-label="Type">
		{#each SEARCH_FILTERS as filter (filter.id)}
			{@const active = data.filter === filter.id}
			<a
				href={urlFor(query, filter.id)}
				role="tab"
				aria-selected={active}
				data-sveltekit-replacestate
				data-sveltekit-noscroll
				data-sveltekit-keepfocus
				class="shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors {active
					? 'bg-fg text-bg'
					: 'bg-surface-2 text-muted hover:text-fg'}"
			>
				{filter.label}
			</a>
		{/each}
	</div>

	{#if data.filter === 'book'}
		<div class="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="Book language">
			<span class="text-muted">Language</span>
			{#each [{ id: 'any', label: 'Any' }, ...BOOK_LANGUAGES] as language (language.id)}
				{@const active = (data.bookLanguage ?? 'any') === language.id}
				<a
					href={urlFor(query, 'book', language.id)}
					data-sveltekit-replacestate
					data-sveltekit-noscroll
					data-sveltekit-keepfocus
					aria-current={active ? 'true' : undefined}
					class="rounded-full px-3 py-1 font-medium transition-colors {active
						? 'bg-accent text-accent-fg'
						: 'bg-surface-2 text-muted hover:text-fg'}"
				>
					{language.label}
				</a>
			{/each}
		</div>
	{/if}
</div>

<div class="space-y-5 px-4 py-5 md:px-8">
	{#if data.tmdbMissing && data.filter !== 'anime'}
		<SetupNotice compact />
	{/if}

	{#if showSkeleton}
		<PosterGridSkeleton />
	{:else if data.query}
		{#if data.results.length}
			<div class="transition-opacity {loading ? 'opacity-60' : ''}">
				<PosterGrid items={data.results} />
			</div>
		{:else}
			<p class="py-16 text-center text-muted">No results for “{data.query}”.</p>
		{/if}
	{:else if data.browse.length}
		<h2 class="text-sm font-semibold tracking-wide text-muted uppercase">Trending</h2>
		<PosterGrid items={data.browse} />
	{/if}
</div>
