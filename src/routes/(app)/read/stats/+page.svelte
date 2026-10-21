<script lang="ts">
	import { BookOpen, Flame, Target } from '@lucide/svelte';
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import GoalRing from '$lib/components/GoalRing.svelte';
	import Img from '$lib/components/Img.svelte';

	let { data } = $props();
	const s = $derived(data.stats);
	const t = $derived(s.totals);
	const goal = $derived(s.goal);
	let editing = $state(false);

	const tiles = $derived([
		{ label: 'Books', value: t.books },
		{ label: 'Manga volumes', value: t.volumes },
		{ label: 'Chapters', value: t.chapters },
		{ label: 'Titles', value: t.titles }
	]);
	const maxMonth = $derived(Math.max(...s.months.map((m) => m.books + m.volumes), 1));
	const hasMonths = $derived(s.months.some((m) => m.books + m.volumes > 0));
	const maxGenre = $derived(Math.max(...s.genres.map((g) => g.count), 1));
	const monthLabel = (month: string) =>
		new Date(Number(month.slice(0, 4)), Number(month.slice(5)) - 1, 1).toLocaleDateString(
			undefined,
			{ month: 'narrow' }
		);
	const empty = $derived(t.books + t.volumes + t.chapters === 0);
</script>

<svelte:head><title>Reading stats · Episodic</title></svelte:head>

<div
	class="mx-auto max-w-4xl space-y-8 px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-10 md:px-8 md:pt-8"
