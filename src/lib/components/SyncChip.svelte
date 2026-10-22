<script lang="ts">
	import { CloudOff, LoaderCircle, LogIn } from '@lucide/svelte';
	import { offline } from '$lib/offline/sync.svelte';
</script>

<!-- Changes made offline that haven't reached the server yet. -->
{#if offline.count > 0}
	<a
		href="/settings#offline"
		class="fixed top-[calc(env(safe-area-inset-top)+0.5rem)] left-1/2 z-40 inline-flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-surface/95 px-3.5 py-1.5 text-xs font-semibold shadow-lg backdrop-blur lg:left-[calc(50%+7.5rem)]"
		aria-live="polite"
	>
		{#if offline.syncing}
			<LoaderCircle class="size-3.5 animate-spin text-accent" />
			Syncing…
		{:else if offline.needsSignIn}
			<LogIn class="size-3.5 text-accent" />
			Sign in to sync {offline.count} change{offline.count === 1 ? '' : 's'}
		{:else}
			<CloudOff class="size-3.5 text-accent" />
			{offline.count} change{offline.count === 1 ? '' : 's'} waiting to sync
		{/if}
	</a>
{/if}
