import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import webpush from 'web-push';
import { titleHref } from '$lib/catalog/types';
import { formatEpisodeCode } from '$lib/media-types/types';
import { config } from '../config';
import { getDb } from '../db/client';
import {
	appMeta,
	episodes,
	libraryEntries,
	notificationTargets,
	notificationsSent,
	titles,
	users,
	type NotificationTargetConfig,
	type NotificationTargetType
} from '../db/schema';
import { localDateString, watchCounts } from './progress';

export type NotificationTarget = typeof notificationTargets.$inferSelect;

export interface NotificationMessage {
	title: string;
	body: string;
	/** Path inside the app, e.g. /title/tv/1399?season=2 */
	path: string;
	/** Collapses repeated notifications for the same show on the device. */
	tag?: string;
}

// ---------- Web Push keys ----------

const VAPID_PUBLIC = 'vapid_public_key';
const VAPID_PRIVATE = 'vapid_private_key';

/** The server's Web Push key pair, created on first use and kept in the database. */
export function vapidKeys(): { publicKey: string; privateKey: string } {
	const db = getDb();
	const get = (key: string) => db.select().from(appMeta).where(eq(appMeta.key, key)).get()?.value;
	const publicKey = get(VAPID_PUBLIC);
	const privateKey = get(VAPID_PRIVATE);
	if (publicKey && privateKey) return { publicKey, privateKey };

	const keys = webpush.generateVAPIDKeys();
	db.insert(appMeta)
		.values({ key: VAPID_PUBLIC, value: keys.publicKey })
		.onConflictDoNothing()
		.run();
	db.insert(appMeta)
		.values({ key: VAPID_PRIVATE, value: keys.privateKey })
		.onConflictDoNothing()
		.run();
	return vapidKeys();
}

// ---------- Delivery ----------

function absolute(path: string): string | undefined {
	const base = config().APP_URL?.replace(/\/$/, '');
	return base ? `${base}${path}` : undefined;
}

class GoneError extends Error {}

async function post(url: string, body: unknown, headers: Record<string, string> = {}) {
	const response = await fetch(url, {
		method: 'POST',
		headers: { 'content-type': 'application/json', ...headers },
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(10_000)
	});
	if (!response.ok) {
		const text = await response.text().catch(() => '');
		throw new Error(`HTTP ${response.status}${text ? `: ${text.slice(0, 120)}` : ''}`);
	}
}

async function deliver(target: NotificationTarget, message: NotificationMessage): Promise<void> {
	const { subscription, url, token } = target.config;
	switch (target.type) {
		case 'webpush': {
			if (!subscription) throw new Error('Missing subscription');
			const { publicKey, privateKey } = vapidKeys();
			try {
				await webpush.sendNotification(subscription, JSON.stringify(message), {
					TTL: 24 * 60 * 60,
					vapidDetails: {
						subject: config().APP_URL?.startsWith('https://')
							? config().APP_URL!
							: 'https://github.com/Witaek/episodic',
						publicKey,
						privateKey
					}
				});
			} catch (error) {
				const status = (error as { statusCode?: number }).statusCode;
				if (status === 404 || status === 410) throw new GoneError('Subscription expired');
				throw error;
			}
			return;
		}
		case 'ntfy': {
			// JSON publishing (POST to the server root) keeps titles with accents intact.
			const topicUrl = new URL(url!);
			const topic = topicUrl.pathname.replace(/^\/+|\/+$/g, '');
			await post(
				topicUrl.origin,
				{
					topic,
					title: message.title,
					message: message.body,
					click: absolute(message.path),
					tags: ['tv']
				},
				token ? { authorization: `Bearer ${token}` } : {}
			);
			return;
		}
		case 'discord': {
			await post(url!, {
				username: 'Episodic',
				embeds: [
					{
						title: message.title,
						description: message.body,
						url: absolute(message.path),
						color: 0x8b7cff
					}
				]
			});
			return;
		}
	}
}

/** Sends to one target and records the outcome. Expired push subscriptions are removed. */
export async function sendToTarget(
	target: NotificationTarget,
	message: NotificationMessage
): Promise<boolean> {
	const db = getDb();
	try {
		await deliver(target, message);
		db.update(notificationTargets)
			.set({ lastSentAt: new Date(), lastError: null })
			.where(eq(notificationTargets.id, target.id))
			.run();
		return true;
	} catch (error) {
		if (error instanceof GoneError) {
			db.delete(notificationTargets).where(eq(notificationTargets.id, target.id)).run();
		} else {
			db.update(notificationTargets)
				.set({ lastError: error instanceof Error ? error.message : String(error) })
				.where(eq(notificationTargets.id, target.id))
				.run();
		}
		return false;
	}
}

// ---------- Targets ----------

export function listTargets(userId: number): NotificationTarget[] {
	return getDb()
		.select()
		.from(notificationTargets)
		.where(eq(notificationTargets.userId, userId))
		.all();
}

export function addTarget(
	userId: number,
	type: NotificationTargetType,
	label: string,
	targetConfig: NotificationTargetConfig
): NotificationTarget {
	const db = getDb();
	// One row per push subscription (re-enabling on the same device updates it).
	if (type === 'webpush' && targetConfig.subscription) {
		const existing = listTargets(userId).find(
			(t) =>
				t.type === 'webpush' &&
				t.config.subscription?.endpoint === targetConfig.subscription!.endpoint
		);
		if (existing) {
			return db
				.update(notificationTargets)
				.set({ label, config: targetConfig, enabled: true, lastError: null })
				.where(eq(notificationTargets.id, existing.id))
				.returning()
				.get();
		}
	}
	return db
		.insert(notificationTargets)
		.values({ userId, type, label, config: targetConfig })
		.returning()
		.get();
}

