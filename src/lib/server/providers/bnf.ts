import { createHttpClient } from './http';

/**
 * The French national library's catalogue (BnF, no key needed): every book published in France is
 * deposited there, so it knows French editions Open Library doesn't, including the original title
 * of translations. Used to identify a scanned ISBN.
 */
const SRU = 'https://catalogue.bnf.fr/api/SRU';
const request = createHttpClient('bnf', { burst: 3, perSecond: 2, concurrency: 2 });

export interface BnfRecord {
	title: string;
	/** For translations: the original title (UNIMARC 454). */
	originalTitle: string | null;
	/** Surnames of the authors. */
	authors: string[];
	pages: number | null;
	year: number | null;
	publisher: string | null;
}

const decode = (text: string) =>
	text
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.trim();

/** Subfield values of every occurrence of a UNIMARC field in one record. */
function subfields(record: string, tag: string, code: string): string[] {
	const fields = record.matchAll(
		new RegExp(`<mxc:datafield tag="${tag}"[^>]*>([\\s\\S]*?)</mxc:datafield>`, 'g')
	);
	return [...fields].flatMap((field) =>
		[...field[1].matchAll(new RegExp(`code="${code}">([^<]*)<`, 'g'))].map((m) => decode(m[1]))
	);
}

/** Parses the first record of an SRU response in UNIMARC. */
export function parseUnimarc(xml: string): BnfRecord | null {
	const record = xml.match(/<mxc:record[\s\S]*?<\/mxc:record>/)?.[0];
	if (!record) return null;
	const title = subfields(record, '200', 'a')[0];
	if (!title) return null;
	const extent = subfields(record, '215', 'a')[0] ?? '';
	const date = [...subfields(record, '214', 'd'), ...subfields(record, '210', 'd')][0] ?? '';
	return {
		// Non-sorting markers (e.g. "Les ") are wrapped in control characters.
		title: title.replace(/[\u0088\u0089\u0098\u009c]/g, ''),
		originalTitle: subfields(record, '454', 't')[0] ?? null,
		authors: [...subfields(record, '700', 'a'), ...subfields(record, '701', 'a')],
		pages: Number(extent.match(/(\d+)\s*p\./)?.[1]) || null,
		year: Number(date.match(/\d{4}/)?.[0]) || null,
		publisher: [...subfields(record, '214', 'c'), ...subfields(record, '210', 'c')][0] ?? null
	};
}

export async function bnfByIsbn(isbn: string): Promise<BnfRecord | null> {
	const params = new URLSearchParams({
		version: '1.2',
		operation: 'searchRetrieve',
		query: `bib.isbn adj "${isbn}"`,
		recordSchema: 'unimarcxchange',
		maximumRecords: '1'
	});
	const xml = await request<string>(`${SRU}?${params}`, { as: 'text', timeoutMs: 8000 });
	return parseUnimarc(xml);
}
