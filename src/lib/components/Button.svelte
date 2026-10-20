<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	interface Props extends HTMLButtonAttributes {
		variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
		size?: 'sm' | 'md';
		children: Snippet;
	}

	let {
		variant = 'primary',
		size = 'md',
		class: className = '',
		children,
		...rest
	}: Props = $props();

	const variants = {
		primary: 'bg-accent text-accent-fg hover:brightness-110',
		secondary: 'bg-surface-2 text-fg hover:bg-border',
		ghost: 'text-muted hover:bg-surface-2 hover:text-fg',
		danger: 'bg-danger/15 text-danger hover:bg-danger/25'
	};
	const sizes = { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2.5 text-[15px]' };
</script>

<button
	class="inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 {variants[
		variant
	]} {sizes[size]} {className}"
	{...rest}
>
	{@render children()}
</button>
