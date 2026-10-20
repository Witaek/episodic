<script lang="ts">
	import { CalendarClock, Ellipsis, Repeat, Trash2 } from '@lucide/svelte';
	import { DropdownMenu } from 'bits-ui';
	import { formatEpisodeCode } from '$lib/media-types/types';
	import type { HistoryItem } from '$lib/tracking/types';
	import Img from './Img.svelte';
	import { menuContent, menuItem, menuSeparator } from './menu';

	interface Props {
		item: HistoryItem;
		onedit: () => void;
		ondelete: () => void;
	}

	let { item, onedit, ondelete }: Props = $props();

	const time = $derived(
		new Date(item.occurredAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
	);
	const image = $derived(item.episode?.still ?? null);
</script>

<li class="flex items-center gap-3 py-3">
	<a href={item.title.href} class="flex min-w-0 flex-1 items-center gap-3">
		{#if image}
			<Img {image} alt="" sizes="112px" class="aspect-video w-24 shrink-0 rounded-lg md:w-28" />
		{:else}
			<Img
				image={item.title.poster}
				alt=""
				sizes="48px"
				class="aspect-[2/3] w-11 shrink-0 rounded-md"
			/>
		{/if}
		<div class="min-w-0">
			<p class="line-clamp-1 font-medium">{item.title.name}</p>
			<p class="line-clamp-1 text-sm text-muted">
				{#if item.episode}
					<span class="font-medium text-fg/80"
						>{formatEpisodeCode({
							season: item.episode.seasonNumber,
							number: item.episode.number
						})}</span
					>{item.episode.name ? ` · ${item.episode.name}` : ''}
				{:else}
					Movie
				{/if}
			</p>
			<p class="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
				{time}
				{#if item.isRepeat}
					<span
						class="inline-flex items-center gap-1 rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold"
					>
						<Repeat class="size-3" /> Rewatch
					</span>
				{/if}
			</p>
		</div>
	</a>
	<DropdownMenu.Root>
		<DropdownMenu.Trigger
			class="grid size-9 shrink-0 place-items-center rounded-full text-muted transition hover:bg-surface-2 hover:text-fg"
			aria-label="Actions"
		>
			<Ellipsis class="size-5" />
		</DropdownMenu.Trigger>
		<DropdownMenu.Portal>
			<DropdownMenu.Content class={menuContent} sideOffset={6} align="end">
				<DropdownMenu.Item class={menuItem} onSelect={onedit}>
					<CalendarClock class="size-4" /> Change date…
				</DropdownMenu.Item>
				<DropdownMenu.Separator class={menuSeparator} />
				<DropdownMenu.Item class="{menuItem} text-danger" onSelect={ondelete}>
					<Trash2 class="size-4" /> Remove from history
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Portal>
	</DropdownMenu.Root>
</li>
