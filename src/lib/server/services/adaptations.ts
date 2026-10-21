import { titleHref, type Image, type TitleDetails, type TitleKind } from '$lib/catalog/types';
import { cached, DAY } from '../cache';
import { config } from '../config';
import type { UserPrefs } from '../db/schema';
import { mangaDetails, sourceMangaForAnime } from '../providers/anilist';
import { mappingsByAnilistIds, mappingsForTmdbTv } from '../providers/anime-mapping';
import {
	adaptationsOf,
	adaptationsOfWorks,
	basedOnForTmdb,
	seriesForWorks,
	type Adaptation,
	type SeriesMembership
} from '../providers/wikidata';
import type { LocaleOptions } from '../providers';
import { getTitle } from './catalog';
import { getUserTitleState } from './library';
import { findTitle } from './titles';

/** Book series and manga are shown in the reader's book language. */
export function readLocale(prefs: UserPrefs): LocaleOptions {
	const { METADATA_LANGUAGE, METADATA_REGION } = config();
	return { language: prefs.bookLanguage ?? METADATA_LANGUAGE.slice(0, 2), region: METADATA_REGION };
}

/** The series a book belongs to (cached for a week). */
export function seriesForBook(work: string, language: string): Promise<SeriesMembership | null> {
	return cached(`membership:${work}:${language.slice(0, 2)}`, 7 * DAY, async () => {
		const found = await seriesForWorks([work], language.slice(0, 2));
		return found.get(work) ?? null;
	}).catch(() => null);
}

export interface LinkedTitle {
	href: string;
	name: string;
	year: number | null;
	poster: Image | null;
	/** "Movie", "TV series", "Anime", "Book series", "Manga"… */
	label: string;
	/** Your progress: watched/read, or a percentage for shows. */
	done: boolean;
	percent: number | null;
}

/** Your progress on a title, for adaptation and "based on" cards. */
function progressOf(kind: TitleKind, id: string, userId: number, prefs: UserPrefs) {
	const state = getUserTitleState(userId, findTitle(kind, id), prefs);
	if (state.progress) {
		return { done: state.progress.upToDate, percent: state.progress.percent || null };
	}
	return { done: (state.watched.movie ?? 0) > 0, percent: null };
}

/** At least this many TMDB votes: filters out fan films and parodies listed on Wikidata. */
const MIN_VOTES = 25;

async function tmdbCards(
	list: Adaptation[],
	userId: number,
	prefs: UserPrefs
): Promise<LinkedTitle[]> {
	const cards = await Promise.all(
		list.map(async (a): Promise<LinkedTitle | null> => {
			const kind = a.tmdbTv ? 'tv' : 'movie';
			const id = (a.tmdbTv ?? a.tmdbMovie)!;
			let details: TitleDetails | null = null;
			try {
				const lookup = await getTitle(kind, id);
				if (!('redirect' in lookup)) details = lookup.title;
			} catch {
				// Unknown on TMDB (or adult content, which TMDB hides): leave it out.
				return null;
			}
			if (details && (details.votes ?? 0) < MIN_VOTES) return null;
			return {
				href: titleHref({ kind, id }),
				name: details?.name ?? a.label,
				year: details?.startDate ? Number(details.startDate.slice(0, 4)) : a.year,
				poster: details?.poster ?? null,
				label: kind === 'tv' ? 'TV series' : 'Movie',
				...progressOf(kind, id, userId, prefs)
			};
		})
	);
	return cards
		.filter((c): c is LinkedTitle => c !== null)
		.sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999));
}

/** Films and TV series adapted from a book or a book series. */
export async function bookAdaptations(
	title: TitleDetails,
	userId: number,
	prefs: UserPrefs,
	works: string[]
): Promise<LinkedTitle[]> {
	if (!config().TMDB_ACCESS_TOKEN) return [];
	const key = `adaptations:${title.ref.kind}:${title.ref.id}`;
	const list = await cached(key, 7 * DAY, async () => {
		const series = title.externalIds.wikidata?.replace(/^Q/, '');
		const [fromSeries, fromBooks] = await Promise.all([
			series ? adaptationsOf([series]) : Promise.resolve([]),
			adaptationsOfWorks(works)
		]);
		const seen = new Set<string>();
		return [...fromSeries, ...fromBooks].filter((a) => !seen.has(a.qid) && seen.add(a.qid));
	}).catch(() => [] as Adaptation[]);
	return tmdbCards(list, userId, prefs);
}

