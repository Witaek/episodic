import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { parseBody, parseTitleParams, requireUser } from '$lib/server/api';
import { readLocale } from '$lib/server/services/adaptations';
import { chooseEdition, clearEdition } from '$lib/server/services/books';
import type { RequestHandler } from './$types';

const body = z.object({ edition: z.string().regex(/^\d+$/).nullable() });

/** Chooses which edition (title, cover, page count) of a book this reader sees; null resets it. */
export const PUT: RequestHandler = async ({ locals, params, request }) => {
	const user = requireUser(locals);
	const { kind, id } = parseTitleParams(params);
	if (kind !== 'book') error(400, 'Only books have editions');
	const { edition } = await parseBody(request, body);
	if (edition === null) {
		clearEdition(user.id, id);
		return json({ edition: null });
	}
	const chosen = await chooseEdition(user.id, id, edition, readLocale(user.prefs).language);
	if (!chosen) error(404, 'Edition not found');
	return json({ edition: chosen });
};
