<script lang="ts">
	import { ChartColumn, Flame } from '@lucide/svelte';
	import Img from '$lib/components/Img.svelte';
	import MonthlyChart from '$lib/components/MonthlyChart.svelte';

	let { data } = $props();
	const s = $derived(data.stats);
	const t = $derived(s.totals);

	const hours = $derived(Math.round(t.minutes / 60));
	const days = $derived((t.minutes / 60 / 24).toFixed(1));
	const maxGenre = $derived(Math.max(...s.genres.map((g) => g.minutes), 1));
	const fmtHours = (m: number) =>
		m >= 600 ? `${Math.round(m / 60)} h` : `${(m / 60).toFixed(1)} h`;
	const hasMonths = $derived(
		s.months.some((m) => m.minutes.show + m.minutes.anime + m.minutes.movie > 0)
	);

	const tiles = $derived([
		{ label: 'Episodes', value: t.episodes.toLocaleString() },
		{ label: 'Movies', value: t.movies.toLocaleString() },
		{ label: 'Books read', value: t.books.toLocaleString() },
		{ label: 'Titles', value: t.titles.toLocaleString() },
		{ label: 'Completed', value: t.completed.toLocaleString() }
	]);
</script>

<svelte:head><title>Stats · Episodic</title></svelte:head>

<div
	class="mx-auto max-w-4xl space-y-8 px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-10 md:px-8 md:pt-8"
>
	<div class="flex items-center justify-between gap-3">
		<h1 class="text-2xl font-bold tracking-tight">Stats</h1>
		<nav class="inline-flex rounded-xl bg-surface-2 p-1 text-sm font-medium" aria-label="Range">
			{#each [{ id: 'year', label: String(data.year), href: '/stats' }, { id: 'all', label: 'All time', href: '/stats?range=all' }] as option (option.id)}
				<a
					href={option.href}
					data-sveltekit-replacestate
					data-sveltekit-noscroll
					aria-current={s.range === option.id ? 'page' : undefined}
					class="rounded-lg px-3.5 py-1.5 transition {s.range === option.id
						? 'bg-surface text-fg shadow-sm'
						: 'text-muted hover:text-fg'}">{option.label}</a
				>
			{/each}
		</nav>
	</div>

	{#if t.episodes + t.movies + t.books === 0}
		<div class="grid place-items-center py-20 text-center">
			<div class="mb-4 grid size-14 place-items-center rounded-2xl bg-surface-2 text-muted">
				<ChartColumn class="size-7" />
			</div>
			<p class="font-medium">No stats yet</p>
			<p class="mt-1 max-w-xs text-sm text-muted">
				Mark a few episodes or movies as watched and your numbers show up here.
			</p>
		</div>
	{:else}
		<!-- Headline numbers -->
		<section class="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
			<div class="col-span-2 rounded-2xl border border-border bg-surface p-5 lg:col-span-3">
				<p class="text-sm text-muted">Time watched</p>
				<p class="mt-1 text-4xl font-bold tracking-tight tabular-nums">
					{hours.toLocaleString()} h
				</p>
				<p class="mt-1 text-sm text-muted">That's {days} days of screen time.</p>
			</div>
			<div class="col-span-2 rounded-2xl border border-border bg-surface p-5">
				<p class="flex items-center gap-1.5 text-sm text-muted"><Flame class="size-4" /> Streak</p>
				<p class="mt-1 text-4xl font-bold tracking-tight tabular-nums">
					{t.currentStreak}
					<span class="text-lg font-semibold text-muted"
						>{t.currentStreak === 1 ? 'day' : 'days'}</span
					>
				</p>
				<p class="mt-1 text-sm text-muted">
					Longest: {t.longestStreak}
					{t.longestStreak === 1 ? 'day' : 'days'} in a row.
				</p>
			</div>
			{#each tiles as tile (tile.label)}
				<div class="rounded-2xl border border-border bg-surface p-4">
					<p class="text-sm text-muted">{tile.label}</p>
					<p class="mt-0.5 text-2xl font-bold tabular-nums">{tile.value}</p>
				</div>
			{/each}
		</section>

		{#if hasMonths}
			<section class="rounded-2xl border border-border bg-surface p-5">
				<h2 class="mb-3 font-semibold">Hours watched, last 12 months</h2>
				<MonthlyChart months={s.months} />
			</section>
		{/if}

		<div class="grid gap-8 md:grid-cols-2">
			{#if s.genres.length}
				<section>
					<h2 class="mb-3 font-semibold">Top genres</h2>
					<ul class="space-y-2.5">
						{#each s.genres as genre (genre.genre)}
							<li>
								<div class="mb-1 flex justify-between text-sm">
									<span>{genre.genre}</span>
									<span class="text-muted tabular-nums">{fmtHours(genre.minutes)}</span>
								</div>
								<div class="h-2 rounded-full bg-surface-2">
									<div
										class="genre-bar h-full rounded-full"
										style:width="{(genre.minutes / maxGenre) * 100}%"
									></div>
								</div>
							</li>
						{/each}
					</ul>
				</section>
			{/if}

			<section>
				<h2 class="mb-3 font-semibold">Most watched</h2>
				<ol class="space-y-2">
					{#each s.topTitles as title, i (title.titleId)}
						<li>
							<a
								href={title.href}
								class="flex items-center gap-3 rounded-xl p-1.5 transition hover:bg-surface"
							>
								<span class="w-5 text-right text-sm font-semibold text-muted tabular-nums"
									>{i + 1}</span
								>
								<Img
									image={title.poster}
									alt=""
									sizes="40px"
									class="aspect-[2/3] w-9 shrink-0 rounded-md"
								/>
								<span class="min-w-0 flex-1">
									<span class="line-clamp-1 font-medium">{title.name}</span>
									<span class="text-sm text-muted">
										{title.episodes
											? `${title.episodes} episode${title.episodes === 1 ? '' : 's'} · `
											: ''}{fmtHours(title.minutes)}
									</span>
								</span>
							</a>
						</li>
					{/each}
				</ol>
			</section>
		</div>
	{/if}
</div>

<style>
	/* Single series: one hue (the TV-shows slot), so no legend is needed. */
	.genre-bar {
		background: #3987e5;
	}
	:global(:root[data-theme='light']) .genre-bar {
		background: #2a78d6;
	}
	@media (prefers-color-scheme: light) {
		:global(:root[data-theme='system']) .genre-bar {
			background: #2a78d6;
		}
	}
</style>
