import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { WatchResponse } from '$lib/tracking/types';
import {
	ensureTitleFor,
	handleErrors,
	parseBody,
	parseTitleParams,
	requireUser,
	watchTargetSchema
} from '$lib/server/api';
import { getUserTitleState } from '$lib/server/services/library';
import { readLocale } from '$lib/server/services/adaptations';
import { rememberEdition } from '$lib/server/services/books';
import { watch } from '$lib/server/services/tracking';
import type { RequestHandler } from './$types';

const body = z.object({
	target: watchTargetSchema,
	watchedAt: z.iso.datetime({ offset: true }).optional(),
	rewatch: z.boolean().optional()
});

export const POST: RequestHandler = async ({ locals, params, request, url }) => {
	const user = requireUser(locals);
	const { kind, id } = parseTitleParams(params);
	const input = await parseBody(request, body);
	return handleErrors(async () => {
		const title = await ensureTitleFor(user, kind, id);
		const watchedAt = input.watchedAt ? new Date(input.watchedAt) : undefined;
		if (watchedAt && watchedAt.getTime() > Date.now() + 60_000) {
			return json({ error: "The watch date can't be in the future" }, { status: 400 });
		}
		const result = watch(user.id, title, input.target, user.prefs, {
			watchedAt,
			rewatch: input.rewatch
		});
		await rememberEdition(
			user.id,
			title.id,
			url.searchParams.get('edition'),
			readLocale(user.prefs).language
		);
		const response: WatchResponse = {
			...result,
			state: getUserTitleState(user.id, title, user.prefs)
		};
		return json(response);
	});
};
