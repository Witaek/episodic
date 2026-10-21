import { error, type ServerLoadEvent } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { BOOK_LANGUAGES, type BookLanguage, type SearchFilter } from '$lib/catalog/types';
import type { Section } from '$lib/section';
import { getDb } from './db/client';
import { users } from './db/schema';
import { tmdb } from './providers';
import { search, trendingRows } from './services/catalog';
import { readSearch, readTrending } from './services/read-search';

const FILTERS: Record<Section, SearchFilter[]> = {
	watch: ['all', 'tv', 'anime', 'movie'],
	read: ['book', 'manga']
};

const isLanguage = (value: string | null | undefined): value is BookLanguage =>
	BOOK_LANGUAGES.some((l) => l.id === value);

/** Search for one side: shows, anime and movies on Watch; books and manga on Read. */
export async function loadSearchPage({ url, locals }: ServerLoadEvent, section: Section) {
	const user = locals.user!;
	const query = (url.searchParams.get('q') ?? '').slice(0, 200);
	const filters = FILTERS[section];
	const typeParam = url.searchParams.get('type') as SearchFilter | null;
	const filter: SearchFilter = typeParam && filters.includes(typeParam) ? typeParam : filters[0];

	// Book language: from the URL ("any" = all languages), else the last one this person used.
	const langParam = url.searchParams.get('lang');
	const saved = user.prefs.bookLanguage;
	const bookLanguage: BookLanguage | null = isLanguage(langParam)
		? langParam
		: langParam === 'any'
			? null
			: isLanguage(saved)
				? saved
				: null;
	if (filter === 'book' && langParam && (bookLanguage ?? 'any') !== (saved ?? 'any')) {
		const prefs = { ...user.prefs, bookLanguage: bookLanguage ?? undefined };
		getDb().update(users).set({ prefs }).where(eq(users.id, user.id)).run();
	}
	const base = { section, query, filter, bookLanguage };

	if (section === 'read') {
		const kind = filter === 'manga' ? 'manga' : 'book';
		if (!query.trim()) {
			return { ...base, results: [], browse: await readTrending(kind), tmdbMissing: false };
		}
		try {
			const results = await readSearch(query, kind, bookLanguage ?? undefined);
			return { ...base, results, browse: [], tmdbMissing: false };
		} catch (cause) {
			console.error('[search] failed', cause);
			error(502, 'Search is unavailable right now. Please try again in a moment.');
		}
	}

	if (!query.trim()) {
		const rows = await trendingRows();
		const browse =
			filter === 'all'
				? rows.flatMap((row) => row.results.slice(0, 8))
				: (rows.find((row) => row.id === filter)?.results ?? []);
		return { ...base, results: [], browse, tmdbMissing: !tmdb.isConfigured() };
	}

	try {
		const { results, tmdbMissing } = await search(query, filter);
		return { ...base, results, browse: [], tmdbMissing };
	} catch (cause) {
		console.error('[search] failed', cause);
		error(502, 'Search is unavailable right now. Please try again in a moment.');
	}
}
