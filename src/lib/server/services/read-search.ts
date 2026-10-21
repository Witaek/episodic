import type { BookLanguage, SearchResult } from '$lib/catalog/types';
import { cached, HOUR } from '../cache';
import { searchManga, trendingManga } from '../providers/anilist';
import { openlibrary, searchBooks } from '../providers/openlibrary';
import { seriesForWorks, type SeriesMembership } from '../providers/wikidata';

const SEARCH_TTL = 6 * HOUR;
const TRENDING_TTL = 6 * HOUR;
/** Series membership barely changes. */
const SERIES_TTL = 7 * 24 * HOUR;

/** Lowercase, without accents or punctuation, for matching titles against a query. */
export function normalize(text: string): string {
	return text
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

/** Small words that don't tell books apart ("les", "de", "the"…). */
const STOP = new Set([
	'le',
	'la',
	'les',
	'de',
	'des',
	'du',
	'un',
	'une',
	'et',
	'l',
	'd',
	'the',
	'a',
	'an',
	'of',
	'and'
]);

const words = (text: string) =>
	normalize(text)
		.split(' ')
		.filter((w) => w && !STOP.has(w));

/** Share of the query's words found in the title, original title or author (0–1). */
function matchScore(result: SearchResult, queryWords: string[]): number {
	if (queryWords.length === 0) return 1;
	const haystack = new Set(
		words([result.name, result.originalName ?? '', result.badge ?? ''].join(' '))
	);
	return queryWords.filter((w) => haystack.has(w)).length / queryWords.length;
}

/**
 * Open Library ranks loosely (a French search also returns unrelated books with a French edition):
 * books whose title or author contains the query come first, and unrelated ones are dropped when
 * there are good matches.
 */
export function rankByQuery(results: SearchResult[], query: string): SearchResult[] {
	const queryWords = words(query);
	const scored = results.map((result, i) => ({ result, i, score: matchScore(result, queryWords) }));
	const good = scored.filter((s) => s.score >= 0.5).length;
	return scored
		.filter((s) => s.score > 0 || good < 3)
		.sort(
			(a, b) => Number(b.score >= 0.99) - Number(a.score >= 0.99) || b.score - a.score || a.i - b.i
		)
		.map((s) => s.result);
}

/**
 * Books of a series are bundled into one series card when the search names the series ("harry
 * potter"): placed where its first book was, with book 1's cover when found. When the search names
 * a book instead ("les piliers de la terre"), the book stays, labelled with its series
 * ("Kingsbridge #1"), and the series card follows it.
 */
export function foldIntoSeries(
	results: SearchResult[],
	memberships: Map<string, SeriesMembership>,
	query = ''
): SearchResult[] {
	const folded: SearchResult[] = [];
	const cards = new Map<string, { card: SearchResult; first: boolean }>();
	const q = normalize(query);
	for (const result of results) {
		const membership = result.ref.kind === 'book' ? memberships.get(result.ref.id) : undefined;
		if (!membership) {
			folded.push(result);
			continue;
		}
		// Wikidata falls back to the id when a label is missing.
		const seriesName = /^Q\d+$/.test(membership.seriesName) ? '' : membership.seriesName;
		const series = normalize(seriesName);
		const searchedSeries = !q || (!!series && (q.includes(series) || series.includes(q)));
		const isFirst = membership.ordinal === '1';
		const existing = cards.get(membership.series);
		if (!searchedSeries) {
			const position = membership.ordinal ? ` #${membership.ordinal}` : '';
			folded.push(seriesName ? { ...result, badge: `${seriesName}${position}` } : result);
		}
		if (existing) {
			if (isFirst && !existing.first && result.poster) {
				existing.card.poster = result.poster;
				existing.first = true;
			}
			continue;
		}
		const card: SearchResult = {
			ref: { provider: 'wikidata', kind: 'series', id: membership.series },
			href: `/read/series/${membership.series}`,
			mediaType: 'bookseries',
			isAnime: false,
			name: seriesName || result.name,
			year: result.year,
			poster: result.poster,
			backdrop: null,
			rating: null,
			badge: 'Series'
		};
		cards.set(membership.series, { card, first: isFirst });
		folded.push(card);
	}
	return folded;
}

/** Book search (folded into series) or manga search, for the Read side. */
export async function readSearch(
	query: string,
	filter: 'book' | 'manga',
	bookLanguage?: BookLanguage
): Promise<SearchResult[]> {
	const q = query.trim().replace(/\s+/g, ' ');
	if (!q) return [];
	if (filter === 'manga') {
		return cached(`search:manga:${q.toLowerCase()}`, SEARCH_TTL, () => searchManga(q));
	}
	const language = bookLanguage ?? 'en';
	const books = await cached(
		`search:openlibrary:${bookLanguage ?? 'any'}:${q.toLowerCase()}`,
		SEARCH_TTL,
		() => searchBooks(q, bookLanguage)
	);
	const works = books.filter((b) => b.ref.kind === 'book').map((b) => b.ref.id);
	// Series lookups are optional: without Wikidata, books are listed one by one.
	const memberships = await cached(
		`search-series:${bookLanguage ?? 'any'}:${q.toLowerCase()}`,
		SERIES_TTL,
		async () => [...(await seriesForWorks(works, language))]
	)
		.then((entries) => new Map(entries))
		.catch((error) => {
			console.warn(`[read-search] series lookup failed: ${String(error)}`);
			return new Map<string, SeriesMembership>();
		});
	return foldIntoSeries(rankByQuery(books, q), memberships, q);
}

/** Trending books (Open Library, folded into series) or popular manga (AniList). */
export async function readTrending(filter: 'book' | 'manga'): Promise<SearchResult[]> {
	try {
		if (filter === 'manga') {
			return await cached('trending:manga', TRENDING_TTL, () => trendingManga());
		}
		const books = await cached('trending:books', TRENDING_TTL, () => openlibrary.trending());
		const works = books.map((b) => b.ref.id);
		const memberships = await cached(`trending-series:books`, TRENDING_TTL, async () => [
			...(await seriesForWorks(works, 'en'))
		])
			.then((entries) => new Map(entries))
			.catch(() => new Map<string, SeriesMembership>());
		return foldIntoSeries(books, memberships);
	} catch (error) {
		console.warn(`[read-search] trending ${filter} failed: ${String(error)}`);
		return [];
	}
}
