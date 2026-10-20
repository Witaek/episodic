<script lang="ts">
	import { page } from '$app/state';
	import { CalendarClock, House, Library, Search, Settings } from '@lucide/svelte';

	const items = [
		{ href: '/', label: 'Home', icon: House },
		{ href: '/search', label: 'Search', icon: Search },
		{ href: '/library', label: 'Library', icon: Library },
		{ href: '/upcoming', label: 'Upcoming', icon: CalendarClock },
		{ href: '/settings', label: 'Settings', icon: Settings }
	];

	const isActive = (href: string) =>
		href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
</script>

<!-- Desktop sidebar -->
<nav
	class="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-bg/80 px-3 py-6 backdrop-blur-xl lg:flex"
	aria-label="Main"
>
	<a href="/" class="mb-8 flex items-center gap-2.5 px-3">
		<img src="/favicon.svg" alt="" class="size-8 rounded-lg" />
		<span class="text-lg font-semibold tracking-tight">Episodic</span>
	</a>
	<ul class="space-y-1">
		{#each items as item (item.href)}
			{@const active = isActive(item.href)}
			<li>
				<a
					href={item.href}
					aria-current={active ? 'page' : undefined}
					class="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition-colors {active
						? 'bg-surface-2 text-fg'
						: 'text-muted hover:bg-surface hover:text-fg'}"
				>
					<item.icon class="size-5 {active ? 'text-accent' : ''}" />
					{item.label}
				</a>
			</li>
		{/each}
	</ul>
</nav>

<!-- Mobile tab bar -->
<nav
	class="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
	aria-label="Main"
>
	<ul class="mx-auto grid max-w-lg grid-cols-5">
		{#each items as item (item.href)}
			{@const active = isActive(item.href)}
			<li>
				<a
					href={item.href}
					aria-current={active ? 'page' : undefined}
					class="flex flex-col items-center gap-1 pt-2.5 pb-2 text-[11px] font-medium transition-colors active:scale-95 {active
						? 'text-fg'
						: 'text-muted'}"
				>
					<item.icon
						class="size-6 {active ? 'text-accent' : ''}"
						strokeWidth={active ? 2.25 : 1.75}
					/>
					{item.label}
				</a>
			</li>
		{/each}
	</ul>
</nav>
