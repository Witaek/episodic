import type { BookLanguage, SearchResult } from '$lib/catalog/types';
import { cached, HOUR } from '../cache';
import { searchManga, trendingManga } from '../providers/anilist';
import { openlibrary, searchBooks } from '../providers/openlibrary';
import { seriesForWorks, type SeriesMembership } from '../providers/wikidata';

const SEARCH_TTL = 6 * HOUR;
const TRENDING_TTL = 6 * HOUR;
/** Series membership barely changes. */
const SERIES_TTL = 7 * 24 * HOUR;

/**
 * Books that belong to a series are shown as the series (one card), at the position of the first
 * of its books in the results. The cover is book 1's when it is among the results.
 */
export function foldIntoSeries(
	results: SearchResult[],
	memberships: Map<string, SeriesMembership>
): SearchResult[] {
	const folded: SearchResult[] = [];
	const cards = new Map<string, { card: SearchResult; found: number; first: boolean }>();
	for (const result of results) {
		const membership = result.ref.kind === 'book' ? memberships.get(result.ref.id) : undefined;
		if (!membership) {
			folded.push(result);
			continue;
		}
		const isFirst = membership.ordinal === '1';
		const existing = cards.get(membership.series);
		if (existing) {
			existing.found++;
			if (isFirst && !existing.first && result.poster) {
				existing.card.poster = result.poster;
				existing.first = true;
			}
			continue;
		}
		// Wikidata falls back to the id when a label is missing.
		const name = /^Q\d+$/.test(membership.seriesName) ? null : membership.seriesName;
		const card: SearchResult = {
			ref: { provider: 'wikidata', kind: 'series', id: membership.series },
			href: `/read/series/${membership.series}`,
			mediaType: 'bookseries',
			isAnime: false,
			name: name || result.name,
			year: result.year,
			poster: result.poster,
			backdrop: null,
			rating: null,
			badge: 'Series'
		};
		cards.set(membership.series, { card, found: 1, first: isFirst });
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
	return foldIntoSeries(books, memberships);
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
