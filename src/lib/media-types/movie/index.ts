import { VIDEO_STATUS_LABELS, type MediaTypeDefinition } from '../types';

export const movie: MediaTypeDefinition = {
	id: 'movie',
	section: 'watch',
	label: 'Movie',
	pluralLabel: 'Movies',
	searchFilter: 'movie',
	progressModel: 'single',
	statusLabels: VIDEO_STATUS_LABELS,
	addLabel: 'Add to Watchlist',
	consumedLabel: 'Watched',
	providers: { search: ['tmdb'], details: ['tmdb'] },
	formatUnit: () => 'Movie'
};
