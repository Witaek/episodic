<script lang="ts">
	import { Search, Settings } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import type { SearchResult } from '$lib/catalog/types';
	import AiringCard from '$lib/components/AiringCard.svelte';
	import Img from '$lib/components/Img.svelte';
	import MediaRow from '$lib/components/MediaRow.svelte';
	import SectionSwitch from '$lib/components/SectionSwitch.svelte';
	import SetupNotice from '$lib/components/SetupNotice.svelte';
	import UpNextCard from '$lib/components/UpNextCard.svelte';
	import { formatEpisodeCode } from '$lib/media-types/types';
	import { presave } from '$lib/offline/presave';
	import { offline } from '$lib/offline/sync.svelte';
	import { haptic, isQueued, markWatched, undoEvents } from '$lib/tracking/client';
	import type { LibraryItem } from '$lib/tracking/types';

	let { data } = $props();

	// What you're in the middle of opens (and can be tracked) without a connection.
	$effect(() => {
		void presave([
			{ href: '/' },
			...data.upNext.map((item) => ({ href: item.href, image: item.poster?.url ?? null }))
		]);
	});

	// Cards update in place after each tap; reset when the page data reloads.
	let upNext = $derived(data.upNext);
	let busy = $state<number | null>(null);

	const greeting = $derived.by(() => {
		const hour = new Date().getHours();
		return hour < 5
			? 'Good night'
			: hour < 12
				? 'Good morning'
				: hour < 18
					? 'Good afternoon'
					: 'Good evening';
	});

	const toResult = (item: LibraryItem): SearchResult => ({
		ref: {
			provider: item.kind === 'anime' ? 'anilist' : 'tmdb',
			kind: item.kind,
			id: item.externalId
		},
		href: item.href,
		mediaType: item.mediaType,
		isAnime: item.isAnime,
		name: item.name,
		year: item.year,
		poster: item.poster,
		backdrop: item.backdrop,
		rating: null
	});

	function replace(titleId: number, update: (item: LibraryItem) => LibraryItem | null) {
		upNext = upNext.flatMap((item) => {
			if (item.titleId !== titleId) return [item];
			const next = update(item);
			return next ? [next] : [];
		});
	}

	async function watchNext(item: LibraryItem) {
		const next = item.progress?.nextUp;
		if (!next || busy) return;
		busy = item.titleId;
		haptic();
		const code = formatEpisodeCode({ season: next.seasonNumber, number: next.number });
		try {
			const result = await markWatched(
				{ kind: item.kind, id: item.externalId, name: item.name },
				{ type: 'episode', season: next.seasonNumber, number: next.number },
				{ label: `${code} watched` }
			);
			const original = item;
			const restore = () => {
				if (upNext.some((i) => i.titleId === original.titleId)) {
					replace(original.titleId, () => original);
				} else {
					upNext = [original, ...upNext];
				}
			};
			if (isQueued(result)) {
				// Offline: the next episode is unknown until it syncs, so the card steps aside.
				replace(item.titleId, () => null);
				toast(`${code} watched`, {
					description: `${item.name} · saved offline, it will sync later`,
					action: result.actionId
						? {
								label: 'Undo',
								onClick: () => {
									void offline.discard(result.actionId!);
									restore();
								}
							}
						: undefined
				});
				return;
			}
			const progress = result.state.progress;
			replace(item.titleId, (current) => (progress?.nextUp ? { ...current, progress } : null));
			toast.success(progress?.nextUp ? `${code} watched` : `You're up to date with ${item.name}`, {
				description: progress?.nextUp ? item.name : undefined,
				action: {
					label: 'Undo',
					onClick: async () => {
						await undoEvents(result.eventIds);
						restore();
					}
				}
			});
		} catch {
			// The client already showed an error toast.
		} finally {
			busy = null;
		}
	}
</script>

<svelte:head>
	<title>Episodic</title>
</svelte:head>

