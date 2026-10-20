import { json } from '@sveltejs/kit';
import { handleErrors, parseTitleParams, requireUser } from '$lib/server/api';
import { refreshTitle } from '$lib/server/services/refresh';
import { findTitle } from '$lib/server/services/titles';
import type { RequestHandler } from './$types';

const MIN_INTERVAL = 5 * 60 * 1000;

/** Re-fetches a stored title now (at most every 5 minutes). */
export const POST: RequestHandler = ({ locals, params }) => {
	requireUser(locals);
	const { kind, id } = parseTitleParams(params);
	return handleErrors(async () => {
		const title = findTitle(kind, id);
		if (!title) return json({ error: 'This title is not in any library yet' }, { status: 404 });
		if (Date.now() - title.refreshedAt.getTime() < MIN_INTERVAL) {
			return json({ refreshed: false, refreshedAt: title.refreshedAt.toISOString() });
		}
		const updated = await refreshTitle(title);
		return json({ refreshed: true, refreshedAt: updated.refreshedAt.toISOString() });
	});
};