>
	<div class="flex items-center justify-between gap-3">
		<h1 class="font-serif text-3xl font-semibold tracking-tight">Reading stats</h1>
		<nav class="inline-flex rounded-xl bg-surface-2 p-1 text-sm font-medium" aria-label="Range">
			{#each [{ id: 'year', label: String(data.year), href: '/read/stats' }, { id: 'all', label: 'All time', href: '/read/stats?range=all' }] as option (option.id)}
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

	<!-- Yearly goal -->
	<section id="goal" class="scroll-mt-24 rounded-2xl border border-border bg-surface p-5">
		<div class="flex flex-wrap items-center gap-5">
			{#if goal.target}
				<div class="relative grid place-items-center">
					<GoalRing done={goal.done} target={goal.target} size={96} />
					<span class="absolute text-lg font-bold tabular-nums">{goal.done}</span>
				</div>
			{:else}
				<div class="grid size-16 place-items-center rounded-2xl bg-accent/15 text-accent">
					<Target class="size-8" />
				</div>
			{/if}
			<div class="min-w-0 flex-1">
				<p class="text-sm text-muted">{goal.year} reading goal</p>
				{#if goal.target}
					<p class="font-serif text-2xl font-semibold">
						{goal.done} of {goal.target} books
					</p>
					<p class="text-sm text-muted">
						{goal.done >= goal.target
							? 'Done! Raise the bar?'
							: `${goal.target - goal.done} to go. Books and manga volumes both count.`}
					</p>
				{:else}
					<p class="font-serif text-2xl font-semibold">No goal yet</p>
					<p class="text-sm text-muted">
						How many books do you want to read this year? Manga volumes count too.
					</p>
				{/if}
			</div>
			{#if !editing}
				<button
					type="button"
					onclick={() => (editing = true)}
					class="rounded-full bg-surface-2 px-4 py-2 text-sm font-semibold hover:bg-border"
				>
					{goal.target ? 'Change' : 'Set a goal'}
				</button>
			{/if}
		</div>
		{#if editing}
			<form
				method="POST"
				action="?/goal"
				class="mt-4 flex flex-wrap items-center gap-3 border-t border-border/60 pt-4"
				use:enhance={() =>
					async ({ result, update }) => {
						if (result.type === 'success') {
							editing = false;
							toast.success('Reading goal saved');
						} else if (result.type === 'failure') {
							toast.error(String(result.data?.message ?? "Couldn't save the goal"));
						}
						await update();
					}}
			>
				<label class="flex items-center gap-2 text-sm">
					Read
					<input
						name="books"
						type="number"
						min="0"
						max="1000"
						inputmode="numeric"
						value={goal.target ?? 24}
						class="w-24 rounded-xl border border-border bg-bg px-3 py-2 text-base tabular-nums outline-none focus:border-accent/60"
					/>
					books in {goal.year}
				</label>
				<button
					class="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:brightness-110"
					>Save</button
				>
				<button
					type="button"
					onclick={() => (editing = false)}
					class="text-sm text-muted hover:text-fg">Cancel</button
				>
				<span class="w-full text-xs text-muted">Set 0 to remove the goal.</span>
			</form>
		{/if}
	</section>

	{#if empty}
		<div class="grid place-items-center py-16 text-center">
			<div class="mb-4 grid size-14 place-items-center rounded-2xl bg-surface-2 text-muted">
				<BookOpen class="size-7" />
			</div>
			<p class="font-medium">Nothing read yet</p>
			<p class="mt-1 max-w-xs text-sm text-muted">
				Finish a book or a manga chapter and your reading shows up here.
			</p>
		</div>
	{:else}
		<section class="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
			<div class="col-span-2 rounded-2xl border border-border bg-surface p-5 lg:col-span-3">
				<p class="text-sm text-muted">Pages read</p>
				<p class="mt-1 text-4xl font-bold tracking-tight tabular-nums">
					{t.pages.toLocaleString()}
				</p>
				<p class="mt-1 text-sm text-muted">Counted from finished books with a known length.</p>
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
					<p class="mt-0.5 text-2xl font-bold tabular-nums">{tile.value.toLocaleString()}</p>
				</div>
			{/each}
		</section>

		{#if hasMonths}
			<section class="rounded-2xl border border-border bg-surface p-5">
				<div class="mb-4 flex flex-wrap items-baseline justify-between gap-2">
					<h2 class="font-semibold">Finished, last 12 months</h2>
					<p class="flex gap-4 text-xs text-muted">
						<span class="flex items-center gap-1.5"
							><span class="size-2.5 rounded-sm bg-accent"></span>Books</span
						>
						<span class="flex items-center gap-1.5"
							><span class="volume-bar size-2.5 rounded-sm"></span>Manga volumes</span
						>
					</p>
				</div>
				<ul class="flex h-40 items-end gap-1.5" aria-label="Books and volumes per month">
					{#each s.months as month (month.month)}
						{@const total = month.books + month.volumes}
						<li class="flex h-full flex-1 flex-col items-center justify-end gap-1">
							{#if total}<span class="text-[10px] text-muted tabular-nums">{total}</span>{/if}
							<div
								class="flex w-full max-w-7 flex-col-reverse overflow-hidden rounded-t-md"
								style:height="{(total / maxMonth) * 100}%"
								title="{month.books} books, {month.volumes} volumes"
							>
								<div class="bg-accent" style:flex-grow={month.books}></div>
								<div class="volume-bar" style:flex-grow={month.volumes}></div>
							</div>
							<span class="text-[10px] text-muted">{monthLabel(month.month)}</span>
						</li>
					{/each}
				</ul>
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
									<span class="text-muted tabular-nums">{genre.count}</span>
								</div>
								<div class="h-2 rounded-full bg-surface-2">
									<div
										class="h-full rounded-full bg-accent"
										style:width="{(genre.count / maxGenre) * 100}%"
									></div>
								</div>
							</li>
						{/each}
					</ul>
				</section>
			{/if}

			{#if s.topTitles.length}
				<section>
					<h2 class="mb-3 font-semibold">Most read</h2>
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
											{title.count}
											{title.mediaType === 'manga'
												? title.count === 1
													? 'volume'
													: 'volumes'
												: title.count === 1
													? 'book'
													: 'books'}
										</span>
									</span>
								</a>
							</li>
						{/each}
					</ol>
				</section>
			{/if}
		</div>
	{/if}
</div>

<style>
	/* Second series next to the amber accent: a teal that reads in both themes. */
	.volume-bar {
		background: #2bb3a3;
	}
	:global(:root[data-theme='light']) .volume-bar {
		background: #0f857a;
	}
	@media (prefers-color-scheme: light) {
		:global(:root[data-theme='system']) .volume-bar {
			background: #0f857a;
		}
	}
</style>
