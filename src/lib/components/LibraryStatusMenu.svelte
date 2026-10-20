<script lang="ts">
	import { Check, ChevronDown, Plus, Trash2 } from '@lucide/svelte';
	import { DropdownMenu } from 'bits-ui';
	import { LIBRARY_STATUSES, type LibraryStatus } from '$lib/media-types/types';
	import { menuContent, menuItem, menuSeparator } from './menu';

	interface Props {
		status: LibraryStatus | null;
		labels: Record<LibraryStatus, string>;
		onselect: (status: LibraryStatus) => void;
		onremove: () => void;
	}

	let { status, labels, onselect, onremove }: Props = $props();
</script>

<div class="inline-flex">
	{#if status}
		<DropdownMenu.Root>
			<DropdownMenu.Trigger
				class="inline-flex items-center gap-2 rounded-full bg-surface-2 px-4 py-2 text-sm font-semibold transition hover:bg-border active:scale-95"
			>
				<Check class="size-4 text-success" strokeWidth={3} />
				{labels[status]}
				<ChevronDown class="size-4 text-muted" />
			</DropdownMenu.Trigger>
			<DropdownMenu.Portal>
				<DropdownMenu.Content class={menuContent} sideOffset={8} align="start">
					{#each LIBRARY_STATUSES as option (option)}
						<DropdownMenu.Item
							class={menuItem}
							onSelect={() => option !== status && onselect(option)}
						>
							<Check class="size-4 {option === status ? 'text-accent' : 'invisible'}" />
							{labels[option]}
						</DropdownMenu.Item>
					{/each}
					<DropdownMenu.Separator class={menuSeparator} />
					<DropdownMenu.Item class="{menuItem} text-danger" onSelect={onremove}>
						<Trash2 class="size-4" /> Remove from library
					</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Portal>
		</DropdownMenu.Root>
	{:else}
		<button
			type="button"
			onclick={() => onselect('planned')}
			class="inline-flex items-center gap-2 rounded-l-full bg-accent py-2 pr-3 pl-4 text-sm font-semibold text-accent-fg transition hover:brightness-110 active:scale-95"
		>
			<Plus class="size-4" strokeWidth={3} />
			Add to {labels.planned}
		</button>
		<DropdownMenu.Root>
			<DropdownMenu.Trigger
				class="inline-flex items-center rounded-r-full border-l border-black/15 bg-accent py-2 pr-3 pl-2 text-accent-fg transition hover:brightness-110"
				aria-label="Add with another status"
			>
				<ChevronDown class="size-4" />
			</DropdownMenu.Trigger>
			<DropdownMenu.Portal>
				<DropdownMenu.Content class={menuContent} sideOffset={8} align="end">
					{#each LIBRARY_STATUSES as option (option)}
						<DropdownMenu.Item class={menuItem} onSelect={() => onselect(option)}>
							{labels[option]}
						</DropdownMenu.Item>
					{/each}
				</DropdownMenu.Content>
			</DropdownMenu.Portal>
		</DropdownMenu.Root>
	{/if}
</div>
