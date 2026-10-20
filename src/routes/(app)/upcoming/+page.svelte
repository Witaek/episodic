<script lang="ts">
	import { CalendarClock } from '@lucide/svelte';
	import Img from '$lib/components/Img.svelte';
	import UpcomingRow from '$lib/components/UpcomingRow.svelte';
	import { formatDate, parseDate } from '$lib/format';
	import { groupByDay } from '$lib/history';

	let { data } = $props();

	const groups = $derived(groupByDay(data.items, (item) => parseDate(item.date)));
</script>

<svelte:head><title>Upcoming · Episodic</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-10 md:px-8 md:pt-8">
	<h1 class="text-2xl font-bold tracking-tight">Upcoming</h1>
	<p class="mt-1 text-sm text-muted">
		The next 30 days for everything in your library. Times are shown in your time zone when known.
	</p>

	{#if data.items.length}
		{#each groups as group (group.key)}
			<section class="mt-6">
				<h2
					class="sticky top-0 z-10 -mx-1 bg-bg/90 px-1 pt-[env(safe-area-inset-top)] pb-1 text-sm font-semibold backdrop-blur {group.label ===
					'Today'
						? 'text-accent'
						: 'text-muted'}"
				>
					{group.label}
				</h2>
				<ul class="divide-y divide-border/60">
					{#each group.items as item (`${item.titleId}-${item.episode?.id ?? 'movie'}`)}
						<UpcomingRow {item} />
					{/each}
				</ul>
			</section>
		{/each}
	{:else}
		<div class="grid place-items-center py-16 text-center">
			<div class="mb-4 grid size-14 place-items-center rounded-2xl bg-surface-2 text-muted">
				<CalendarClock class="size-7" />
			</div>
			<p class="font-medium">Nothing airing in the next 30 days</p>
			<p class="mt-1 max-w-xs text-sm text-muted">
				New episodes of shows in your library show up here as soon as they're scheduled.
			</p>
		</div>
	{/if}

	{#if data.announced.length}
		<section class="mt-10">
			<h2 class="mb-3 text-lg font-semibold tracking-tight">Coming later</h2>
			<ul class="grid grid-cols-1 gap-3 sm:grid-cols-2">
				{#each data.announced as season (season.titleId)}
					<li>
						<a
							href={season.href}
							class="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3 transition hover:border-accent/50"
						>
							<Img
								image={season.poster}
								alt=""
								sizes="48px"
								class="aspect-[2/3] w-12 shrink-0 rounded-md"
							/>
							<div class="min-w-0">
								<p class="line-clamp-1 font-medium">{season.name}</p>
								<p class="text-sm text-muted">
									Season {season.seasonNumber} · {season.airDate
										? formatDate(season.airDate, 'long')
										: 'date to be announced'}
								</p>
							</div>
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>
