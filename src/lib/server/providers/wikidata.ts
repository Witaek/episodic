import { createHttpClient } from './http';

/**
 * Wikidata (no key): which series a book belongs to and in what order, the films and TV series
 * adapted from a book, and the reverse ("based on"). Books are matched through their Open Library
 * work id (P648), films through their TMDB ids (P4947 movie, P4983 TV).
 */
const ENDPOINT = 'https://query.wikidata.org/sparql';
const USER_AGENT = 'Episodic (https://github.com/Witaek/episodic)';

const request = createHttpClient('wikidata', { burst: 3, perSecond: 2, concurrency: 2 });

type Binding = Record<string, { value: string } | undefined>;

async function sparql(query: string): Promise<Binding[]> {
	const url = `${ENDPOINT}?${new URLSearchParams({ query, format: 'json' })}`;
	const data = await request<{ results: { bindings: Binding[] } }>(url, {
		headers: { 'user-agent': USER_AGENT, accept: 'application/sparql-results+json' },
		timeoutMs: 20_000
	});
	return data.results.bindings;
}

const qid = (uri: string | undefined) => uri?.match(/Q(\d+)$/)?.[1] ?? null;
/** "OL82563W" → "82563" */
export const olWorkDigits = (value: string | undefined) => value?.match(/^OL(\d+)W$/)?.[1] ?? null;
const labelLanguages = (language: string) =>
	[...new Set([language.slice(0, 2), 'en', 'mul'])].join(',');

export interface SeriesMembership {
	/** Wikidata id of the series, digits only. */
	series: string;
	seriesName: string;
	/** Position in the series ("1", "0.5"), when known. */
	ordinal: string | null;
}

/** For Open Library works (digits), the series each belongs to. Unknown works are left out. */
export async function seriesForWorks(
	workIds: string[],
	language = 'en'
): Promise<Map<string, SeriesMembership>> {
	const result = new Map<string, SeriesMembership>();
	if (workIds.length === 0) return result;
	const values = workIds.map((id) => `"OL${id}W"`).join(' ');
	const rows = await sparql(`
		SELECT ?ol ?series ?seriesLabel ?ord WHERE {
			VALUES ?ol { ${values} }
			?book wdt:P648 ?ol; p:P179 ?st.
			?st ps:P179 ?series.
			OPTIONAL { ?st pq:P1545 ?ord }
			SERVICE wikibase:label { bd:serviceParam wikibase:language "${labelLanguages(language)}". }
		}`);
	for (const row of rows) {
		const work = olWorkDigits(row.ol?.value);
		const series = qid(row.series?.value);
		if (!work || !series) continue;
		const existing = result.get(work);
		// A book can be in several series (e.g. a wider "universe"): prefer one with a position.
		if (existing && (existing.ordinal || !row.ord)) continue;
		result.set(work, {
			series,
			seriesName: row.seriesLabel?.value ?? '',
			ordinal: row.ord?.value ?? null
		});
	}
	return result;
}

export interface SeriesMember {
	/** Wikidata id of the book. */
	qid: string;
	ordinal: string | null;
	label: string;
	/** Open Library work, digits. */
	work: string | null;
	published: string | null;
}

export interface SeriesInfo {
	qid: string;
	name: string;
	description: string | null;
	authors: string[];
	members: SeriesMember[];
}

/** A series with its books in reading order (numbered books first, then by publication date). */
export async function seriesDetails(seriesId: string, language = 'en'): Promise<SeriesInfo | null> {
	const langs = labelLanguages(language);
	const [head, members] = await Promise.all([
		sparql(`
			SELECT ?seriesLabel ?seriesDescription ?authorLabel WHERE {
				BIND(wd:Q${seriesId} AS ?series)
				OPTIONAL { ?series wdt:P50 ?author }
				SERVICE wikibase:label { bd:serviceParam wikibase:language "${langs}". }
			}`),
		sparql(`
			SELECT ?book ?bookLabel ?ord ?ol ?date ?authorLabel WHERE {
				?book p:P179 ?st. ?st ps:P179 wd:Q${seriesId}.
				OPTIONAL { ?st pq:P1545 ?ord }
				OPTIONAL { ?book wdt:P648 ?ol }
				OPTIONAL { ?book wdt:P577 ?date }
				OPTIONAL { ?book wdt:P50 ?author }
				SERVICE wikibase:label { bd:serviceParam wikibase:language "${langs}". }
			}`)
	]);
	if (head.length === 0 && members.length === 0) return null;

	const byBook = new Map<string, SeriesMember>();
	const authors = new Set<string>();
	for (const row of head) if (row.authorLabel?.value) authors.add(row.authorLabel.value);
	for (const row of members) {
		const book = qid(row.book?.value);
		if (!book) continue;
		if (row.authorLabel?.value && !/^Q\d+$/.test(row.authorLabel.value))
			authors.add(row.authorLabel.value);
		const date = row.date?.value?.slice(0, 10) ?? null;
		const existing = byBook.get(book);
		if (existing) {
			// Keep the earliest date and any Open Library id found on another row.
			existing.work ??= olWorkDigits(row.ol?.value);
			if (date && (!existing.published || date < existing.published)) existing.published = date;
			continue;
		}
		byBook.set(book, {
			qid: book,
			ordinal: row.ord?.value ?? null,
			label: row.bookLabel?.value ?? '',
			work: olWorkDigits(row.ol?.value),
			published: date
		});
	}

	const ordinalValue = (m: SeriesMember) => {
		const n = Number(m.ordinal);
		return Number.isFinite(n) && m.ordinal !== null ? n : Number.POSITIVE_INFINITY;
	};
	const list = [...byBook.values()]
		// Untitled entries (just a Q-id label) are noise.
		.filter((m) => m.label && !/^Q\d+$/.test(m.label))
		.sort(
			(a, b) =>
				ordinalValue(a) - ordinalValue(b) ||
				(a.published ?? '9999').localeCompare(b.published ?? '9999')
		);
	// The same book can appear twice (two records for one novel): keep one per position.
	const seen = new Set<string>();
	const deduped = list
		// Prefer records linked to Open Library when the same book appears twice.
		.sort((a, b) => Number(!a.work) - Number(!b.work))
		.filter((m) => {
			const keys = [m.ordinal ? `#${m.ordinal}` : null, `t:${m.label.toLowerCase()}`].filter(
				Boolean
			);
			if (keys.some((k) => seen.has(k!))) return false;
			keys.forEach((k) => seen.add(k!));
			return true;
		})
		.sort(
			(a, b) =>
				ordinalValue(a) - ordinalValue(b) ||
				(a.published ?? '9999').localeCompare(b.published ?? '9999')
		);

	return {
		qid: seriesId,
		name: head[0]?.seriesLabel?.value ?? '',
		description: head[0]?.seriesDescription?.value ?? null,
		authors: [...authors].slice(0, 3),
		members: deduped
	};
}

