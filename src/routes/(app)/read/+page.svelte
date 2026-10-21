<script lang="ts">
	import { BookOpen, ScanBarcode, Search, Settings, Target } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import type { SearchResult } from '$lib/catalog/types';
	import AiringCard from '$lib/components/AiringCard.svelte';
	import GoalRing from '$lib/components/GoalRing.svelte';
	import MediaRow from '$lib/components/MediaRow.svelte';
	import ReadingCard from '$lib/components/ReadingCard.svelte';
	import SectionSwitch from '$lib/components/SectionSwitch.svelte';
	import { mediaType } from '$lib/media-types/registry';
	import { haptic, markWatched, undoEvents } from '$lib/tracking/client';
	import type { LibraryItem, WatchTarget } from '$lib/tracking/types';

	let { data } = $props();

	// Cards update in place after each tap; reset when the page data reloads.
	let reading = $derived(data.reading);
	let goal = $derived(data.goal);
	let busy = $state<number | null>(null);

	const toResult = (item: LibraryItem): SearchResult => ({
		ref: {
			provider:
				item.kind === 'manga' ? 'anilist' : item.kind === 'book' ? 'openlibrary' : 'wikidata',
			kind: item.kind,
			id: item.externalId
		},
		href: item.href,
		mediaType: item.mediaType,
		isAnime: false,
		name: item.name,
		year: item.year,
		poster: item.poster,
		backdrop: item.backdrop,
		rating: null
	});

	async function readNext(item: LibraryItem) {
		if (busy) return;
		const next = item.progress?.nextUp;
		const target: WatchTarget | null =
			item.mediaType === 'book'
				? { type: 'book' }
				: next
					? { type: 'episode', season: next.seasonNumber, number: next.number }
					: null;
		if (!target) return;
		busy = item.titleId;
		haptic();
		const unit = next
			? mediaType(item.mediaType).formatUnit({ season: next.seasonNumber, number: next.number })
			: null;
		const original = item;
		try {
			const result = await markWatched({ kind: item.kind, id: item.externalId }, target);
			const progress = result.state.progress;
			const done = item.mediaType === 'book' || !progress?.nextUp;
			reading = done
				? reading.filter((i) => i.titleId !== item.titleId)
				: reading.map((i) =>
						i.titleId === item.titleId ? { ...i, progress, reading: result.state.reading } : i
					);
			// A finished book or volume counts toward the goal.
			const finishedUnit = item.mediaType !== 'manga' || done;
			if (finishedUnit) goal = { ...goal, done: goal.done + 1 };
			toast.success(done ? `Finished ${item.name}` : `${unit} read`, {
				description: done ? undefined : item.name,
				action: {
					label: 'Undo',
					onClick: async () => {
						await undoEvents(result.eventIds);
						reading = reading.some((i) => i.titleId === original.titleId)
							? reading.map((i) => (i.titleId === original.titleId ? original : i))
							: [original, ...reading];
						if (finishedUnit) goal = { ...goal, done: Math.max(goal.done - 1, 0) };
					}
				}
			});
		} catch {
			// The client already showed an error toast.
		} finally {
			busy = null;
		}
	}

	const goalPercent = $derived(
		goal.target ? Math.round(Math.min(goal.done / goal.target, 1) * 100) : 0
	);
	/** Ahead or behind a steady pace through the year. */
	const pace = $derived.by(() => {
		if (!goal.target) return null;
		const now = new Date();
		const start = new Date(now.getFullYear(), 0, 1).getTime();
		const end = new Date(now.getFullYear() + 1, 0, 1).getTime();
		const expected = Math.floor(goal.target * ((now.getTime() - start) / (end - start)));
		const diff = goal.done - expected;
		if (goal.done >= goal.target) return 'Goal reached. Well read!';
		if (diff > 0) return `${diff} ahead of schedule`;
		if (diff < 0) return `${-diff} behind schedule`;
		return 'Right on schedule';
	});
</script>

<svelte:head>
	<title>Reading · Episodic</title>
</svelte:head>

