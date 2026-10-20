<script lang="ts">
	import type { Snippet } from 'svelte';

	let { title, children }: { title: string; children: Snippet } = $props();
</script>

<section class="space-y-3">
	<h2 class="text-sm font-semibold tracking-wide text-muted uppercase">{title}</h2>
	<div class="overflow-hidden rounded-2xl border border-border bg-surface">
		{@render children()}
	</div>
</section>