<div class="space-y-8 pt-[calc(env(safe-area-inset-top)+1.25rem)] pb-8 md:space-y-10 md:pt-8">
	<header class="flex items-center justify-between gap-4 px-4 md:px-8">
		<div>
			<p class="text-sm text-muted">{greeting},</p>
			<h1 class="text-2xl font-bold tracking-tight md:text-3xl">{data.displayName}</h1>
		</div>
		<div class="flex items-center gap-2 lg:hidden">
			<SectionSwitch section="watch" compact />
			<a
				href="/settings?section=watch"
				class="grid size-10 place-items-center rounded-full bg-surface-2 text-muted transition hover:text-fg"
				aria-label="Settings"
			>
				<Settings class="size-5" />
			</a>
		</div>
	</header>

	{#if data.tmdbMissing}
		<div class="px-4 md:px-8"><SetupNotice /></div>
	{/if}

	{#if upNext.length}
		<section class="space-y-3">
			<h2 class="px-4 text-lg font-semibold tracking-tight md:px-8 md:text-xl">Up next</h2>
			<ul
				class="flex snap-x snap-mandatory scroll-px-4 [scrollbar-width:none] gap-3 overflow-x-auto px-4 pb-2 md:scroll-px-8 md:gap-4 md:px-8 [&::-webkit-scrollbar]:hidden"
			>
				{#each upNext as item (item.titleId)}
					<li class="w-[85vw] max-w-md shrink-0 snap-start sm:w-[24rem]">
						<UpNextCard {item} busy={busy === item.titleId} onwatch={() => watchNext(item)} />
					</li>
				{/each}
			</ul>
		</section>
	{:else if !data.watchlist.length}
		<section class="mx-4 overflow-hidden rounded-3xl border border-border bg-surface md:mx-8">
			<div class="p-6 md:p-8">
				<h2 class="text-xl font-semibold">Start your library</h2>
				<p class="mt-1 max-w-lg text-muted">
					Search for a show, anime or movie and add it to your watchlist. Mark episodes as you
					watch, and Episodic keeps track of what's next.
				</p>
				<a
					href="/search"
					class="mt-5 inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-fg transition hover:brightness-110"
				>
					<Search class="size-4" /> Find something to watch
				</a>
			</div>
		</section>
	{/if}

	{#if data.airingSoon.length}
		<section class="space-y-3">
			<header class="flex items-baseline justify-between px-4 md:px-8">
				<h2 class="text-lg font-semibold tracking-tight md:text-xl">Airing soon</h2>
				<a href="/upcoming" class="text-sm text-muted hover:text-fg">See all</a>
			</header>
			<ul
				class="flex [scrollbar-width:none] gap-3 overflow-x-auto px-4 pb-1 md:px-8 [&::-webkit-scrollbar]:hidden"
			>
				{#each data.airingSoon as item (`${item.titleId}-${item.episode?.id ?? 'movie'}`)}
					<li class="shrink-0"><AiringCard {item} /></li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if data.watchlist.length}
		<MediaRow
			title="Your watchlist"
			items={data.watchlist.map(toResult)}
			href="/library?status=planned"
		/>
	{/if}

	{#await data.rows}
		<div class="space-y-3 px-4 md:px-8" aria-hidden="true">
			<div class="h-6 w-40 animate-pulse rounded bg-surface-2"></div>
			<div class="flex gap-3 overflow-hidden">
				{#each Array(6) as _, i (i)}
					<div
						class="aspect-[2/3] w-[30vw] max-w-40 shrink-0 animate-pulse rounded-xl bg-surface-2"
					></div>
				{/each}
			</div>
		</div>
	{:then rows}
		{@const featured = !upNext.length
			? rows.flatMap((row) => row.results).find((item) => item.backdrop && item.overview)
			: undefined}
		{#if featured}
			<a
				href={featured.href}
				class="group relative mx-4 block aspect-[16/8] overflow-hidden rounded-3xl md:mx-8 md:aspect-[16/6]"
			>
				<Img
					image={featured.backdrop}
					alt=""
					sizes="100vw"
					class="absolute inset-0 transition-transform duration-[2s] group-hover:scale-105"
				/>
				<div
					class="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent"
				></div>
				<div class="absolute inset-x-0 bottom-0 max-w-2xl p-5 text-white md:p-8">
					<p class="mb-1.5 text-xs font-semibold tracking-widest text-accent uppercase">
						Trending now
					</p>
					<h2 class="text-2xl font-bold tracking-tight text-balance md:text-4xl">
						{featured.name}
					</h2>
					<p class="mt-2 hidden text-sm text-white/80 sm:block">
						<span class="line-clamp-2">{featured.overview}</span>
					</p>
				</div>
			</a>
		{/if}
		{#each rows as row (row.id)}
			<MediaRow title={row.title} items={row.results} href="/search?type={row.id}" />
		{/each}
	{/await}
</div>
