<script lang="ts">
	import { Dialog } from 'bits-ui';
	import { goto, invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import Button from './Button.svelte';
	import SegmentedControl from './SegmentedControl.svelte';

	interface Props {
		open: boolean;
		/** Open Library work of the book being grouped. */
		work: string;
		bookName: string;
	}

	let { open = $bindable(), work, bookName }: Props = $props();

	let mode = $state<'new' | 'existing'>('new');
	let name = $state('');
	let number = $state(1);
	let existing = $state<{ id: string; name: string; books: number }[]>([]);
	let chosen = $state('');
	let saving = $state(false);

	$effect(() => {
		if (!open) return;
		// "Le Seigneur des anneaux, tome 2" → "Le Seigneur des anneaux", number 2.
		const match = bookName.match(/^(.*?)[\s,:–-]*(?:tome|vol\.?|volume|book|livre|t\.)\s*(\d+)/i);
		name = match ? match[1].trim() : bookName;
		number = match ? Number(match[2]) : 1;
		fetch('/api/collections')
			.then((r) => (r.ok ? r.json() : []))
			.then((list) => {
				existing = list;
				chosen = list[0]?.id ?? '';
			})
			.catch(() => {});
	});

	async function save(event: SubmitEvent) {
		event.preventDefault();
		saving = true;
		try {
			const response =
				mode === 'new'
					? await fetch('/api/collections', {
							method: 'POST',
							headers: { 'content-type': 'application/json' },
							body: JSON.stringify({ name, work, number })
						})
					: await fetch(`/api/collections/${chosen}/books`, {
							method: 'POST',
							headers: { 'content-type': 'application/json' },
							body: JSON.stringify({ work, number })
						});
			const result = await response.json().catch(() => ({}));
			if (!response.ok) {
				toast.error(result.error ?? result.message ?? "Couldn't group this book");
				return;
			}
			open = false;
			toast.success(`Added as book ${number}`);
			if (result.href) await goto(result.href);
			else await invalidateAll();
		} finally {
			saving = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
		<Dialog.Content
			class="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 mx-auto max-w-sm rounded-3xl border border-border bg-surface p-6 shadow-2xl sm:top-1/2 sm:bottom-auto sm:-translate-y-1/2"
		>
			<Dialog.Title class="font-serif text-xl font-semibold">Part of a series</Dialog.Title>
			<Dialog.Description class="mt-1 text-sm text-muted">
				Group books yourself when the catalog doesn't know the series. They're then tracked
				together, like the episodes of a show.
			</Dialog.Description>
			<form class="mt-5 space-y-4" onsubmit={save}>
				{#if existing.length}
					<SegmentedControl
						name="series-mode"
						value={mode}
						onchange={(value) => (mode = value)}
						options={[
							{ value: 'new', label: 'New series' },
							{ value: 'existing', label: 'Existing' }
						]}
					/>
				{/if}
				{#if mode === 'new' || !existing.length}
					<label class="block space-y-1.5 text-sm font-medium">
						<span>Series name</span>
						<input
							bind:value={name}
							required
							maxlength="200"
							class="w-full rounded-xl border border-border bg-bg px-3.5 py-2.5 text-base outline-none focus:border-accent/60"
						/>
					</label>
				{:else}
					<label class="block space-y-1.5 text-sm font-medium">
						<span>Series</span>
						<select
							bind:value={chosen}
							class="w-full rounded-xl border border-border bg-bg px-3.5 py-2.5 text-base outline-none focus:border-accent/60"
						>
							{#each existing as series (series.id)}
								<option value={series.id}>{series.name} ({series.books})</option>
							{/each}
						</select>
					</label>
				{/if}
				<label class="block space-y-1.5 text-sm font-medium">
					<span>This book is number</span>
					<input
						type="number"
						bind:value={number}
						min="1"
						max="999"
						required
						inputmode="numeric"
						class="w-24 rounded-xl border border-border bg-bg px-3.5 py-2.5 text-base tabular-nums outline-none focus:border-accent/60"
					/>
				</label>
				<div class="flex justify-end gap-2 pt-1">
					<Dialog.Close>
						{#snippet child({ props })}
							<Button {...props} type="button" variant="ghost">Cancel</Button>
						{/snippet}
					</Dialog.Close>
					<Button type="submit" disabled={saving}>Save</Button>
				</div>
			</form>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
