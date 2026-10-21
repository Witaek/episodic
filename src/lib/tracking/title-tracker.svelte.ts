import { toast } from 'svelte-sonner';
import {
	formatEpisodeCode,
	VIDEO_STATUS_LABELS,
	type LibraryStatus,
	type ProgressUnit
} from '$lib/media-types/types';
import {
	haptic,
	markUnwatched,
	markWatched,
	removeFromLibrary,
	setLibraryStatus,
	setReadingPage,
	undoEvents,
	type TitleRefLike
} from './client';
import { MOVIE_KEY, episodeKey, type TitleUserState, type WatchTarget } from './types';

export interface Wording {
	formatUnit: (unit: ProgressUnit) => string;
	done: string;
	undone: string;
	again: string;
	unit: string;
	units: string;
}

export const VIDEO_WORDING: Wording = {
	formatUnit: formatEpisodeCode,
	done: 'watched',
	undone: 'unwatched',
	again: 'rewatched',
	unit: 'episode',
	units: 'episodes'
};

/** Wording for books and manga, given how the media type names its units. */
export function readingWording(
	formatUnit: (unit: ProgressUnit) => string,
	unit = 'book',
	units = 'books'
): Wording {
	return { formatUnit, done: 'read', undone: 'unread', again: 'reread', unit, units };
}

/**
 * Tracking state for one title page: optimistic updates, toasts with Undo, and the
 * "also mark earlier episodes?" offer.
 */
export class TitleTracker {
	state: TitleUserState = $state()!;
	busy = $state(false);

	constructor(
		private readonly ref: TitleRefLike,
		initial: TitleUserState,
		private readonly statusLabels: Record<LibraryStatus, string> = VIDEO_STATUS_LABELS,
		/** How units are named and the verb used in messages ("S02E05 watched", "Book 4 read"). */
		private readonly wording: Wording = VIDEO_WORDING
	) {
		this.state = initial;
	}

	plays(season: number, number: number): number {
		return this.state.watched[episodeKey(season, number)] ?? 0;
	}

	get moviePlays(): number {
		return this.state.watched[MOVIE_KEY] ?? 0;
	}

	async setStatus(status: LibraryStatus) {
		const previous = this.state.status;
		this.state.status = status;
		try {
			this.state = (await setLibraryStatus(this.ref, status)).state;
			const label = previous
				? `Moved to ${this.statusLabels[status]}`
				: `Added to ${this.statusLabels[status]}`;
			// Completing a show doesn't mark its episodes: offer to, if some aired ones are unwatched.
			const progress = this.state.progress;
			const missing = progress ? progress.aired - progress.watched : 0;
			if (status === 'completed' && missing > 0) {
				toast.success(label, {
					description: `${missing} aired episode${missing === 1 ? ' is' : 's are'} not marked as watched.`,
					duration: 10_000,
					action: { label: 'Mark all watched', onClick: () => void this.watch({ type: 'all' }) }
				});
			} else {
				toast.success(label);
			}
		} catch {
			this.state.status = previous;
		}
	}

	async remove() {
		const previous = this.state.status;
		this.state.status = null;
		try {
			this.state = (await removeFromLibrary(this.ref)).state;
			toast('Removed from your library', {
				description: 'Your watch history is kept.',
				action: previous
					? { label: 'Undo', onClick: () => void this.setStatus(previous) }
					: undefined
			});
		} catch {
			this.state.status = previous;
		}
	}

	/** One tap on an episode's check button. */
	async toggleEpisode(season: number, number: number) {
		if (this.plays(season, number) > 0) {
			await this.unwatch(
				{ type: 'episode', season, number },
				`${this.wording.formatUnit({ season, number })} marked ${this.wording.undone}`
			);
		} else {
			await this.watch({ type: 'episode', season, number });
		}
	}

	async watch(target: WatchTarget, options: { watchedAt?: Date; rewatch?: boolean } = {}) {
		const snapshot = $state.snapshot(this.state);
		this.applyOptimistic(target, +1);
		haptic();
		try {
			const result = await markWatched(this.ref, target, options);
			this.state = result.state;
			if (result.eventIds.length === 0) {
				toast('Already watched', { description: 'Use "Watch again" to log a rewatch.' });
				return;
			}
			const undo = {
				label: 'Undo',
				onClick: async () => {
					const { states } = await undoEvents(result.eventIds);
					const next = Object.values(states)[0];
					if (next) this.state = next;
				}
			};
			const label = this.describe(target, result.eventIds.length, options.rewatch);
			if (result.earlierUnwatched > 0 && target.type === 'episode') {
				const n = result.earlierUnwatched;
				toast.success(label, {
					description: `${n} earlier episode${n === 1 ? '' : 's'} not marked yet.`,
					duration: 8000,
					action: {
						label: `Mark ${n === 1 ? 'it' : 'them'} too`,
						onClick: () =>
							void this.watch(
								{ type: 'upTo', season: target.season, number: target.number },
								{ watchedAt: options.watchedAt }
							)
					},
					cancel: undo
				});
			} else {
				toast.success(label, { action: undo });
			}
		} catch {
			this.state = snapshot;
		}
	}

	/** Books: save the current page. */
	async setPage(page: number, unit?: { season: number; number: number }) {
		const previous = $state.snapshot(this.state);
		this.state.reading = { page, pages: this.state.reading?.pages ?? null, unit: unit ?? null };
		try {
			const result = await setReadingPage(this.ref, page, unit);
			this.state = result.state;
			if (result.finished) toast.success('Finished! Marked as read');
			else toast.success(`Saved: page ${page}`);
		} catch {
			this.state = previous;
		}
	}

	async unwatch(target: WatchTarget, message = 'Marked unwatched') {
		const snapshot = $state.snapshot(this.state);
		this.applyOptimistic(target, -1);
		try {
			this.state = (await markUnwatched(this.ref, target)).state;
			toast(message);
		} catch {
			this.state = snapshot;
		}
	}

	private describe(target: WatchTarget, count: number, rewatch?: boolean): string {
		const verb = rewatch ? this.wording.again : this.wording.done;
		switch (target.type) {
			case 'episode':
				return `${this.wording.formatUnit({ season: target.season, number: target.number })} ${verb}`;
			case 'movie':
				return rewatch ? 'Rewatch logged' : 'Marked as watched';
			case 'book':
				return rewatch ? 'Reread logged' : 'Marked as read';
			default:
				return `${count} ${count === 1 ? this.wording.unit : this.wording.units} marked as ${this.wording.done}`;
		}
	}

	/** Immediate feedback for single items; bulk targets wait for the server. */
	private applyOptimistic(target: WatchTarget, delta: 1 | -1) {
		const key =
			target.type === 'episode'
				? episodeKey(target.season, target.number)
				: target.type === 'movie' || target.type === 'book'
					? MOVIE_KEY
					: null;
		if (!key) return;
		const plays = Math.max(0, (this.state.watched[key] ?? 0) + delta);
		if (plays) this.state.watched[key] = plays;
		else delete this.state.watched[key];
	}
}
