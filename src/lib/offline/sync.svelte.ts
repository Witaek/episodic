import { toast } from 'svelte-sonner';
import { enqueue, flush, listQueued, newActionId, removeQueued, type QueuedAction } from './outbox';

/**
 * Offline tracking in the app: the number of changes waiting, and when they're sent (reconnecting,
 * reopening the app, every minute while some wait, and in the background on Android through the
 * service worker's sync event).
 */

class OfflineSync {
	/** The signed-in person; null before the app shell knows. */
	userId: number | null = $state(null);
	pending: QueuedAction[] = $state([]);
	online = $state(true);
	/** Waiting changes belong to someone who must sign in again. */
	needsSignIn = $state(false);
	syncing = $state(false);

	get count() {
		return this.pending.length;
	}

	async refresh() {
		if (this.userId === null) return;
		this.pending = await listQueued(this.userId).catch(() => []);
	}

	/** Keeps an action for later. Returns its id (to undo it while it's still waiting). */
	async queue(action: Omit<QueuedAction, 'id' | 'userId' | 'createdAt'>): Promise<string | null> {
		if (this.userId === null) return null;
		const id = newActionId();
		await enqueue({ ...action, id, userId: this.userId, createdAt: new Date().toISOString() });
		await this.refresh();
		void registerBackgroundSync();
		return id;
	}

	/** Drops a waiting change (Undo, or "discard" in Settings). */
	async discard(id: string) {
		await removeQueued(id);
		await this.refresh();
	}

	async syncNow({ quiet = false } = {}) {
		if (this.userId === null || this.syncing) return;
		await this.refresh();
		if (this.pending.length === 0) return;
		this.syncing = true;
		try {
			const result = await flush(this.userId);
			this.needsSignIn = result.waiting;
			const synced = result.synced.length;
			if (synced) {
				toast.success(`Synced ${synced} change${synced === 1 ? '' : 's'} made offline`);
				// Pages show the server's state again, now including those changes.
				const { invalidateAll } = await import('$app/navigation');
				await invalidateAll();
			}
			for (const action of result.rejected) {
				toast.error(`Couldn't sync: ${action.label}`);
			}
			if (!quiet && !synced && result.remaining && !this.online) {
				toast('Still offline: your changes will sync later');
			}
		} finally {
			this.syncing = false;
			await this.refresh();
		}
	}
}

export const offline = new OfflineSync();

async function registerBackgroundSync() {
	try {
		const registration = await navigator.serviceWorker?.ready;
		// Android Chrome only; elsewhere changes sync when the app is next open.
		await (
			registration as ServiceWorkerRegistration & {
				sync?: { register(tag: string): Promise<void> };
			}
		)?.sync?.register('episodic-outbox');
	} catch {
		// Not supported: the app syncs on its own when open.
	}
}

/** Starts syncing for the signed-in person. Returns a cleanup function. */
export function startOfflineSync(userId: number): () => void {
	offline.userId = userId;
	offline.online = navigator.onLine;
	void offline.syncNow({ quiet: true });

	const onOnline = () => {
		offline.online = true;
		void offline.syncNow({ quiet: true });
	};
	const onOffline = () => (offline.online = false);
	const onVisible = () => {
		if (document.visibilityState === 'visible') void offline.syncNow({ quiet: true });
	};
	// The service worker synced in the background: show the new count.
	const onMessage = (event: MessageEvent) => {
		if (event.data === 'outbox-synced') void offline.refresh();
	};
	window.addEventListener('online', onOnline);
	window.addEventListener('offline', onOffline);
	document.addEventListener('visibilitychange', onVisible);
	navigator.serviceWorker?.addEventListener('message', onMessage);
	const timer = setInterval(() => {
		if (offline.count) void offline.syncNow({ quiet: true });
	}, 60_000);

	return () => {
		window.removeEventListener('online', onOnline);
		window.removeEventListener('offline', onOffline);
		document.removeEventListener('visibilitychange', onVisible);
		navigator.serviceWorker?.removeEventListener('message', onMessage);
		clearInterval(timer);
	};
}
