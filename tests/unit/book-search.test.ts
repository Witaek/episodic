import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { SearchResult } from '../../src/lib/catalog/types';
import { parseUnimarc } from '../../src/lib/server/providers/bnf';
import { foldIntoSeries, rankByQuery } from '../../src/lib/server/services/read-search';

const book = (id: string, name: string, author: string | null = null): SearchResult => ({
	ref: { provider: 'openlibrary', kind: 'book', id },
	href: `/read/book/${id}`,
	mediaType: 'book',
	isAnime: false,
	name,
	year: 1989,
	poster: { url: `cover-${id}` },
	backdrop: null,
	rating: null,
	badge: author
});

describe('book search ranking', () => {
	it('puts title matches first and drops unrelated books', () => {
		const ranked = rankByQuery(
			[
				book('1', "Description de l'Égypte", 'Gilles Néret'),
				book('2', 'Les Piliers de la Terre', 'Ken Follett'),
				book('3', 'Les piliers de la terre - Tome 2', 'Ken Follett'),
				book('4', 'Un monde sans fin', 'Ken Follett'),
				book('5', 'Les piliers de la terre (Les romanesques)')
			],
			'les piliers de la terre'
		);
		expect(ranked.map((b) => b.ref.id)).toEqual(['2', '3', '5']);
	});

	it('matches authors too, ignoring accents and case', () => {
		const ranked = rankByQuery(
			[
				book('1', 'Ellen', 'Ken Follett'),
				book('2', 'Autre', 'Quelqu’un'),
				book('3', 'Aliena', 'Ken FOLLETT'),
				book('4', 'Un monde sans fin', 'Ken Follétt')
			],
			'follett'
		);
		expect(ranked.map((b) => b.ref.id)).toEqual(['1', '3', '4']);
	});
});

describe('series in book search', () => {
	const memberships = new Map([
		['10', { series: '8337', seriesName: 'Harry Potter', ordinal: '1' }],
		['11', { series: '8337', seriesName: 'Harry Potter', ordinal: '2' }],
		['20', { series: '1200', seriesName: 'Kingsbridge', ordinal: '1' }]
	]);

	it('bundles books into the series when the search names the series', () => {
		const folded = foldIntoSeries(
			[book('11', 'Chamber of Secrets'), book('10', "Philosopher's Stone")],
			memberships,
			'harry potter'
		);
		expect(folded.map((r) => r.name)).toEqual(['Harry Potter']);
		expect(folded[0].poster).toEqual({ url: 'cover-10' });
	});

	it('keeps a searched book visible, labelled with its series, followed by the series', () => {
		const folded = foldIntoSeries(
			[book('20', 'Les piliers de la terre', 'Ken Follett'), book('9', 'Other')],
			memberships,
			'les piliers de la terre'
		);
		expect(folded.map((r) => [r.name, r.badge])).toEqual([
			['Les piliers de la terre', 'Kingsbridge #1'],
			['Kingsbridge', 'Series'],
			['Other', null]
		]);
	});
});

describe('BnF catalogue records', () => {
	it('reads title, original title, authors, pages and year of a French translation', () => {
		const xml = readFileSync('tests/fixtures/bnf-isbn-9782253107057.xml', 'utf8');
		expect(parseUnimarc(xml)).toEqual({
			title: 'Les oiseaux du temps',
			originalTitle: 'This is how you lose the time war',
			authors: ['El-Mohtar', 'Gladstone'],
			pages: 211,
			year: 2023,
			publisher: 'le Livre de poche'
		});
		expect(parseUnimarc('<srw:searchRetrieveResponse/>')).toBeNull();
	});
});
