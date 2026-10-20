import { and, eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { episodes, titles } from '../db/schema';
import { upcomingAiringSchedules } from '../providers/anilist';
import { mappingsForTmdbTv } from '../providers/anime-mapping';
import { getShowWithEpisodes, lookupShow } from '../providers/tvmaze';
import { localDateString } from './progress';
import type { TitleRow } from './titles';

const DAY = 24 * 60 * 60 * 1000;

function setAirAt(titleId: number, season: number, number: number, airAt: string): boolean {
	return (
		getDb()
			.update(episodes)
			.set({ airAt })
			.where(
				and(
					eq(episodes.titleId, titleId),
					eq(episodes.seasonNumber, season),
					eq(episodes.number, number)
				)
			)
			.run().changes > 0
	);
}

/**
 * Adds exact air times to a stored show's upcoming episodes: from AniList for anime (through the
 * id mapping), from TVmaze for other shows. Returns how many episodes were updated.
 */
export async function enrichAirTimes(title: TitleRow): Promise<number> {
	if (title.provider !== 'tmdb' || title.kind !== 'tv') return 0;
	return title.isAnime ? enrichFromAnilist(title) : enrichFromTvmaze(title);
}

async function enrichFromAnilist(title: TitleRow): Promise<number> {
	const mappings = mappingsForTmdbTv(Number(title.externalId)).filter((m) => m.tmdbSeason !== null);
	if (mappings.length === 0) return 0;
	const schedules = await upcomingAiringSchedules(mappings.map((m) => m.anilistId));
	let updated = 0;
	for (const mapping of mappings) {
		for (const node of schedules.get(mapping.anilistId) ?? []) {
			const number = node.episode + (mapping.tmdbEpisodeOffset ?? 0);
			const airAt = new Date(node.airingAt * 1000).toISOString();
			if (setAirAt(title.id, mapping.tmdbSeason!, number, airAt)) updated++;
		}
	}
	return updated;
}

async function enrichFromTvmaze(title: TitleRow): Promise<number> {
	const ids = title.externalIds;
	let tvmazeId = ids.tvmaze ? Number(ids.tvmaze) : undefined;
	if (tvmazeId === undefined) {
		const show = await lookupShow({ tvdb: ids.tvdb, imdb: ids.imdb });
		tvmazeId = show?.id ?? 0;
		// Remember the id (0 = not on TVmaze) so the lookup isn't repeated.
		getDb()
			.update(titles)
			.set({ externalIds: { ...ids, tvmaze: String(tvmazeId) } })
			.where(eq(titles.id, title.id))
			.run();
	}
	if (!tvmazeId) return 0;

	const show = await getShowWithEpisodes(tvmazeId);
	// Only recent and upcoming episodes: old numbering differences don't matter there.
	const from = localDateString(new Date(Date.now() - 3 * DAY));
	let updated = 0;
	for (const episode of show._embedded?.episodes ?? []) {
		if (!episode.airstamp || episode.number === null || episode.airdate < from) continue;
		const airAt = new Date(episode.airstamp).toISOString();
		if (setAirAt(title.id, episode.season, episode.number, airAt)) updated++;
	}
	return updated;
}
