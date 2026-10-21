import { BOOK_LANGUAGES, type BookLanguage } from '$lib/catalog/types';
import { cached, HOUR } from '../cache';
import { workEditions, type EditionSummary } from '../providers/openlibrary';
import { normalize } from './read-search';
import {
	searchWikipediaBook,
	wikipediaArticleForWork,
	wikipediaIntro
} from '../providers/wikidata';

/**
 * A book in the reader's language: which edition to show by default, and a summary in that
 * language. Open Library's work summary is usually English, while its French editions often carry
 * the publisher's French blurb; French Wikipedia covers well-known books.
 */

const WEEK = 7 * 24 * HOUR;

export const marcOf = (language: BookLanguage) =>
	BOOK_LANGUAGES.find((l) => l.id === language)!.marc;

/** Every edition of a work (cached a week). */
export function bookEditions(work: string): Promise<EditionSummary[]> {
	return cached(`editions:openlibrary:${work}`, WEEK, () => workEditions(work)).catch(() => []);
}

/** A title without its subtitle or volume details, for comparing editions. */
const baseTitle = (title: string) => normalize(title.split(/[:(\[]/)[0] ?? title);

/** Editions that are rarely the one you'd want to see by default. */
const SPECIAL =
	/\b(integrale|int[eé]grale|coffret|box set|omnibus|annot|illustr|comment|lecture suivie|abridged|adapt|simplifi|edition scolaire|classiques|study guide|resume|r[eé]sum[eé])/i;
const NO_PUBLISHER = /independently published|createspace|not identified|unknown|lulu/i;
/** Audiobooks and ebooks: not the book on your shelf. */
const NOT_PRINT = /audio|cd|mp3|cassette|e-?book|kindle|epub|recorded books|audible/i;

/**
 * The edition to show when the reader hasn't chosen one, in their language: the usual title of the
 * translation (the most common among editions), from a real publisher, with a cover and page
 * count; omnibus, annotated or school editions only as a last resort.
 */
export function defaultEdition(
	editions: EditionSummary[],
	language: BookLanguage
): EditionSummary | null {
	const marc = marcOf(language);
	const inLanguage = editions.filter((e) => e.languages.includes(marc));
	if (inLanguage.length === 0) return null;
	const counts = new Map<string, number>();
	for (const e of inLanguage)
		counts.set(baseTitle(e.title), (counts.get(baseTitle(e.title)) ?? 0) + 1);
	const usual = [...counts].sort((a, b) => b[1] - a[1])[0][0];
	// The publisher with the most editions is usually the original one (Gallimard, Pocket…).
	const publisherOf = (e: EditionSummary) => normalize(e.publisher ?? '').split(' ')[0] ?? '';
	const byPublisher = new Map<string, number>();
	for (const e of inLanguage) {
		const p = publisherOf(e);
		if (p) byPublisher.set(p, (byPublisher.get(p) ?? 0) + 1);
	}
	const mainPublisher = [...byPublisher].sort((a, b) => b[1] - a[1])[0]?.[0];
	const score = (e: EditionSummary) =>
		(baseTitle(e.title) === usual ? 4 : 0) +
		(e.cover ? 3 : 0) +
		(e.pages ? 1 : 0) +
		(e.publisher && !NO_PUBLISHER.test(e.publisher) ? 1 : -3) +
		(mainPublisher && publisherOf(e) === mainPublisher ? 2 : 0) +
		(SPECIAL.test(`${e.title} ${e.publisher ?? ''}`) ? -4 : 0) +
		(NOT_PRINT.test(`${e.format ?? ''} ${e.publisher ?? ''}`) ? -6 : 0);
	return [...inLanguage].sort(
		(a, b) => score(b) - score(a) || (b.year ?? '').localeCompare(a.year ?? '')
	)[0];
}

/** Very common words, to tell French from English text. */
const COMMON: Record<string, string[]> = {
	fr: [
		'le',
		'la',
		'les',
		'des',
		'est',
		'une',
		'dans',
		'qui',
		'que',
		'pour',
		'sur',
		'avec',
		'son',
		'sa',
		'ses',
		'il',
		'elle',
		'du',
		'au',
		'aux',
		'pas',
		'plus',
		'mais',
		'ce',
		'cette'
	],
	en: [
		'the',
		'and',
		'of',
		'to',
		'is',
		'in',
		'that',
		'his',
		'her',
		'with',
		'for',
		'was',
		'he',
		'she',
		'it',
		'from',
		'by',
		'an',
		'as',
		'this',
		'are',
		'who',
		'their'
	]
};

/** Whether a text reads as `language` rather than another one (for edition blurbs). */
export function looksLike(text: string, language: BookLanguage): boolean {
	const tokens = normalize(text).split(' ');
	const hits = (lang: string) => tokens.filter((t) => COMMON[lang]?.includes(t)).length;
	const own = hits(language);
	const others = Math.max(
		...Object.keys(COMMON)
			.filter((l) => l !== language)
			.map(hits),
		0
	);
	return own >= 3 && own > others * 1.5;
}

/** A blurb worth showing: a real summary in the reader's language, not a note or a link. */
function goodBlurb(text: string, language: BookLanguage): boolean {
	return text.length >= 150 && !/https?:\/\//.test(text) && looksLike(text, language);
}

export interface LocalizedSummary {
	text: string;
	source: 'edition' | 'wikipedia';
}

/** A summary in the reader's language: an edition's blurb, else Wikipedia's introduction. */
export function localizedSummary(
	work: string,
	language: BookLanguage,
	editions: EditionSummary[],
	preferred?: string | null,
	{ title, author }: { title?: string; author?: string | null } = {}
): Promise<LocalizedSummary | null> {
	const marc = marcOf(language);
	const blurbs = editions.filter(
		(e) =>
			e.languages.includes(marc) &&
			e.description &&
			goodBlurb(e.description, language) &&
			!SPECIAL.test(`${e.title} ${e.description.slice(0, 80)}`)
	);
	const blurb = blurbs.find((e) => e.id === preferred) ?? blurbs[0];
	if (blurb) return Promise.resolve({ text: blurb.description!, source: 'edition' });
	return cached(`wikipedia-intro:${work}:${language}`, WEEK, async () => {
		// Through Wikidata's link to this work, else by searching the title (and author).
		const article =
			(await wikipediaArticleForWork(work, language)) ??
			(title ? await searchWikipediaBook(title, author ?? null, language) : null);
		const text = article ? await wikipediaIntro(article, language) : null;
		return text ? ({ text, source: 'wikipedia' } as const) : null;
	}).catch(() => null);
}

/** The language a text is in, among the book languages, if it's clear. */
export function languageOf(text: string): BookLanguage | null {
	return BOOK_LANGUAGES.map((l) => l.id).find((l) => looksLike(text, l)) ?? null;
}

/** A good blurb from any edition, whatever its language (when none exists in the reader's). */
export function anyBlurb(editions: EditionSummary[]): string | null {
	for (const e of editions) {
		const language = e.description ? languageOf(e.description) : null;
		if (language && goodBlurb(e.description!, language) && !SPECIAL.test(e.title)) {
			return e.description;
		}
	}
	return null;
}
