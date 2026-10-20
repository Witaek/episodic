<script lang="ts">
	import { Check } from '@lucide/svelte';

	interface Props {
		watched: boolean;
		/** Number of plays; shows a small badge from 2. */
		plays?: number;
		size?: 'sm' | 'md' | 'lg';
		label: string;
		disabled?: boolean;
		onclick: () => void;
	}

	let { watched, plays = 0, size = 'md', label, disabled = false, onclick }: Props = $props();
	const sizes = { sm: 'size-8', md: 'size-10', lg: 'size-12' };
	const icons = { sm: 'size-4', md: 'size-5', lg: 'size-6' };
</script>

<button
	type="button"
	aria-pressed={watched}
	aria-label={label}
	title={label}
	{disabled}
	onclick={(event) => {
		event.preventDefault();
		event.stopPropagation();
		onclick();
	}}
	class="relative grid shrink-0 place-items-center rounded-full transition duration-200 active:scale-90 disabled:opacity-40 {sizes[
		size
	]} {watched
		? 'bg-success text-bg shadow-[0_0_0_4px] shadow-success/20'
		: 'text-muted ring-2 ring-border ring-inset hover:text-fg hover:ring-muted'}"
>
	<Check
		class="{icons[size]} transition-transform {watched ? 'scale-100' : 'scale-90'}"
		strokeWidth={3}
	/>
	{#if plays > 1}
		<span
			class="absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full bg-fg px-1 text-[10px] font-bold text-bg"
			>{plays}</span
		>
	{/if}
</button>
