import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { parseBody, requireUser } from '$lib/server/api';
import { addBookToCollection, CollectionError } from '$lib/server/services/book-series';
import { findTitle } from '$lib/server/services/titles';
import type { RequestHandler } from './$types';

const body = z.object({
	work: z.string().regex(/^\d+$/),
	number: z.number().int().min(1).max(999)
});

/** Adds a book to a series grouped by hand. */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	const user = requireUser(locals);
	const collection = findTitle('collection', params.id);
	if (!collection) error(404, 'Series not found');
	const { work, number } = await parseBody(request, body);
	try {
		await addBookToCollection(user.id, user.prefs, collection, work, number);
		return json({ ok: true });
	} catch (cause) {
		if (cause instanceof CollectionError) return json({ error: cause.message }, { status: 400 });
		throw cause;
	}
};
