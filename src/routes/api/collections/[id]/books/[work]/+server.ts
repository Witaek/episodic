import { error, json } from '@sveltejs/kit';
import { requireUser } from '$lib/server/api';
import { removeBookFromCollection } from '$lib/server/services/book-series';
import { findTitle } from '$lib/server/services/titles';
import type { RequestHandler } from './$types';

/** Takes a book out of a series grouped by hand. */
export const DELETE: RequestHandler = async ({ locals, params }) => {
	requireUser(locals);
	const collection = findTitle('collection', params.id);
	if (!collection || !/^\d+$/.test(params.work)) error(404, 'Not found');
	await removeBookFromCollection(collection, params.work);
	return json({ ok: true });
};
