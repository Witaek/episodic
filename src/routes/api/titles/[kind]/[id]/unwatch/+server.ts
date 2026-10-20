import { json } from '@sveltejs/kit';
import { z } from 'zod';
import {
	handleErrors,
	parseBody,
	parseTitleParams,
	requireUser,
	watchTargetSchema
} from '$lib/server/api';
import { getUserTitleState } from '$lib/server/services/library';
import { findTitle } from '$lib/server/services/titles';
import { unwatch } from '$lib/server/services/tracking';
import type { RequestHandler } from './$types';

const body = z.object({ target: watchTargetSchema });

export const POST: RequestHandler = async ({ locals, params, request }) => {
	const user = requireUser(locals);
	const { kind, id } = parseTitleParams(params);
	const { target } = await parseBody(request, body);
	return handleErrors(() => {
		const title = findTitle(kind, id);
		if (title) unwatch(user.id, title, target, user.prefs);
		return json({ state: getUserTitleState(user.id, title, user.prefs) });
	});
};
