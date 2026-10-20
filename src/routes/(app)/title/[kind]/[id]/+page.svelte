<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import {
		ArrowLeft,
		Check,
		CheckCheck,
		ExternalLink,
		Play,
		RefreshCw,
		RotateCcw,
		Star
	} from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import type { Episode } from '$lib/catalog/types';
	import { posterTint } from '$lib/tint';
	import { HERO_POSTER } from '$lib/transitions';
	import { airingSummary } from '$lib/catalog/airing';
	import EpisodeRow, { type EpisodeActions } from '$lib/components/EpisodeRow.svelte';
	import EpisodeSheet from '$lib/components/EpisodeSheet.svelte';
	import Img from '$lib/components/Img.svelte';
	import MediaRow from '$lib/components/MediaRow.svelte';
	import PersonCard from '$lib/components/PersonCard.svelte';
	import SetupNotice from '$lib/components/SetupNotice.svelte';
	import StatusChip from '$lib/components/StatusChip.svelte';
	import { formatDate, formatDateTime, formatRuntime, year } from '$lib/format';
	import LibraryStatusMenu from '$lib/components/LibraryStatusMenu.svelte';
	import ProgressBar from '$lib/components/ProgressBar.svelte';
	import ReadingProgressControl from '$lib/components/ReadingProgressControl.svelte';
	import WatchDateDialog from '$lib/components/WatchDateDialog.svelte';
	import { mediaType } from '$lib/media-types/registry';
	import { formatEpisodeCode } from '$lib/media-types/types';
	import { TitleTracker } from '$lib/tracking/title-tracker.svelte';
	import { EMPTY_STATE, type WatchTarget } from '$lib/tracking/types';

	let { data } = $props();

	let overviewExpanded = $state(false);

	const title = $derived(data.setupNeeded ? null : data.title);

	// A glow in the poster's color behind the page header.
	let tint = $state<string | null>(null);
	$effect(() => {
		const poster = title?.poster;
		tint = poster?.color ?? null;
		if (!poster || poster.color) return;
		let current = true;
		posterTint(poster.url).then((color) => current && (tint = color));
		return () => (current = false);
	});

	const definition = $derived(title ? mediaType(title.mediaType) : null);
	const tracker = $derived(
		title && definition
			? new TitleTracker(
					{ kind: title.ref.kind, id: title.ref.id },
					data.setupNeeded ? EMPTY_STATE : data.state,
					definition.statusLabels
				)
			: null
	);
	const progress = $derived(tracker?.state.progress ?? null);

	// Movies and books are tracked as a whole: one button instead of episodes.
	const whole = $derived(
		title?.mediaType === 'book'
			? {
					target: { type: 'book' } as const,
					markLabel: 'Mark as read',
					doneLabel: 'Read',
					undoLabel: 'Mark as unread',
					againLabel: 'Read again',
					dateLabel: 'Finished on a date…'
				}
			: title?.mediaType === 'movie'
				? {
						target: { type: 'movie' } as const,
						markLabel: 'Mark watched',
						doneLabel: 'Watched',
						undoLabel: 'Mark unwatched',
						againLabel: 'Watch again',
						dateLabel: 'Watched on a date…'
					}
				: null
	);
	const nextUp = $derived(progress?.nextUp ?? null);

	// "Watched on a date…" dialog
	let dateDialog = $state<{
		open: boolean;
		label: string;
		target: WatchTarget | null;
		rewatch: boolean;
	}>({
		open: false,
		label: '',
		target: null,
		rewatch: false
	});
	const airTimes = $derived(data.setupNeeded ? {} : data.airTimes);
	function withAirTime(episode: Episode): Episode {
		return episode.airAt
			? episode
			: { ...episode, airAt: airTimes[`${episode.seasonNumber}-${episode.number}`] ?? null };
	}

	let refreshing = $state(false);
	async function refreshMetadata() {
		if (!title) return;
		refreshing = true;
		try {
			const response = await fetch(`/api/titles/${title.ref.kind}/${title.ref.id}/refresh`, {
				method: 'POST'
			});
			const result = await response.json();
			if (!response.ok) throw new Error(result.error ?? 'Refresh failed');
			if (result.refreshed) {
				await invalidateAll();
				toast.success('Updated from ' + sourceName);
			} else {
				toast('Already up to date', { description: 'Refreshed less than 5 minutes ago.' });
			}
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Refresh failed');
		} finally {
			refreshing = false;
		}
	}

	// Episode details sheet
	let sheet = $state<{ open: boolean; episode: Episode | null; actions: EpisodeActions | null }>({
		open: false,
		episode: null,
		actions: null
	});

	function episodeActions(episode: Episode): EpisodeActions | undefined {
		const t = tracker;
		if (!t) return undefined;
		const { seasonNumber: season, number } = episode;
		const code = formatEpisodeCode({ season, number });
		const target = { type: 'episode' as const, season, number };
		return {
			toggle: () => t.toggleEpisode(season, number),
			upTo: () => t.watch({ type: 'upTo', season, number }),
			pickDate: () =>
				pickDate(target, `${code} · ${episode.name ?? ''}`, t.plays(season, number) > 0),
			rewatch: () => t.watch(target, { rewatch: true }),
			unwatch: () => t.unwatch(target, `${code} marked unwatched`)
		};
	}

	function pickDate(target: WatchTarget, label: string, rewatch = false) {
		dateDialog = { open: true, label, target, rewatch };
	}
	const airing = $derived(title ? airingSummary(title) : null);
	// Specials (season 0) go last.
	const seasons = $derived(
		title ? [...title.seasons].sort((a, b) => (a.number || 1e6) - (b.number || 1e6)) : []
	);
	const sourceName = $derived(title?.ref.provider === 'anilist' ? 'AniList' : 'TMDB');

	const meta = $derived(
		title
			? [
					year(title.startDate) +
						(title.endDate && year(title.endDate) !== year(title.startDate)
							? `–${year(title.endDate)}`
							: ''),
					title.certification,
					title.mediaType === 'book'
						? title.pages
							? `${title.pages} pages`
							: null
						: title.mediaType === 'movie'
							? formatRuntime(title.runtime)
							: title.seasons.filter((s) => s.number > 0).length > 1
								? `${title.seasons.filter((s) => s.number > 0).length} seasons`
								: title.episodeCount
									? `${title.episodeCount} episodes`
									: null,
					title.genres.slice(0, 3).join(', ')
				].filter(Boolean)
			: []
	);

	const facts = $derived(
		title
			? [
					{ label: 'Type', value: mediaType(title.mediaType).label },
					{
						label:
							title.mediaType === 'book'
								? 'First published'
								: title.mediaType === 'movie'
									? 'Release date'
									: 'First aired',
						// Open Library only knows the year.
						value:
							title.mediaType === 'book'
								? year(title.startDate)
								: formatDate(title.startDate, 'long')
					},
					{ label: 'Ended', value: formatDate(title.endDate, 'long') },
					{
						label:
							title.mediaType === 'book'
								? title.companies.length > 1
									? 'Authors'
									: 'Author'
								: title.isAnime && title.ref.provider === 'anilist'
									? 'Studio'
									: title.mediaType === 'movie'
										? 'Production'
										: 'Network',
						value: title.companies.join(', ')
					},
					{
						label: 'Episode length',
						value: title.mediaType === 'movie' ? '' : formatRuntime(title.runtime)
					},
					{ label: 'Pages', value: title.pages ? String(title.pages) : '' },
					{
						label: 'Original title',
						value: title.originalName !== title.name ? title.originalName : ''
					}
				].filter((fact) => fact.value)
			: []
	);
