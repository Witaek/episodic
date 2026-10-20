import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { parseBody, requireUser } from '$lib/server/api';
import { updateEventTime } from '$lib/server/services/history';
import { getTitleRow } from '$lib/server/services/titles';
import { applyAutoStatus, deleteEvents } from '$lib/server/services/tracking';
import type { RequestHandler } from './$types';

function eventId(raw: string): number {
	const id = Number(raw);
	if (!Number.isInteger(id) || id <= 0) error(404, 'Not found');
	return id;
}

const body = z.object({ occurredAt: z.iso.datetime({ offset: true }) });

/** Change when something was watched. */
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	const user = requireUser(locals);
	const { occurredAt } = await parseBody(request, body);
	const at = new Date(occurredAt);
	if (at.getTime() > Date.now() + 60_000) error(400, "The date can't be in the future");
	if (!updateEventTime(user.id, eventId(params.id), at)) error(404, 'Not found');
	return json({ ok: true });
};

/** Remove one entry from the history. */
export const DELETE: RequestHandler = ({ locals, params }) => {
	const user = requireUser(locals);
	const titleIds = deleteEvents(user.id, [eventId(params.id)]);
	if (titleIds.length === 0) error(404, 'Not found');
	for (const titleId of titleIds) {
		const title = getTitleRow(titleId);
		if (title) applyAutoStatus(user.id, title, user.prefs, 'unwatch');
	}
	return json({ ok: true });
};
