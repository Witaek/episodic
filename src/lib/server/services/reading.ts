import { and, eq } from 'drizzle-orm';
import {
	BOOK_LANGUAGES,
	type BookLanguage,
	type Episode,
	type Image,
	type Season,
	type TitleDetails
} from '$lib/catalog/types';
import { cached, HOUR } from '../cache';
import { getDb } from '../db/client';
import { episodes, titles } from '../db/schema';
import {
	fuzzyDate,
	mangaDetails,
	mangaTitle,
	mapAnilistStatus,
	stripDescription,
	type RawMangaDetails
} from '../providers/anilist';
import { ProviderError } from '../providers/http';
import { findByAnilist, volumeCovers, volumes, type MangaVolume } from '../providers/mangadex';
import { openlibrary, volumeInfo, type VolumeInfo } from '../providers/openlibrary';
import { seriesDetails, type SeriesInfo } from '../providers/wikidata';
import { layoutVolumes, type VolumeLayout } from './manga-volumes';

/**
 * Book series and manga, shaped like shows: a series' books (or a manga's chapters, grouped in
 * volumes) are its episodes, so all the tracking, progress and "next up" logic applies as-is.
 */

const TTL = 12 * HOUR;
/** Listed volumes are out unless a later date is known: this date means "published, date unknown". */
export const PUBLISHED_UNKNOWN = '1900-01-01';

export const bookLanguage = (language: string): BookLanguage | undefined =>
	BOOK_LANGUAGES.find((l) => l.id === language.slice(0, 2))?.id;

// ---------- Book series (Wikidata + Open Library) ----------

interface SeriesBundle {
	info: SeriesInfo;
	volumes: [string, VolumeInfo][];
	overview: string | null;
	genres: string[];
}

async function seriesBundle(
	id: string,
	language: string,
	fresh = false
): Promise<SeriesBundle | null> {
	const lang = bookLanguage(language);
	return cached(
		`series:wikidata:${id}:${lang ?? 'any'}`,
		TTL,
		async () => {
			const info = await seriesDetails(id, lang ?? 'en');
			if (!info) return null;
			const works = info.members.map((m) => m.work).filter((w): w is string => !!w);
			const vols = await volumeInfo(works, lang).catch(() => new Map<string, VolumeInfo>());
			// The first book's synopsis and subjects describe the series well enough.
			const first = works[0]
				? await openlibrary
						.getTitle('book', works[0], { language: 'en', region: 'US' })
						.catch(() => null)
				: null;
			return {
				info,
				volumes: [...vols],
				overview: first?.overview ?? info.description,
				genres: first?.genres ?? []
			};
		},
		{ fresh }
	);
}

/** Integer positions are the main books; prequels, half-steps and unnumbered extras go to "Extras". */
function seriesEpisodes(bundle: SeriesBundle): Episode[] {
	const vols = new Map(bundle.volumes);
	let extra = 0;
	return bundle.info.members.map((m) => {
		const position = Number(m.ordinal);
		const main = m.ordinal !== null && Number.isInteger(position) && position > 0;
		const volume = m.work ? vols.get(m.work) : undefined;
		const published = m.published ?? (volume?.year ? `${volume.year}-01-01` : PUBLISHED_UNKNOWN);
		return {
			id: m.work ? `OL${m.work}W` : `Q${m.qid}`,
			seasonNumber: main ? 1 : 0,
			number: main ? position : ++extra,
			name: volume?.title ?? m.label,
			overview: null,
			airDate: published,
			still: volume?.cover ?? null,
			runtime: null,
			rating: null,
			pages: volume?.pages ?? null,
			work: m.work
		};
	});
}