</script>

<svelte:head>
	<title>{title ? `${title.name} · Episodic` : 'Episodic'}</title>
	{#if title?.overview}<meta name="description" content={title.overview} />{/if}
</svelte:head>

{#if data.setupNeeded || !title}
	<div class="p-4 md:p-8"><SetupNotice /></div>
{:else}
	<!-- Hero -->
	<div class="relative">
		{#if tint}
			<div
				class="pointer-events-none absolute inset-x-0 top-40 -z-10 h-[40rem] opacity-35 transition-opacity duration-700"
				style:background="radial-gradient(60% 50% at 30% 40%, {tint}, transparent 70%)"
				aria-hidden="true"
			></div>
		{/if}
		<div class="relative h-64 overflow-hidden sm:h-80 md:h-[26rem] lg:h-[30rem]">
			<Img
				image={title.backdrop ?? title.poster}
				alt=""
				sizes="100vw"
				eager
				class="absolute inset-0 {title.backdrop ? '' : 'scale-110 blur-2xl'}"
			/>
			<div class="absolute inset-0 bg-gradient-to-t from-bg via-bg/50 to-bg/0"></div>
			<div class="absolute inset-0 bg-gradient-to-r from-bg/60 to-transparent md:from-bg/80"></div>
		</div>

		<button
			type="button"
			onclick={() => history.back()}
			class="absolute top-[calc(env(safe-area-inset-top)+0.75rem)] left-3 grid size-10 place-items-center rounded-full bg-black/40 text-white backdrop-blur transition hover:bg-black/60 md:left-6"
			aria-label="Back"
		>
			<ArrowLeft class="size-5" />
		</button>

		<div class="relative -mt-28 flex gap-4 px-4 sm:-mt-36 md:-mt-48 md:gap-8 md:px-8">
			<Img
				image={title.poster}
				alt="{title.name} poster"
				transitionName={HERO_POSTER}
				sizes="(min-width: 768px) 224px, 112px"
				eager
				class="aspect-[2/3] w-28 shrink-0 self-end rounded-xl shadow-2xl ring-1 ring-white/10 sm:w-36 md:w-56"
			/>
			<div class="min-w-0 flex-1 self-end pb-1">
				{#if title.logo}
					<h1 class="mb-3">
						<img
							src={title.logo.url}
							alt={title.name}
							class="max-h-20 max-w-full object-contain object-left drop-shadow-lg md:max-h-32 md:max-w-md"
						/>
					</h1>
				{:else}
					<h1 class="text-2xl font-bold tracking-tight text-balance sm:text-3xl md:text-5xl">
						{title.name}
					</h1>
				{/if}
				{#if title.mediaType === 'book' && title.companies.length}
					<p class="mt-1 text-base text-fg/80 md:text-lg">by {title.companies.join(', ')}</p>
				{/if}
				<p class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg/80">
					{#if title.rating}
						<span class="flex items-center gap-1 font-medium text-fg">
							<Star class="size-4 fill-amber-400 text-amber-400" />
							{title.rating.toFixed(1)}
						</span>
						<span class="text-muted" aria-hidden="true">·</span>
					{/if}
					{#each meta as item, i (i)}
						{#if i > 0}<span class="text-muted" aria-hidden="true">·</span>{/if}
						<span>{item}</span>
					{/each}
				</p>
				{#if airing}
					<div class="mt-3 hidden md:block"><StatusChip summary={airing} /></div>
				{/if}
			</div>
		</div>
	</div>

	<div class="mx-auto max-w-6xl space-y-10 px-4 pt-5 pb-10 md:px-8">
		<!-- Tracking -->
		{#if tracker && definition && title}
			<section class="flex flex-wrap items-center gap-3">
				{#if whole}
					{#if tracker.moviePlays > 0}
						<button
							type="button"
							onclick={() => tracker.unwatch(whole.target)}
							class="inline-flex items-center gap-2 rounded-full bg-success px-5 py-2.5 text-sm font-semibold text-bg transition active:scale-95"
							title={whole.undoLabel}
						>
							<Check class="size-4" strokeWidth={3} />
							{whole.doneLabel}{tracker.moviePlays > 1 ? ` ${tracker.moviePlays}×` : ''}
						</button>
						<button
							type="button"
							onclick={() => tracker.watch(whole.target, { rewatch: true })}
							class="inline-flex items-center gap-2 rounded-full bg-surface-2 px-4 py-2.5 text-sm font-semibold transition hover:bg-border active:scale-95"
						>
							<RotateCcw class="size-4" />
							{whole.againLabel}
						</button>
					{:else}
						<button
							type="button"
							onclick={() => tracker.watch(whole.target)}
							class="inline-flex items-center gap-2 rounded-full bg-fg px-5 py-2.5 text-sm font-semibold text-bg transition hover:opacity-90 active:scale-95"
						>
							<Check class="size-4" strokeWidth={3} />
							{whole.markLabel}
						</button>
					{/if}
					<button
						type="button"
						onclick={() => pickDate(whole.target, title.name, tracker.moviePlays > 0)}
						class="text-sm font-medium text-muted hover:text-fg"
					>
						{whole.dateLabel}
					</button>
				{:else if nextUp}
					<button
						type="button"
						onclick={() =>
							tracker.watch({
								type: 'episode',
								season: nextUp.seasonNumber,
								number: nextUp.number
							})}
						class="inline-flex items-center gap-2 rounded-full bg-fg px-5 py-2.5 text-sm font-semibold text-bg transition hover:opacity-90 active:scale-95"
					>
						<Check class="size-4" strokeWidth={3} />
						Mark {formatEpisodeCode({ season: nextUp.seasonNumber, number: nextUp.number })} watched
					</button>
				{:else if progress?.upToDate}
					<span
						class="inline-flex items-center gap-2 rounded-full bg-success/15 px-4 py-2 text-sm font-semibold text-success"
					>
						<CheckCheck class="size-4" /> Up to date
					</span>
				{/if}
				<LibraryStatusMenu
					status={tracker.state.status}
					labels={definition.statusLabels}
					addLabel={definition.addLabel}
					onselect={(status) => tracker.setStatus(status)}
					onremove={() => tracker.remove()}
				/>
				{#if title.mediaType === 'book'}
					<ReadingProgressControl {tracker} pages={title.pages ?? null} />
				{/if}
				{#if progress && progress.aired > 0 && (progress.watched > 0 || tracker.state.status)}
					<div class="w-full max-w-md space-y-1.5">
						<ProgressBar percent={progress.percent} />
						<p class="text-xs text-muted">
							{progress.watched} of {progress.aired} aired episodes watched{progress.total >
							progress.aired
								? ` · ${progress.total - progress.aired} still to air`
								: ''}
						</p>
					</div>
				{/if}
			</section>
		{/if}

		<!-- Overview -->
		<section class="max-w-3xl space-y-4">
			{#if airing}
				<div class="md:hidden"><StatusChip summary={airing} /></div>
			{/if}
			{#if title.tagline}
				<p class="text-lg text-fg/90 italic">{title.tagline}</p>
			{/if}
			{#if title.overview}
				{@const long = title.overview.length > 360}
				<div>
					<p
						class="leading-relaxed whitespace-pre-line text-fg/85 {long && !overviewExpanded
							? 'line-clamp-5 md:line-clamp-none'
							: ''}"
					>
						{title.overview}
					</p>
					{#if long}
						<button
							type="button"
							class="mt-1 text-sm font-medium text-accent md:hidden"
							onclick={() => (overviewExpanded = !overviewExpanded)}
						>
							{overviewExpanded ? 'Less' : 'More'}
						</button>
					{/if}
				</div>
			{/if}
			<div class="flex flex-wrap gap-2 pt-1">
				{#if title.trailerUrl}
					<a
						href={title.trailerUrl}
						target="_blank"
						rel="noopener noreferrer"
						class="inline-flex items-center gap-2 rounded-full bg-fg px-4 py-2 text-sm font-semibold text-bg transition hover:opacity-90 active:scale-95"
					>
						<Play class="size-4 fill-current" /> Trailer
					</a>
				{/if}
				{#if title.sourceUrl}
					<a
						href={title.sourceUrl}
						target="_blank"
						rel="noopener noreferrer"
						class="inline-flex items-center gap-2 rounded-full bg-surface-2 px-4 py-2 text-sm font-medium transition hover:bg-border active:scale-95"
					>
						<ExternalLink class="size-4" />
						{sourceName}
					</a>
				{/if}
			</div>
		</section>

		<!-- Episodes -->
		{#if seasons.length > 0 && data.seasonNumber !== null}
			<section class="space-y-4" id="episodes">
				<div class="flex items-center justify-between gap-3">
					<h2 class="text-xl font-semibold tracking-tight">Episodes</h2>
					{#if tracker && data.seasonNumber !== null}
						{@const seasonNumber = data.seasonNumber}
						<button
							type="button"
							onclick={() => tracker.watch({ type: 'season', season: seasonNumber })}
							class="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-muted transition hover:bg-surface-2 hover:text-fg"
						>
							<CheckCheck class="size-4" /> Mark season watched
						</button>
					{/if}
				</div>
				{#if seasons.length > 1}
					<nav
						class="-mx-4 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0"
						aria-label="Seasons"
					>
						{#each seasons as season (season.number)}
							{@const active = season.number === data.seasonNumber}
							<a
								href="?season={season.number}"
								data-sveltekit-replacestate
								data-sveltekit-noscroll
								aria-current={active ? 'true' : undefined}
								class="shrink-0 rounded-full px-4 py-1.5 text-sm font-medium whitespace-nowrap transition-colors {active
									? 'bg-fg text-bg'
									: 'bg-surface-2 text-muted hover:text-fg'}"
							>
								{season.number === 0
									? 'Specials'
									: season.name.match(/^Season \d+$/)
										? `Season ${season.number}`
										: season.name}
							</a>
						{/each}
					</nav>
				{/if}

				{#await data.season}
					<div class="divide-y divide-border/60" aria-busy="true">
						{#each Array(4) as _, i (i)}
							<div class="flex gap-3 py-3 md:gap-4">
								<div
									class="aspect-video w-32 shrink-0 animate-pulse rounded-lg bg-surface-2 md:w-44"
								></div>
								<div class="flex-1 space-y-2 pt-1">
									<div class="h-4 w-1/2 animate-pulse rounded bg-surface-2"></div>
									<div class="h-3 w-1/4 animate-pulse rounded bg-surface-2"></div>
								</div>
							</div>
						{/each}
					</div>
				{:then season}
					{#if season && season.episodes.length}
						{@const showStill = season.episodes.some((e) => e.still)}
						{#if season.overview}
							<p class="max-w-3xl text-sm text-muted">{season.overview}</p>
						{/if}
						<div class="divide-y divide-border/60">
							{#each season.episodes as episode (episode.id)}
								{@const actions = episodeActions(episode)}
								<EpisodeRow
									episode={withAirTime(episode)}
									{showStill}
									plays={tracker?.plays(episode.seasonNumber, episode.number)}
									{actions}
									onopen={() =>
										(sheet = {
											open: true,
											episode: withAirTime(episode),
											actions: actions ?? null
										})}
								/>
							{/each}
						</div>
					{:else if season}
						<p class="text-muted">No episodes listed yet.</p>
					{:else}
						<p class="text-muted">Couldn't load this season. Try again in a moment.</p>
					{/if}
				{/await}
			</section>
		{/if}

		<!-- Cast -->
		{#if title.cast.length}
			<section class="space-y-4">
				<h2 class="text-xl font-semibold tracking-tight">
					{title.ref.provider === 'anilist' ? 'Characters' : 'Cast'}
				</h2>
				<ul
					class="-mx-4 flex [scrollbar-width:none] gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0"
				>
					{#each title.cast as person (person.id)}
						<li class="shrink-0"><PersonCard {person} /></li>
					{/each}
				</ul>
			</section>
		{/if}

		<!-- Details -->
		{#if facts.length}
			<section class="space-y-4">
				<h2 class="text-xl font-semibold tracking-tight">Details</h2>
				<dl class="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
					{#each facts as fact (fact.label)}
						<div>
							<dt class="text-xs tracking-wide text-muted uppercase">{fact.label}</dt>
							<dd class="mt-1 text-sm">{fact.value}</dd>
						</div>
					{/each}
				</dl>
				{#if !data.setupNeeded && data.refreshedAt}
					<p class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
						Last updated {formatDateTime(data.refreshedAt)}
						<button
							type="button"
							onclick={refreshMetadata}
							disabled={refreshing}
							class="inline-flex items-center gap-1 font-medium text-accent hover:underline disabled:opacity-50"
						>
							<RefreshCw class="size-3 {refreshing ? 'animate-spin' : ''}" /> Refresh now
						</button>
					</p>
				{/if}
			</section>
		{/if}
	</div>

	{#if title.recommendations.length}
		<div class="pb-10"><MediaRow title="More like this" items={title.recommendations} /></div>
	{/if}
{/if}

<WatchDateDialog
	bind:open={dateDialog.open}
	title={dateDialog.label}
	onconfirm={(date) => {
		if (tracker && dateDialog.target) {
			void tracker.watch(dateDialog.target, { watchedAt: date, rewatch: dateDialog.rewatch });
		}
	}}
/>

<EpisodeSheet
	bind:open={sheet.open}
	episode={sheet.episode}
	showName={title?.name ?? ''}
	plays={sheet.episode && tracker
		? tracker.plays(sheet.episode.seasonNumber, sheet.episode.number)
		: 0}
	actions={sheet.actions}
/>
