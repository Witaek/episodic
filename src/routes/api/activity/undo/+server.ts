import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { parseBody, requireUser } from '$lib/server/api';
import { getUserTitleState } from '$lib/server/services/library';
import { getTitleRow } from '$lib/server/services/titles';
import { applyAutoStatus, deleteEvents } from '$lib/server/services/tracking';
import type { RequestHandler } from './$types';

const body = z.object({ eventIds: z.array(z.number().int().positive()).min(1).max(5000) });

/** Undo: deletes the given events and returns the new state of each affected title. */
export const POST: RequestHandler = async ({ locals, request }) => {
	const user = requireUser(locals);
	const { eventIds } = await parseBody(request, body);
	const titleIds = deleteEvents(user.id, eventIds);
	const states = Object.fromEntries(
		titleIds.flatMap((titleId) => {
			const title = getTitleRow(titleId);
			if (!title) return [];
			applyAutoStatus(user.id, title, user.prefs, 'unwatch');
			return [[titleId, getUserTitleState(user.id, title, user.prefs)]];
		})
	);
	return json({ states });
};
