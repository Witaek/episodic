import { error, redirect } from '@sveltejs/kit';
import {
	READ_KINDS,
	titleHref,
	type BookEdition,
	type Image,
	type Season,
	type TitleKind
} from '$lib/catalog/types';
import {
	animeMoviesForShow,
	resolveShowMovies,
	showForAnimeMovie
} from '$lib/server/services/franchise';
import type { UserPrefs } from '$lib/server/db/schema';
import { NotConfiguredError } from '$lib/server/providers';
import { editionOf } from '$lib/server/services/books';
import { getEntry, getUserTitleState } from '$lib/server/services/library';
import { findTitle, titleEpisodes } from '$lib/server/services/titles';
import {
	defaultSeasonNumber,
	getSeason,
	getTitle,
	getBookEdition,
	isNotFound,
	type TitleLookup
} from '$lib/server/services/catalog';
import {
	basedOn,
	bookAdaptations,
	mangaAdaptations,
	readLocale,
	seriesForBook,
	type LinkedTitle
} from '$lib/server/services/adaptations';
import { absorbIntoSeries, collectionOfWork } from '$lib/server/services/book-series';

const KINDS: TitleKind[] = ['movie', 'tv', 'anime', 'book', 'series', 'collection', 'manga'];

interface TitlePageEvent {
	params: { kind: string; id: string };
	url: URL;
	locals: App.Locals;
}

/**
 * Loads a title page. Watch titles live under /title/…, books, book series and manga under
 * /read/… (same page, Read look); a request on the wrong side is redirected.
 */
