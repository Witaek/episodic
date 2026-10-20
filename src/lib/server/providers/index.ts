import { anilist } from './anilist';
import { openlibrary } from './openlibrary';
import type { MetadataProvider } from './provider';
import { tmdb } from './tmdb';
import { tvmaze } from './tvmaze';

/** Every metadata provider. New sources are added here. */
export const providers: readonly MetadataProvider[] = [tmdb, anilist, tvmaze, openlibrary];

export { anilist, openlibrary, tmdb, tvmaze };
export type { MetadataProvider, LocaleOptions } from './provider';
export { NotConfiguredError } from './provider';
