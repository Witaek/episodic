import { existsSync, mkdtempSync, rmSync, utimesSync } from 'node:fs';
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
const backup = await import('../../src/lib/server/services/backup');
const portability = await import('../../src/lib/server/services/portability');

const details = (id: string, mediaType: 'show' | 'movie' = 'show'): TitleDetails => ({
	ref: { provider: 'tmdb', kind: mediaType === 'movie' ? 'movie' : 'tv', id },
	mediaType,
	isAnime: false,
	name: `Title ${id}`,
	originalName: null,
	tagline: null,
	overview: null,
	poster: null,
	backdrop: null,
	logo: null,
	genres: [],
	status: 'ended',
	startDate: '2020-01-01',
	endDate: null,
	runtime: 30,
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
});

const season: Season = {
	number: 1,
	name: 'Season 1',
	overview: null,
	airDate: '2020-01-01',
	poster: null,
	episodeCount: 3,
	episodes: [1, 2, 3].map((n) => ({
		id: `e${n}`,
		seasonNumber: 1,
		number: n,
		name: null,
		overview: null,
		airDate: `2020-01-0${n}`,
		still: null,
		runtime: 30,
		rating: null
	}))
};

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

describe('backups', () => {
	it('creates a usable copy and prunes old automatic ones', async () => {
		const first = await backup.createBackup();
		expect(existsSync(join(dataDir, 'backups', first.name))).toBe(true);
		const manual = await backup.createBackup({ manual: true });
		expect(manual.manual).toBe(true);

		// Age both by 30 days, then add a fresh one.
		const old = Date.now() / 1000 - 30 * 86400;
		for (const b of [first, manual]) utimesSync(join(dataDir, 'backups', b.name), old, old);
		await new Promise((r) => setTimeout(r, 1100)); // names have second precision
		await backup.createBackup();

		expect(backup.pruneBackups(14)).toBe(1);
		const names = backup.listBackups().map((b) => b.name);
		expect(names).toContain(manual.name);
		expect(names).not.toContain(first.name);
	});

	it('rejects unexpected file names', () => {
		expect(backup.backupPath('../episodic.db')).toBeNull();
		expect(backup.deleteBackup('episodic.db')).toBe(false);
	});
});

describe('export and restore', () => {
	it('round-trips library and history into another account without duplicates', async () => {
		const show = storeTitle('tv', '10', details('10'), [season]);
		const movie = storeTitle('movie', '20', details('20', 'movie'), []);
		library.setStatus(alice, show.id, 'in_progress');
		tracking.watch(alice, show, { type: 'upTo', season: 1, number: 2 }, {});
		tracking.watch(alice, movie, { type: 'movie' }, {});

		const data = portability.exportUserData(alice);
		expect(portability.exportSchema.safeParse(JSON.parse(JSON.stringify(data))).success).toBe(true);
		expect(data.library).toHaveLength(2);
		expect(data.activity).toHaveLength(3);

		const jobId = portability.startImport(bob, data);
		await expect.poll(() => portability.getImportJob(bob, jobId)?.status).toBe('done');
		expect(portability.getImportJob(bob, jobId)).toMatchObject({
			addedEntries: 2,
			addedEvents: 3,
			skipped: []
		});

		const state = library.getUserTitleState(bob, show, {});
		expect(state.status).toBe('in_progress');
		expect(state.watched).toEqual({ '1-1': 1, '1-2': 1 });
		expect(library.getUserTitleState(bob, movie, {}).watched).toEqual({ movie: 1 });

		// Restoring the same file again adds nothing.
		const again = portability.startImport(bob, data);
		await expect.poll(() => portability.getImportJob(bob, again)?.status).toBe('done');
		expect(portability.getImportJob(bob, again)?.addedEvents).toBe(0);
		expect(portability.getImportJob(alice, again)).toBeUndefined();
	});
});

describe('automatic statuses preference', () => {
	it('leaves statuses alone when turned off', () => {
		const show = storeTitle('tv', '30', details('30'), [season]);
		library.setStatus(alice, show.id, 'planned');
		tracking.watch(alice, show, { type: 'all' }, { autoStatus: false });
		expect(library.getEntry(alice, show.id)?.status).toBe('planned');

		const other = storeTitle('tv', '31', details('31'), [season]);
		tracking.watch(alice, other, { type: 'episode', season: 1, number: 1 }, { autoStatus: false });
		expect(library.getEntry(alice, other.id)?.status).toBe('in_progress');
	});
});
