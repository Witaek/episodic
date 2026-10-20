import { createHash, randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import type { Cookies } from '@sveltejs/kit';
import { and, count, eq, gt, lt, ne } from 'drizzle-orm';
import { config } from './config';
import { getDb } from './db/client';
import { sessions, users, type UserPrefs } from './db/schema';

export const SESSION_COOKIE = 'episodic_session';
const SESSION_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;

export interface SessionUser {
	id: number;
	username: string;
	displayName: string;
	role: 'admin' | 'user';
	prefs: UserPrefs;
}

// ---------- Passwords ----------

export const PASSWORD_MIN_LENGTH = 8;

export function hashPassword(password: string): Promise<string> {
	return hash(password);
}

export function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
	return verify(passwordHash, password).catch(() => false);
}

export function validateUsername(username: string): string | null {
	if (!/^[a-z0-9][a-z0-9._-]{1,31}$/.test(username)) {
		return 'Use 2–32 characters: letters, numbers, dots, dashes or underscores.';
	}
	return null;
}

export function validatePassword(password: string): string | null {
	if (password.length < PASSWORD_MIN_LENGTH) {
		return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
	}
	if (password.length > 256) return 'That password is too long.';
	return null;
}

// ---------- Users ----------

export function userCount(): number {
	return getDb().select({ n: count() }).from(users).get()?.n ?? 0;
}

export async function createUser(input: {
	username: string;
	displayName?: string;
	password: string;
	role: 'admin' | 'user';
}): Promise<number> {
	const username = input.username.trim().toLowerCase();
	const { id } = getDb()
		.insert(users)
		.values({
			username,
			displayName: input.displayName?.trim() || username,
			passwordHash: await hashPassword(input.password),
			role: input.role
		})
		.returning({ id: users.id })
		.get();
	return id;
}

export function findUserByUsername(username: string) {
	return getDb()
		.select()
		.from(users)
		.where(eq(users.username, username.trim().toLowerCase()))
		.get();
}

/** Creates the first admin from ADMIN_USERNAME / ADMIN_PASSWORD when no account exists yet. */
export async function seedAdminFromEnv(username?: string, password?: string): Promise<boolean> {
	if (!username || !password || userCount() > 0) return false;
	const problem = validateUsername(username.toLowerCase()) ?? validatePassword(password);
	if (problem) {
		console.warn(`[auth] ADMIN_USERNAME/ADMIN_PASSWORD ignored: ${problem}`);
		return false;
	}
	await createUser({ username, password, role: 'admin' });
	return true;
}

// ---------- Sessions ----------

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export function createSession(userId: number): { token: string; expiresAt: Date } {
	const token = randomBytes(32).toString('base64url');
	const expiresAt = new Date(Date.now() + SESSION_DAYS * DAY);
	getDb()
		.insert(sessions)
		.values({ id: hashToken(token), userId, expiresAt })
		.run();
	return { token, expiresAt };
}

/** Returns the session's user, extending the session when it is past half its lifetime. */
export function validateSession(token: string): { user: SessionUser; expiresAt: Date } | null {
	const db = getDb();
	const id = hashToken(token);
	const row = db
		.select({ session: sessions, user: users })
		.from(sessions)
		.innerJoin(users, eq(sessions.userId, users.id))
		.where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())))
		.get();
	if (!row || row.user.disabled) return null;

	let expiresAt = row.session.expiresAt;
	if (expiresAt.getTime() - Date.now() < (SESSION_DAYS / 2) * DAY) {
		expiresAt = new Date(Date.now() + SESSION_DAYS * DAY);
		db.update(sessions).set({ expiresAt }).where(eq(sessions.id, id)).run();
	}

	const { user } = row;
	return {
		user: {
			id: user.id,
			username: user.username,
			displayName: user.displayName,
			role: user.role,
			prefs: user.prefs
		},
		expiresAt
	};
}

export function deleteSession(token: string): void {
	getDb()
		.delete(sessions)
		.where(eq(sessions.id, hashToken(token)))
		.run();
}

/** Signs a user out everywhere, optionally keeping the current session. */
export function deleteUserSessions(userId: number, keepToken?: string): void {
	const keep = keepToken ? hashToken(keepToken) : undefined;
	getDb()
		.delete(sessions)
		.where(
			keep ? and(eq(sessions.userId, userId), ne(sessions.id, keep)) : eq(sessions.userId, userId)
		)
		.run();
}

export function purgeExpiredSessions(): number {
	return getDb().delete(sessions).where(lt(sessions.expiresAt, new Date())).run().changes;
}

export function setSessionCookie(
	cookies: Cookies,
	token: string,
	expiresAt: Date,
	secure: boolean
) {
	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure,
		expires: expiresAt
	});
}

export function clearSessionCookie(cookies: Cookies, secure: boolean) {
	cookies.delete(SESSION_COOKIE, { path: '/', secure });
}

/**
 * True when the browser reached us over HTTPS. Episodic itself only speaks HTTP, so HTTPS means a
 * proxy in front (Tailscale Serve, a reverse proxy). Don't use `event.url.protocol` for this:
 * without ORIGIN set, adapter-node assumes "https" for every request, which made browsers drop
 * Secure cookies on plain http://<lan-ip> addresses.
 */
export function isSecureRequest(request: Request, appUrl = config().APP_URL): boolean {
	const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0].trim();
	if (forwardedProto) return forwardedProto === 'https';
	const forwarded = request.headers.get('forwarded')?.match(/proto=(https?)/i)?.[1];
	if (forwarded) return forwarded.toLowerCase() === 'https';
	// A proxy that sets no header: trust APP_URL when the request is for that host.
	if (appUrl?.startsWith('https://')) {
		const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
		return host === new URL(appUrl).host;
	}
	return false;
}

// ---------- Login throttling ----------

const failures = new Map<string, { count: number; until: number }>();
const MAX_FAILURES = 5;
const LOCK_MS = 60_000;

/** Seconds to wait before another attempt is allowed, or 0. */
export function loginLockedFor(key: string): number {
	const entry = failures.get(key);
	if (!entry || entry.count < MAX_FAILURES) return 0;
	const remaining = entry.until - Date.now();
	if (remaining <= 0) {
		failures.delete(key);
		return 0;
	}
	return Math.ceil(remaining / 1000);
}

export function recordLoginFailure(key: string): void {
	const entry = failures.get(key) ?? { count: 0, until: 0 };
	entry.count++;
	entry.until = Date.now() + LOCK_MS;
	failures.set(key, entry);
}

export function clearLoginFailures(key: string): void {
	failures.delete(key);
}
