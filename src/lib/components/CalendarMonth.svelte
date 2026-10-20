<script lang="ts">
	import { ChevronLeft, ChevronRight } from '@lucide/svelte';
	import { parseDate } from '$lib/format';
	import { formatEpisodeCode } from '$lib/media-types/types';
	import type { UpcomingItem } from '$lib/tracking/types';
	import Img from './Img.svelte';
	import UpcomingRow from './UpcomingRow.svelte';

	interface Props {
		year: number;
		month: number;
		from: string;
		to: string;
		today: string;
		items: UpcomingItem[];
	}

	let { year, month, from, to, today, items }: Props = $props();

	const pad = (n: number) => String(n).padStart(2, '0');
	const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
	const monthParam = (y: number, m: number) => {
		const d = new Date(y, m, 1);
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
	};

	const days = $derived.by(() => {
		const list: string[] = [];
		for (let d = parseDate(from); iso(d) <= to; d.setDate(d.getDate() + 1)) list.push(iso(d));
		return list;
	});
	const byDay = $derived.by(() => {
		const map = new Map<string, UpcomingItem[]>();
		for (const item of items) map.set(item.date, [...(map.get(item.date) ?? []), item]);
		return map;
	});
	const weekdays = $derived(
		Array.from({ length: 7 }, (_, i) =>
			new Date(2024, 0, 1 + i).toLocaleDateString(undefined, { weekday: 'short' })
		)
	);
	const title = $derived(
		new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
	);
	const inMonth = (day: string) => parseDate(day).getMonth() === month;

	// The selected day's list shows under the grid (tapping a day on a phone).
	let selected = $state<string | null>(null);
	const selectedDay = $derived(
		selected && days.includes(selected)
			? selected
			: days.includes(today)
				? today
				: (days.find((d) => inMonth(d) && byDay.has(d)) ?? null)
	);
	const selectedItems = $derived(selectedDay ? (byDay.get(selectedDay) ?? []) : []);
</script>

<div class="mt-5 flex items-center justify-between gap-3">
	<h2 class="text-lg font-semibold capitalize">{title}</h2>
	<div class="flex items-center gap-1">
		<a
			href="?view=calendar&month={monthParam(year, month - 1)}"
			data-sveltekit-replacestate
			data-sveltekit-noscroll
			class="grid size-9 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"
			aria-label="Previous month"
		>
			<ChevronLeft class="size-5" />
		</a>
		<a
			href="?view=calendar"
			data-sveltekit-replacestate
			data-sveltekit-noscroll
			class="rounded-full px-3 py-1.5 text-sm font-medium text-muted hover:bg-surface-2 hover:text-fg"
		>
			Today
		</a>
		<a
			href="?view=calendar&month={monthParam(year, month + 1)}"
			data-sveltekit-replacestate
			data-sveltekit-noscroll
			class="grid size-9 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"
			aria-label="Next month"
		>
			<ChevronRight class="size-5" />
		</a>
	</div>
</div>

<div class="mt-3 overflow-hidden rounded-2xl border border-border bg-surface">
	<div class="grid grid-cols-7 border-b border-border text-center text-xs font-medium text-muted">
		{#each weekdays as day (day)}
			<div class="py-2">{day}</div>
		{/each}
	</div>
	<div class="grid grid-cols-7">
		{#each days as day, i (day)}
			{@const dayItems = byDay.get(day) ?? []}
			{@const isToday = day === today}
			{@const isSelected = day === selectedDay}
			<button
				type="button"
				onclick={() => (selected = day)}
				aria-pressed={isSelected}
				aria-label="{parseDate(day).toLocaleDateString(undefined, {
					weekday: 'long',
					day: 'numeric',
					month: 'long'
				})}, {dayItems.length} {dayItems.length === 1 ? 'item' : 'items'}"
				class="relative flex min-h-16 flex-col gap-1 border-border p-1 text-left transition-colors md:min-h-28 md:p-1.5 {i %
					7 !==
				6
					? 'border-r'
					: ''} {i < days.length - 7 ? 'border-b' : ''} {isSelected
					? 'bg-accent/10'
					: 'hover:bg-surface-2'} {inMonth(day) ? '' : 'opacity-40'}"
			>
				<span
					class="grid size-6 place-items-center rounded-full text-xs font-semibold tabular-nums {isToday
						? 'bg-accent text-accent-fg'
						: ''}"
				>
					{parseDate(day).getDate()}
				</span>
				<!-- Phones: one dot per item. Larger screens: a line per item. -->
				<span class="flex flex-wrap gap-0.5 md:hidden">
					{#each dayItems.slice(0, 6) as item, j (j)}
						<span
							class="size-1.5 rounded-full {item.watched ? 'bg-success' : 'bg-accent'}"
							aria-hidden="true"
						></span>
					{/each}
				</span>
				<span class="hidden min-w-0 flex-col gap-0.5 md:flex">
					{#each dayItems.slice(0, 3) as item, j (j)}
						<span
							class="flex min-w-0 items-center gap-1 rounded-md px-1 py-0.5 text-[11px] leading-tight {item.watched
								? 'bg-success/15 text-success'
								: 'bg-accent/15 text-fg'}"
						>
							<Img
								image={item.poster}
								alt=""
								sizes="16px"
								class="aspect-[2/3] w-3 shrink-0 rounded-sm"
							/>
							<span class="truncate">
								{item.name}{item.episode
									? ` ${formatEpisodeCode({ season: item.episode.seasonNumber, number: item.episode.number })}`
									: ''}
							</span>
						</span>
					{/each}
					{#if dayItems.length > 3}
						<span class="px-1 text-[11px] text-muted">+{dayItems.length - 3} more</span>
					{/if}
				</span>
			</button>
		{/each}
	</div>
</div>

{#if selectedDay}
	<section class="mt-5">
		<h3 class="text-sm font-semibold text-muted">
			{parseDate(selectedDay).toLocaleDateString(undefined, {
				weekday: 'long',
				day: 'numeric',
				month: 'long'
			})}
		</h3>
		{#if selectedItems.length}
			<ul class="mt-1 divide-y divide-border/60">
				{#each selectedItems as item (`${item.titleId}-${item.episode?.id ?? 'movie'}`)}
					<UpcomingRow {item} />
				{/each}
			</ul>
		{:else}
			<p class="mt-2 text-sm text-muted">Nothing on this day.</p>
		{/if}
	</section>
{/if}
