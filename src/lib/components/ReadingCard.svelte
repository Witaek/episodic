<script lang="ts">
	import { mediaType } from '$lib/media-types/registry';
	import type { LibraryItem } from '$lib/tracking/types';
	import Img from './Img.svelte';
	import ProgressBar from './ProgressBar.svelte';
	import WatchButton from './WatchButton.svelte';

	interface Props {
		item: LibraryItem;
		busy?: boolean;
		/** Marks the next book, chapter, or the whole book read. */
		onread: () => void;
	}

	let { item, busy = false, onread }: Props = $props();

	const type = $derived(mediaType(item.mediaType));
	const next = $derived(item.progress?.nextUp ?? null);
	const page = $derived(item.reading?.page ?? null);
	const pages = $derived(item.reading?.pages ?? null);

	/** "Book 3", "Vol. 4 · Ch. 31", or the book's page. */
	const unitLabel = $derived(
		next ? type.formatUnit({ season: next.seasonNumber, number: next.number }) : null
	);
	const detail = $derived.by(() => {
		if (item.mediaType === 'book') {
			if (!page) return 'Not started';
			return pages ? `Page ${page} of ${pages}` : `Page ${page}`;
		}
		const parts = [next?.name && next.name !== unitLabel ? next.name : null];
		if (page) parts.push(pages ? `p. ${page}/${pages}` : `p. ${page}`);
		return parts.filter(Boolean).join(' · ');
	});
	// Within the current book when there is one; otherwise across the series.
	const percent = $derived(
		item.mediaType === 'book'
			? page && pages
				? (page / pages) * 100
				: 0
			: (item.progress?.percent ?? 0)
	);
	const remaining = $derived(
		item.progress ? Math.max(item.progress.aired - item.progress.watched, 0) : 0
	);
	const label = $derived(
		item.mediaType === 'book'
			? `Mark ${item.name} read`
			: `Mark ${unitLabel ?? 'next'} of ${item.name} read`
	);
</script>

<div
	class="flex items-center gap-4 rounded-2xl border border-border bg-surface p-3 transition hover:border-accent/40"
>
	<a href={item.href} class="shrink-0">
		<Img
			image={item.poster}
			alt=""
			sizes="80px"
			class="aspect-[2/3] w-16 rounded-lg shadow-md md:w-20"
		/>
	</a>
	<a href={item.href} class="min-w-0 flex-1">
		{#if unitLabel}
			<p class="text-xs font-semibold tracking-wide text-accent uppercase">{unitLabel}</p>
		{/if}
		<p class="line-clamp-2 font-serif text-base leading-snug font-semibold">{item.name}</p>
		{#if detail}<p class="mt-0.5 line-clamp-1 text-sm text-muted">{detail}</p>{/if}
		<div class="mt-2 flex items-center gap-2">
			<ProgressBar {percent} class="h-1.5 flex-1" />
			{#if item.mediaType !== 'book' && remaining > 0}
				<span class="shrink-0 text-xs text-muted tabular-nums">
					{remaining}
					{item.mediaType === 'manga' ? 'left' : remaining === 1 ? 'book left' : 'books left'}
				</span>
			{/if}
		</div>
	</a>
	{#if item.mediaType === 'book' || next}
		<WatchButton watched={false} plays={0} {label} disabled={busy} onclick={onread} />
	{/if}
</div>
