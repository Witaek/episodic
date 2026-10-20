import type { MediaTypeId, ProviderId, SearchFilter } from '$lib/catalog/types';

/** How progress is counted for a media type. */
export type ProgressModel = 'single' | 'episodic' | 'chapters' | 'pages';

/** Library statuses are stored generically; each media type supplies its own labels. */
export const LIBRARY_STATUSES = [
	'planned',
	'in_progress',
	'completed',
	'on_hold',
	'dropped'
] as const;
export type LibraryStatus = (typeof LIBRARY_STATUSES)[number];

/** A unit of progress: an episode (season + number), a chapter, a page… */
export interface ProgressUnit {
	season?: number | null;
	number: number;
}

export interface MediaTypeDefinition {
	id: MediaTypeId;
	label: string;
	pluralLabel: string;
	/** Search tab this type appears under. */
	searchFilter: SearchFilter;
	progressModel: ProgressModel;
	statusLabels: Record<LibraryStatus, string>;
	/** The main "add" button, e.g. "Add to Watchlist" or "Want to read". */
	addLabel: string;
	/** "Watched" / "Read": used for history and buttons. */
	consumedLabel: string;
	/** Providers used for search and details, in priority order. */
	providers: { search: ProviderId[]; details: ProviderId[] };
	/** Short label for a unit: "S02E05", "Ch. 112", "p. 240". */
	formatUnit(unit: ProgressUnit): string;
}

export const VIDEO_STATUS_LABELS: Record<LibraryStatus, string> = {
	planned: 'Watchlist',
	in_progress: 'Watching',
	completed: 'Completed',
	on_hold: 'On hold',
	dropped: 'Dropped'
};

export function formatEpisodeCode({ season, number }: ProgressUnit): string {
	const pad = (n: number) => String(n).padStart(2, '0');
	return season == null ? `E${pad(number)}` : `S${pad(season)}E${pad(number)}`;
}
