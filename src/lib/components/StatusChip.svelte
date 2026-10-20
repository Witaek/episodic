<script lang="ts">
	import type { AiringSummary } from '$lib/catalog/airing';

	let { summary }: { summary: AiringSummary } = $props();

	const tones = {
		soon: 'bg-accent/15 text-accent ring-accent/30',
		live: 'bg-success/15 text-success ring-success/30',
		neutral: 'bg-surface-2 text-fg ring-border',
		ended: 'bg-surface-2 text-muted ring-border'
	};
</script>

<span
	class="inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ring-1 {tones[
		summary.tone
	]}"
>
	{#if summary.tone === 'soon' || summary.tone === 'live'}
		<span class="relative flex size-2">
			<span class="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60"
			></span>
			<span class="relative inline-flex size-2 rounded-full bg-current"></span>
		</span>
	{/if}
	{summary.label}
</span>
