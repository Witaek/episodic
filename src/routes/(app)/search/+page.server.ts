import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { BOOK_LANGUAGES, type BookLanguage, type SearchFilter } from '$lib/catalog/types';
import { getDb } from '$lib/server/db/client';
import { users } from '$lib/server/db/schema';
import { tmdb } from '$lib/server/providers';
import { search, trendingRows } from '$lib/server/services/catalog';
import type { PageServerLoad } from './$types';

const FILTERS: SearchFilter[] = ['all', 'tv', 'anime', 'movie', 'book'];

const isLanguage = (value: string | null | undefined): value is BookLanguage =>
	BOOK_LANGUAGES.some((l) => l.id === value);

export const load: PageServerLoad = async ({ url, locals }) => {
	const user = locals.user!;
	const query = (url.searchParams.get('q') ?? '').slice(0, 200);
	const typeParam = url.searchParams.get('type') as SearchFilter | null;
	const filter: SearchFilter = typeParam && FILTERS.includes(typeParam) ? typeParam : 'all';

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

	if (!query.trim()) {
		const rows = await trendingRows();
		const browse =
			filter === 'all'
				? rows.flatMap((row) => row.results.slice(0, 8))
				: (rows.find((row) => row.id === filter)?.results ?? []);
		return {
			query,
			filter,
			bookLanguage,
			results: [],
			browse,
			tmdbMissing: !tmdb.isConfigured()
		};
	}

	try {
		const { results, tmdbMissing } = await search(query, filter, undefined, {
			bookLanguage: bookLanguage ?? undefined
		});
		return { query, filter, bookLanguage, results, browse: [], tmdbMissing };
	} catch (cause) {
		console.error('[search] failed', cause);
		error(502, 'Search is unavailable right now. Please try again in a moment.');
	}
};
