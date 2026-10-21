import { READING_STATUS_LABELS } from '../book';
import type { MediaTypeDefinition } from '../types';

/**
 * Manga, from AniList (and MangaDex for volumes and chapters of ongoing series). Tracked like a
 * show: volumes are the seasons, chapters the episodes.
 */
export const manga: MediaTypeDefinition = {
	id: 'manga',
	section: 'read',
	label: 'Manga',
	pluralLabel: 'Manga',
	searchFilter: 'manga',
	progressModel: 'chapters',
	statusLabels: READING_STATUS_LABELS,
	addLabel: 'Want to read',
	consumedLabel: 'Read',
	providers: { search: ['anilist'], details: ['anilist', 'mangadex'] },
	formatUnit: ({ season, number }) => (season ? `Vol. ${season} · Ch. ${number}` : `Ch. ${number}`)
};
