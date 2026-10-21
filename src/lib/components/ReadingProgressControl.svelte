<script lang="ts">
	import { BookOpen } from '@lucide/svelte';
	import type { TitleTracker } from '$lib/tracking/title-tracker.svelte';
	import ProgressBar from './ProgressBar.svelte';

	interface Props {
		tracker: TitleTracker;
		pages?: number | null;
		/** Series: the book this page count is for. */
		unit?: { season: number; number: number };
	}

	let { tracker, pages: titlePages = null, unit }: Props = $props();

	// In a series, the saved page only applies to the book it was saved for.
	const reading = $derived.by(() => {
		const r = tracker.state.reading;
		if (!unit) return r;
		return r?.unit && r.unit.season === unit.season && r.unit.number === unit.number ? r : null;
	});
	const pages = $derived(titlePages ?? reading?.pages ?? null);
	let draft = $state('');
	$effect(() => {
		draft = reading?.page ? String(reading.page) : '';
	});
	const percent = $derived(
		pages && reading?.page ? Math.min(100, Math.round((reading.page / pages) * 100)) : 0
	);

	function save(event: SubmitEvent) {
		event.preventDefault();
		const page = Number(draft);
		if (!Number.isFinite(page) || page < 0) return;
		void tracker.setPage(pages ? Math.min(page, pages) : page, unit);
	}
</script>

<form class="w-full max-w-md space-y-2" onsubmit={save}>
	<div class="flex items-center gap-2 text-sm">
		<BookOpen class="size-4 text-muted" />
		<label for="reading-page" class="text-muted">Page</label>
		<input
			id="reading-page"
			type="number"
			inputmode="numeric"
			min="0"
			max={pages ?? undefined}
			bind:value={draft}
			placeholder="0"
			class="w-20 rounded-lg border border-border bg-surface px-2 py-1 text-center tabular-nums outline-none focus:border-accent/60"
		/>
		{#if pages}<span class="text-muted">of {pages}</span>{/if}
		<button
			type="submit"
			class="ml-auto rounded-full bg-surface-2 px-3 py-1 font-medium transition hover:bg-border active:scale-95"
		>
			Save
		</button>
	</div>
	{#if pages && reading?.page}
		<ProgressBar {percent} />
		<p class="text-xs text-muted">{percent}% · {pages - reading.page} pages to go</p>
	{/if}
</form>
