<script lang="ts">
	let { data } = $props();

	const checks = $derived([
		{ label: 'Server', ok: true, detail: `v${data.version}` },
		{ label: 'Database', ok: data.database, detail: data.database ? 'Ready' : 'Unavailable' },
		{
			label: 'TMDB token',
			ok: data.tmdbConfigured,
			detail: data.tmdbConfigured ? 'Configured' : 'Missing, see docs/api-keys.md'
		}
	]);
</script>

<svelte:head>
	<title>Episodic</title>
</svelte:head>

<main
	class="relative grid min-h-dvh place-items-center overflow-hidden px-4 py-16"
	style="background: radial-gradient(60rem 40rem at 20% -10%, color-mix(in oklab, var(--accent) 28%, transparent), transparent 60%), radial-gradient(50rem 30rem at 110% 110%, color-mix(in oklab, var(--success) 14%, transparent), transparent 60%), var(--bg);"
>
	<section class="w-full max-w-md">
		<div class="mb-8 flex items-center gap-3">
			<img src="/favicon.svg" alt="" class="size-12 rounded-2xl shadow-lg" />
			<div>
				<h1 class="text-3xl font-semibold tracking-tight">Episodic</h1>
				<p class="text-muted">Your shows, anime and movies. Self-hosted.</p>
			</div>
		</div>

		<ul
			class="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface/80 backdrop-blur"
		>
			{#each checks as check (check.label)}
				<li class="flex items-center justify-between gap-4 px-5 py-4">
					<span class="flex items-center gap-3 font-medium">
						<span
							class="size-2.5 rounded-full {check.ok ? 'bg-success' : 'bg-danger'}"
							aria-hidden="true"
						></span>
						{check.label}
					</span>
					<span class="text-right text-sm text-muted">{check.detail}</span>
				</li>
			{/each}
		</ul>

		<p class="mt-6 text-center text-sm text-muted">
			Phase 0: the server is up. Search and tracking arrive in the next phases.
		</p>
	</section>
</main>
