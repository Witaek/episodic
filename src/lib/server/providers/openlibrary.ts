import {
	BOOK_LANGUAGES,
	type BookEdition,
	type BookLanguage,
	type Image,
	type SearchResult,
	type TitleDetails,
	type TitleKind
} from '$lib/catalog/types';
import { titleHref } from '$lib/catalog/types';
import { createHttpClient } from './http';
import type { LocaleOptions, MetadataProvider } from './provider';

/**
 * Books from Open Library (no key needed). Works are identified by their numeric part
 * ("OL21745884W" → "21745884") so they fit the /title/{kind}/{id} routes.
 */
const API = 'https://openlibrary.org';
const COVERS = 'https://covers.openlibrary.org/b/id';
const USER_AGENT = 'Episodic (https://github.com/Witaek/episodic)';

// Open Library asks clients to stay gentle; identify ourselves and keep a few requests per second.
const request = createHttpClient('openlibrary', { burst: 5, perSecond: 3, concurrency: 2 });

const get = <T>(path: string) =>
	request<T>(`${API}${path}`, { headers: { 'user-agent': USER_AGENT } });

export const workId = (key: string) => key.match(/OL(\d+)W/)?.[1] ?? null;
export const editionId = (key: string) => key.match(/OL(\d+)M/)?.[1] ?? null;
const workKey = (id: string) => `/works/OL${id}W`;

export function coverImage(coverId: number | null | undefined): Image | null {
	if (!coverId) return null;
	return {
		url: `${COVERS}/${coverId}-L.jpg`,
		srcset: `${COVERS}/${coverId}-M.jpg 180w, ${COVERS}/${coverId}-L.jpg 500w`
	};
}

/** Subjects are noisy ("nyt:hardcover-fiction=2021-05-23"); keep a few readable ones. */
export function cleanSubjects(subjects: string[] | undefined, max = 4): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const raw of subjects ?? []) {
		if (/[:=]/.test(raw) || raw.length > 30) continue;
		const subject = raw.charAt(0).toUpperCase() + raw.slice(1);
		const key = subject.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		result.push(subject);
		if (result.length >= max) break;
	}
	return result;
}

interface SearchDoc {
	key: string;
	title: string;
	author_name?: string[];
	first_publish_year?: number;
	cover_i?: number;
	number_of_pages_median?: number;
	ratings_average?: number;
	/** With `lang`: the best-matching edition in that language. */
	editions?: { docs: { key: string; title?: string; cover_i?: number }[] };
}

const FIELDS =
	'key,title,author_name,first_publish_year,cover_i,number_of_pages_median,ratings_average';

export function mapDoc(doc: SearchDoc): SearchResult | null {
	const id = workId(doc.key);
	if (!id) return null;
	const ref = { provider: 'openlibrary' as const, kind: 'book' as const, id };
	// Searching in a language shows that edition: its title and cover, and a link to it.
	const edition = doc.editions?.docs[0];
	const edId = edition ? editionId(edition.key) : null;
	return {
		ref,
		href: edId ? `${titleHref(ref)}?edition=${edId}` : titleHref(ref),
		mediaType: 'book',
		isAnime: false,
		name: edition?.title ?? doc.title,
		originalName: edition?.title && edition.title !== doc.title ? doc.title : null,
		year: doc.first_publish_year ?? null,
		overview: null,
		poster: coverImage(edition?.cover_i ?? doc.cover_i),
		backdrop: null,
		// Open Library ratings are out of 5.
		rating: doc.ratings_average ? Math.round(doc.ratings_average * 20) / 10 : null,
		badge: doc.author_name?.[0] ?? null
	};
}

interface Work {
	title: string;
	description?: string | { value: string };
	covers?: number[];
	subjects?: string[];
}

