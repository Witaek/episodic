import { formatEpisodeCode, VIDEO_STATUS_LABELS, type MediaTypeDefinition } from '../types';

export const show: MediaTypeDefinition = {
	id: 'show',
	label: 'TV show',
	pluralLabel: 'TV shows',
	searchFilter: 'tv',
	progressModel: 'episodic',
	statusLabels: VIDEO_STATUS_LABELS,
	addLabel: 'Add to Watchlist',
	consumedLabel: 'Watched',
	providers: { search: ['tmdb'], details: ['tmdb', 'tvmaze'] },
	formatUnit: formatEpisodeCode
};
