<script lang="ts">
	import { formatDateTime } from '$lib/format';

	let { data } = $props();

	const checks = $derived([
		{ label: 'Database', ok: data.database, detail: data.database ? 'Ready' : 'Unavailable' },
		...data.providers.map((p) => ({
			label: p.name,
			ok: p.configured,
			detail: p.configured
				? p.id === 'tmdb'
					? 'Token configured'
					: 'No key needed'
				: 'Token missing'
		})),
		{
			label: 'Anime id mapping',
			ok: data.animeMappingsAgeDays !== null,
			detail:
				data.animeMappingsAgeDays === null
					? 'Not downloaded yet'
					: data.animeMappingsAgeDays === 0
						? 'Updated today'
						: `Updated ${data.animeMappingsAgeDays} days ago`
		}
	]);
</script>

<svelte:head><title>Settings · Episodic</title></svelte:head>

<div
	class="mx-auto max-w-2xl space-y-8 px-4 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-10 md:px-8"
>
	<h1 class="text-3xl font-semibold tracking-tight">Settings</h1>

	<section class="space-y-3">
		<h2 class="text-sm font-semibold tracking-wide text-muted uppercase">System status</h2>
		<ul class="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
			{#each checks as check (check.label)}
				<li class="flex items-center justify-between gap-4 px-5 py-3.5">
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
	</section>

	{#if data.jobs.length}
		<section class="space-y-3">
			<h2 class="text-sm font-semibold tracking-wide text-muted uppercase">Background jobs</h2>
			<ul
				class="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface"
			>
				{#each data.jobs as job (job.name)}
					<li class="px-5 py-3.5">
						<div class="flex items-center justify-between gap-4">
							<span class="font-medium">{job.name}</span>
							<span
								class="text-xs font-medium {job.lastStatus === 'error'
									? 'text-danger'
									: job.lastStatus === 'success'
										? 'text-success'
										: 'text-muted'}">{job.lastStatus ?? 'not run yet'}</span
							>
						</div>
						<p class="mt-1 text-xs text-muted">
							{#if job.lastRun}Last run {formatDateTime(job.lastRun)}{job.lastMessage
									? `: ${job.lastMessage}`
									: ''}.{/if}
							{#if job.nextRun}Next {formatDateTime(job.nextRun)}.{/if}
						</p>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<section class="space-y-3">
		<h2 class="text-sm font-semibold tracking-wide text-muted uppercase">About</h2>
		<div class="space-y-3 rounded-2xl border border-border bg-surface p-5 text-sm text-muted">
			<p>
				<span class="font-medium text-fg">Episodic</span> v{data.version} ·
				<a class="text-accent hover:underline" href="https://github.com/Witaek/episodic">GitHub</a>
			</p>
			<p>
				Metadata from
				{#each data.providers as provider, i (provider.id)}{i > 0
						? i === data.providers.length - 1
							? ' and '
							: ', '
						: ''}<a class="text-accent hover:underline" href={provider.url}>{provider.name}</a
					>{/each}.
			</p>
			<p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
		</div>
	</section>
</div>
