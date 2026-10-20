import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Season, TitleDetails } from '../../src/lib/catalog/types';

// Each test file runs in its own module scope, so this database is private to this file.
const dataDir = mkdtempSync(join(tmpdir(), 'episodic-test-'));
process.env.DATA_DIR = dataDir;

const { runMigrations, closeDb } = await import('../../src/lib/server/db/client');
const { createUser } = await import('../../src/lib/server/auth');
const { storeTitle } = await import('../../src/lib/server/services/titles');
const library = await import('../../src/lib/server/services/library');
const tracking = await import('../../src/lib/server/services/tracking');

const details = (overrides: Partial<TitleDetails> = {}): TitleDetails => ({
	ref: { provider: 'tmdb', kind: 'tv', id: '100' },
	mediaType: 'show',
	isAnime: false,
	name: 'Test Show',
	originalName: null,
	tagline: null,
	overview: null,
	poster: null,
	backdrop: null,
	logo: null,
	genres: [],
	status: 'ended',
	startDate: '2020-01-01',
	endDate: '2020-02-01',
	runtime: 30,
	rating: null,
	certification: null,
	companies: [],
	cast: [],
	seasons: [],
	episodeCount: 4,
	nextEpisode: null,
	lastEpisode: null,
	recommendations: [],
	trailerUrl: null,
	externalIds: {},
	sourceUrl: null,
	...overrides
});

const season = (number: number, count: number): Season => ({
	number,
	name: `Season ${number}`,
	overview: null,
	airDate: '2020-01-01',
	poster: null,
	episodeCount: count,
	episodes: Array.from({ length: count }, (_, i) => ({
		id: `${number}-${i + 1}`,
		seasonNumber: number,
		number: i + 1,
		name: `Episode ${i + 1}`,
		overview: null,
		airDate: `2020-01-0${i + 1}`,
		still: null,
		runtime: 30,
		rating: null
	}))
});

let alice: number;
let bob: number;

beforeAll(async () => {
	runMigrations();
	alice = await createUser({ username: 'alice', password: 'password1', role: 'admin' });
	bob = await createUser({ username: 'bob', password: 'password2', role: 'user' });
});

afterAll(() => {
	closeDb();
	rmSync(dataDir, { recursive: true, force: true });
});

describe('tracking flow', () => {
	const prefs = {};

	it('marks episodes, moves to Watching, then Completed when an ended show is finished', () => {
		const title = storeTitle('tv', '100', details(), [season(1, 2), season(2, 2)]);
		library.setStatus(alice, title.id, 'planned');

		const first = tracking.watch(alice, title, { type: 'episode', season: 1, number: 1 }, prefs);
		expect(first.eventIds).toHaveLength(1);
		let state = library.getUserTitleState(alice, title, prefs);
		expect(state.status).toBe('in_progress');
		expect(state.progress?.nextUp).toMatchObject({ seasonNumber: 1, number: 2 });

		// Marking S2E1 reports the gap at S1E2.
		const jump = tracking.watch(alice, title, { type: 'episode', season: 2, number: 1 }, prefs);
		expect(jump.earlierUnwatched).toBe(1);

		tracking.watch(alice, title, { type: 'all' }, prefs);
		state = library.getUserTitleState(alice, title, prefs);
		expect(state.progress?.percent).toBe(100);
		expect(state.status).toBe('completed');

		// Undo the last bulk mark → back to Watching.
		tracking.unwatch(alice, title, { type: 'episode', season: 2, number: 2 }, prefs);
		expect(library.getUserTitleState(alice, title, prefs).status).toBe('in_progress');
	});

	it('keeps rewatches as extra plays and unwatch removes the latest one', () => {
		const title = storeTitle('tv', '100', details(), [season(1, 2), season(2, 2)]);
		tracking.watch(alice, title, { type: 'episode', season: 1, number: 1 }, prefs, {
			rewatch: true
		});
		expect(library.getUserTitleState(alice, title, prefs).watched['1-1']).toBe(2);
		tracking.unwatch(alice, title, { type: 'episode', season: 1, number: 1 }, prefs);
		expect(library.getUserTitleState(alice, title, prefs).watched['1-1']).toBe(1);
	});

	it('undo deletes exactly the given events', () => {
		const title = storeTitle('tv', '100', details(), [season(1, 2), season(2, 2)]);
		tracking.unwatch(alice, title, { type: 'all' }, prefs);
		const result = tracking.watch(alice, title, { type: 'season', season: 1 }, prefs);
		expect(result.eventIds).toHaveLength(2);
		expect(tracking.deleteEvents(alice, result.eventIds)).toEqual([title.id]);
		expect(library.getUserTitleState(alice, title, prefs).watched).toEqual({});
	});

	it('keeps users apart', () => {
		const title = storeTitle('tv', '100', details(), [season(1, 2), season(2, 2)]);
		tracking.watch(alice, title, { type: 'season', season: 1 }, prefs);
		expect(library.getUserTitleState(bob, title, prefs)).toMatchObject({
			status: null,
			watched: {}
		});
		expect(tracking.deleteEvents(bob, [1, 2, 3])).toEqual([]);
		expect(library.listLibrary(bob, prefs)).toEqual([]);
	});

	it('completes movies and returns them to the watchlist when unwatched', () => {
		const movie = storeTitle(
			'movie',
			'550',
			details({ mediaType: 'movie', ref: { provider: 'tmdb', kind: 'movie', id: '550' } }),
			[]
		);
		tracking.watch(bob, movie, { type: 'movie' }, prefs);
		expect(library.getUserTitleState(bob, movie, prefs)).toMatchObject({
			status: 'completed',
			watched: { movie: 1 }
		});
		tracking.unwatch(bob, movie, { type: 'movie' }, prefs);
		expect(library.getUserTitleState(bob, movie, prefs).status).toBe('planned');
	});

	it('keeps episode ids stable across refreshes', () => {
		const before = storeTitle('tv', '100', details(), [season(1, 2), season(2, 2)]);
		const state = library.getUserTitleState(alice, before, prefs);
		const after = storeTitle('tv', '100', details({ name: 'Renamed' }), [
			season(1, 2),
			season(2, 3)
		]);
		expect(after.id).toBe(before.id);
		expect(after.name).toBe('Renamed');
		expect(library.getUserTitleState(alice, after, prefs).watched).toEqual(state.watched);
	});
});
