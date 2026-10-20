import { and, eq } from 'drizzle-orm';
import type { ProviderId, Season, TitleDetails, TitleKind } from '$lib/catalog/types';
import { getDb } from '../db/client';
import { episodes, seasons, titles } from '../db/schema';
import { getSeason, getTitle } from './catalog';

/**
 * Local copies of titles that are in someone's library or history. Episode rows keep stable ids
 * across refreshes (upsert by season + number), so watch history always points at them.
 */

export type TitleRow = typeof titles.$inferSelect;

export function providerFor(kind: TitleKind): ProviderId {
	return kind === 'anime' ? 'anilist' : 'tmdb';
}

export function findTitle(kind: TitleKind, externalId: string): TitleRow | undefined {
	return getDb()
		.select()
		.from(titles)
		.where(
			and(
				eq(titles.provider, providerFor(kind)),
				eq(titles.kind, kind),
				eq(titles.externalId, externalId)
			)
		)
		.get();
}

export function getTitleRow(id: number): TitleRow | undefined {
	return getDb().select().from(titles).where(eq(titles.id, id)).get();
}

/** Returns the stored title, fetching and storing it first if needed. */
export async function ensureTitle(kind: TitleKind, externalId: string): Promise<TitleRow> {
	return findTitle(kind, externalId) ?? (await syncTitle(kind, externalId));
}

/** Fetches a title (and all its seasons) from its provider and stores it. */
export async function syncTitle(
	kind: TitleKind,
	externalId: string,
	{ fresh = false }: { fresh?: boolean } = {}
): Promise<TitleRow> {
	const lookup = await getTitle(kind, externalId, undefined, { fresh });
	if ('redirect' in lookup)
		throw new Error(`${kind}/${externalId} is tracked as ${lookup.redirect}`);
	const details = lookup.title;

	const fetchedSeasons: Season[] =
		details.mediaType === 'movie'
			? []
			: await Promise.all(
					details.seasons.map((s) => getSeason(kind, externalId, s.number, undefined, { fresh }))
				);

	return storeTitle(kind, externalId, details, fetchedSeasons);
}

export function storeTitle(
	kind: TitleKind,
	externalId: string,
	details: TitleDetails,
	fetchedSeasons: Season[]
): TitleRow {
	const db = getDb();
	const values = {
		provider: providerFor(kind),
		kind,
		externalId,
		mediaType: details.mediaType,
		isAnime: details.isAnime,
		name: details.name,
		originalName: details.originalName,
		overview: details.overview,
		poster: details.poster,
		backdrop: details.backdrop,
		logo: details.logo,
		genres: details.genres,
		status: details.status,
		startDate: details.startDate,
		endDate: details.endDate,
		runtime: details.runtime,
		rating: details.rating,
		externalIds: details.externalIds,
		refreshedAt: new Date()
	};

	return db.transaction((tx) => {
		const row = tx
			.insert(titles)
			.values(values)
			.onConflictDoUpdate({
				target: [titles.provider, titles.kind, titles.externalId],
				set: values
			})
			.returning()
			.get();

		for (const season of fetchedSeasons) {
			const seasonValues = {
				titleId: row.id,
				number: season.number,
				name: season.name,
				overview: season.overview,
				poster: season.poster,
				airDate: season.airDate,
				episodeCount: season.episodes.length
			};
			tx.insert(seasons)
				.values(seasonValues)
				.onConflictDoUpdate({ target: [seasons.titleId, seasons.number], set: seasonValues })
				.run();

			for (const episode of season.episodes) {
				const episodeValues = {
					titleId: row.id,
					seasonNumber: episode.seasonNumber,
					number: episode.number,
					name: episode.name,
					overview: episode.overview,
					still: episode.still,
					airDate: episode.airDate,
					airAt: episode.airAt ?? null,
					runtime: episode.runtime ?? details.runtime,
					externalId: episode.id
				};
				tx.insert(episodes)
					.values(episodeValues)
					.onConflictDoUpdate({
						target: [episodes.titleId, episodes.seasonNumber, episodes.number],
						set: episodeValues
					})
					.run();
			}
		}
		return row;
	});
}

export function titleEpisodes(titleId: number) {
	return getDb().select().from(episodes).where(eq(episodes.titleId, titleId)).all();
}
