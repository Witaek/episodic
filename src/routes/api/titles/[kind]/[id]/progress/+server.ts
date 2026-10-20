import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { handleErrors, parseBody, parseTitleParams, requireUser } from '$lib/server/api';
import { getUserTitleState } from '$lib/server/services/library';
import { ensureTitle } from '$lib/server/services/titles';
import { setReadingProgress } from '$lib/server/services/tracking';
import type { RequestHandler } from './$types';

const body = z.object({ page: z.number().int().min(0).max(100_000) });

/** Saves the current page of a book. */
export const PUT: RequestHandler = async ({ locals, params, request }) => {
	const user = requireUser(locals);
	const { kind, id } = parseTitleParams(params);
	const { page } = await parseBody(request, body);
	return handleErrors(async () => {
		const title = await ensureTitle(kind, id);
		const { finished } = setReadingProgress(user.id, title, page, user.prefs);
		return json({ finished, state: getUserTitleState(user.id, title, user.prefs) });
	});
};
