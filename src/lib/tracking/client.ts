import { toast } from 'svelte-sonner';
import type { TitleKind } from '$lib/catalog/types';
import type { LibraryStatus } from '$lib/media-types/types';
import type { TitleUserState, WatchResponse, WatchTarget } from './types';

/** Browser-side calls to the tracking API. Errors are shown as toasts and re-thrown. */

export interface TitleRefLike {
	kind: TitleKind;
	id: string;
	/** Books: the edition being read, saved with the action. */
	edition?: string | null;
}

async function call<T>(url: string, method: string, body?: unknown): Promise<T> {
	const response = await fetch(url, {
		method,
		headers: body ? { 'content-type': 'application/json' } : undefined,
		body: body ? JSON.stringify(body) : undefined
	});
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

export function setLibraryStatus(ref: TitleRefLike, status: LibraryStatus) {
	return call<{ state: TitleUserState }>(url(ref, 'library'), 'PUT', { status });
}

export function removeFromLibrary(ref: TitleRefLike) {
	return call<{ state: TitleUserState }>(url(ref, 'library'), 'DELETE');
}

export function markWatched(
	ref: TitleRefLike,
	target: WatchTarget,
	options: { watchedAt?: Date; rewatch?: boolean } = {}
) {
	return call<WatchResponse>(url(ref, 'watch'), 'POST', {
		target,
		watchedAt: options.watchedAt?.toISOString(),
		rewatch: options.rewatch
	});
}

export function markUnwatched(ref: TitleRefLike, target: WatchTarget) {
	return call<{ state: TitleUserState }>(url(ref, 'unwatch'), 'POST', { target });
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

export function setReadingPage(ref: TitleRefLike, page: number) {
	return call<{ finished: boolean; state: TitleUserState }>(url(ref, 'progress'), 'PUT', {
		page
	});
}
