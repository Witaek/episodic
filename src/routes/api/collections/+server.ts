import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { titleHref } from '$lib/catalog/types';
import { parseBody, requireUser } from '$lib/server/api';
import {
	CollectionError,
	createCollection,
	listCollections
} from '$lib/server/services/book-series';
import type { RequestHandler } from './$types';

/** Series grouped by hand, to pick one when adding a book. */
export const GET: RequestHandler = ({ locals }) => {
	requireUser(locals);
	return json(listCollections());
};

const body = z.object({
	name: z.string().trim().min(1, 'Give the series a name').max(200),
	work: z.string().regex(/^\d+$/),
	number: z.number().int().min(1).max(999)
});

/** Creates a series by hand, starting with one book. */
export const POST: RequestHandler = async ({ locals, request }) => {
	const user = requireUser(locals);
	const input = await parseBody(request, body);
	try {
		const collection = await createCollection(user.id, user.prefs, input);
		return json(
			{
				id: collection.externalId,
				href: titleHref({ kind: 'collection', id: collection.externalId })
			},
			{ status: 201 }
		);
	} catch (cause) {
		if (cause instanceof CollectionError) return json({ error: cause.message }, { status: 400 });
		throw cause;
	}
};
