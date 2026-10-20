import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { LIBRARY_STATUSES } from '$lib/media-types/types';
import { handleErrors, parseBody, parseTitleParams, requireUser } from '$lib/server/api';
import { getUserTitleState, removeEntry, setStatus } from '$lib/server/services/library';
import { rememberEdition } from '$lib/server/services/books';
import { ensureTitle, findTitle } from '$lib/server/services/titles';
import type { RequestHandler } from './$types';

const body = z.object({ status: z.enum(LIBRARY_STATUSES) });

/** Add to the library or change status. */
export const PUT: RequestHandler = async ({ locals, params, request, url }) => {
	const user = requireUser(locals);
	const { kind, id } = parseTitleParams(params);
	const { status } = await parseBody(request, body);
	return handleErrors(async () => {
		const title = await ensureTitle(kind, id);
		setStatus(user.id, title.id, status);
		await rememberEdition(user.id, title.id, url.searchParams.get('edition'));
		return json({ state: getUserTitleState(user.id, title, user.prefs) });
	});
};

/** Remove from the library (watch history is kept). */
export const DELETE: RequestHandler = ({ locals, params }) => {
	const user = requireUser(locals);
	const { kind, id } = parseTitleParams(params);
	const title = findTitle(kind, id);
	if (title) removeEntry(user.id, title.id);
	return json({ state: getUserTitleState(user.id, title, user.prefs) });
};
