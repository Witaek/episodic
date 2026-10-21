/** A scanned book, as returned by /api/books/isbn/{isbn}. */
export interface IsbnLookup {
	isbn: string;
	work: string;
	/** Open Library edition, when Open Library has this exact edition. */
	edition: string | null;
	href: string;
	name: string;
	poster: import('$lib/catalog/types').Image | null;
	year: string | null;
	/** The series the book is part of, when Wikidata knows it. */
	series: { name: string; href: string; position: string | null } | null;
}

/** ISBN-13 (978/979) or ISBN-10 with a valid checksum. */
export function isIsbn(value: string): boolean {
	const s = value.replace(/[\s-]/g, '').toUpperCase();
	if (/^97[89]\d{10}$/.test(s)) {
		const sum = [...s].reduce((acc, d, i) => acc + Number(d) * (i % 2 ? 3 : 1), 0);
		return sum % 10 === 0;
	}
	if (/^\d{9}[\dX]$/.test(s)) {
		const sum = [...s].reduce((acc, d, i) => acc + (d === 'X' ? 10 : Number(d)) * (10 - i), 0);
		return sum % 11 === 0;
	}
	return false;
}

/** A barcode that is a book Open Library doesn't have, as identified by the BnF. */
export interface IsbnUnmatched {
	error: string;
	title?: string;
	authors?: string[];
}
