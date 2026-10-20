<script lang="ts">
	import { CalendarClock, Check, RotateCcw, Star, Undo2 } from '@lucide/svelte';
	import { Dialog } from 'bits-ui';
	import type { Episode } from '$lib/catalog/types';
	import { formatDate, formatDateTime, formatRuntime } from '$lib/format';
	import { formatEpisodeCode } from '$lib/media-types/types';
	import Img from './Img.svelte';
	import type { EpisodeActions } from './EpisodeRow.svelte';

	interface Props {
		open: boolean;
		episode: Episode | null;
		showName: string;
		plays: number;
		actions: EpisodeActions | null;
	}

	let { open = $bindable(), episode, showName, plays, actions }: Props = $props();

	const run = (action: (() => void) | undefined) => () => {
		open = false;
		action?.();
	};
</script>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
		<Dialog.Content
			class="sheet fixed inset-x-0 bottom-0 z-50 max-h-[90dvh] overflow-y-auto rounded-t-3xl border-t border-border bg-surface pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl outline-none sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-[32rem] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:border sm:pb-5"
		>
			{#if episode}
				<div
					class="mx-auto mt-2.5 mb-1 h-1.5 w-10 rounded-full bg-border sm:hidden"
					aria-hidden="true"
				></div>
				{#if episode.still}
					<Img
						image={episode.still}
						alt=""
						sizes="(min-width: 640px) 512px, 100vw"
						class="aspect-video w-full sm:rounded-t-3xl"
					/>
				{/if}
				<div class="space-y-4 p-5">
					<div>
						<p class="text-xs font-semibold tracking-wide text-accent uppercase">
							{showName} · {formatEpisodeCode({
								season: episode.seasonNumber,
								number: episode.number
							})}
						</p>
						<Dialog.Title class="mt-1 text-xl font-semibold">
							{episode.name ?? `Episode ${episode.number}`}
						</Dialog.Title>
						<p class="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted">
							<span>
								{episode.airAt
									? formatDateTime(episode.airAt)
									: episode.airDate
										? formatDate(episode.airDate, 'long')
										: 'Date to be announced'}
							</span>
							{#if episode.runtime}<span>· {formatRuntime(episode.runtime)}</span>{/if}
							{#if episode.rating}
								<span class="inline-flex items-center gap-1"
									>· <Star class="size-3.5 fill-amber-400 text-amber-400" />
									{episode.rating.toFixed(1)}</span
								>
							{/if}
						</p>
					</div>
					{#if episode.overview}
						<Dialog.Description class="leading-relaxed text-fg/85"
							>{episode.overview}</Dialog.Description
						>
					{/if}
					{#if plays > 0}
						<p class="text-sm text-success">Watched{plays > 1 ? ` ${plays} times` : ''}</p>
					{/if}

					{#if actions}
						<div class="grid grid-cols-2 gap-2 pt-1">
							{#if plays > 0}
								<button type="button" onclick={run(actions.rewatch)} class="sheet-action">
									<RotateCcw class="size-4" /> Watch again
								</button>
								<button type="button" onclick={run(actions.unwatch)} class="sheet-action">
									<Undo2 class="size-4" /> Mark unwatched
								</button>
							{:else}
								<button
									type="button"
									onclick={run(actions.toggle)}
									class="sheet-action col-span-2 !bg-fg !text-bg"
								>
									<Check class="size-4" strokeWidth={3} /> Mark watched
								</button>
							{/if}
							<button type="button" onclick={run(actions.pickDate)} class="sheet-action">
								<CalendarClock class="size-4" /> On a date…
							</button>
							<button type="button" onclick={run(actions.upTo)} class="sheet-action">
								<Check class="size-4" /> All up to here
							</button>
						</div>
					{/if}
				</div>
			{/if}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	:global(.sheet[data-state='open']) {
		animation: sheet-in 260ms cubic-bezier(0.2, 0.9, 0.3, 1);
	}
	@keyframes sheet-in {
		from {
			transform: translateY(40px);
			opacity: 0;
		}
	}
	@media (min-width: 640px) {
		@keyframes sheet-in {
			from {
				transform: translate(-50%, -46%);
				opacity: 0;
			}
		}
	}
	.sheet-action {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		border-radius: 0.75rem;
		background: var(--surface-2);
		padding: 0.7rem 1rem;
		font-size: 0.9rem;
		font-weight: 600;
		transition: transform 120ms;
	}
	.sheet-action:active {
		transform: scale(0.97);
	}
	.sheet-action:disabled {
		opacity: 0.5;
	}
</style>
