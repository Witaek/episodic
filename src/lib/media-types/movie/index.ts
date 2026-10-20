import { VIDEO_STATUS_LABELS, type MediaTypeDefinition } from '../types';

export const movie: MediaTypeDefinition = {
	id: 'movie',
	label: 'Movie',
	pluralLabel: 'Movies',
	searchFilter: 'movie',
	progressModel: 'single',
	statusLabels: VIDEO_STATUS_LABELS,
	consumedLabel: 'Watched',
	providers: { search: ['tmdb'], details: ['tmdb'] },
	formatUnit: () => 'Movie'
};
