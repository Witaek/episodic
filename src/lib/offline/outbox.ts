/**
 * The offline outbox: tracking actions made without a connection, kept in IndexedDB on this
 * device and replayed in order once the server is reachable. Plain TypeScript so both the app and
 * the service worker (background sync) can use it. The server side is src/lib/server/offline-sync.ts.
 */

export interface QueuedAction {
	/** Unique id; the server applies an action with a given id only once. */
	id: string;
	/** Who made it (the server refuses it for another signed-in account). */
	userId: number;
	/** When it was made, ISO. */
	createdAt: string;
	method: string;
	url: string;
	body?: unknown;
	/** For people: "S02E05 of Frieren watched". */
	label: string;
}

/** The result of replaying one action. */
export type ReplayOutcome =
	| 'done'
	/** No connection, or the server is busy: try again later. */
	| 'retry'
	/** Not signed in (or signed in as someone else): kept until the right person signs in. */
	| 'waiting'
	/** The server refused it (e.g. the title no longer exists): dropped. */
	| 'rejected';

const DB_NAME = 'episodic-offline';
const STORE = 'outbox';

function open(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, 1);
		request.onupgradeneeded = () => {
			request.result.createObjectStore(STORE, { keyPath: 'id' });
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

async function withStore<T>(
	mode: IDBTransactionMode,
	run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
	const db = await open();
	try {
		return await new Promise<T>((resolve, reject) => {
			const tx = db.transaction(STORE, mode);
			const request = run(tx.objectStore(STORE));
			tx.oncomplete = () => resolve(request.result);
			tx.onerror = () => reject(tx.error);
			tx.onabort = () => reject(tx.error);
		});
	} finally {
		db.close();
	}
}

export function newActionId(): string {
	return crypto.randomUUID();
}

export async function enqueue(action: QueuedAction): Promise<void> {
	await withStore('readwrite', (store) => store.put(action));
}

/** Waiting actions, oldest first (optionally only one person's). */
export async function listQueued(userId?: number): Promise<QueuedAction[]> {
	const all = await withStore<QueuedAction[]>('readonly', (store) => store.getAll());
	return all
		.filter((a) => userId === undefined || a.userId === userId)
		.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function removeQueued(id: string): Promise<void> {
	await withStore('readwrite', (store) => store.delete(id));
}

/** Sends one action with the headers the server uses to apply it once, by the right person. */
export async function replay(
	action: QueuedAction,
	send: typeof fetch = fetch
): Promise<ReplayOutcome> {
	let response: Response;
	try {
		response = await send(action.url, {
			method: action.method,
			credentials: 'same-origin',
			headers: {
				...(action.body === undefined ? {} : { 'content-type': 'application/json' }),
				'x-episodic-action': action.id,
				'x-episodic-user': String(action.userId),
				'x-episodic-time': action.createdAt
			},
			body: action.body === undefined ? undefined : JSON.stringify(action.body)
		});
	} catch {
		return 'retry';
	}
	if (response.ok) return 'done';
	if (response.status === 401 || response.status === 409) return 'waiting';
	if (response.status === 429 || response.status >= 500) return 'retry';
	return 'rejected';
}

export interface FlushResult {
	synced: QueuedAction[];
	rejected: QueuedAction[];
	remaining: number;
	/** Stopped because nobody (or someone else) is signed in. */
	waiting: boolean;
}

let running: Promise<FlushResult> | null = null;

/**
 * Replays this person's waiting actions in order. Stops at the first one that can't be sent yet,
 * so later actions never overtake earlier ones. One flush at a time per page.
 */
export function flush(userId: number, send: typeof fetch = fetch): Promise<FlushResult> {
	running ??= (async () => {
		const result: FlushResult = { synced: [], rejected: [], remaining: 0, waiting: false };
		const queued = await listQueued(userId);
		let index = 0;
		for (; index < queued.length; index++) {
			const action = queued[index];
			const outcome = await replay(action, send);
			if (outcome === 'retry' || outcome === 'waiting') {
				result.waiting = outcome === 'waiting';
				break;
			}
			await removeQueued(action.id);
			(outcome === 'done' ? result.synced : result.rejected).push(action);
		}
		result.remaining = queued.length - index;
		return result;
	})().finally(() => {
		running = null;
	});
	return running;
}

/** Whether a failed request means "no connection" (rather than an answer from the server). */
export function isNetworkError(error: unknown): boolean {
	return error instanceof TypeError || (typeof navigator !== 'undefined' && !navigator.onLine);
}
