import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { formatEpisodeCode } from '$lib/media-types/types';
import { config } from '../config';
import { getDb } from '../db/client';
import { users } from '../db/schema';
import { buildCalendar, type IcsEvent } from '../ics';
import { localDateString } from './progress';
import { scheduleBetween } from './upcoming';

const DAY = 24 * 60 * 60 * 1000;

/** Creates (or replaces) the user's feed token; the old link stops working. */
export function resetCalendarToken(userId: number): string {
	const token = randomBytes(24).toString('base64url');
	getDb().update(users).set({ calendarToken: token }).where(eq(users.id, userId)).run();
	return token;
}

export function disableCalendarFeed(userId: number): void {
	getDb().update(users).set({ calendarToken: null }).where(eq(users.id, userId)).run();
}

export function getCalendarToken(userId: number): string | null {
	return (
		getDb().select({ t: users.calendarToken }).from(users).where(eq(users.id, userId)).get()?.t ??
		null
	);
}

/** The iCal feed for a token: 30 days back to 90 days ahead. Null if the token is unknown. */
export function calendarFeed(token: string, now = new Date()): string | null {
	if (!/^[A-Za-z0-9_-]{20,}$/.test(token)) return null;
	const user = getDb()
		.select({ id: users.id, disabled: users.disabled })
		.from(users)
		.where(eq(users.calendarToken, token))
		.get();
	if (!user || user.disabled) return null;

	const from = localDateString(new Date(now.getTime() - 30 * DAY));
	const to = localDateString(new Date(now.getTime() + 90 * DAY));
	const base = config().APP_URL?.replace(/\/$/, '');

	const events: IcsEvent[] = scheduleBetween(user.id, from, to).map((item) => {
		const code = item.episode
			? formatEpisodeCode({ season: item.episode.seasonNumber, number: item.episode.number })
			: null;
		const summary = code ? `${item.name} ${code}` : `${item.name} (release)`;
		const description = [item.episode?.name, base ? `${base}${item.href}` : null]
			.filter(Boolean)
			.join('\n');
		return {
			uid: item.episode ? `episode-${item.episode.id}@episodic` : `movie-${item.titleId}@episodic`,
			summary,
			description: description || undefined,
			url: base ? `${base}${item.href}` : undefined,
			...(item.airAt
				? { start: item.airAt, minutes: item.episode?.runtime ?? 30 }
				: { date: item.date }),
			stamp: now
		};
	});

	return buildCalendar('Episodic', events);
}
