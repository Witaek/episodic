import type {
	ProviderId,
	SearchFilter,
	SearchResult,
	Season,
	TitleDetails,
	TitleKind
} from '$lib/catalog/types';

export interface LocaleOptions {
	language: string;
	region: string;
}

/**
 * A source of metadata. Capabilities are optional: a provider implements only what it offers.
 * New sources (Open Library, MangaDex, …) implement this interface and are listed in
 * `providers/index.ts`.
 */
export interface MetadataProvider {
	readonly id: ProviderId;
	readonly name: string;
	/** Homepage, used for attribution. */
	readonly url: string;
	/** False when a required API key is missing. */
	isConfigured(): boolean;
	/** Which search tabs this provider can answer. */
	readonly searchFilters?: readonly SearchFilter[];
	/** Which title kinds this provider can resolve. */
	readonly titleKinds?: readonly TitleKind[];

	search?(query: string, filter: SearchFilter, locale: LocaleOptions): Promise<SearchResult[]>;
	trending?(filter: SearchFilter, locale: LocaleOptions): Promise<SearchResult[]>;
	getTitle?(kind: TitleKind, id: string, locale: LocaleOptions): Promise<TitleDetails>;
	getSeason?(kind: TitleKind, id: string, season: number, locale: LocaleOptions): Promise<Season>;
}

export class NotConfiguredError extends Error {
	constructor(readonly provider: ProviderId) {
		super(`${provider} is not configured`);
		this.name = 'NotConfiguredError';
	}
}
