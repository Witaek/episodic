import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Season, TitleDetails } from '../../src/lib/catalog/types';

const dataDir = mkdtempSync(join(tmpdir(), 'episodic-test-'));
process.env.DATA_DIR = dataDir;

const { runMigrations, closeDb, getDb } = await import('../../src/lib/server/db/client');
const { episodes, titles } = await import('../../src/lib/server/db/schema');
const { createUser } = await import('../../src/lib/server/auth');
const { storeTitle } = await import('../../src/lib/server/services/titles');
const library = await import('../../src/lib/server/services/library');
const tracking = await import('../../src/lib/server/services/tracking');
const refresh = await import('../../src/lib/server/services/refresh');
const { upcoming } = await import('../../src/lib/server/services/upcoming');
const { listHistory } = await import('../../src/lib/server/services/history');
const { localDateString } = await import('../../src/lib/server/services/progress');
const { eq } = await import('drizzle-orm');

const DAY = 24 * 60 * 60 * 1000;
const now = new Date();
const dayOffset = (n: number) => localDateString(new Date(now.getTime() + n * DAY));

const details = (overrides: Partial<TitleDetails> = {}): TitleDetails => ({
	ref: { provider: 'tmdb', kind: 'tv', id: '1' },
	mediaType: 'show',
	isAnime: false,
	name: 'Airing Show',
	originalName: null,
	tagline: null,
	overview: null,
	poster: null,
	backdrop: null,
	logo: null,
	genres: [],
	status: 'returning',
	startDate: dayOffset(-60),
	endDate: null,
	runtime: 45,
	rating: null,
	certification: null,
	companies: [],
	cast: [],
	seasons: [],
	episodeCount: null,
	nextEpisode: null,
	lastEpisode: null,
	recommendations: [],
	trailerUrl: null,
	externalIds: { tmdb: '1' },
	sourceUrl: null,
	...overrides
});

const season = (number: number, dates: (string | null)[]): Season => ({
	number,
	name: `Season ${number}`,
	overview: null,
	airDate: dates[0],
	poster: null,
	episodeCount: dates.length,
	episodes: dates.map((airDate, i) => ({
		id: `${number}-${i + 1}`,
		seasonNumber: number,
		number: i + 1,
		name: `Episode ${i + 1}`,
		overview: null,
		airDate,
		still: null,
		runtime: 45,
		rating: null
	}))
});

let userId: number;

beforeAll(async () => {
	runMigrations();
	userId = await createUser({ username: 'viewer', password: 'password1', role: 'user' });
});

afterAll(() => {
	closeDb();
	rmSync(dataDir, { recursive: true, force: true });
});

