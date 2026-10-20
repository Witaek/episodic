<script lang="ts">
	import { enhance } from '$app/forms';
	import { CalendarPlus, Copy, RefreshCw } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import Button from './Button.svelte';

	let { token, appUrl }: { token: string | null; appUrl: string | null } = $props();

	let origin = $state('');
	$effect(() => {
		origin = appUrl?.replace(/\/$/, '') ?? location.origin;
	});
	const url = $derived(token && origin ? `${origin}/calendar/${token}.ics` : '');
	const webcal = $derived(url.replace(/^https?:/, 'webcal:'));

	async function copy() {
		try {
			await navigator.clipboard.writeText(url);
			toast.success('Link copied');
		} catch {
			toast.error('Copy failed. Select the link and copy it by hand.');
		}
	}
</script>

<div class="space-y-4 p-5 text-sm">
	<p class="text-muted">
		Subscribe to your upcoming episodes in your phone's or computer's calendar. It updates by
		itself, roughly every few hours.
	</p>
	{#if token}
		<div class="flex items-center gap-2">
			<input
				readonly
				value={url}
				aria-label="Calendar feed link"
				onfocus={(e) => e.currentTarget.select()}
				class="min-w-0 flex-1 rounded-xl border border-border bg-bg px-3 py-2 font-mono text-xs"
			/>
			<Button size="sm" variant="secondary" onclick={copy}><Copy class="size-4" /> Copy</Button>
		</div>
		<div class="flex flex-wrap gap-2">
			<a
				href={webcal}
				class="inline-flex items-center gap-2 rounded-xl bg-accent px-3 py-1.5 font-semibold text-accent-fg"
			>
				<CalendarPlus class="size-4" /> Add to calendar
			</a>
			<form method="POST" action="?/calendarReset" use:enhance>
				<Button type="submit" size="sm" variant="ghost"
					><RefreshCw class="size-4" /> New link</Button
				>
			</form>
			<form method="POST" action="?/calendarDisable" use:enhance>
				<Button type="submit" size="sm" variant="ghost">Turn off</Button>
			</form>
		</div>
		<p class="text-xs text-muted">
			Keep this link private: anyone with it can see your upcoming episodes. "New link" stops the
			old one. Google Calendar only works if your server is reachable from the internet; iPhone,
			iPad and Mac calendars also work over Tailscale.
		</p>
	{:else}
		<form method="POST" action="?/calendarReset" use:enhance>
			<Button type="submit" size="sm"><CalendarPlus class="size-4" /> Create calendar link</Button>
		</form>
	{/if}
</div>
