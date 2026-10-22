<script lang="ts">
	import { CloudOff, RefreshCw, Trash2 } from '@lucide/svelte';
	import { formatDateTime } from '$lib/format';
	import { offline } from '$lib/offline/sync.svelte';
	import Button from './Button.svelte';
</script>

<!-- Changes made without a connection, waiting to be sent. -->
<div class="space-y-3 p-4" id="offline">
	{#if offline.count === 0}
		<p class="text-sm text-muted">
			Everything is synced. Without a connection, you can still mark episodes, books and chapters,
			and update your page, on shows and books you've opened recently: changes are kept on this
			device and sent once you're back online.
		</p>
	{:else}
		<div class="flex flex-wrap items-center justify-between gap-3">
			<p class="flex items-center gap-2 text-sm font-medium">
				<CloudOff class="size-4 text-accent" />
				{offline.count} change{offline.count === 1 ? '' : 's'} waiting to sync
				{#if offline.needsSignIn}<span class="text-muted">· sign in again to send them</span>{/if}
			</p>
			<Button
				size="sm"
				variant="secondary"
				disabled={offline.syncing}
				onclick={() => offline.syncNow()}
			>
				<RefreshCw class="size-4 {offline.syncing ? 'animate-spin' : ''}" /> Sync now
			</Button>
		</div>
		<ul class="divide-y divide-border/60 rounded-xl border border-border/60">
			{#each offline.pending as action (action.id)}
				<li class="flex items-center gap-3 px-3 py-2">
					<div class="min-w-0 flex-1">
						<p class="truncate text-sm">{action.label}</p>
						<p class="text-xs text-muted">{formatDateTime(action.createdAt)}</p>
					</div>
					<button
						type="button"
						onclick={() => offline.discard(action.id)}
						class="grid size-8 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"
						aria-label="Discard: {action.label}"
						title="Discard"
					>
						<Trash2 class="size-4" />
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>
