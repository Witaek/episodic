<script lang="ts">
	import { ArrowLeft, ExternalLink, Play, Star } from '@lucide/svelte';
	import { airingSummary } from '$lib/catalog/airing';
	import EpisodeRow from '$lib/components/EpisodeRow.svelte';
	import Img from '$lib/components/Img.svelte';
	import MediaRow from '$lib/components/MediaRow.svelte';
	import PersonCard from '$lib/components/PersonCard.svelte';
	import SetupNotice from '$lib/components/SetupNotice.svelte';
	import StatusChip from '$lib/components/StatusChip.svelte';
	import { formatDate, formatRuntime, year } from '$lib/format';
	import { mediaType } from '$lib/media-types/registry';

	let { data } = $props();

	let overviewExpanded = $state(false);

	const title = $derived(data.setupNeeded ? null : data.title);
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
					title.mediaType === 'movie'
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
						label: title.mediaType === 'movie' ? 'Release date' : 'First aired',
						value: formatDate(title.startDate, 'long')
					},
					{ label: 'Ended', value: formatDate(title.endDate, 'long') },
					{
						label:
							title.isAnime && title.ref.provider === 'anilist'
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
				<h2 class="text-xl font-semibold tracking-tight">Episodes</h2>
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
								<EpisodeRow {episode} {showStill} />
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
			</section>
		{/if}
	</div>

	{#if title.recommendations.length}
		<div class="pb-10"><MediaRow title="More like this" items={title.recommendations} /></div>
	{/if}
{/if}
