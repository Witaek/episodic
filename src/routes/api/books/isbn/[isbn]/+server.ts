import { error, json } from '@sveltejs/kit';
import { requireUser } from '$lib/server/api';
import { bnfByIsbn } from '$lib/server/providers/bnf';
import { findByIsbn, findWork } from '$lib/server/providers/openlibrary';
import { readLocale, seriesForBook } from '$lib/server/services/adaptations';
import { getBookEdition, getTitle } from '$lib/server/services/catalog';
import { isIsbn, type IsbnLookup, type IsbnUnmatched } from '$lib/scan';
import type { RequestHandler } from './$types';

/**
 * Finds a book by the ISBN on its barcode: the work, the exact edition, and its series. Editions
 * Open Library doesn't have (common for French paperbacks) are identified through the BnF
 * catalogue, then matched to the Open Library work by original title and author.
 */
export const GET: RequestHandler = async ({ locals, params }) => {
	const user = requireUser(locals);
	const isbn = params.isbn.replace(/[\s-]/g, '').toUpperCase();
	if (!isIsbn(isbn)) error(400, 'Not a valid ISBN');
	const locale = readLocale(user.prefs);

	let found: { work: string; edition: string | null } | null = await findByIsbn(isbn);
	let name: string | null = null;
	let year: string | null = null;
	if (!found) {
		const record = await bnfByIsbn(isbn).catch(() => null);
		if (!record) {
			return json({ error: 'No book found for this ISBN' } satisfies IsbnUnmatched, {
				status: 404
			});
		}
		const work =
			(record.originalTitle && (await findWork(record.originalTitle, record.authors))) ||
			(await findWork(record.title, record.authors));
		if (!work) {
			const body: IsbnUnmatched = {
				error: 'Open Library does not have this book',
				title: record.title,
				authors: record.authors
			};
			return json(body, { status: 404 });
		}
		found = { work, edition: null };
		name = record.title;
		year = record.year ? String(record.year) : null;
	}

	const [edition, work, membership] = await Promise.all([
		found.edition ? getBookEdition(found.edition).catch(() => null) : null,
		getTitle('book', found.work, locale).catch(() => null),
		seriesForBook(found.work, locale.language)
	]);
	const details = work && 'title' in work ? work.title : null;
	const body: IsbnLookup = {
		isbn,
		...found,
		href: found.edition
			? `/read/book/${found.work}?edition=${found.edition}`
			: `/read/book/${found.work}`,
		name: edition?.title ?? name ?? details?.name ?? 'Unknown title',
		poster: edition?.cover ?? details?.poster ?? null,
		year: edition?.year ?? year ?? details?.startDate?.slice(0, 4) ?? null,
		series: membership
			? {
					name: membership.seriesName,
					href: `/read/series/${membership.series}`,
					position: membership.ordinal
				}
			: null
	};
	return json(body);
};
