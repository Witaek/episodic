import { toast } from 'svelte-sonner';
import {
	formatEpisodeCode,
	VIDEO_STATUS_LABELS,
	type LibraryStatus,
	type ProgressUnit
} from '$lib/media-types/types';
import { offline } from '$lib/offline/sync.svelte';
import {
	haptic,
	isQueued,
	markUnwatched,
	markWatched,
	removeFromLibrary,
	setLibraryStatus,
	setReadingPage,
	undoEvents,
	type Queued,
	type TitleRefLike
} from './client';
import {
	MOVIE_KEY,
	episodeKey,
	type EpisodeBrief,
	type TitleUserState,
	type WatchTarget
} from './types';

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

	/**
	 * Units listed on the page (the season shown), so offline changes can move "next up" and mark
	 * a whole season locally.
	 */
	knownUnits: EpisodeBrief[] = [];

	setKnownUnits(units: EpisodeBrief[]) {
		this.knownUnits = [...units].sort(
			(a, b) => a.seasonNumber - b.seasonNumber || a.number - b.number
		);
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
			const result = await setLibraryStatus(this.ref, status, this.statusLabels[status]);
			if (isQueued(result)) {
				this.savedOffline(`Moved to ${this.statusLabels[status]}`, result, () => {
					this.state.status = previous;
				});
				return;
			}
			this.state = result.state;
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
			const result = await removeFromLibrary(this.ref);
			if (isQueued(result)) {
				this.savedOffline('Removed from your library', result, () => {
					this.state.status = previous;
				});
				return;
			}
			this.state = result.state;
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
			const offlineLabel = this.describe(target, 1, options.rewatch);
			const result = await markWatched(this.ref, target, { ...options, label: offlineLabel });
			if (isQueued(result)) {
				this.applyOffline(target);
				this.savedOffline(offlineLabel, result, () => {
					this.state = snapshot;
				});
				return;
			}
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
			if (isQueued(result)) {
				this.savedOffline(`Page ${page}`, result, () => {
					this.state = previous;
				});
				return;
			}
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
			const result = await markUnwatched(this.ref, target, message);
			if (isQueued(result)) {
				this.applyOffline(target, -1);
				this.savedOffline(message, result, () => {
					this.state = snapshot;
				});
				return;
			}
			this.state = result.state;
			toast(message);
		} catch {
			this.state = snapshot;
		}
	}

	/** "Saved offline" toast, with an Undo that drops the waiting change. */
	private savedOffline(label: string, queued: Queued, revert: () => void) {
		toast(label, {
			description: 'Saved on this device. It will sync when you are back online.',
			action: queued.actionId
				? {
						label: 'Undo',
						onClick: () => {
							void offline.discard(queued.actionId!);
							revert();
						}
					}
				: undefined
		});
	}

	/**
	 * Offline, the server can't recompute progress: mark what the page knows locally (a season,
	 * everything up to an episode) and move "next up" along the listed units.
	 */
	private applyOffline(target: WatchTarget, delta: 1 | -1 = 1) {
		const units = this.knownUnits;
		const keys =
			target.type === 'season'
				? units.filter((u) => u.seasonNumber === target.season)
				: target.type === 'upTo'
					? units.filter(
							(u) =>
								u.seasonNumber < target.season ||
								(u.seasonNumber === target.season && u.number <= target.number)
						)
					: target.type === 'all'
						? units
						: [];
		for (const unit of keys) {
			const key = episodeKey(unit.seasonNumber, unit.number);
			if (delta > 0) this.state.watched[key] ??= 1;
			else delete this.state.watched[key];
		}
		const progress = this.state.progress;
		if (!progress || units.length === 0) return;
		const today = new Date().toISOString().slice(0, 10);
		const next = units.find(
			(u) =>
				u.seasonNumber > 0 &&
				!this.state.watched[episodeKey(u.seasonNumber, u.number)] &&
				(!u.airDate || u.airDate <= today)
		);
		const watched = units.filter((u) => this.state.watched[episodeKey(u.seasonNumber, u.number)]);
		this.state.progress = {
			...progress,
			nextUp: next ?? null,
			watched: Math.max(progress.watched, Math.min(progress.aired, watched.length)),
			percent: progress.aired
				? Math.min(
						100,
						Math.round((Math.max(progress.watched, watched.length) / progress.aired) * 100)
					)
				: progress.percent
		};
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
