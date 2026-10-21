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

export interface VolumeInfo {
	title: string;
	cover: Image | null;
	pages: number | null;
	year: number | null;
	/** Edition shown (in the requested language), digits. */
	edition: string | null;
	/** Whether title and cover come from an edition in the requested language. */
	inLanguage: boolean;
}

type EditionDoc = {
	key: string;
	title?: string;
	cover_i?: number;
	number_of_pages?: number;
	language?: string[];
};

/**
 * Cover, page count and (with `language`) the localized edition title for many works at once:
 * one request for a whole series. Open Library's `lang` only prefers editions in that language, so
 * the edition is used only when it really is in it.
 */
export async function volumeInfo(
	workIds: string[],
	language?: BookLanguage
): Promise<Map<string, VolumeInfo>> {
	const result = new Map<string, VolumeInfo>();
	const marc = BOOK_LANGUAGES.find((l) => l.id === language)?.marc;
	for (let i = 0; i < workIds.length; i += 40) {
		const batch = workIds.slice(i, i + 40);
		const params = new URLSearchParams({
			q: `key:(${batch.map((id) => `/works/OL${id}W`).join(' OR ')})`,
			fields: `${FIELDS},editions,editions.key,editions.title,editions.cover_i,editions.number_of_pages,editions.language`,
			limit: String(batch.length)
		});
		if (language) params.set('lang', language);
		const data = await get<{ docs: SearchDoc[] }>(`/search.json?${params}`);
		for (const doc of data.docs) {
			const id = workId(doc.key);
			if (!id) continue;
			const edition = doc.editions?.docs[0] as EditionDoc | undefined;
			const inLanguage = !!marc && !!edition?.title && !!edition.language?.includes(marc);
			result.set(id, {
				title: (inLanguage ? edition!.title : null) ?? doc.title,
				cover: coverImage((inLanguage ? edition!.cover_i : null) ?? doc.cover_i),
				pages: (inLanguage ? edition!.number_of_pages : null) ?? doc.number_of_pages_median ?? null,
				year: doc.first_publish_year ?? null,
				edition: inLanguage && edition ? editionId(edition.key) : null,
				inLanguage
			});
		}
	}
	return result;
}

/** The work an edition belongs to (Wikidata sometimes links an edition instead of the work). */
export async function workOfEdition(edition: string): Promise<string | null> {
	const data = await get<{ works?: { key: string }[] }>(`/books/OL${edition}M.json`);
	return data.works?.[0] ? workId(data.works[0].key) : null;
}

/** A work with this title and an edition in `language` (to replace a duplicate without one). */
export async function findWorkInLanguage(
	title: string,
	author: string | null,
	language: BookLanguage
): Promise<string | null> {
	const marc = BOOK_LANGUAGES.find((l) => l.id === language)?.marc;
	if (!marc) return null;
	const quote = (text: string) => `"${text.replace(/"/g, '')}"`;
	const q = [`title:${quote(title)}`, author ? `author:${quote(author)}` : '', `language:${marc}`]
		.filter(Boolean)
		.join(' ');
	const data = await get<{ docs: { key: string }[] }>(
		`/search.json?${new URLSearchParams({ q, fields: 'key', limit: '1' })}`
	);
	return data.docs[0] ? workId(data.docs[0].key) : null;
}

/** One edition of a work, for choosing which one you read (and its cover). */
export interface EditionSummary {
	id: string;
	title: string;
	/** MARC codes, e.g. ["fre"]. */
	languages: string[];
	cover: Image | null;
	publisher: string | null;
	year: string | null;
	pages: number | null;
	isbn: string | null;
	description: string | null;
	/** "Paperback", "Audio CD", "ebook"… */
	format: string | null;
}

interface RawEdition {
	key: string;
	title?: string;
	languages?: { key: string }[];
	covers?: number[];
	publishers?: string[];
	publish_date?: string;
	number_of_pages?: number;
	isbn_13?: string[];
	isbn_10?: string[];
	description?: string | { value: string };
	physical_format?: string;
}

/** Every edition of a work (up to 1000), most useful first: with a cover, then newest. */
export async function workEditions(work: string): Promise<EditionSummary[]> {
	const data = await get<{ entries: RawEdition[] }>(`${workKey(work)}/editions.json?limit=1000`);
	return data.entries
		.map((e): EditionSummary | null => {
			const id = editionId(e.key);
			if (!id || !e.title) return null;
			return {
				id,
				title: e.title,
				languages: (e.languages ?? []).map((l) => l.key.replace('/languages/', '')),
				cover: coverImage(e.covers?.find((c) => c > 0)),
				publisher: e.publishers?.[0] ?? null,
				year: e.publish_date?.match(/\d{4}/)?.[0] ?? null,
				pages: e.number_of_pages ?? null,
				isbn: e.isbn_13?.[0] ?? e.isbn_10?.[0] ?? null,
				description: description(e.description),
				format: e.physical_format ?? null
			};
		})
		.filter((e): e is EditionSummary => e !== null)
		.sort(
			(a, b) => Number(!a.cover) - Number(!b.cover) || (b.year ?? '').localeCompare(a.year ?? '')
		);
}

/** The work and edition for an ISBN (10 or 13 digits), for barcode scanning. */
export async function findByIsbn(isbn: string): Promise<{ work: string; edition: string } | null> {
	const clean = isbn.replace(/[^\dX]/gi, '');
	if (clean.length !== 10 && clean.length !== 13) return null;
	try {
		const edition = await get<{ key: string; works?: { key: string }[] }>(`/isbn/${clean}.json`);
		const work = edition.works?.[0] ? workId(edition.works[0].key) : null;
		const editionDigits = editionId(edition.key);
		return work && editionDigits ? { work, edition: editionDigits } : null;
	} catch {
		return null;
	}
}

/** The work for a title by one of these authors (e.g. a translation's original title). */
export async function findWork(title: string, authors: string[]): Promise<string | null> {
	for (const author of authors.length ? authors : ['']) {
		const params = new URLSearchParams({ title, fields: 'key', limit: '1' });
		if (author) params.set('author', author);
		const data = await get<{ docs: { key: string }[] }>(`/search.json?${params}`);
		const work = data.docs[0] ? workId(data.docs[0].key) : null;
		if (work) return work;
	}
	return null;
}
