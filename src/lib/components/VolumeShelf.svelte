<script lang="ts">
	import {
		BookOpen,
		CheckCheck,
		Ellipsis,
		ListChecks,
		RotateCcw,
		Trash2,
		Undo2
	} from '@lucide/svelte';
	import { DropdownMenu } from 'bits-ui';
	import { invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import type { Episode, Season, SeasonSummary } from '$lib/catalog/types';
	import type { TitleTracker } from '$lib/tracking/title-tracker.svelte';
	import Img from './Img.svelte';
	import ProgressBar from './ProgressBar.svelte';
	import ReadingProgressControl from './ReadingProgressControl.svelte';
	import WatchButton from './WatchButton.svelte';
	import { menuContent, menuItem, menuSeparator } from './menu';

	interface Props {
		kind: 'bookseries' | 'manga';
		seasons: SeasonSummary[];
		/** The volume (manga) or group (series) whose units are listed, streamed. */
		season: Promise<Season | null>;
		seasonNumber: number | null;
		tracker: TitleTracker;
		/** Fallback cover when a volume has none. */
		cover: import('$lib/catalog/types').Image | null;
		onpickdate: (episode: Episode) => void;
		/** A series grouped by hand: books can be taken out of it. */
		collectionId?: string | null;
	}

	let {
		kind,
		seasons,
		season,
		seasonNumber,
		tracker,
		cover,
		onpickdate,
		collectionId = null
	}: Props = $props();

	async function removeBook(book: Episode) {
		if (!collectionId || !book.work) return;
		const response = await fetch(`/api/collections/${collectionId}/books/${book.work}`, {
			method: 'DELETE'
		});
		if (!response.ok) {
			toast.error("Couldn't remove the book");
			return;
		}
		toast(`${book.name} removed from the series`);
		await invalidateAll();
	}

	/** Units read in a volume, from the watch counts ("season-number" keys). */
	function readIn(volume: number): number {
		const prefix = `${volume}-`;
		return Object.keys(tracker.state.watched).filter((k) => k.startsWith(prefix)).length;
	}

	const volumes = $derived([...seasons].sort((a, b) => (a.number || 1e6) - (b.number || 1e6)));
	const currentUnit = $derived(tracker.state.reading?.unit ?? null);
	const nextUp = $derived(tracker.state.progress?.nextUp ?? null);
	// Catch-up mode: tapping a chapter marks everything up to it.
	let catchUp = $state(false);
</script>

{#if kind === 'manga'}
	<!-- Volumes as a shelf of covers with progress; the selected one lists its chapters. -->
	<ul class="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
		{#each volumes as volume (volume.number)}
			{@const read = readIn(volume.number)}
			{@const done = read >= volume.episodeCount && volume.episodeCount > 0}
			{@const active = volume.number === seasonNumber}
			<li>
				<a
					href="?season={volume.number}#volumes"
					data-sveltekit-replacestate
					data-sveltekit-noscroll
					aria-current={active ? 'true' : undefined}
					class="group block rounded-xl p-1 transition {active
						? 'bg-accent/15 ring-2 ring-accent'
						: 'hover:bg-surface-2'}"
				>
					<div class="relative">
						<Img
							image={volume.poster ?? cover}
							alt=""
							sizes="120px"
							maxWidth={512}
							class="aspect-[2/3] rounded-lg {done ? 'opacity-60' : ''}"
						/>
						{#if done}
							<span class="absolute inset-0 grid place-items-center">
								<span
									class="grid size-9 place-items-center rounded-full bg-success text-bg shadow-lg"
								>
									<CheckCheck class="size-5" />
								</span>
							</span>
						{/if}
					</div>
					<p class="mt-1.5 truncate text-xs font-semibold">
						{volume.name.replace('Volume ', 'Vol. ')}
					</p>
					{#if volume.episodeCount > 1 && read > 0 && !done}
						<ProgressBar percent={(read / volume.episodeCount) * 100} class="mt-1 h-1" />
					{/if}
				</a>
			</li>
		{/each}
	</ul>
{/if}

{#await season}
	<div class="mt-4 space-y-2" aria-busy="true">
		{#each Array(4) as _, i (i)}
			<div class="h-14 animate-pulse rounded-xl bg-surface-2"></div>
		{/each}
	</div>
{:then current}
	{#if current && current.episodes.length}
		{#if kind === 'manga'}
			{@const chapters = current.episodes}
			{@const allRead = chapters.every((e) => tracker.plays(e.seasonNumber, e.number) > 0)}
			<div class="mt-6 space-y-3" id="volume-detail">
				<div class="flex flex-wrap items-center justify-between gap-3">
					<h3 class="font-serif text-lg font-semibold">{current.name}</h3>
					<button
						type="button"
						onclick={() =>
							allRead
								? tracker.unwatch({ type: 'season', season: current.number })
								: tracker.watch({ type: 'season', season: current.number })}
						class="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold transition {allRead
							? 'bg-success/15 text-success'
							: 'bg-surface-2 hover:bg-border'}"
					>
						<CheckCheck class="size-4" />
						{allRead ? 'Volume read' : 'Mark volume read'}
					</button>
				</div>
				{#if current.overview}<p class="text-xs text-muted">{current.overview}</p>{/if}
				{#if chapters.length > 1 || chapters[0].number !== 0}
					<ul class="flex flex-wrap gap-2" aria-label="Chapters">
						{#each chapters as chapter (chapter.id)}
							{@const read = tracker.plays(chapter.seasonNumber, chapter.number) > 0}
							<li>
								<button
									type="button"
									aria-pressed={read}
									aria-label={read
										? 'Mark chapter ' + chapter.number + ' unread'
										: 'Mark chapter ' + chapter.number + ' read'}
									onclick={() =>
										catchUp && !read
											? tracker.watch({
													type: 'upTo',
													season: chapter.seasonNumber,
													number: chapter.number
												})
											: tracker.toggleEpisode(chapter.seasonNumber, chapter.number)}
									class="min-w-12 rounded-lg px-2.5 py-2 text-sm font-semibold tabular-nums transition active:scale-95 {read
										? 'bg-success text-bg'
										: 'bg-surface-2 text-fg hover:bg-border'}"
								>
									{chapter.number}
								</button>
							</li>
						{/each}
					</ul>
					<label class="flex items-center gap-2 text-sm text-muted">
						<input type="checkbox" bind:checked={catchUp} class="size-4 accent-[var(--accent)]" />
						Catch up: tapping a chapter also marks every earlier one
					</label>
				{/if}
			</div>
		{:else}
			<!-- Book series: one row per book, with its cover. -->
			<ul class="space-y-3">
				{#each current.episodes as book (book.id)}
					{@const plays = tracker.plays(book.seasonNumber, book.number)}
					{@const unit = { season: book.seasonNumber, number: book.number }}
					{@const isCurrent =
						(currentUnit &&
							currentUnit.season === unit.season &&
							currentUnit.number === unit.number) ||
						(!currentUnit &&
							nextUp?.seasonNumber === unit.season &&
							nextUp?.number === unit.number)}
					{@const upcoming = book.airDate && book.airDate > new Date().toISOString().slice(0, 10)}
					<li
						class="rounded-2xl border p-3 transition {isCurrent
							? 'border-accent/50 bg-accent/5'
							: 'border-border bg-surface'} {upcoming ? 'opacity-60' : ''}"
					>
						<div class="flex items-center gap-3">
							<a href={book.work ? `/read/book/${book.work}` : undefined} class="shrink-0">
								<Img
									image={book.still}
									alt=""
									sizes="64px"
									class="aspect-[2/3] w-14 rounded-md shadow md:w-16 {plays ? 'opacity-70' : ''}"
								/>
							</a>
							<div class="min-w-0 flex-1">
								<p class="text-xs font-semibold tracking-wide text-accent uppercase">
									{book.seasonNumber === 0 ? 'Extra' : `Book ${book.number}`}
								</p>
								<a
									href={book.work ? `/read/book/${book.work}` : undefined}
									class="line-clamp-2 font-serif font-semibold hover:underline">{book.name}</a
								>
								<p class="text-xs text-muted">
									{[
										book.airDate && book.airDate > '1901' ? book.airDate.slice(0, 4) : null,
										book.pages ? `${book.pages} pages` : null,
										upcoming ? 'Coming soon' : null
									]
										.filter(Boolean)
										.join(' · ')}
								</p>
							</div>
							<DropdownMenu.Root>
								<DropdownMenu.Trigger
									class="grid size-9 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"
									aria-label="More actions for {book.name}"
								>
									<Ellipsis class="size-5" />
								</DropdownMenu.Trigger>
								<DropdownMenu.Portal>
									<DropdownMenu.Content class={menuContent} sideOffset={6} align="end">
										<DropdownMenu.Item
											class={menuItem}
											onSelect={() => tracker.watch({ type: 'upTo', ...unit })}
										>
											<ListChecks class="size-4" /> Mark all up to here
										</DropdownMenu.Item>
										<DropdownMenu.Item class={menuItem} onSelect={() => onpickdate(book)}>
											<BookOpen class="size-4" /> Finished on a date…
										</DropdownMenu.Item>
										{#if plays}
											<DropdownMenu.Item
												class={menuItem}
												onSelect={() =>
													tracker.watch({ type: 'episode', ...unit }, { rewatch: true })}
											>
												<RotateCcw class="size-4" /> Read again
											</DropdownMenu.Item>
											<DropdownMenu.Separator class={menuSeparator} />
											<DropdownMenu.Item
												class={menuItem}
												onSelect={() =>
													tracker.unwatch(
														{ type: 'episode', ...unit },
														`${book.name} marked unread`
													)}
											>
												<Undo2 class="size-4" /> Mark as unread
											</DropdownMenu.Item>
										{/if}
										{#if collectionId}
											<DropdownMenu.Separator class={menuSeparator} />
											<DropdownMenu.Item class={menuItem} onSelect={() => removeBook(book)}>
												<Trash2 class="size-4" /> Remove from this series
											</DropdownMenu.Item>
										{/if}
									</DropdownMenu.Content>
								</DropdownMenu.Portal>
							</DropdownMenu.Root>
							<WatchButton
								watched={plays > 0}
								{plays}
								label={plays ? `Mark ${book.name} unread` : `Mark ${book.name} read`}
								onclick={() => tracker.toggleEpisode(book.seasonNumber, book.number)}
							/>
						</div>
						{#if isCurrent && !plays && !upcoming}
							<div class="mt-3 border-t border-border/60 pt-3">
								<ReadingProgressControl {tracker} pages={book.pages ?? null} {unit} />
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	{:else if current}
		<p class="mt-4 text-muted">Nothing listed yet.</p>
	{/if}
{/await}
