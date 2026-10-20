import type { Image, MediaTypeId, TitleKind } from '$lib/catalog/types';
import type { LibraryStatus } from '$lib/media-types/types';

/** Shapes shared by the tracking API and the UI. */

export interface EpisodeBrief {
	id: number;
	seasonNumber: number;
	number: number;
	name: string | null;
	airDate: string | null;
	airAt: string | null;
	still: Image | null;
	runtime: number | null;
}

export interface ProgressSummary {
	/** Aired episodes watched at least once. */
	watched: number;
	aired: number;
	total: number;
	/** 0–100, of aired episodes. */
	percent: number;
	/** Every aired episode is watched. */
	upToDate: boolean;
	/** The episode to watch next, if it has aired. */
	nextUp: EpisodeBrief | null;
	/** The next episode that hasn't aired yet. */
	nextToAir: EpisodeBrief | null;
}

export interface TitleUserState {
	/** Local title id, once the title is stored (in a library or history). */
	titleId: number | null;
	status: LibraryStatus | null;
	/** Watch counts keyed by episodeKey(); movies use the key "movie". */
	watched: Record<string, number>;
	progress: ProgressSummary | null;
	lastActivityAt: string | null;
}

export const EMPTY_STATE: TitleUserState = {
	titleId: null,
	status: null,
	watched: {},
	progress: null,
	lastActivityAt: null
};

export const MOVIE_KEY = 'movie';

export function episodeKey(seasonNumber: number, number: number): string {
	return `${seasonNumber}-${number}`;
}

/** What a watch/unwatch request applies to. */
export type WatchTarget =
	| { type: 'episode'; season: number; number: number }
	| { type: 'season'; season: number }
	| { type: 'upTo'; season: number; number: number }
	| { type: 'all' }
	| { type: 'movie' };

export interface WatchResponse {
	eventIds: number[];
	/** Aired, unwatched episodes before a single marked episode (to offer "mark those too"). */
	earlierUnwatched: number;
	state: TitleUserState;
}

export interface LibraryItem {
	titleId: number;
	kind: TitleKind;
	externalId: string;
	href: string;
	name: string;
	mediaType: MediaTypeId;
	isAnime: boolean;
	poster: Image | null;
	backdrop: Image | null;
	logo: Image | null;
	year: number | null;
	status: LibraryStatus;
	addedAt: string;
	lastActivityAt: string | null;
	progress: ProgressSummary | null;
}

export interface HistoryItem {
	eventId: number;
	occurredAt: string;
	isRepeat: boolean;
	title: {
		id: number;
		name: string;
		href: string;
		mediaType: MediaTypeId;
		isAnime: boolean;
		poster: Image | null;
	};
	episode: {
		seasonNumber: number;
		number: number;
		name: string | null;
		still: Image | null;
		runtime: number | null;
	} | null;
	runtime: number | null;
}

export interface UpcomingItem {
	titleId: number;
	href: string;
	name: string;
	mediaType: MediaTypeId;
	isAnime: boolean;
	poster: Image | null;
	backdrop: Image | null;
	status: LibraryStatus;
	/** Null for a movie release. */
	episode: EpisodeBrief | null;
	/** Local calendar date "YYYY-MM-DD" (from airAt when known). */
	date: string;
	airAt: string | null;
}

export interface AnnouncedSeason {
	titleId: number;
	href: string;
	name: string;
	poster: Image | null;
	seasonNumber: number;
	airDate: string | null;
}