export interface Adaptation {
	qid: string;
	label: string;
	tmdbMovie: string | null;
	tmdbTv: string | null;
	year: number | null;
}

/** Films and TV series based on any of the given Wikidata items (books or series). */
export async function adaptationsOf(itemIds: string[], language = 'en'): Promise<Adaptation[]> {
	if (itemIds.length === 0) return [];
	const values = itemIds.map((id) => `wd:Q${id}`).join(' ');
	const rows = await sparql(`
		SELECT DISTINCT ?film ?filmLabel ?movie ?tv ?date WHERE {
			VALUES ?source { ${values} }
			?film wdt:P144 ?source.
			OPTIONAL { ?film wdt:P4947 ?movie }
			OPTIONAL { ?film wdt:P4983 ?tv }
			OPTIONAL { ?film wdt:P577 ?date }
			SERVICE wikibase:label { bd:serviceParam wikibase:language "${labelLanguages(language)}". }
		}`);
	const byFilm = new Map<string, Adaptation>();
	for (const row of rows) {
		const film = qid(row.film?.value);
		if (!film) continue;
		const year = row.date?.value ? Number(row.date.value.slice(0, 4)) : null;
		const existing = byFilm.get(film);
		if (existing) {
			if (year && (!existing.year || year < existing.year)) existing.year = year;
			continue;
		}
		byFilm.set(film, {
			qid: film,
			label: row.filmLabel?.value ?? '',
			tmdbMovie: row.movie?.value ?? null,
			tmdbTv: row.tv?.value ?? null,
			year
		});
	}
	// Only what can be opened on the Watch side.
	return [...byFilm.values()].filter((a) => a.tmdbMovie || a.tmdbTv);
}

export interface BasedOn {
	/** Book's Wikidata id and, when known, its Open Library work and series. */
	qid: string;
	label: string;
	work: string | null;
	series: string | null;
	seriesName: string | null;
}

/** The books (or series) a TMDB movie or show is based on. */
export async function basedOnForTmdb(
	kind: 'movie' | 'tv',
	tmdbId: string,
	language = 'en'
): Promise<BasedOn[]> {
	const property = kind === 'movie' ? 'P4947' : 'P4983';
	const rows = await sparql(`
		SELECT DISTINCT ?source ?sourceLabel ?ol ?series ?seriesLabel WHERE {
			?film wdt:${property} "${tmdbId.replace(/\D/g, '')}"; wdt:P144 ?source.
			OPTIONAL { ?source wdt:P648 ?ol }
			OPTIONAL { ?source wdt:P179 ?series }
			SERVICE wikibase:label { bd:serviceParam wikibase:language "${labelLanguages(language)}". }
		}`);
	const result = new Map<string, BasedOn>();
	for (const row of rows) {
		const source = qid(row.source?.value);
		if (!source || result.has(source)) continue;
		result.set(source, {
			qid: source,
			label: row.sourceLabel?.value ?? '',
			work: olWorkDigits(row.ol?.value),
			series: qid(row.series?.value),
			seriesName: row.seriesLabel?.value ?? null
		});
	}
	return [...result.values()].filter((b) => b.work || b.series);
}

/** Films and TV series based on books identified by their Open Library works (digits). */
export async function adaptationsOfWorks(
	workIds: string[],
	language = 'en'
): Promise<Adaptation[]> {
	if (workIds.length === 0) return [];
	const values = workIds.map((id) => `"OL${id}W"`).join(' ');
	const rows = await sparql(`
		SELECT DISTINCT ?book WHERE { VALUES ?ol { ${values} } ?book wdt:P648 ?ol. }`);
	const items = rows.map((r) => qid(r.book?.value)).filter((q): q is string => !!q);
	return adaptationsOf(items, language);
}
