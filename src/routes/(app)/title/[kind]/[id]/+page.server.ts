import { error, redirect } from '@sveltejs/kit';
import type { Season, TitleKind } from '$lib/catalog/types';
import { NotConfiguredError } from '$lib/server/providers';
import { getUserTitleState } from '$lib/server/services/library';
import { findTitle } from '$lib/server/services/titles';
import {
	defaultSeasonNumber,
	getSeason,
	getTitle,
	isNotFound,
	type TitleLookup
} from '$lib/server/services/catalog';
import type { PageServerLoad } from './$types';

const KINDS: TitleKind[] = ['movie', 'tv', 'anime'];

export const load: PageServerLoad = async ({ params, url, locals }) => {
	const kind = params.kind as TitleKind;
	if (!KINDS.includes(kind) || !/^\d+$/.test(params.id)) error(404, 'Not found');

	let lookup: TitleLookup;
	try {
		lookup = await getTitle(kind, params.id);
	} catch (cause) {
		if (cause instanceof NotConfiguredError) return { setupNeeded: true as const };
		if (isNotFound(cause)) error(404, 'This title could not be found.');
		console.error(`[title] ${kind}/${params.id} failed`, cause);
		error(502, 'Could not load this title right now. Please try again in a moment.');
	}

	if ('redirect' in lookup) redirect(307, lookup.redirect);
	const { title } = lookup;
	const user = locals.user!;
	const state = getUserTitleState(user.id, findTitle(kind, params.id), user.prefs);

	let seasonNumber: number | null = null;
	let season: Promise<Season | null> = Promise.resolve(null);
	if (title.mediaType !== 'movie' && title.seasons.length > 0) {
		const param = url.searchParams.get('season');
		const requested = param !== null && /^\d+$/.test(param) ? Number(param) : undefined;
		const progressSeason =
			state.progress?.nextUp?.seasonNumber ?? state.progress?.nextToAir?.seasonNumber;
		const hasSeason = (n: number | undefined) =>
			n !== undefined && title.seasons.some((s) => s.number === n);
		seasonNumber = hasSeason(requested)
			? requested!
			: hasSeason(progressSeason) && state.progress?.watched
				? progressSeason!
				: defaultSeasonNumber(title);
		if (seasonNumber !== null) {
			season = getSeason(kind, params.id, seasonNumber).catch((cause) => {
				console.error(`[title] season ${seasonNumber} of ${kind}/${params.id} failed`, cause);
				return null;
			});
		}
	}

	// `season` is streamed: the page renders immediately and the episode list fills in.
	return { setupNeeded: false as const, title, seasonNumber, season, state };
};
