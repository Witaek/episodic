<script lang="ts">
	import { page } from '$app/state';
	import {
		BookOpen,
		CalendarClock,
		ChartColumn,
		History,
		House,
		Library,
		LibraryBig,
		ScanBarcode,
		Search,
		Settings
	} from '@lucide/svelte';
	import type { Section } from '$lib/section';
	import SectionSwitch from './SectionSwitch.svelte';

	let { section }: { section: Section } = $props();

	const watchItems = [
		{ href: '/', label: 'Home', icon: House },
		{ href: '/search', label: 'Search', icon: Search },
		{ href: '/library', label: 'Library', icon: Library },
		{ href: '/upcoming', label: 'Upcoming', icon: CalendarClock },
		{ href: '/history?section=watch', label: 'History', icon: History }
	];
	const readItems = [
		{ href: '/read', label: 'Reading', icon: BookOpen },
		{ href: '/read/search', label: 'Search', icon: Search },
		{ href: '/read/shelf', label: 'Shelf', icon: LibraryBig },
		{ href: '/read/stats', label: 'Stats', icon: ChartColumn },
		{ href: '/history?section=read', label: 'History', icon: History }
	];
	const items = $derived(section === 'read' ? readItems : watchItems);
	// Settings (and Watch stats, Read scanning) live in the sidebar on desktop; on phones they're
	// reached from the home screens.
	const sidebarItems = $derived([
		...items,
		...(section === 'read'
			? [{ href: '/read/scan', label: 'Scan a book', icon: ScanBarcode }]
			: [{ href: '/stats', label: 'Stats', icon: ChartColumn }]),
		{ href: '/settings', label: 'Settings', icon: Settings }
	]);

	const isActive = (href: string) => {
		const [path] = href.split('?');
		if (path === '/' || path === '/read') return page.url.pathname === path;
		return page.url.pathname.startsWith(path);
	};
</script>

<!-- Desktop sidebar -->
<nav
	class="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-bg/80 px-3 py-6 backdrop-blur-xl lg:flex"
	aria-label="Main"
>
	<a href={section === 'read' ? '/read' : '/'} class="mb-5 flex items-center gap-2.5 px-3">
		<img src="/favicon.svg" alt="" class="size-8 rounded-lg" />
		<span class="text-lg font-semibold tracking-tight">Episodic</span>
	</a>
	<div class="mb-6 px-2"><SectionSwitch {section} /></div>
	<ul class="space-y-1">
		{#each sidebarItems as item (item.href)}
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
