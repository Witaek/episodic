import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { parseBody, requireUser } from '$lib/server/api';
import { renameCollection } from '$lib/server/services/book-series';
import { findTitle } from '$lib/server/services/titles';
import type { RequestHandler } from './$types';

const body = z.object({ name: z.string().trim().min(1).max(200) });

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	requireUser(locals);
	const collection = findTitle('collection', params.id);
	if (!collection) error(404, 'Series not found');
	const { name } = await parseBody(request, body);
	renameCollection(collection, name);
	return json({ ok: true });
};
