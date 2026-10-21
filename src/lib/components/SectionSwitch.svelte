<script lang="ts">
	import { BookOpen, Clapperboard } from '@lucide/svelte';
	import { rememberSection, type Section } from '$lib/section';

	let { section, compact = false }: { section: Section; compact?: boolean } = $props();

	const options = [
		{ id: 'watch' as const, label: 'Watch', href: '/?section=watch', icon: Clapperboard },
		{ id: 'read' as const, label: 'Read', href: '/read', icon: BookOpen }
	];
</script>

<nav
	class="inline-flex rounded-full bg-surface-2 p-1 {compact ? 'text-xs' : 'text-sm'}"
	aria-label="Watch or read"
>
	{#each options as option (option.id)}
		{@const active = section === option.id}
		<a
			href={option.href}
			onclick={() => rememberSection(option.id)}
			aria-current={active ? 'page' : undefined}
			class="inline-flex items-center gap-1.5 rounded-full font-semibold transition {compact
				? 'px-3 py-1'
				: 'px-4 py-1.5'} {active
				? 'bg-accent text-accent-fg shadow-sm'
				: 'text-muted hover:text-fg'}"
		>
			<option.icon class={compact ? 'size-3.5' : 'size-4'} />
			{option.label}
		</a>
	{/each}
</nav>
