import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const dataDir = mkdtempSync(join(tmpdir(), 'episodic-test-'));
process.env.DATA_DIR = dataDir;

const { runMigrations, closeDb, getDb } = await import('../../src/lib/server/db/client');
const { apiCache } = await import('../../src/lib/server/db/schema');
const { cached } = await import('../../src/lib/server/cache');
const { eq } = await import('drizzle-orm');

beforeAll(() => runMigrations());
afterAll(() => {
	closeDb();
	rmSync(dataDir, { recursive: true, force: true });
});

const expire = (key: string, agoMs: number) =>
	getDb()
		.update(apiCache)
		.set({ expiresAt: new Date(Date.now() - agoMs) })
		.where(eq(apiCache.key, key))
		.run();

describe('cached (stale-while-revalidate)', () => {
	it('computes once, then serves from cache', async () => {
		let calls = 0;
		const compute = async () => ++calls;
		expect(await cached('a', 60_000, compute)).toBe(1);
		expect(await cached('a', 60_000, compute)).toBe(1);
		expect(calls).toBe(1);
	});

	it('serves an expired value immediately and refreshes it in the background', async () => {
		await cached('b', 60_000, async () => 'old');
		expire('b', 1000);
		let release!: () => void;
		const slow = () => new Promise<string>((resolve) => (release = () => resolve('new')));
		// Returns the old value without waiting for the slow refresh.
		expect(await cached('b', 60_000, slow)).toBe('old');
		release();
		await new Promise((r) => setTimeout(r, 10));
		expect(await cached('b', 60_000, async () => 'unused')).toBe('new');
	});

	it('waits for a new value when the entry is far too old, or when fresh is asked', async () => {
		await cached('c', 60_000, async () => 'old');
		expire('c', 8 * 24 * 60 * 60 * 1000);
		expect(await cached('c', 60_000, async () => 'new')).toBe('new');
		expect(await cached('c', 60_000, async () => 'newer', { fresh: true })).toBe('newer');
	});

	it('keeps serving the stale value if the provider fails', async () => {
		await cached('d', 60_000, async () => 'kept');
		expire('d', 8 * 24 * 60 * 60 * 1000);
		expect(
			await cached('d', 60_000, async () => {
				throw new Error('down');
			})
		).toBe('kept');
	});
});
