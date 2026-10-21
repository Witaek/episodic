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
	section: 'read',
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

/** A series of books (Harry Potter): tracked like a show, each book is one unit. */
export const bookseries: MediaTypeDefinition = {
	id: 'bookseries',
	section: 'read',
	label: 'Book series',
	pluralLabel: 'Book series',
	searchFilter: 'book',
	progressModel: 'episodic',
	statusLabels: READING_STATUS_LABELS,
	addLabel: 'Want to read',
	consumedLabel: 'Read',
	providers: { search: ['openlibrary', 'wikidata'], details: ['wikidata', 'openlibrary'] },
	formatUnit: ({ number }) => `Book ${number}`
};
