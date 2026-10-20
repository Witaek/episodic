<script lang="ts">
	import { KeyRound } from '@lucide/svelte';

	let { compact = false }: { compact?: boolean } = $props();
</script>

<div
	class="flex gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm {compact
		? ''
		: 'md:p-5'}"
	role="status"
>
	<KeyRound class="mt-0.5 size-5 shrink-0 text-amber-400" />
	<div>
		<p class="font-medium">TMDB isn't set up yet</p>
		<p class="mt-1 text-muted">
			Add a free <code class="text-fg">TMDB_ACCESS_TOKEN</code> to search TV shows and movies. Anime
			search already works through AniList. See
			<a
				class="text-accent underline-offset-2 hover:underline"
				href="https://github.com/Witaek/episodic/blob/main/docs/api-keys.md">docs/api-keys.md</a
			>.
		</p>
	</div>
</div>