export async function loadTitlePage(
	{ params, url, locals }: TitlePageEvent,
	section: 'watch' | 'read'
) {
	const kind = params.kind as TitleKind;
	if (!KINDS.includes(kind) || !/^\d+$/.test(params.id)) error(404, 'Not found');
	const isRead = READ_KINDS.includes(kind);
	if (isRead !== (section === 'read')) {
		redirect(307, `${titleHref({ kind, id: params.id })}${url.search}`);
	}
	const user = locals.user!;
	// Books, series and manga are shown in the reader's book language.
	const locale = isRead ? readLocale(user.prefs) : undefined;

	let lookup: TitleLookup;
	try {
		lookup = await getTitle(kind, params.id, locale);
	} catch (cause) {
		if (cause instanceof NotConfiguredError) return { setupNeeded: true as const, section };
		if (isNotFound(cause)) error(404, 'This title could not be found.');
		console.error(`[title] ${kind}/${params.id} failed`, cause);
		error(502, 'Could not load this title right now. Please try again in a moment.');
	}

	if ('redirect' in lookup) redirect(307, lookup.redirect);
	// A copy: book editions change some fields for this reader only.
	const title = { ...lookup.title };
	const stored = findTitle(kind, params.id);
	const state = getUserTitleState(user.id, stored, user.prefs);

	// Books: show the edition picked in search (?edition=) or the one this reader saved before.
	let edition: BookEdition | null = null;
	if (kind === 'book') {
		const param = url.searchParams.get('edition');
		const saved = stored ? editionOf(getEntry(user.id, stored.id)?.progress)?.id : null;
		const editionId = param && /^\d+$/.test(param) ? param : saved;
		if (editionId) {
			edition = await getBookEdition(editionId).catch(() => null);
			if (edition) {
				title.originalName = edition.title !== title.name ? title.name : null;
				title.name = edition.title;
				title.poster = edition.cover ?? title.poster;
				title.pages = edition.pages ?? title.pages;
			}
		}
	}

	// Exact air times learned by the background refresh (AniList/TVmaze), keyed "season-number".
	const airTimes: Record<string, string> = {};
	if (stored) {
		for (const e of titleEpisodes(stored.id)) {
			if (e.airAt) airTimes[`${e.seasonNumber}-${e.number}`] = e.airAt;
		}
	}
	const next = title.nextEpisode;
	if (next && !next.airAt) next.airAt = airTimes[`${next.seasonNumber}-${next.number}`] ?? null;

	let seasonNumber: number | null = null;
	let season: Promise<Season | null> = Promise.resolve(null);
	if (title.mediaType !== 'movie' && title.seasons.length > 0) {
		const param = url.searchParams.get('season');
		const requested = param !== null && /^\d+$/.test(param) ? Number(param) : undefined;
		const progressSeason =
			state.progress?.nextUp?.seasonNumber ?? state.progress?.nextToAir?.seasonNumber;
		const hasSeason = (n: number | undefined) =>
			n !== undefined && title.seasons.some((s) => s.number === n);
		seasonNumber = hasSeason(requested)
			? requested!
			: hasSeason(progressSeason) && state.progress?.watched
				? progressSeason!
				: defaultSeasonNumber(title);
		if (seasonNumber !== null) {
			season = getSeason(kind, params.id, seasonNumber, locale).catch((cause) => {
				console.error(`[title] season ${seasonNumber} of ${kind}/${params.id} failed`, cause);
				return null;
			});
		}
	}

	// Anime movies live with their show: list them on the show, link back from the movie.
	const movies =
		title.isAnime && kind === 'tv' ? franchiseMovies(Number(params.id), user.id, user.prefs) : null;
	const partOf =
		title.isAnime && kind === 'movie' ? parentShow(Number(params.id)) : Promise.resolve(null);

	// A book that belongs to a series is tracked through the series (it's one of its volumes):
	// a Wikidata series, or one grouped by hand.
	let inSeries: {
		kind: 'series' | 'collection';
		id: string;
		name: string;
		href: string;
		season: number;
		number: number;
		state: ReturnType<typeof getUserTitleState>;
	} | null = null;
	if (kind === 'book') {
		const membership = await seriesForBook(params.id, locale!.language);
		const position = Number(membership?.ordinal);
		const local = collectionOfWork(params.id);
		const found =
			membership && Number.isInteger(position) && position > 0
				? {
						kind: 'series' as const,
						id: membership.series,
						name: membership.seriesName,
						number: position
					}
				: local
					? {
							kind: 'collection' as const,
							id: local.title.externalId,
							name: local.title.name,
							number: local.unit.number
						}
					: null;
		if (found) {
			// Reads of this book recorded on their own move into the series.
			if (stored) await absorbIntoSeries(user.id, stored, user.prefs).catch(() => false);
			inSeries = {
				...found,
				href: titleHref({ kind: found.kind, id: found.id }),
				season: 1,
				state: getUserTitleState(user.id, findTitle(found.kind, found.id), user.prefs)
			};
		}
	}

	// Adaptations (films, TV, anime) of what you read, and what a film or show is based on.
	let adaptations: Promise<LinkedTitle[]> = Promise.resolve([]);
	if (kind === 'manga') adaptations = mangaAdaptations(params.id, user.id, user.prefs);
	else if (kind === 'book') adaptations = bookAdaptations(title, user.id, user.prefs, [params.id]);
	else if (kind === 'series' || kind === 'collection') {
		adaptations = getSeason(kind, params.id, 1, locale)
			.then((s) =>
				bookAdaptations(
					title,
					user.id,
					user.prefs,
					s.episodes.map((e) => e.work).filter((w): w is string => !!w)
				)
			)
			.catch(() => []);
	}
	const basedOnList = isRead
		? Promise.resolve([])
		: basedOn(title, user.id, user.prefs).catch(() => []);

	// Streamed promises (season, movies, partOf, adaptations, basedOn): the page renders
	// immediately and fills them in.
	return {
		section,
		inSeries,
		adaptations,
		basedOn: basedOnList,
		edition,
		movies,
		partOf,
		setupNeeded: false as const,
		title,
		seasonNumber,
		season,
		state,
		airTimes,
		refreshedAt: stored?.refreshedAt.toISOString() ?? null
	};
}

export interface FranchiseMovie {
	id: string;
	href: string;
	name: string;
	year: number | null;
	poster: Image | null;
	runtime: number | null;
	plays: number;
}

async function franchiseMovies(
	tmdbTvId: number,
	userId: number,
	prefs: UserPrefs
): Promise<FranchiseMovie[]> {
	await resolveShowMovies(tmdbTvId);
	const ids = animeMoviesForShow(tmdbTvId);
	const settled = await Promise.allSettled(ids.map((id) => getTitle('movie', String(id))));
	return settled.flatMap((outcome, i) => {
		if (outcome.status === 'rejected' || 'redirect' in outcome.value) return [];
		const movie = outcome.value.title;
		const id = String(ids[i]);
		return [
			{
				id,
				href: titleHref({ kind: 'movie', id }),
				name: movie.name,
				year: movie.startDate ? Number(movie.startDate.slice(0, 4)) : null,
				poster: movie.poster,
				runtime: movie.runtime,
				plays: getUserTitleState(userId, findTitle('movie', id), prefs).watched.movie ?? 0
			}
		];
	});
}

async function parentShow(tmdbMovieId: number) {
	const showId = showForAnimeMovie(tmdbMovieId);
	if (!showId) return null;
	try {
		const lookup = await getTitle('tv', String(showId));
		if ('redirect' in lookup) return null;
		return {
			href: titleHref({ kind: 'tv', id: String(showId) }),
			name: lookup.title.name,
			poster: lookup.title.poster
		};
	} catch {
		return null;
	}
}
