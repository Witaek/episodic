<script lang="ts">
	import { ChartColumn, History, LoaderCircle } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import Button from '$lib/components/Button.svelte';
	import HistoryRow from '$lib/components/HistoryRow.svelte';
	import WatchDateDialog from '$lib/components/WatchDateDialog.svelte';
	import { groupByDay } from '$lib/history';
	import type { HistoryItem } from '$lib/tracking/types';

	let { data } = $props();

	// Pages loaded with "Load more" are appended; everything resets when the filter changes.
	let items = $derived(data.items);
	let cursor = $derived(data.nextCursor);
	let loading = $state(false);

	const groups = $derived(groupByDay(items, (item) => new Date(item.occurredAt)));

	const types = [
		{ id: 'all', label: 'All' },
		{ id: 'tv', label: 'TV shows' },
		{ id: 'anime', label: 'Anime' },
		{ id: 'movie', label: 'Movies' },
		{ id: 'book', label: 'Books' }
	];

	async function loadMore() {
		if (!cursor || loading) return;
		loading = true;
		try {
			const response = await fetch(
				`/api/history?type=${data.type}&cursor=${encodeURIComponent(cursor)}`
			);
			const page = (await response.json()) as { items: HistoryItem[]; nextCursor: string | null };
			items = [...items, ...page.items];
			cursor = page.nextCursor;
		} catch {
			toast.error("Couldn't load more history");
		} finally {
			loading = false;
		}
	}

	async function remove(item: HistoryItem) {
		const before = items;
		items = items.filter((i) => i.eventId !== item.eventId);
		const response = await fetch(`/api/activity/${item.eventId}`, { method: 'DELETE' });
		if (response.ok) toast('Removed from history');
		else {
			items = before;
			toast.error("Couldn't remove it");
		}
	}

	let editing = $state<HistoryItem | null>(null);
	let editOpen = $state(false);

	async function changeDate(item: HistoryItem, date: Date) {
		const response = await fetch(`/api/activity/${item.eventId}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ occurredAt: date.toISOString() })
		});
		if (!response.ok) {
			toast.error((await response.json().catch(() => ({}))).message ?? "Couldn't change the date");
			return;
		}
		items = items
			.map((i) => (i.eventId === item.eventId ? { ...i, occurredAt: date.toISOString() } : i))
			.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.eventId - a.eventId);
		toast.success('Date updated');
	}
</script>

<svelte:head><title>History · Episodic</title></svelte:head>

<div
	class="sticky top-0 z-20 space-y-3 border-b border-border/60 bg-bg/85 px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-3 backdrop-blur-xl md:px-8"
>
	<div class="flex items-center justify-between gap-3">
		<h1 class="text-2xl font-bold tracking-tight">History</h1>
		<a
			href="/stats"
			class="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-sm font-medium text-muted hover:text-fg"
		>
			<ChartColumn class="size-4" /> Stats
		</a>
	</div>
	<nav class="flex gap-4 text-sm" aria-label="Type">
		{#each types as type (type.id)}
			<a
				href={type.id === 'all' ? '/history' : `/history?type=${type.id}`}
				data-sveltekit-replacestate
				data-sveltekit-noscroll
				class="pb-0.5 font-medium transition-colors {data.type === type.id
					? 'border-b-2 border-accent text-fg'
					: 'text-muted hover:text-fg'}">{type.label}</a
			>
		{/each}
	</nav>
</div>

<div class="mx-auto max-w-3xl px-4 py-4 md:px-8">
	{#if items.length}
		{#each groups as group (group.key)}
			<section class="mb-4">
				<h2
					class="sticky top-[calc(env(safe-area-inset-top)+6.5rem)] z-10 -mx-1 bg-bg/90 px-1 py-2 text-sm font-semibold text-muted backdrop-blur"
				>
					{group.label}
					<span class="font-normal">· {group.items.length}</span>
				</h2>
				<ul class="divide-y divide-border/60">
					{#each group.items as item (item.eventId)}
						<HistoryRow
							{item}
							onedit={() => {
								editing = item;
								editOpen = true;
							}}
							ondelete={() => remove(item)}
						/>
					{/each}
				</ul>
			</section>
		{/each}
		{#if cursor}
			<div class="flex justify-center py-4">
				<Button variant="secondary" onclick={loadMore} disabled={loading}>
					{#if loading}<LoaderCircle class="size-4 animate-spin" />{/if}
					Load more
				</Button>
			</div>
		{/if}
	{:else}
		<div class="grid place-items-center py-20 text-center">
			<div class="mb-4 grid size-14 place-items-center rounded-2xl bg-surface-2 text-muted">
				<History class="size-7" />
			</div>
			<p class="font-medium">No history yet</p>
			<p class="mt-1 max-w-xs text-sm text-muted">
				Everything you mark as watched shows up here, day by day.
			</p>
		</div>
	{/if}
</div>

<WatchDateDialog
	bind:open={editOpen}
	title={editing ? editing.title.name : ''}
	initial={editing ? new Date(editing.occurredAt) : null}
	onconfirm={(date) => editing && changeDate(editing, date)}
/>
