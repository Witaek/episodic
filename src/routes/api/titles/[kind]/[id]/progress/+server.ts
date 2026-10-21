import { json } from '@sveltejs/kit';
import { z } from 'zod';
import {
	ensureTitleFor,
	handleErrors,
	parseBody,
	parseTitleParams,
	requireUser
} from '$lib/server/api';
import { rememberEdition } from '$lib/server/services/books';
import { getEntry, getUserTitleState, setStatus } from '$lib/server/services/library';
import { setReadingProgress, setVolumeProgress } from '$lib/server/services/tracking';
import type { RequestHandler } from './$types';

const body = z.object({
	page: z.number().int().min(0).max(100_000),
	// Series: the book the page is in.
	season: z.number().int().min(0).optional(),
	number: z.number().int().min(0).optional()
});

/** Saves the current page of a book (and, with ?edition=, which edition it is). */
export const PUT: RequestHandler = async ({ locals, params, request, url }) => {
	const user = requireUser(locals);
	const { kind, id } = parseTitleParams(params);
	const { page, season, number } = await parseBody(request, body);
	return handleErrors(async () => {
		const title = await ensureTitleFor(user, kind, id);
		// The edition is stored on the library entry and decides the page count, so it comes first.
		if (!getEntry(user.id, title.id)) setStatus(user.id, title.id, 'planned');
		await rememberEdition(user.id, title.id, url.searchParams.get('edition'));
		const { finished } =
			season !== undefined && number !== undefined
				? setVolumeProgress(user.id, title, { season, number }, page, user.prefs)
				: setReadingProgress(user.id, title, page, user.prefs);
		return json({ finished, state: getUserTitleState(user.id, title, user.prefs) });
	});
};
