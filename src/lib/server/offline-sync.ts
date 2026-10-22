import { json, type RequestEvent } from '@sveltejs/kit';
import { and, eq, lt } from 'drizzle-orm';
import { getDb } from './db/client';
import { clientActions } from './db/schema';

/**
 * Offline tracking: a device keeps actions made without a connection and replays them later
 * (src/lib/offline). Each carries headers the server checks here:
 * - `x-episodic-action`: a unique id, so a replay that already went through isn't applied twice;
 * - `x-episodic-user`: who made it, so a shared device never applies one person's actions to
 *   whoever is signed in now;
 * - `x-episodic-time`: when it was made, for "most recent change wins" (page, status).
 */

export const ACTION_HEADER = 'x-episodic-action';
export const USER_HEADER = 'x-episodic-user';
export const TIME_HEADER = 'x-episodic-time';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Runs a replayed action at most once. Requests without an action id go through unchanged.
 */
export async function onceForReplay(
	event: RequestEvent,
	resolve: () => Response | Promise<Response>
): Promise<Response> {
	const actionId = event.request.headers.get(ACTION_HEADER);
	const user = event.locals.user;
	if (!actionId || !user || !MUTATING.has(event.request.method)) return resolve();
	if (actionId.length > 100) return json({ error: 'Invalid action id' }, { status: 400 });

	const madeBy = event.request.headers.get(USER_HEADER);
	if (madeBy && madeBy !== String(user.id)) {
		return json({ error: 'This change was made by another account' }, { status: 409 });
	}
	const db = getDb();
	const seen = db
		.select()
		.from(clientActions)
		.where(and(eq(clientActions.userId, user.id), eq(clientActions.actionId, actionId)))
		.get();
	if (seen) return json({ duplicate: true });

	const response = await resolve();
	if (response.ok) {
		db.insert(clientActions)
			.values({ userId: user.id, actionId, createdAt: new Date() })
			.onConflictDoNothing()
			.run();
	}
	return response;
}

/** When a replayed action was made on the device (never in the future), if given. */
export function clientTime(request: Request): Date | null {
	const value = request.headers.get(TIME_HEADER);
	if (!value) return null;
	const time = new Date(value);
	if (Number.isNaN(time.getTime())) return null;
	return time.getTime() > Date.now() ? new Date() : time;
}

/** Forgets replay ids after 30 days (daily cleanup job). */
export function purgeClientActions(now = Date.now()): number {
	return getDb()
		.delete(clientActions)
		.where(lt(clientActions.createdAt, new Date(now - 30 * 24 * 60 * 60 * 1000)))
		.run().changes;
}