<div class="space-y-8 pt-[calc(env(safe-area-inset-top)+1.25rem)] pb-8 md:space-y-10 md:pt-8">
	<header class="flex items-center justify-between gap-4 px-4 md:px-8">
		<div>
			<p class="text-sm text-muted">{data.displayName}'s</p>
			<h1 class="font-serif text-3xl font-semibold tracking-tight md:text-4xl">Reading</h1>
		</div>
		<div class="flex items-center gap-2 lg:hidden">
			<SectionSwitch section="read" compact />
			<a
				href="/settings?section=read"
				class="grid size-10 place-items-center rounded-full bg-surface-2 text-muted transition hover:text-fg"
				aria-label="Settings"
			>
				<Settings class="size-5" />
			</a>
		</div>
	</header>

	<!-- Yearly goal -->
	<section class="px-4 md:px-8">
		{#if goal.target}
			<a
				href="/read/stats#goal"
				class="flex items-center gap-4 rounded-2xl border border-border bg-surface p-4 transition hover:border-accent/40"
			>
				<div class="relative grid place-items-center">
					<GoalRing done={goal.done} target={goal.target} />
					<span class="absolute text-sm font-bold tabular-nums">{goalPercent}%</span>
				</div>
				<div class="min-w-0">
					<p class="text-sm text-muted">{goal.year} reading goal</p>
					<p class="font-serif text-xl font-semibold">
						{goal.done} of {goal.target} books
					</p>
					{#if pace}<p class="text-sm text-accent">{pace}</p>{/if}
				</div>
			</a>
		{:else}
			<a
				href="/read/stats#goal"
				class="flex items-center gap-3 rounded-2xl border border-dashed border-border p-4 text-sm text-muted transition hover:border-accent/50 hover:text-fg"
			>
				<Target class="size-5 text-accent" />
				<span>Set a reading goal for {goal.year}: how many books and volumes?</span>
			</a>
		{/if}
	</section>

	{#if reading.length}
		<section class="space-y-3">
			<header class="flex items-baseline justify-between px-4 md:px-8">
				<h2 class="font-serif text-xl font-semibold tracking-tight md:text-2xl">Reading now</h2>
				<a href="/read/shelf" class="text-sm text-muted hover:text-fg">Shelf</a>
			</header>
			<ul class="grid gap-3 px-4 md:grid-cols-2 md:px-8 xl:grid-cols-3">
				{#each reading as item (item.titleId)}
					<li>
						<ReadingCard {item} busy={busy === item.titleId} onread={() => readNext(item)} />
					</li>
				{/each}
			</ul>
		</section>
	{:else}
		<section class="mx-4 overflow-hidden rounded-3xl border border-border bg-surface md:mx-8">
			<div class="p-6 md:p-8">
				<BookOpen class="mb-3 size-8 text-accent" />
				<h2 class="font-serif text-2xl font-semibold">What are you reading?</h2>
				<p class="mt-1 max-w-lg text-muted">
					Find a book, a series or a manga. Series are tracked like shows: Episodic knows which book
					comes next, and which films or anime were made from it.
				</p>
				<div class="mt-5 flex flex-wrap gap-2">
					<a
						href="/read/search"
						class="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-fg transition hover:brightness-110"
					>
						<Search class="size-4" /> Find a book
					</a>
					<a
						href="/read/scan"
						class="inline-flex items-center gap-2 rounded-full bg-surface-2 px-5 py-2.5 text-sm font-semibold transition hover:bg-border"
					>
						<ScanBarcode class="size-4" /> Scan a barcode
					</a>
				</div>
			</div>
		</section>
	{/if}

	{#if data.comingSoon.length}
		<section class="space-y-3">
			<h2 class="px-4 font-serif text-xl font-semibold tracking-tight md:px-8 md:text-2xl">
				Coming soon
			</h2>
			<ul
				class="flex [scrollbar-width:none] gap-3 overflow-x-auto px-4 pb-1 md:px-8 [&::-webkit-scrollbar]:hidden"
			>
				{#each data.comingSoon as item (`${item.titleId}-${item.episode?.id ?? 'book'}`)}
					<li class="shrink-0"><AiringCard {item} /></li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if data.planned.length}
		<MediaRow
			title="Want to read"
			items={data.planned.map(toResult)}
			href="/read/shelf?status=planned"
		/>
	{/if}

	{#if data.finished.length}
		<MediaRow
			title="Recently finished"
			items={data.finished.map(toResult)}
			href="/read/shelf?status=completed"
		/>
	{/if}

	{#await data.trending}
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
	{:then trending}
		{#if trending.books.length}
			<MediaRow title="Trending books" items={trending.books} href="/read/search" />
		{/if}
		{#if trending.manga.length}
			<MediaRow title="Popular manga" items={trending.manga} href="/read/search?type=manga" />
		{/if}
	{/await}
</div>