export async function seriesTitle(
	id: string,
	language: string,
	fresh = false
): Promise<TitleDetails> {
	const bundle = await seriesBundle(id, language, fresh);
	if (!bundle) throw new ProviderError('Series not found', 'wikidata', 404);
	const list = seriesEpisodes(bundle);
	const main = list.filter((e) => e.seasonNumber === 1);
	const extras = list.filter((e) => e.seasonNumber === 0);
	const dates = list
		.map((e) => e.airDate!)
		.filter((d) => d !== PUBLISHED_UNKNOWN)
		.sort();
	return {
		ref: { provider: 'wikidata', kind: 'series', id },
		mediaType: 'bookseries',
		isAnime: false,
		name: bundle.info.name,
		originalName: null,
		tagline: null,
		overview: bundle.overview,
		poster: main[0]?.still ?? list[0]?.still ?? null,
		backdrop: null,
		logo: null,
		genres: bundle.genres,
		// A series counts as finished: reading every known book completes it, and a new book
		// (a later publication date) reopens it like a new episode.
		status: 'ended',
		startDate: dates[0] ?? null,
		endDate: null,
		runtime: null,
		pages: null,
		rating: null,
		certification: null,
		companies: [],
		authors: bundle.info.authors,
		cast: [],
		seasons: [
			...(main.length
				? [
						{
							number: 1,
							name: 'Books',
							episodeCount: main.length,
							airDate: dates[0] ?? null,
							poster: main[0]?.still ?? null
						}
					]
				: []),
			...(extras.length
				? [
						{
							number: 0,
							name: 'Extras',
							episodeCount: extras.length,
							airDate: null,
							poster: extras[0]?.still ?? null
						}
					]
				: [])
		],
		episodeCount: main.length,
		nextEpisode: null,
		lastEpisode: null,
		recommendations: [],
		trailerUrl: null,
		externalIds: { wikidata: `Q${id}`, lang: language.slice(0, 2) },
		sourceUrl: `https://www.wikidata.org/wiki/Q${id}`
	};
}

export async function seriesSeason(id: string, season: number, language: string): Promise<Season> {
	const bundle = await seriesBundle(id, language);
	if (!bundle) throw new ProviderError('Series not found', 'wikidata', 404);
	const list = seriesEpisodes(bundle).filter((e) => e.seasonNumber === season);
	return {
		number: season,
		name: season === 1 ? 'Books' : 'Extras',
		overview: null,
		airDate: list[0]?.airDate ?? null,
		poster: list[0]?.still ?? null,
		episodeCount: list.length,
		episodes: list
	};
}

// ---------- Manga (AniList + MangaDex) ----------

interface MangaBundle {
	details: RawMangaDetails;
	mangadexId: string | null;
	layout: VolumeLayout[];
	covers: [number, Image][];
}

async function mangaBundle(id: string, language: string, fresh = false): Promise<MangaBundle> {
	return cached(
		`manga:anilist:${id}:${language.slice(0, 2)}`,
		TTL,
		async () => {
			const details = await mangaDetails(id);
			let mangadexId: string | null = null;
			let chapters: MangaVolume[] = [];
			let covers = new Map<number, Image>();
			try {
				mangadexId = await findByAnilist(Number(id), [
					details.title.english ?? '',
					details.title.romaji ?? '',
					details.title.userPreferred
				]);
				if (mangadexId) {
					[chapters, covers] = await Promise.all([
						volumes(mangadexId),
						volumeCovers(mangadexId, language)
					]);
				}
			} catch (error) {
				// Volumes then come from AniList alone.
				console.warn(`[manga] MangaDex lookup for ${id} failed: ${String(error)}`);
			}
			const layout = layoutVolumes({
				anilistVolumes: details.volumes,
				anilistChapters: details.chapters,
				mangadex: chapters,
				coverVolumes: [...covers.keys()]
			});
			return { details, mangadexId, layout, covers: [...covers] };
		},
		{ fresh }
	);
}

/** Season number for a layout group: the volume, or (after the last volume) newer chapters. */
function seasonNumberOf(layout: VolumeLayout[], group: VolumeLayout): number {
	if (group.volume !== null) return group.volume;
	const lastVolume = Math.max(0, ...layout.map((g) => g.volume ?? 0));
	return lastVolume + 1;
}

function mangaSeasonName(group: VolumeLayout, hasVolumes: boolean): string {
	if (group.volume !== null) return `Volume ${group.volume}`;
	return hasVolumes ? 'Not in a volume yet' : 'Chapters';
}

