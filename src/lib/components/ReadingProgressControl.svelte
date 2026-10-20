<script lang="ts">
	import { BookOpen } from '@lucide/svelte';
	import type { TitleTracker } from '$lib/tracking/title-tracker.svelte';
	import ProgressBar from './ProgressBar.svelte';

	let { tracker, pages: titlePages = null }: { tracker: TitleTracker; pages?: number | null } =
		$props();

	const reading = $derived(tracker.state.reading);
	const pages = $derived(reading?.pages ?? titlePages);
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
		void tracker.setPage(pages ? Math.min(page, pages) : page);
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
