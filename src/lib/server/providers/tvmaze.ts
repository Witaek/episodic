import { createHttpClient } from './http';
import type { MetadataProvider } from './provider';

/**
 * TVmaze provides exact air times (TMDB only has dates). It is looked up by TVDB or IMDb id.
 * Used by the airing service; it has no search of its own in Episodic.
 */
const API = 'https://api.tvmaze.com';

// TVmaze allows 20 calls per 10 seconds.
const request = createHttpClient('tvmaze', { burst: 10, perSecond: 1.8, concurrency: 2 });

export interface TvmazeEpisode {
	season: number;
	number: number | null;
	name: string;
	airdate: string;
	/** ISO timestamp with offset, e.g. 2026-10-25T21:00:00-04:00 */
	airstamp: string | null;
	runtime: number | null;
}

export interface TvmazeShow {
	id: number;
	name: string;
	status: string;
	schedule: { time: string; days: string[] };
	network?: { country?: { timezone?: string } } | null;
	webChannel?: { country?: { timezone?: string } | null } | null;
	_embedded?: { nextepisode?: TvmazeEpisode; episodes?: TvmazeEpisode[] };
}

export async function lookupShow(ids: {
	tvdb?: string;
	imdb?: string;
}): Promise<TvmazeShow | null> {
	const params = ids.tvdb ? `thetvdb=${ids.tvdb}` : ids.imdb ? `imdb=${ids.imdb}` : null;
	if (!params) return null;
	try {
		return await request<TvmazeShow>(`${API}/lookup/shows?${params}`);
	} catch (error) {
		if ((error as { status?: number }).status === 404) return null;
		throw error;
	}
}

export function getShowWithEpisodes(id: number): Promise<TvmazeShow> {
	return request<TvmazeShow>(`${API}/shows/${id}?embed[]=episodes&embed[]=nextepisode`);
}

/** Exact air time (UTC ISO) for an episode, if TVmaze knows it. */
export function findAirTime(show: TvmazeShow, season: number, number: number): string | null {
	const episode = show._embedded?.episodes?.find((e) => e.season === season && e.number === number);
	return episode?.airstamp ? new Date(episode.airstamp).toISOString() : null;
}

export const tvmaze = {
	id: 'tvmaze',
	name: 'TVmaze',
	url: 'https://www.tvmaze.com',
	isConfigured: () => true
} satisfies MetadataProvider;