/** Anime adapted from a manga, one card per show (seasons folded) plus movies. */
export async function mangaAdaptations(
	anilistMangaId: string,
	userId: number,
	prefs: UserPrefs
): Promise<LinkedTitle[]> {
	const relations = await cached(`manga-anime:${anilistMangaId}`, 7 * DAY, async () => {
		const details = await mangaDetails(anilistMangaId);
		return details.relations.edges
			.filter((e) => e.relationType === 'ADAPTATION' && e.node.type === 'ANIME')
			.map((e) => ({
				id: e.node.id,
				format: e.node.format,
				name: e.node.title.english ?? e.node.title.userPreferred,
				year: e.node.startDate.year,
				cover: e.node.coverImage.large
			}));
	}).catch(() => []);
	if (relations.length === 0) return [];

	const tmdbReady = !!config().TMDB_ACCESS_TOKEN;
	const mappings = mappingsByAnilistIds(relations.map((r) => r.id));
	const cards = new Map<string, LinkedTitle>();
	for (const r of relations) {
		const m = mappings.get(r.id);
		if (tmdbReady && m?.tmdbTvId && r.format !== 'MOVIE') {
			const id = String(m.tmdbTvId);
			if (cards.has(`tv:${id}`)) continue;
			const lookup = await getTitle('tv', id).catch(() => null);
			const details = lookup && !('redirect' in lookup) ? lookup.title : null;
			cards.set(`tv:${id}`, {
				href: titleHref({ kind: 'tv', id }),
				name: details?.name ?? r.name,
				year: details?.startDate ? Number(details.startDate.slice(0, 4)) : r.year,
				poster: details?.poster ?? (r.cover ? { url: r.cover } : null),
				label: 'Anime series',
				...progressOf('tv', id, userId, prefs)
			});
		} else if (tmdbReady && m?.tmdbMovieId && r.format === 'MOVIE') {
			const id = String(m.tmdbMovieId);
			if (cards.has(`movie:${id}`)) continue;
			cards.set(`movie:${id}`, {
				href: titleHref({ kind: 'movie', id }),
				name: r.name,
				year: r.year,
				poster: r.cover ? { url: r.cover } : null,
				label: 'Anime movie',
				...progressOf('movie', id, userId, prefs)
			});
		} else if (r.format === 'TV' || r.format === 'MOVIE') {
			// Not linked to TMDB: open the AniList-only page.
			const id = String(r.id);
			cards.set(`anime:${id}`, {
				href: titleHref({ kind: 'anime', id }),
				name: r.name,
				year: r.year,
				poster: r.cover ? { url: r.cover } : null,
				label: r.format === 'MOVIE' ? 'Anime movie' : 'Anime series',
				...progressOf('anime', id, userId, prefs)
			});
		}
	}
	return [...cards.values()].sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999));
}

/** For a Watch title: the books, series or manga it's based on. */
export async function basedOn(
	title: TitleDetails,
	userId: number,
	prefs: UserPrefs
): Promise<LinkedTitle[]> {
	const { kind, id, provider } = title.ref;
	if (provider !== 'tmdb' || (kind !== 'tv' && kind !== 'movie')) return [];
	const language = readLocale(prefs).language;

	if (title.isAnime) {
		const anilistIds = kind === 'tv' ? mappingsForTmdbTv(Number(id)).map((m) => m.anilistId) : [];
		if (anilistIds.length === 0) return [];
		const manga = await cached(`anime-source:${kind}:${id}`, 7 * DAY, () =>
			sourceMangaForAnime(anilistIds)
		).catch(() => []);
		return manga.slice(0, 2).map((m) => ({
			href: titleHref({ kind: 'manga', id: String(m.id) }),
			name: m.name,
			year: null,
			poster: m.cover ? { url: m.cover } : null,
			label: 'Manga',
			...progressOf('manga', String(m.id), userId, prefs)
		}));
	}

	const books = await cached(`based-on:${kind}:${id}:${language}`, 7 * DAY, () =>
		basedOnForTmdb(kind, id, language)
	).catch(() => []);
	// Prefer the whole series when the source book is part of one.
	const cards = new Map<string, LinkedTitle>();
	for (const b of books) {
		if (b.series) {
			const seriesId = b.series;
			if (cards.has(`series:${seriesId}`)) continue;
			cards.set(`series:${seriesId}`, {
				href: titleHref({ kind: 'series', id: seriesId }),
				name: b.seriesName ?? b.label,
				year: null,
				poster: null,
				label: 'Book series',
				...progressOf('series', seriesId, userId, prefs)
			});
		} else if (b.work) {
			cards.set(`book:${b.work}`, {
				href: titleHref({ kind: 'book', id: b.work }),
				name: b.label,
				year: null,
				poster: null,
				label: 'Book',
				...progressOf('book', b.work, userId, prefs)
			});
		}
	}
	return [...cards.values()];
}
