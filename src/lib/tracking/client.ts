import { toast } from 'svelte-sonner';
import type { TitleKind } from '$lib/catalog/types';
import type { LibraryStatus } from '$lib/media-types/types';
import { isNetworkError } from '$lib/offline/outbox';
import { offline } from '$lib/offline/sync.svelte';
import type { TitleUserState, WatchResponse, WatchTarget } from './types';

/** Browser-side calls to the tracking API. Errors are shown as toasts and re-thrown. */

export interface TitleRefLike {
	kind: TitleKind;
	id: string;
	/** Books: the edition being read, saved with the action. */
	edition?: string | null;
	/** Shown for changes waiting to sync ("Frieren"). */
	name?: string;
}

/** A change saved on this device while offline; it syncs later (src/lib/offline). */
export interface Queued {
	queued: true;
	/** Its id in the outbox, to undo it while it's still waiting. */
	actionId: string | null;
}

export const isQueued = (value: unknown): value is Queued =>
	!!value && typeof value === 'object' && (value as Queued).queued === true;

/**
 * Sends a tracking call. With `offlineLabel`, a call that fails for lack of connection is kept on
 * this device and synced later instead of failing.
 */
async function call<T>(
	url: string,
	method: string,
	body?: unknown,
	offlineLabel?: string
): Promise<T> {
	let response: Response;
	try {
		response = await fetch(url, {
			method,
			headers: body ? { 'content-type': 'application/json' } : undefined,
			body: body ? JSON.stringify(body) : undefined
		});
	} catch (error) {
		if (offlineLabel && isNetworkError(error)) {
			const actionId = await offline.queue({ method, url, body, label: offlineLabel });
			if (actionId) return { queued: true, actionId } as T;
		}
		toast.error("Couldn't reach Episodic. Check your connection.");
		throw error;
	}
	const data = await response.json().catch(() => ({}));
	if (!response.ok) {
		const message = data.error ?? data.message ?? 'Something went wrong';
		toast.error(message);
		throw new Error(message);
	}
	return data as T;
}

const url = (ref: TitleRefLike, action: string) =>
	`/api/titles/${ref.kind}/${ref.id}/${action}${ref.edition ? `?edition=${ref.edition}` : ''}`;

const named = (ref: TitleRefLike, what: string) => (ref.name ? `${ref.name}: ${what}` : what);

export function setLibraryStatus(ref: TitleRefLike, status: LibraryStatus, label: string = status) {
	return call<{ state: TitleUserState } | Queued>(
		url(ref, 'library'),
		'PUT',
		{ status },
		named(ref, `moved to ${label}`)
	);
}

export function removeFromLibrary(ref: TitleRefLike) {
	return call<{ state: TitleUserState } | Queued>(
		url(ref, 'library'),
		'DELETE',
		undefined,
		named(ref, 'removed from library')
	);
}

export function markWatched(
	ref: TitleRefLike,
	target: WatchTarget,
	options: { watchedAt?: Date; rewatch?: boolean; label?: string } = {}
) {
	return call<WatchResponse | Queued>(
		url(ref, 'watch'),
		'POST',
		{
			target,
			// Offline, the history keeps the time of the tap, not of the sync.
			watchedAt: (options.watchedAt ?? new Date()).toISOString(),
			rewatch: options.rewatch
		},
		named(ref, options.label ?? 'marked done')
	);
}

export function markUnwatched(ref: TitleRefLike, target: WatchTarget, label = 'marked not done') {
	return call<{ state: TitleUserState } | Queued>(
		url(ref, 'unwatch'),
		'POST',
		{ target },
		named(ref, label)
	);
}

export function undoEvents(eventIds: number[]) {
	return call<{ states: Record<string, TitleUserState> }>('/api/activity/undo', 'POST', {
		eventIds
	});
}

/** Light haptic feedback where supported (Android). */
export function haptic(pattern: number | number[] = 12) {
	if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate?.(pattern);
}

export function setReadingPage(
	ref: TitleRefLike,
	page: number,
	unit?: { season: number; number: number }
) {
	return call<{ finished: boolean; state: TitleUserState } | Queued>(
		url(ref, 'progress'),
		'PUT',
		{ page, ...unit },
		named(ref, `page ${page}`)
	);
}
