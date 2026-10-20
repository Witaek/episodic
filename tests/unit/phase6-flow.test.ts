import { createServer, type Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Season, TitleDetails } from '../../src/lib/catalog/types';

const dataDir = mkdtempSync(join(tmpdir(), 'episodic-test-'));
process.env.DATA_DIR = dataDir;

const { runMigrations, closeDb } = await import('../../src/lib/server/db/client');
const { createUser } = await import('../../src/lib/server/auth');
const { storeTitle } = await import('../../src/lib/server/services/titles');
const library = await import('../../src/lib/server/services/library');
const tracking = await import('../../src/lib/server/services/tracking');
const { scheduleBetween } = await import('../../src/lib/server/services/upcoming');
const feed = await import('../../src/lib/server/services/calendar-feed');
const { watchStats } = await import('../../src/lib/server/services/stats');
const notifications = await import('../../src/lib/server/services/notifications');
const { localDateString } = await import('../../src/lib/server/services/progress');

const DAY = 86_400_000;
// Midday today: "aired yesterday at 09:00" is then always inside the 36-hour notification window,
// whatever time the tests run.
const now = new Date();
now.setHours(12, 0, 0, 0);
const day = (offset: number) => localDateString(new Date(now.getTime() + offset * DAY));

const details: TitleDetails = {
	ref: { provider: 'tmdb', kind: 'tv', id: '7' },
	mediaType: 'show',
	isAnime: false,
	name: 'Weekly Show',
	originalName: null,
	tagline: null,
	overview: null,
	poster: null,
	backdrop: null,
	logo: null,
	genres: ['Drama'],
	status: 'returning',
	startDate: day(-30),
	endDate: null,
	runtime: 50,
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
	externalIds: {},
	sourceUrl: null
};

const season: Season = {
	number: 1,
	name: 'Season 1',
	overview: null,
	airDate: day(-14),
	poster: null,
	episodeCount: 4,
	episodes: [-14, -7, -1, 6].map((offset, i) => ({
		id: `w${i + 1}`,
		seasonNumber: 1,
		number: i + 1,
		name: `Part ${i + 1}`,
		overview: null,
		airDate: day(offset),
		still: null,
		runtime: 50,
		rating: null
	}))
};

let userId: number;
let ntfy: Server;
let received: { topic: string; title: string; message: string }[] = [];

beforeAll(async () => {
	runMigrations();
	userId = await createUser({ username: 'watcher', password: 'password1', role: 'user' });
	ntfy = createServer((req, res) => {
		let body = '';
		req.on('data', (c) => (body += c));
		req.on('end', () => {
			received.push(JSON.parse(body));
			res.end('{}');
		});
	});
	await new Promise<void>((resolve) => ntfy.listen(0, resolve));
});

afterAll(() => {
	ntfy.close();
	closeDb();
	rmSync(dataDir, { recursive: true, force: true });
});

describe('schedule, feed, stats and notifications', () => {
	it('lists a date range with watched flags', () => {
		const title = storeTitle('tv', '7', details, [season]);
		library.setStatus(userId, title.id, 'in_progress');
		tracking.watch(userId, title, { type: 'episode', season: 1, number: 1 }, {});
		const items = scheduleBetween(userId, day(-20), day(10));
		expect(items.map((i) => [i.episode?.number, i.watched])).toEqual([
			[1, true],
			[2, false],
			[3, false],
			[4, false]
		]);
	});

	it('serves an iCal feed only for a valid token', () => {
		expect(feed.calendarFeed('nope')).toBeNull();
		const token = feed.resetCalendarToken(userId);
		const ics = feed.calendarFeed(token)!;
		expect(ics).toContain('SUMMARY:Weekly Show S01E04');
		expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(4);
		const next = feed.resetCalendarToken(userId);
		expect(feed.calendarFeed(token)).toBeNull();
		expect(feed.calendarFeed(next)).not.toBeNull();
		feed.disableCalendarFeed(userId);
		expect(feed.calendarFeed(next)).toBeNull();
	});

	it('computes stats', () => {
		const stats = watchStats(userId, 'all');
		expect(stats.totals).toMatchObject({ episodes: 1, movies: 0, minutes: 50, titles: 1 });
		expect(stats.genres).toEqual([{ genre: 'Drama', minutes: 50 }]);
		expect(stats.months).toHaveLength(12);
	});

	it('notifies once about newly aired, unwatched episodes of shows being watched', async () => {
		// Nothing without a target.
		expect(notifications.pendingNotifications(now)).toEqual([]);

		const port = (ntfy.address() as { port: number }).port;
		notifications.addTarget(userId, 'ntfy', 'ntfy · test', {
			url: `http://127.0.0.1:${port}/episodic-test`
		});

		// Episode 3 aired yesterday (09:00 local); episode 2 is outside the look-back window.
		const pending = notifications.pendingNotifications(now);
		expect(pending).toHaveLength(1);
		expect(pending[0].message).toMatchObject({
			title: 'New episode: Weekly Show',
			body: 'S01E03 · Part 3'
		});

		expect(await notifications.sendNewEpisodeNotifications(now)).toBe(
			'1 notification, 1 delivered'
		);
		expect(received).toEqual([
			expect.objectContaining({ topic: 'episodic-test', title: 'New episode: Weekly Show' })
		]);
		// Not twice.
		expect(notifications.pendingNotifications(now)).toEqual([]);
	});

	it('records failures on the target', async () => {
		const target = notifications.addTarget(userId, 'discord', 'Discord', {
			url: 'http://127.0.0.1:9/api/webhooks/1/x'
		});
		const ok = await notifications.sendToTarget(target, { title: 't', body: 'b', path: '/' });
		expect(ok).toBe(false);
		expect(notifications.getTarget(userId, target.id)?.lastError).toBeTruthy();
	});
});