export async function mangaTitleDetails(
	id: string,
	language: string,
	fresh = false
): Promise<TitleDetails> {
	const { details: m, mangadexId, layout, covers } = await mangaBundle(id, language, fresh);
	const coverOf = new Map(covers);
	const hasVolumes = layout.some((g) => g.volume !== null);
	const poster = m.coverImage.extraLarge ?? m.coverImage.large;
	const authors = [
		...new Set(
			m.staff.edges.filter((e) => /story|art|original/i.test(e.role)).map((e) => e.node.name.full)
		)
	].slice(0, 3);
	return {
		ref: { provider: 'anilist', kind: 'manga', id },
		mediaType: 'manga',
		isAnime: false,
		name: mangaTitle(m),
		originalName: m.title.native ?? m.title.romaji,
		tagline: null,
		overview: stripDescription(m.description),
		poster: poster ? { url: poster, color: m.coverImage.color } : null,
		backdrop: m.bannerImage ? { url: m.bannerImage } : null,
		logo: null,
		genres: m.genres,
		status: mapAnilistStatus(m.status),
		startDate: fuzzyDate(m.startDate),
		endDate: fuzzyDate(m.endDate),
		runtime: null,
		pages: null,
		rating: m.averageScore ? m.averageScore / 10 : null,
		certification: null,
		companies: [],
		authors,
		cast: [],
		seasons: layout.map((group) => ({
			number: seasonNumberOf(layout, group),
			name: mangaSeasonName(group, hasVolumes),
			episodeCount: group.chapters.length || 1,
			airDate: null,
			poster: (group.volume !== null ? coverOf.get(group.volume) : null) ?? null
		})),
		episodeCount: m.chapters ?? (layout.flatMap((g) => g.chapters).length || null),
		nextEpisode: null,
		lastEpisode: null,
		recommendations: [],
		trailerUrl: null,
		externalIds: {
			anilist: id,
			mal: m.idMal ? String(m.idMal) : undefined,
			mangadex: mangadexId ?? undefined,
			lang: language.slice(0, 2)
		},
		sourceUrl: `https://anilist.co/manga/${id}`
	};
}

export async function mangaSeason(id: string, season: number, language: string): Promise<Season> {
	const { details, layout, covers } = await mangaBundle(id, language);
	const group = layout.find((g) => seasonNumberOf(layout, g) === season);
	if (!group) throw new ProviderError('Volume not found', 'mangadex', 404);
	const hasVolumes = layout.some((g) => g.volume !== null);
	const published = fuzzyDate(details.startDate) ?? PUBLISHED_UNKNOWN;
	const cover = group.volume !== null ? (new Map(covers).get(group.volume) ?? null) : null;
	// A volume whose chapters are unknown is tracked as one unit (number 0).
	const units = group.chapters.length ? group.chapters : [0];
	return {
		number: season,
		name: mangaSeasonName(group, hasVolumes),
		overview: group.estimated ? 'Chapter numbers in this volume are estimated.' : null,
		airDate: null,
		poster: cover,
		episodeCount: units.length,
		episodes: units.map((chapter) => ({
			id: `${id}-${season}-${chapter}`,
			seasonNumber: season,
			number: chapter,
			name: chapter ? `Chapter ${chapter}` : `Volume ${group.volume}`,
			overview: null,
			airDate: published,
			still: null,
			runtime: null,
			rating: null
		}))
	};
}

// ---------- Hand-made collections (stored only in the database) ----------

/** A collection's details and its single season, read back from the database. */
export function collectionTitle(id: string): { details: TitleDetails; season: Season } | null {
	const db = getDb();
	const row = db
		.select()
		.from(titles)
		.where(
			and(eq(titles.provider, 'local'), eq(titles.kind, 'collection'), eq(titles.externalId, id))
		)
		.get();
	if (!row) return null;
	const list = db
		.select()
		.from(episodes)
		.where(eq(episodes.titleId, row.id))
		.orderBy(episodes.number)
		.all();
	const season: Season = {
		number: 1,
		name: 'Books',
		overview: null,
		airDate: null,
		poster: list[0]?.still ?? null,
		episodeCount: list.length,
		episodes: list.map((e) => ({
			id: e.externalId ? `OL${e.externalId}W` : String(e.id),
			seasonNumber: 1,
			number: e.number,
			name: e.name,
			overview: null,
			airDate: e.airDate,
			still: e.still ?? null,
			runtime: null,
			rating: null,
			pages: e.pages,
			work: e.externalId
		}))
	};
	return {
		details: {
			ref: { provider: 'local', kind: 'collection', id },
			mediaType: 'bookseries',
			isAnime: false,
			name: row.name,
			originalName: null,
			tagline: null,
			overview: row.overview,
			poster: row.poster ?? list[0]?.still ?? null,
			backdrop: null,
			logo: null,
			genres: row.genres,
			status: 'ended',
			startDate: row.startDate,
			endDate: null,
			runtime: null,
			pages: null,
			rating: null,
			certification: null,
			companies: [],
			authors: (row.externalIds.authors ?? '').split('|').filter(Boolean),
			cast: [],
			seasons: list.length
				? [
						{
							number: 1,
							name: 'Books',
							episodeCount: list.length,
							airDate: null,
							poster: list[0]?.still ?? null
						}
					]
				: [],
			episodeCount: list.length,
			nextEpisode: null,
			lastEpisode: null,
			recommendations: [],
			trailerUrl: null,
			externalIds: {},
			sourceUrl: null
		},
		season
	};
}
