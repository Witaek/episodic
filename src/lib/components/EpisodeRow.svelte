<script lang="ts">
	import { CalendarClock, Ellipsis, ListChecks, RotateCcw, Undo2 } from '@lucide/svelte';
	import { DropdownMenu } from 'bits-ui';
	import type { Episode } from '$lib/catalog/types';
	import { formatDate, formatDateTime, formatRuntime, isPast, relativeDay } from '$lib/format';
	import Img from './Img.svelte';
	import WatchButton from './WatchButton.svelte';
	import { menuContent, menuItem, menuSeparator } from './menu';

	export interface EpisodeActions {
		toggle: () => void;
		upTo: () => void;
		pickDate: () => void;
		rewatch: () => void;
		unwatch: () => void;
	}

	interface Props {
		episode: Episode;
		/** False when no episode in the list has a still, so rows stay compact. */
		showStill?: boolean;
		/** Watch count; undefined hides tracking controls (signed-out preview). */
		plays?: number;
		actions?: EpisodeActions;
	}

	let { episode, showStill = true, plays, actions }: Props = $props();

	const aired = $derived(
		episode.airAt ? new Date(episode.airAt) <= new Date() : isPast(episode.airDate)
	);
	const watched = $derived((plays ?? 0) > 0);
	const when = $derived.by(() => {
		if (aired) return formatDate(episode.airDate ?? episode.airAt);
		if (episode.airAt) return `Airs ${formatDateTime(episode.airAt)}`;
		if (episode.airDate) return `Airs ${relativeDay(episode.airDate)}`;
		return 'Date to be announced';
	});
	const code = $derived(`episode ${episode.number}`);
</script>

<article
	class="group flex items-center gap-3 md:gap-4 {showStill ? 'py-3' : 'py-2.5'} {aired || watched
		? ''
		: 'opacity-60'}"
>
	{#if showStill}
		<div class="relative shrink-0">
			<Img
				image={episode.still}
				alt=""
				sizes="(min-width: 768px) 176px, 128px"
				class="aspect-video w-32 rounded-lg md:w-44 {watched ? 'opacity-55' : ''}"
			/>
		</div>
	{/if}
	<div class="min-w-0 flex-1 self-start {showStill ? 'pt-0.5' : ''}">
		<h3 class="text-[15px] leading-snug font-medium {watched ? 'text-fg/70' : ''}">
			<span class="text-muted tabular-nums">{episode.number}.</span>
			{episode.name ?? `Episode ${episode.number}`}
		</h3>
		<p class="mt-0.5 text-xs text-muted">
			{when}{episode.runtime ? ` · ${formatRuntime(episode.runtime)}` : ''}
		</p>
		{#if episode.overview}
			<p class="mt-1.5 line-clamp-2 text-sm text-muted">{episode.overview}</p>
		{/if}
	</div>

	{#if actions}
		<div class="flex shrink-0 items-center gap-1">
			<DropdownMenu.Root>
				<DropdownMenu.Trigger
					class="grid size-9 place-items-center rounded-full text-muted transition hover:bg-surface-2 hover:text-fg"
					aria-label="More actions for {code}"
				>
					<Ellipsis class="size-5" />
				</DropdownMenu.Trigger>
				<DropdownMenu.Portal>
					<DropdownMenu.Content class={menuContent} sideOffset={6} align="end">
						<DropdownMenu.Item class={menuItem} onSelect={actions.upTo}>
							<ListChecks class="size-4" /> Mark all up to here
						</DropdownMenu.Item>
						<DropdownMenu.Item class={menuItem} onSelect={actions.pickDate}>
							<CalendarClock class="size-4" /> Watched on a date…
						</DropdownMenu.Item>
						{#if watched}
							<DropdownMenu.Item class={menuItem} onSelect={actions.rewatch}>
								<RotateCcw class="size-4" /> Watch again
							</DropdownMenu.Item>
							<DropdownMenu.Separator class={menuSeparator} />
							<DropdownMenu.Item class={menuItem} onSelect={actions.unwatch}>
								<Undo2 class="size-4" /> Mark unwatched
							</DropdownMenu.Item>
						{/if}
					</DropdownMenu.Content>
				</DropdownMenu.Portal>
			</DropdownMenu.Root>
			<WatchButton
				{watched}
				plays={plays ?? 0}
				label={watched ? `Mark ${code} unwatched` : `Mark ${code} watched`}
				onclick={actions.toggle}
			/>
		</div>
	{/if}
</article>
