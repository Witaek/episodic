import { error, json } from '@sveltejs/kit';
import { requireUser } from '$lib/server/api';
import { findByIsbn } from '$lib/server/providers/openlibrary';
import { readLocale, seriesForBook } from '$lib/server/services/adaptations';
import { getBookEdition } from '$lib/server/services/catalog';
import { isIsbn, type IsbnLookup } from '$lib/scan';
import type { RequestHandler } from './$types';

/** Finds a book by the ISBN on its barcode: the work, the exact edition, and its series. */
export const GET: RequestHandler = async ({ locals, params }) => {
	const user = requireUser(locals);
	const isbn = params.isbn.replace(/[\s-]/g, '').toUpperCase();
	if (!isIsbn(isbn)) error(400, 'Not a valid ISBN');
	const found = await findByIsbn(isbn);
	if (!found) error(404, 'No book found for this ISBN');
	const language = readLocale(user.prefs).language;
	const [edition, membership] = await Promise.all([
		getBookEdition(found.edition).catch(() => null),
		seriesForBook(found.work, language)
	]);
	const body: IsbnLookup = {
		isbn,
		...found,
		href: `/read/book/${found.work}?edition=${found.edition}`,
		name: edition?.title ?? 'Unknown title',
		poster: edition?.cover ?? null,
		year: edition?.year ?? null,
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
