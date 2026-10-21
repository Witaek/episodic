import { error, redirect } from '@sveltejs/kit';
import {
	BOOK_LANGUAGES,
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
import { editionFor, editionsFor, isCoverOnly } from '$lib/server/services/books';
import {
	bookEditions,
	defaultEdition,
	localizedSummary,
	anyBlurb,
	languageOf,
	looksLike,
	marcOf
} from '$lib/server/services/book-details';
import { bookLanguage } from '$lib/server/services/reading';
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

/** An edition offered in the book page's edition picker. */
export interface EditionChoice {
	id: string;
	title: string;
	cover: Image | null;
	publisher: string | null;
	year: string | null;
	pages: number | null;
	languages: string[];
	inLanguage: boolean;
}

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

	// Books: the edition picked in search (?edition=), else the one this reader chose, else one in
	// their language. The summary follows the reader's language when one can be found.
	let edition: BookEdition | null = null;
	let editions: EditionChoice[] = [];
	let editionChosen = false;
	let overviewNote: string | null = null;
	if (kind === 'book') {
		const language = bookLanguage(locale!.language) ?? 'en';
		const all = await bookEditions(params.id);
		const param = url.searchParams.get('edition');
		const saved = editionFor(user.id, params.id);
		editionChosen = !!saved || !!param;
		// A cover chosen from another language's edition keeps the usual edition's title and pages.
		const coverOnly = !param && isCoverOnly(saved);
		const editionId =
			(param && /^\d+$/.test(param) ? param : null) ??
			(coverOnly ? null : saved?.id) ??
			defaultEdition(all, language)?.id ??
			null;
		const listed = all.find((e) => e.id === editionId);
		edition = listed
			? {
					id: listed.id,
					title: listed.title,
					cover: listed.cover,
					pages: listed.pages,
					language: listed.languages[0] ?? null,
					publisher: listed.publisher,
					year: listed.year
				}
			: editionId
				? await getBookEdition(editionId).catch(() => null)
				: null;
		if (edition) {
			title.originalName = edition.title !== title.name ? title.name : null;
			title.name = edition.title;
			title.poster = edition.cover ?? title.poster;
			title.pages = edition.pages ?? title.pages;
		}
		if (coverOnly && saved?.cover) {
			title.poster = saved.cover;
			// The picker marks the edition the cover comes from.
			edition = edition ? { ...edition, id: saved.id } : edition;
		}
		// A French book's own summary is already French; otherwise look for one in the reader's
		// language and say so when only the English one exists.
		if (!title.overview || !looksLike(title.overview, language)) {
			const summary = await localizedSummary(params.id, language, all, edition?.id, {
				title: edition?.title ?? title.name,
				author: title.companies[0] ?? null
			});
			if (summary) title.overview = summary.text;
			else {
				// Nothing in the reader's language: show what exists, and say which language it is.
				title.overview ??= anyBlurb(all);
				const shown = title.overview ? languageOf(title.overview) : null;
				const name = BOOK_LANGUAGES.find((l) => l.id === shown)?.label;
				if (shown && shown !== language && name) {
					overviewNote = `Summary only available in ${shown === 'fr' ? 'French' : name}.`;
				}
			}
		}

		// For the edition picker: covers first, the reader's language first.
		const marc = marcOf(language);
		editions = all
			.map((e) => ({
				id: e.id,
				title: e.title,
				cover: e.cover,
				publisher: e.publisher,
				year: e.year,
				pages: e.pages,
				languages: e.languages,
				inLanguage: e.languages.includes(marc)
			}))
			.sort(
				(a, b) => Number(b.inLanguage) - Number(a.inLanguage) || Number(!a.cover) - Number(!b.cover)
			)
			.slice(0, 120);
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
			season = getSeason(kind, params.id, seasonNumber, locale)
				.then((loaded) =>
					kind === 'series' || kind === 'collection' ? withEditions(loaded, user.id) : loaded
				)
				.catch((cause) => {
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
		editions,
		editionChosen,
		overviewNote,
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

/** A series' books, shown in the edition each reader chose (cover, title, pages). */
function withEditions(season: Season, userId: number): Season {
	const chosen = editionsFor(
		userId,
		season.episodes.map((e) => e.work).filter((w): w is string => !!w)
	);
	if (chosen.size === 0) return season;
	return {
		...season,
		episodes: season.episodes.map((e) => {
			const edition = e.work ? chosen.get(e.work) : undefined;
			return edition
				? {
						...e,
						name: edition.title || e.name,
						still: edition.cover ?? e.still,
						pages: edition.pages ?? e.pages
					}
				: e;
		})
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
