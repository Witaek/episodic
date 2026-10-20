<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';

	interface Props extends HTMLInputAttributes {
		label: string;
		error?: string | null;
		hint?: string;
	}

	let { label, error = null, hint, id, value = $bindable(), ...rest }: Props = $props();
	const inputId = $derived(id ?? `field-${rest.name}`);
</script>

<div class="space-y-1.5">
	<label for={inputId} class="block text-sm font-medium">{label}</label>
	<input
		id={inputId}
		bind:value
		aria-invalid={error ? 'true' : undefined}
		aria-describedby={error || hint ? `${inputId}-note` : undefined}
		class="w-full rounded-xl border bg-surface px-3.5 py-2.5 text-base outline-none placeholder:text-muted focus:ring-4 {error
			? 'border-danger/70 focus:ring-danger/15'
			: 'border-border focus:border-accent/60 focus:ring-accent/15'}"
		{...rest}
	/>
	{#if error}
		<p id="{inputId}-note" class="text-sm text-danger">{error}</p>
	{:else if hint}
		<p id="{inputId}-note" class="text-xs text-muted">{hint}</p>
	{/if}
</div>
