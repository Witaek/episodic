import { formatEpisodeCode, VIDEO_STATUS_LABELS, type MediaTypeDefinition } from '../types';

/**
 * Anime is tracked TV-style: one show with seasons, using TMDB's episode structure.
 * AniList provides anime search, exact airing times and sequel announcements; titles
 * without a TMDB entry fall back to an AniList-only page with a flat episode list.
 */
export const anime: MediaTypeDefinition = {
	id: 'anime',
	section: 'watch',
	label: 'Anime',
	pluralLabel: 'Anime',
	searchFilter: 'anime',
	progressModel: 'episodic',
	statusLabels: VIDEO_STATUS_LABELS,
	addLabel: 'Add to Watchlist',
	consumedLabel: 'Watched',
	providers: { search: ['anilist', 'tmdb'], details: ['tmdb', 'anilist'] },
	formatUnit: formatEpisodeCode
};