function description(value: Work['description']): string | null {
	const text = typeof value === 'string' ? value : value?.value;
	if (!text) return null;
	// Drop trailing source notes and link lists that some works carry.
	return (
		text
			.split(/\n-{3,}\n|\n\(\[source\]/)[0]
			.replace(/\r/g, '')
			.trim() || null
	);
}

/** Search, optionally limited to works with an edition in `language` (shown as that edition). */
export async function searchBooks(query: string, language?: BookLanguage): Promise<SearchResult[]> {
	const marc = BOOK_LANGUAGES.find((l) => l.id === language)?.marc;
	const params = new URLSearchParams({
		// Only works that have an edition in that language, showing that edition.
		q: marc ? `${query} language:${marc}` : query,
		fields: marc ? `${FIELDS},editions,editions.key,editions.title,editions.cover_i` : FIELDS,
		limit: '30'
	});
	if (language) params.set('lang', language);
	const data = await get<{ docs: SearchDoc[] }>(`/search.json?${params}`);
	return data.docs.map(mapDoc).filter((r): r is SearchResult => r !== null);
}

/** One edition (e.g. a translation): its own title, cover and page count. */
export async function getEdition(id: string): Promise<BookEdition> {
	const raw = await get<{
		title: string;
		covers?: number[];
		number_of_pages?: number;
		languages?: { key: string }[];
		publishers?: string[];
		publish_date?: string;
	}>(`/books/OL${id}M.json`);
	const marc = raw.languages?.[0]?.key.split('/').pop() ?? null;
	return {
		id,
		title: raw.title,
		cover: coverImage(raw.covers?.find((c) => c > 0)),
		pages: raw.number_of_pages ?? null,
		language: BOOK_LANGUAGES.find((l) => l.marc === marc)?.id ?? marc,
		publisher: raw.publishers?.[0] ?? null,
		year: raw.publish_date?.match(/\d{4}/)?.[0] ?? null
	};
}

export const openlibrary = {
	id: 'openlibrary',
	name: 'Open Library',
	url: 'https://openlibrary.org',
	searchFilters: ['book'],
	titleKinds: ['book'],

	isConfigured: () => true,

	search: (query: string) => searchBooks(query),

	async trending() {
		const data = await get<{ works: SearchDoc[] }>('/trending/weekly.json?limit=24');
		return data.works.map(mapDoc).filter((r): r is SearchResult => r !== null);
	},

	async getTitle(kind: TitleKind, id: string, _locale: LocaleOptions): Promise<TitleDetails> {
		if (kind !== 'book') throw new Error(`Open Library cannot load ${kind}`);
		const [work, found] = await Promise.all([
			get<Work>(`${workKey(id)}.json`),
			get<{ docs: SearchDoc[] }>(`/search.json?q=key:${workKey(id)}&fields=${FIELDS}&limit=1`)
		]);
		const doc = found.docs[0];
		const coverId = work.covers?.find((c) => c > 0) ?? doc?.cover_i;
		return {
			ref: { provider: 'openlibrary', kind: 'book', id },
			mediaType: 'book',
			isAnime: false,
			name: work.title,
			originalName: null,
			tagline: null,
			overview: description(work.description),
			poster: coverImage(coverId),
			backdrop: null,
			logo: null,
			genres: cleanSubjects(work.subjects),
			status: 'released',
			startDate: doc?.first_publish_year ? `${doc.first_publish_year}-01-01` : null,
			endDate: null,
			runtime: null,
			pages: doc?.number_of_pages_median ?? null,
			rating: doc?.ratings_average ? Math.round(doc.ratings_average * 20) / 10 : null,
			certification: null,
			// Authors, shown where networks/studios go for other types.
			companies: doc?.author_name?.slice(0, 3) ?? [],
			cast: [],
			seasons: [],
			episodeCount: null,
			nextEpisode: null,
			lastEpisode: null,
			recommendations: [],
			trailerUrl: null,
			externalIds: { openlibrary: `OL${id}W` },
			sourceUrl: `${API}${workKey(id)}`
		};
	}
} satisfies MetadataProvider;
