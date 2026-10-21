import { eq, lt } from 'drizzle-orm';
import { getDb } from './db/client';
import { apiCache } from './db/schema';

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** Expired entries stay usable this long (served while refreshing, or when a provider is down). */
const STALE_FOR = 7 * DAY;

const inFlight = new Map<string, Promise<unknown>>();

export interface CacheOptions {
	/** Skip the cached value and wait for a new one (background refreshes, storing a title). */
	fresh?: boolean;
}

/**
 * Returns a cached value, or computes and stores it. Concurrent calls for the same key share one
 * computation.
 *
 * Stale-while-revalidate: once an entry has expired, the old value is still returned straight
 * away while a new one is fetched in the background, so pages never wait on TMDB/AniList/Open
 * Library for something they've shown before. Only a first visit (nothing cached) or `fresh`
 * waits. If the refresh fails, the stale value keeps being served.
 */
export async function cached<T>(
	key: string,
	ttlMs: number,
	compute: () => Promise<T>,
	{ fresh = false }: CacheOptions = {}
): Promise<T> {
	const db = getDb();
	const row = db.select().from(apiCache).where(eq(apiCache.key, key)).get();
	const now = Date.now();

	if (!fresh && row) {
		const expiresAt = row.expiresAt.getTime();
		if (expiresAt > now) return JSON.parse(row.value) as T;
		if (expiresAt + STALE_FOR > now) {
			// Serve the old copy now; refresh in the background.
			void revalidate(key, ttlMs, compute).catch(() => {});
			return JSON.parse(row.value) as T;
		}
	}

	return revalidate(key, ttlMs, compute).catch((error: unknown) => {
		if (row) {
			console.warn(`[cache] refresh failed for ${key}, serving stale value: ${String(error)}`);
			return JSON.parse(row.value) as T;
		}
		throw error;
	});
}

/** Computes and stores a value; concurrent callers share one computation. */
function revalidate<T>(key: string, ttlMs: number, compute: () => Promise<T>): Promise<T> {
	const pending = inFlight.get(key) as Promise<T> | undefined;
	if (pending) return pending;

	const promise = compute()
		.then((value) => {
			const record = { value: JSON.stringify(value), expiresAt: new Date(Date.now() + ttlMs) };
			getDb()
				.insert(apiCache)
				.values({ key, ...record })
				.onConflictDoUpdate({ target: apiCache.key, set: record })
				.run();
			return value;
		})
		.finally(() => inFlight.delete(key));

	inFlight.set(key, promise);
	return promise;
}

export function purgeExpiredCache(olderThanMs = STALE_FOR): number {
	return getDb()
		.delete(apiCache)
		.where(lt(apiCache.expiresAt, new Date(Date.now() - olderThanMs)))
		.run().changes;
}