describe('airing and refresh', () => {
	it('keeps exact air times across refreshes unless the date moves', () => {
		const title = storeTitle('tv', '1', details(), [
			season(1, [dayOffset(-14), dayOffset(-7), dayOffset(2)])
		]);
		getDb()
			.update(episodes)
			.set({ airAt: '2030-01-01T20:00:00.000Z' })
			.where(eq(episodes.titleId, title.id))
			.run();

		storeTitle('tv', '1', details(), [season(1, [dayOffset(-14), dayOffset(-7), dayOffset(2)])]);
		const kept = getDb().select().from(episodes).where(eq(episodes.titleId, title.id)).all();
		expect(kept.every((e) => e.airAt === '2030-01-01T20:00:00.000Z')).toBe(true);

		storeTitle('tv', '1', details(), [season(1, [dayOffset(-14), dayOffset(-7), dayOffset(3)])]);
		const moved = getDb().select().from(episodes).where(eq(episodes.titleId, title.id)).all();
		expect(moved.find((e) => e.number === 3)?.airAt).toBeNull();
		expect(moved.find((e) => e.number === 1)?.airAt).toBe('2030-01-01T20:00:00.000Z');

		// Reset for the next tests.
		getDb().update(episodes).set({ airAt: null }).where(eq(episodes.titleId, title.id)).run();
	});

	it('assigns refresh tiers', () => {
		const title = storeTitle('tv', '1', details(), [
			season(1, [dayOffset(-14), dayOffset(-7), dayOffset(3)])
		]);
		library.setStatus(userId, title.id, 'in_progress');
		const ended = storeTitle(
			'tv',
			'2',
			details({
				status: 'ended',
				name: 'Old Show',
				ref: { provider: 'tmdb', kind: 'tv', id: '2' }
			}),
			[season(1, ['2010-01-01', '2010-01-08'])]
		);
		library.setStatus(userId, ended.id, 'completed');

		expect(refresh.refreshOverview()).toEqual({ hot: 1, active: 0, settled: 1 });
		// Both were just stored, so nothing is due yet.
		expect(refresh.dueTitles(10)).toEqual([]);
		const later = new Date(now.getTime() + 7 * 60 * 60 * 1000);
		expect(refresh.dueTitles(10, later).map((d) => d.title.name)).toEqual(['Airing Show']);
	});

	it('counts episodes that aired since the last refresh and reopens completed shows', () => {
		const title = storeTitle('tv', '1', details(), [
			season(1, [dayOffset(-14), dayOffset(-7), dayOffset(3)])
		]);
		tracking.watch(userId, title, { type: 'all' }, {});
		library.setStatus(userId, title.id, 'completed');

		const since = new Date(now.getTime() - 2 * DAY);
		const inFourDays = new Date(now.getTime() + 4 * DAY);
		expect(refresh.newlyAired(title.id, since, now)).toBe(0);
		expect(refresh.newlyAired(title.id, since, inFourDays)).toBe(1);

		// The status rule used after a refresh: a completed show with an unwatched aired episode.
		storeTitle('tv', '1', details(), [season(1, [dayOffset(-14), dayOffset(-7), dayOffset(-1)])]);
		tracking.applyAutoStatus(userId, title, {}, 'refresh');
		expect(library.getEntry(userId, title.id)?.status).toBe('in_progress');
	});

	it('lists upcoming episodes and announced seasons', () => {
		const title = storeTitle('tv', '1', details(), [
			season(1, [dayOffset(-14), dayOffset(-7), dayOffset(-1)]),
			season(2, [dayOffset(5), dayOffset(12)]),
			season(3, [null])
		]);
		const { items, announced } = upcoming(userId, { now });
		expect(
			items
				.filter((i) => i.titleId === title.id)
				.map((i) => `${i.episode?.seasonNumber}x${i.episode?.number}`)
		).toEqual(['2x1', '2x2']);
		expect(announced).toEqual([]);

		// Once season 2 has aired, season 3 (no date yet) is "coming later".
		storeTitle('tv', '1', details(), [
			season(2, [dayOffset(-10), dayOffset(-3)]),
			season(3, [null])
		]);
		expect(upcoming(userId, { now }).announced).toMatchObject([{ seasonNumber: 3, airDate: null }]);
	});

	it('paginates history newest first', () => {
		const [title] = getDb().select().from(titles).where(eq(titles.externalId, '1')).all();
		tracking.unwatch(userId, title, { type: 'all' }, {});
		for (let i = 0; i < 5; i++) {
			tracking.watch(
				userId,
				title,
				{ type: 'episode', season: 1, number: 1 },
				{},
				{
					rewatch: true,
					watchedAt: new Date(now.getTime() - i * DAY)
				}
			);
		}
		const first = listHistory(userId, { limit: 2 });
		expect(first.items).toHaveLength(2);
		expect(first.nextCursor).not.toBeNull();
		const second = listHistory(userId, { limit: 2, cursor: first.nextCursor });
		expect(second.items[0].occurredAt < first.items[1].occurredAt).toBe(true);
		const all = listHistory(userId, { limit: 100 });
		expect(new Set(all.items.map((i) => i.eventId)).size).toBe(all.items.length);
		expect(listHistory(userId, { type: 'movie' }).items).toEqual([]);
	});
});
