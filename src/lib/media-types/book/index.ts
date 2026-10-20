import type { LibraryStatus, MediaTypeDefinition } from '../types';

export const READING_STATUS_LABELS: Record<LibraryStatus, string> = {
	planned: 'Plan to read',
	in_progress: 'Reading',
	completed: 'Read',
	on_hold: 'On hold',
	dropped: 'Dropped'
};

/** Books, from Open Library. Progress is a page number stored on the library entry. */
export const book: MediaTypeDefinition = {
	id: 'book',
	label: 'Book',
	pluralLabel: 'Books',
	searchFilter: 'book',
	progressModel: 'pages',
	statusLabels: READING_STATUS_LABELS,
	addLabel: 'Want to read',
	consumedLabel: 'Read',
	providers: { search: ['openlibrary'], details: ['openlibrary'] },
	formatUnit: ({ number }) => `p. ${number}`
};
