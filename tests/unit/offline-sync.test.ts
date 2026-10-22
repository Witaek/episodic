import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RequestEvent } from '@sveltejs/kit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { replay, type QueuedAction } from '../../src/lib/offline/outbox';

const dataDir = mkdtempSync(join(tmpdir(), 'episodic-test-'));
process.env.DATA_DIR = dataDir;

const { runMigrations, closeDb } = await import('../../src/lib/server/db/client');
const { createUser } = await import('../../src/lib/server/auth');
const sync = await import('../../src/lib/server/offline-sync');

let userId: number;
beforeAll(async () => {
	runMigrations();
	userId = await createUser({ username: 'phone', password: 'password1', role: 'user' });
});
afterAll(() => {
	closeDb();
	rmSync(dataDir, { recursive: true, force: true });
});

const event = (headers: Record<string, string>, user = userId) =>
	({
		request: new Request('http://x/api/titles/tv/1/watch', { method: 'POST', headers }),
		locals: { user: { id: user } }
	}) as unknown as RequestEvent;

describe('replayed offline actions on the server', () => {
	it('applies an action once, however often it is replayed', async () => {
		let applied = 0;
		const run = () => {
			applied++;
			return new Response('{}');
		};
		const headers = { 'x-episodic-action': 'a1', 'x-episodic-user': String(userId) };
		await sync.onceForReplay(event(headers), run);
		const second = await sync.onceForReplay(event(headers), run);
		expect(applied).toBe(1);
		expect(await second.json()).toEqual({ duplicate: true });
	});

	it('does not remember an action that failed, so a retry can succeed', async () => {
		let attempts = 0;
		const headers = { 'x-episodic-action': 'a2' };
		await sync.onceForReplay(event(headers), () => {
			attempts++;
			return new Response('{}', { status: 500 });
		});
		await sync.onceForReplay(event(headers), () => {
			attempts++;
			return new Response('{}');
		});
		expect(attempts).toBe(2);
	});

	it('refuses an action made by another account on a shared device', async () => {
		const response = await sync.onceForReplay(
			event({ 'x-episodic-action': 'a3', 'x-episodic-user': '999' }),
			() => new Response('{}')
		);
		expect(response.status).toBe(409);
	});

	it('reads when the action was made, never in the future', () => {
		const at = '2026-10-20T08:00:00.000Z';
		expect(
			sync.clientTime(new Request('http://x', { headers: { 'x-episodic-time': at } }))
		).toEqual(new Date(at));
		const future = new Date(Date.now() + 86_400_000).toISOString();
		const clamped = sync.clientTime(
			new Request('http://x', { headers: { 'x-episodic-time': future } })
		)!;
		expect(clamped.getTime()).toBeLessThanOrEqual(Date.now());
		expect(sync.clientTime(new Request('http://x'))).toBeNull();
	});

	it('forgets action ids after 30 days', () => {
		expect(sync.purgeClientActions(Date.now() + 31 * 86_400_000)).toBeGreaterThan(0);
	});
});

describe('replaying from the device', () => {
	const action: QueuedAction = {
		id: 'x1',
		userId: 7,
		createdAt: '2026-10-20T08:00:00.000Z',
		method: 'POST',
		url: '/api/titles/tv/1/watch',
		body: { target: { type: 'episode', season: 1, number: 1 } },
		label: 'S01E01 watched'
	};
	const answer = (status: number) => async () => new Response('{}', { status });

	it('sends the id, the person and the time, and sorts out the answers', async () => {
		let sent: RequestInit | undefined;
		await replay(action, (async (_url: string, init?: RequestInit) => {
			sent = init;
			return new Response('{}');
		}) as typeof fetch);
		expect(sent?.headers).toMatchObject({
			'x-episodic-action': 'x1',
			'x-episodic-user': '7',
			'x-episodic-time': action.createdAt
		});
		expect(await replay(action, answer(200) as typeof fetch)).toBe('done');
		expect(await replay(action, answer(503) as typeof fetch)).toBe('retry');
		expect(await replay(action, answer(401) as typeof fetch)).toBe('waiting');
		expect(await replay(action, answer(404) as typeof fetch)).toBe('rejected');
		const offline = (async () => {
			throw new TypeError('Failed to fetch');
		}) as typeof fetch;
		expect(await replay(action, offline)).toBe('retry');
	});
});
