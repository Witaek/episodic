<script lang="ts">
	import type { Component } from 'svelte';

	interface Props {
		icon: Component;
		title: string;
		description: string;
		phase: string;
	}

	let { icon: Icon, title, description, phase }: Props = $props();
</script>

<div class="grid min-h-[60dvh] place-items-center px-4">
	<div class="max-w-sm text-center">
		<div class="mx-auto mb-5 grid size-16 place-items-center rounded-2xl bg-surface-2 text-accent">
			<Icon class="size-8" />
		</div>
		<h1 class="text-2xl font-semibold tracking-tight">{title}</h1>
		<p class="mt-2 text-muted">{description}</p>
		<p class="mt-4 inline-block rounded-full bg-surface-2 px-3 py-1 text-xs text-muted">
			Arrives in {phase}
		</p>
	</div>
</div>
