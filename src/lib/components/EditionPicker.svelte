<script lang="ts">
	import { Dialog } from 'bits-ui';
	import { Check, ImageOff } from '@lucide/svelte';
	import { invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import type { EditionChoice } from '$lib/server/title-page';
	import Button from './Button.svelte';
	import Img from './Img.svelte';

	interface Props {
		open: boolean;
		/** Open Library work. */
		work: string;
		editions: EditionChoice[];
		current: string | null;
		/** Whether the reader picked the current edition (vs. the default one). */
		chosen: boolean;
	}

	let { open = $bindable(), work, editions, current, chosen }: Props = $props();

	const LANGUAGES: Record<string, string> = {
		fre: 'French',
		eng: 'English',
		spa: 'Spanish',
		ger: 'German',
		ita: 'Italian',
		por: 'Portuguese',
		dut: 'Dutch'
	};
	let showAll = $state(false);
	let saving = $state<string | null>(null);

	const withCover = $derived(editions.filter((e) => e.cover));
	const inLanguage = $derived(withCover.filter((e) => e.inLanguage));
	// Other languages and coverless editions only on request: they're rarely what you want.
	const shown = $derived(showAll || inLanguage.length === 0 ? editions : inLanguage);

	async function pick(edition: string | null) {
		saving = edition ?? 'default';
		try {
			const response = await fetch(`/api/titles/book/${work}/edition`, {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ edition })
			});
			if (!response.ok) throw new Error(String(response.status));
			open = false;
			toast.success(edition ? 'Edition changed' : 'Back to the default edition');
			// The page shows ?edition= from search first; drop it so the choice shows.
			const url = new URL(location.href);
			if (url.searchParams.has('edition')) {
				url.searchParams.delete('edition');
				history.replaceState(history.state, '', url);
			}
			await invalidateAll();
		} catch {
			toast.error("Couldn't change the edition");
		} finally {
			saving = null;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
		<Dialog.Content
			class="fixed inset-x-2 top-[max(1rem,env(safe-area-inset-top))] bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-3xl flex-col rounded-3xl border border-border bg-surface shadow-2xl sm:inset-x-4 sm:top-[8vh] sm:bottom-[8vh]"
		>
			<div class="border-b border-border/60 p-5">
				<Dialog.Title class="font-serif text-xl font-semibold">Your edition</Dialog.Title>
				<Dialog.Description class="mt-1 text-sm text-muted">
					Pick the edition you own: its cover, title and page count are shown everywhere for you,
					including in its series.
				</Dialog.Description>
			</div>
			<div class="flex-1 overflow-y-auto p-5">
				{#if shown.length}
					<ul class="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-5">
						{#each shown as edition (edition.id)}
							{@const active = edition.id === current}
							<li>
								<button
									type="button"
									disabled={!!saving}
									onclick={() => pick(edition.id)}
									aria-pressed={active}
									class="group block w-full text-left disabled:opacity-60"
								>
									<div class="relative">
										{#if edition.cover}
											<Img
												image={edition.cover}
												alt=""
												sizes="140px"
												class="aspect-[2/3] rounded-lg shadow transition group-hover:-translate-y-0.5 {active
													? 'ring-3 ring-accent'
													: ''}"
											/>
										{:else}
											<div
												class="grid aspect-[2/3] place-items-center rounded-lg bg-surface-2 text-muted {active
													? 'ring-3 ring-accent'
													: ''}"
											>
												<ImageOff class="size-6" />
											</div>
										{/if}
										{#if active}
											<span
												class="absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-full bg-accent text-accent-fg shadow"
											>
												<Check class="size-4" />
											</span>
										{/if}
									</div>
									<p class="mt-1.5 line-clamp-2 text-xs font-semibold">{edition.title}</p>
									<p class="line-clamp-2 text-[11px] text-muted">
										{[
											edition.publisher,
											edition.year,
											edition.languages.map((l) => LANGUAGES[l] ?? l).join(', ') || null,
											edition.pages ? `${edition.pages} p.` : null
										]
											.filter(Boolean)
											.join(' · ')}
									</p>
								</button>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="py-10 text-center text-muted">Open Library lists no editions of this book.</p>
				{/if}
			</div>
			<div class="flex flex-wrap items-center gap-2 border-t border-border/60 p-4">
				{#if inLanguage.length && !showAll && editions.length > inLanguage.length}
					<Button variant="ghost" onclick={() => (showAll = true)}>
						Show all {editions.length} editions
					</Button>
				{/if}
				{#if chosen}
					<Button variant="ghost" disabled={!!saving} onclick={() => pick(null)}>
						Use the default edition
					</Button>
				{/if}
				<Dialog.Close>
					{#snippet child({ props })}
						<Button {...props} type="button" class="ml-auto">Done</Button>
					{/snippet}
				</Dialog.Close>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
