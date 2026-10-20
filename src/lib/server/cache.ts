import { eq, lt } from 'drizzle-orm';
import { getDb } from './db/client';
import { apiCache } from './db/schema';

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

const inFlight = new Map<string, Promise<unknown>>();

/**
 * Returns a cached value, or computes and stores it. Concurrent calls for the same key share
 * one computation. Falls back to the stale value when the refresh fails. `fresh` skips the
 * cached value (used by background refreshes) but still updates the cache.
 */
export async function cached<T>(
	key: string,
	ttlMs: number,
	compute: () => Promise<T>,
	{ fresh = false }: { fresh?: boolean } = {}
): Promise<T> {
	const db = getDb();
	const row = db.select().from(apiCache).where(eq(apiCache.key, key)).get();
	if (!fresh && row && row.expiresAt.getTime() > Date.now()) return JSON.parse(row.value) as T;

	const pending = inFlight.get(key) as Promise<T> | undefined;
	if (pending) return pending;

	const promise = compute()
		.then((value) => {
			const record = { value: JSON.stringify(value), expiresAt: new Date(Date.now() + ttlMs) };
			db.insert(apiCache)
				.values({ key, ...record })
				.onConflictDoUpdate({ target: apiCache.key, set: record })
				.run();
			return value;
		})
		.catch((error: unknown) => {
			if (row) {
				console.warn(`[cache] refresh failed for ${key}, serving stale value: ${String(error)}`);
				return JSON.parse(row.value) as T;
			}
			throw error;
		})
		.finally(() => inFlight.delete(key));

	inFlight.set(key, promise);
	return promise;
}

export function purgeExpiredCache(olderThanMs = 7 * DAY): number {
	return getDb()
		.delete(apiCache)
		.where(lt(apiCache.expiresAt, new Date(Date.now() - olderThanMs)))
		.run().changes;
}