export function removeTarget(userId: number, id: number): boolean {
	return (
		getDb()
			.delete(notificationTargets)
			.where(and(eq(notificationTargets.id, id), eq(notificationTargets.userId, userId)))
			.run().changes > 0
	);
}

export function getTarget(userId: number, id: number): NotificationTarget | undefined {
	return getDb()
		.select()
		.from(notificationTargets)
		.where(and(eq(notificationTargets.id, id), eq(notificationTargets.userId, userId)))
		.get();
}

// ---------- New-episode notifications ----------

const HOUR = 60 * 60 * 1000;
/** Episodes without an exact time are announced at 09:00 on their air date. */
const DATE_ONLY_HOUR = 9;
/** Only episodes that aired recently; avoids a flood after downtime or first setup. */
const LOOKBACK = 36 * HOUR;

export function notifyAt(episode: { airDate: string | null; airAt: string | null }): Date | null {
	if (episode.airAt) return new Date(episode.airAt);
	if (!episode.airDate) return null;
	const [y, m, d] = episode.airDate.split('-').map(Number);
	return new Date(y, m - 1, d, DATE_ONLY_HOUR);
}

export interface PendingNotification {
	userId: number;
	titleId: number;
	message: NotificationMessage;
	episodeIds: number[];
}

/** Newly aired, unwatched, not-yet-notified episodes of shows people follow, grouped per show. */
export function pendingNotifications(now = new Date()): PendingNotification[] {
	const db = getDb();
	const recipients = db
		.selectDistinct({ userId: notificationTargets.userId })
		.from(notificationTargets)
		.where(eq(notificationTargets.enabled, true))
		.all()
		.map((r) => r.userId);
	if (recipients.length === 0) return [];

	const from = localDateString(new Date(now.getTime() - LOOKBACK - 24 * HOUR));
	const to = localDateString(new Date(now.getTime() + 24 * HOUR));
	const result: PendingNotification[] = [];

	for (const userId of recipients) {
		const user = db
			.select({ prefs: users.prefs, disabled: users.disabled })
			.from(users)
			.where(eq(users.id, userId))
			.get();
		if (!user || user.disabled) continue;
		const statuses = user.prefs.notifyWatchlist ? ['in_progress', 'planned'] : ['in_progress'];

		const rows = db
			.select({ episode: episodes, title: titles })
			.from(episodes)
			.innerJoin(titles, eq(titles.id, episodes.titleId))
			.innerJoin(
				libraryEntries,
				and(eq(libraryEntries.titleId, titles.id), eq(libraryEntries.userId, userId))
			)
			.where(
				and(
					inArray(libraryEntries.status, statuses as ('in_progress' | 'planned')[]),
					gte(episodes.airDate, from),
					lte(episodes.airDate, to)
				)
			)
			.all()
			.filter(({ episode }) => {
				const at = notifyAt(episode);
				return (
					episode.seasonNumber > 0 && at && at <= now && now.getTime() - at.getTime() <= LOOKBACK
				);
			});
		if (rows.length === 0) continue;

		const sent = new Set(
			db
				.select({ episodeId: notificationsSent.episodeId })
				.from(notificationsSent)
				.where(
					and(
						eq(notificationsSent.userId, userId),
						inArray(
							notificationsSent.episodeId,
							rows.map((r) => r.episode.id)
						)
					)
				)
				.all()
				.map((r) => r.episodeId)
		);
		const watched = watchCounts(userId, [...new Set(rows.map((r) => r.title.id))]);

		const byTitle = new Map<number, typeof rows>();
		for (const row of rows) {
			if (sent.has(row.episode.id) || watched.has(row.episode.id)) continue;
			byTitle.set(row.title.id, [...(byTitle.get(row.title.id) ?? []), row]);
		}

		for (const [titleId, list] of byTitle) {
			list.sort(
				(a, b) =>
					a.episode.seasonNumber - b.episode.seasonNumber || a.episode.number - b.episode.number
			);
			const { title } = list[0];
			const first = list[0].episode;
			const last = list.at(-1)!.episode;
			const code = (e: typeof first) =>
				formatEpisodeCode({ season: e.seasonNumber, number: e.number });
			const message: NotificationMessage =
				list.length === 1
					? {
							title: `New episode: ${title.name}`,
							body: first.name ? `${code(first)} · ${first.name}` : `${code(first)} is out`,
							path: titleHref({ kind: title.kind, id: title.externalId }, first.seasonNumber),
							tag: `title-${titleId}`
						}
					: {
							title: `${list.length} new episodes: ${title.name}`,
							body: `${code(first)} to ${code(last)} are out`,
							path: titleHref({ kind: title.kind, id: title.externalId }, first.seasonNumber),
							tag: `title-${titleId}`
						};
			result.push({ userId, titleId, message, episodeIds: list.map((r) => r.episode.id) });
		}
	}
	return result;
}

/** The scheduled job: sends pending notifications and remembers them. */
export async function sendNewEpisodeNotifications(now = new Date()): Promise<string> {
	const pending = pendingNotifications(now);
	if (pending.length === 0) return 'nothing new';
	const db = getDb();
	let delivered = 0;
	for (const item of pending) {
		const targets = listTargets(item.userId).filter((t) => t.enabled);
		const results = await Promise.all(targets.map((t) => sendToTarget(t, item.message)));
		delivered += results.filter(Boolean).length;
		// Recorded even if a target failed: retrying would repeat it on the targets that worked.
		for (const episodeId of item.episodeIds) {
			db.insert(notificationsSent)
				.values({ userId: item.userId, episodeId, sentAt: now })
				.onConflictDoNothing()
				.run();
		}
	}
	return `${pending.length} notification${pending.length === 1 ? '' : 's'}, ${delivered} delivered`;
}
