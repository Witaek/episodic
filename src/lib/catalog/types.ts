/**
 * Provider-neutral catalog types shared by the server and the UI.
 * Providers (TMDB, AniList, …) translate their responses into these shapes.
 */

export type ProviderId =
	| 'tmdb'
	| 'anilist'
	| 'tvmaze'
	| 'openlibrary'
	| 'wikidata'
	| 'mangadex'
	/** Series grouped by hand by a user. */
	| 'local';

/** Media types known to the registry (see src/lib/media-types). */
export type MediaTypeId = 'movie' | 'show' | 'anime' | 'book' | 'bookseries' | 'manga';

/** The Read side of the app (books, book series, manga); everything else is Watch. */
export const READ_MEDIA_TYPES: readonly MediaTypeId[] = ['book', 'bookseries', 'manga'];
export const isReadType = (type: MediaTypeId) => READ_MEDIA_TYPES.includes(type);

/** Routing segment for a title page: /title/{kind}/{id}. */
/** 'series': a book series from Wikidata; 'collection': a series grouped by hand. */
export type TitleKind = 'movie' | 'tv' | 'anime' | 'book' | 'series' | 'collection' | 'manga';

export const READ_KINDS: readonly TitleKind[] = ['book', 'series', 'collection', 'manga'];

export interface Image {
	url: string;
	/** Optional responsive candidates, e.g. "…w342 342w, …w500 500w". */
	srcset?: string;
	/** Dominant color, when the provider knows it (AniList does). */
	color?: string | null;
}

export interface TitleRef {
	provider: ProviderId;
	kind: TitleKind;
	id: string;
}

export interface SearchResult {
	ref: TitleRef;
	href: string;
	mediaType: MediaTypeId;
	isAnime: boolean;
	name: string;
	originalName?: string | null;
	year: number | null;
	overview?: string | null;
	poster: Image | null;
	backdrop: Image | null;
	/** Score out of 10. */
	rating: number | null;
	/** Short extra label, e.g. "Season 2" or "Movie". */
	badge?: string | null;
}

export type ShowStatus =
	| 'returning'
	| 'in_production'
	| 'planned'
	| 'ended'
	| 'canceled'
	| 'released'
	| 'upcoming'
	| 'unknown';

export interface Person {
	id: string;
	name: string;
	role: string | null;
	photo: Image | null;
}

export interface EpisodeSummary {
	id: string;
	seasonNumber: number;
	number: number;
	name: string | null;
	airDate: string | null;
	/** Exact air time (ISO, UTC), when a provider knows it. */
	airAt?: string | null;
}

export interface Episode extends EpisodeSummary {
	overview: string | null;
	still: Image | null;
	runtime: number | null;
	rating: number | null;
	/** Book volumes: page count. */
	pages?: number | null;
	/** Book volumes: the Open Library work, digits. */
	work?: string | null;
}

export interface SeasonSummary {
	number: number;
	name: string;
	episodeCount: number;
	airDate: string | null;
	poster: Image | null;
}

export interface Season extends SeasonSummary {
	overview: string | null;
	episodes: Episode[];
}

export interface TitleDetails {
	ref: TitleRef;
	mediaType: MediaTypeId;
	isAnime: boolean;
	name: string;
	originalName: string | null;
	tagline: string | null;
	overview: string | null;
	poster: Image | null;
	backdrop: Image | null;
	logo: Image | null;
	genres: string[];
	status: ShowStatus;
	/** Release date (movies) or first air date (shows). */
	startDate: string | null;
	endDate: string | null;
	/** Typical runtime in minutes. */
	runtime: number | null;
	/** Books: page count. */
	pages?: number | null;
	rating: number | null;
	/** Number of ratings behind `rating` (TMDB), to tell real films from obscure ones. */
	votes?: number | null;
	certification: string | null;
	/** Networks for TV, studios for anime, production companies for movies. */
	companies: string[];
	cast: Person[];
	seasons: SeasonSummary[];
	episodeCount: number | null;
	nextEpisode: EpisodeSummary | null;
	lastEpisode: EpisodeSummary | null;
	recommendations: SearchResult[];
	trailerUrl: string | null;
	externalIds: Partial<
		Record<
			| 'tmdb'
			| 'imdb'
			| 'tvdb'
			| 'anilist'
			| 'mal'
			| 'tvmaze'
			| 'openlibrary'
			| 'wikidata'
			| 'mangadex'
			/** Language the series/manga was loaded in. */
			| 'lang',
			string
		>
	>;
	/** Books and manga: authors. */
	authors?: string[];
	/** Where the data came from, for attribution and "open on …" links. */
	sourceUrl: string | null;
}

/** Languages offered for book search. */
export const BOOK_LANGUAGES = [
	{ id: 'en', label: 'English', marc: 'eng' },
	{ id: 'fr', label: 'Français', marc: 'fre' }
] as const;
export type BookLanguage = (typeof BOOK_LANGUAGES)[number]['id'];

/** A specific edition of a book (e.g. the French translation), as the reader sees it. */
export interface BookEdition {
	/** Numeric part of the Open Library edition key ("OL19679484M" → "19679484"). */
	id: string;
	title: string;
	cover: Image | null;
	pages: number | null;
	language: string | null;
	publisher: string | null;
	year: string | null;
}

export type SearchFilter = 'all' | 'tv' | 'anime' | 'movie' | 'book' | 'manga';

export function titleHref(ref: Pick<TitleRef, 'kind' | 'id'>, season?: number | null): string {
	// Books, series and manga live in the Read section.
	const section = READ_KINDS.includes(ref.kind) ? 'read' : 'title';
	const base = `/${section}/${ref.kind}/${encodeURIComponent(ref.id)}`;
	return season != null ? `${base}?season=${season}` : base;
}
