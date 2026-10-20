<script lang="ts">
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { formatRuntime } from '$lib/format';
	import { haptic, markUnwatched, markWatched, undoEvents } from '$lib/tracking/client';
	import Img from './Img.svelte';
	import WatchButton from './WatchButton.svelte';

	export interface FranchiseMovieItem {
		id: string;
		href: string;
		name: string;
		year: number | null;
		poster: import('$lib/catalog/types').Image | null;
		runtime: number | null;
		plays: number;
	}

	let { movies: initial }: { movies: FranchiseMovieItem[] } = $props();

	// Deeply reactive copy: watch counts change in place when tapped, and reset on navigation.
	let movies = $state<FranchiseMovieItem[]>(untrack(() => initial.map((m) => ({ ...m }))));
	$effect.pre(() => {
		movies = initial.map((m) => ({ ...m }));
	});

	async function toggle(movie: FranchiseMovieItem) {
		const ref = { kind: 'movie' as const, id: movie.id };
		const before = movie.plays;
		haptic();
		try {
			if (before > 0) {
				movie.plays = before - 1;
				const { state } = await markUnwatched(ref, { type: 'movie' });
				movie.plays = state.watched.movie ?? 0;
				toast(`${movie.name} marked unwatched`);
			} else {
				movie.plays = 1;
				const result = await markWatched(ref, { type: 'movie' });
				movie.plays = result.state.watched.movie ?? 1;
				toast.success(`${movie.name} watched`, {
					action: {
						label: 'Undo',
						onClick: async () => {
							await undoEvents(result.eventIds);
							movie.plays = before;
						}
					}
				});
			}
		} catch {
			movie.plays = before;
		}
	}
</script>

<ul class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
	{#each movies as movie (movie.id)}
		<li class="flex items-center gap-3 rounded-2xl border border-border bg-surface p-2.5">
			<a href={movie.href} class="flex min-w-0 flex-1 items-center gap-3">
				<Img
					image={movie.poster}
					alt=""
					sizes="56px"
					class="aspect-[2/3] w-14 shrink-0 rounded-lg"
				/>
				<span class="min-w-0">
					<span class="line-clamp-2 text-sm font-medium">{movie.name}</span>
					<span class="text-xs text-muted">
						{[movie.year, formatRuntime(movie.runtime)].filter(Boolean).join(' · ')}
					</span>
				</span>
			</a>
			<WatchButton
				watched={movie.plays > 0}
				plays={movie.plays}
				label={movie.plays > 0 ? `Mark ${movie.name} unwatched` : `Mark ${movie.name} watched`}
				onclick={() => toggle(movie)}
			/>
		</li>
	{/each}
</ul>
