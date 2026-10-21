import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { EditionSummary } from '../../src/lib/server/providers/openlibrary';

const dataDir = mkdtempSync(join(tmpdir(), 'episodic-test-'));
process.env.DATA_DIR = dataDir;

const edition = (id: string, extra: Partial<EditionSummary>): EditionSummary => ({
	id,
	title: 'Les piliers de la terre',
	languages: ['fre'],
	cover: { url: `cover-${id}` },
	publisher: 'Le Livre de Poche',
	year: '2010',
	pages: 1049,
	isbn: null,
	description: null,
	format: 'Paperback',
	...extra
});

const PILLARS = [
	edition('1', { publisher: 'Independently Published', year: '2023' }),
	edition('2', { title: 'Les piliers de la terre : édition illustrée', year: '2022' }),
	edition('3', { publisher: 'Le Livre de Poche', year: '2012' }),
	edition('4', { publisher: 'Le Livre de Poche', year: '2005', cover: null }),
	edition('5', { publisher: 'Recorded Books', format: 'Audio CD', year: '2024' }),
	edition('6', { title: 'Filary ziemi', languages: ['pol'], publisher: 'Albatros', year: '2017' }),
	edition('7', { title: 'The Pillars of the Earth', languages: ['eng'], publisher: 'Pan' })
];

// Open Library answers for the cover-only test: the Polish edition, then the work's editions.
vi.stubGlobal('fetch', async (input: string | URL) => {
	const url = String(input);
	const body = url.includes('/books/OL6M.json')
		? {
				key: '/books/OL6M',
				title: 'Filary ziemi',
				covers: [99],
				number_of_pages: 900,
				languages: [{ key: '/languages/pol' }]
			}
		: url.includes('/editions.json')
			? {
					entries: [
						{
							key: '/books/OL3M',
							title: 'Les piliers de la terre',
							languages: [{ key: '/languages/fre' }],
							covers: [3],
							publishers: ['Le Livre de Poche'],
							number_of_pages: 1049
						}
					]
				}
			: {};
	return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
});

const { runMigrations, closeDb } = await import('../../src/lib/server/db/client');
const { createUser } = await import('../../src/lib/server/auth');
const details = await import('../../src/lib/server/services/book-details');
const books = await import('../../src/lib/server/services/books');

let userId: number;
beforeAll(async () => {
	runMigrations();
	userId = await createUser({ username: 'reader', password: 'password1', role: 'user' });
});
afterAll(() => {
	closeDb();
	rmSync(dataDir, { recursive: true, force: true });
	vi.unstubAllGlobals();
});

describe('default edition in the reader’s language', () => {
	it('picks the usual edition: real publisher, plain title, print, with a cover', () => {
		expect(details.defaultEdition(PILLARS, 'fr')?.id).toBe('3');
		expect(details.defaultEdition(PILLARS, 'en')?.id).toBe('7');
	});

	it('has none when no edition is in that language', () => {
		expect(details.defaultEdition([PILLARS[5]], 'fr')).toBeNull();
	});
});

describe('summary language', () => {
	const fr =
		"Dans l'Angleterre du XIIe siècle ravagée par la guerre et la famine, des êtres luttent pour s'assurer le pouvoir, la gloire, la sainteté, l'amour, ou simplement de quoi survivre.";
	const en =
		'Story of Valjean, the ex-convict who rises against all odds from galley slave to mayor, and of the policeman who pursues him for his whole life.';

	it('tells French from English', () => {
		expect(details.looksLike(fr, 'fr')).toBe(true);
		expect(details.looksLike(en, 'fr')).toBe(false);
		expect(details.languageOf(en)).toBe('en');
	});

	it('uses a French blurb, ignoring English text and links on French editions', async () => {
		const editions = [
			edition('a', { description: en }),
			edition('b', { description: 'Full text online available at http://example.org/1984 here.' }),
			edition('c', { description: fr })
		];
		expect(await details.localizedSummary('1', 'fr', editions)).toEqual({
			text: fr,
			source: 'edition'
		});
		expect(details.anyBlurb([edition('d', { languages: ['fre'], description: fr })])).toBe(fr);
	});
});

describe('choosing an edition', () => {
	it('takes only the cover from an edition in another language', async () => {
		const chosen = await books.chooseEdition(userId, '1914022', '6', 'fr');
		expect(chosen).toMatchObject({
			id: '6',
			title: 'Les piliers de la terre',
			pages: 1049,
			cover: { url: 'https://covers.openlibrary.org/b/id/99-L.jpg' }
		});
		expect(books.isCoverOnly(chosen)).toBe(true);
		expect(books.editionsFor(userId, ['1914022']).get('1914022')?.id).toBe('6');
		books.clearEdition(userId, '1914022');
		expect(books.editionFor(userId, '1914022')).toBeNull();
	});
});
