<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Download, LoaderCircle, Upload } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import Button from './Button.svelte';

	interface Job {
		id: number;
		status: 'queued' | 'running' | 'done' | 'error';
		totalTitles: number;
		doneTitles: number;
		addedEntries: number;
		addedEvents: number;
		skipped: string[];
		message: string | null;
	}

	let job = $state<Job | null>(null);
	let input: HTMLInputElement;

	async function restore(file: File) {
		let body: string;
		try {
			body = await file.text();
		} catch {
			toast.error("Couldn't read that file");
			return;
		}
		const response = await fetch('/api/import', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body
		});
		const result = await response.json().catch(() => ({}));
		if (!response.ok) {
			toast.error(result.message ?? 'Restore failed');
			return;
		}
		await poll(result.jobId);
	}

	async function poll(id: number) {
		for (;;) {
			const response = await fetch(`/api/import/${id}`);
			if (!response.ok) return;
			job = await response.json();
			if (job && (job.status === 'done' || job.status === 'error')) break;
			await new Promise((r) => setTimeout(r, 1000));
		}
		if (job?.status === 'done') {
			toast.success(`Restored ${job.addedEntries} titles and ${job.addedEvents} watches`);
			await invalidateAll();
		} else toast.error(job?.message ?? 'Restore failed');
	}

	const running = $derived(job?.status === 'queued' || job?.status === 'running');
</script>

<div class="space-y-4 p-5 text-sm">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<p class="max-w-sm text-muted">
			Download your library and watch history as a JSON file. It can be restored into any Episodic
			server.
		</p>
		<a
			href="/api/export"
			download
			class="inline-flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-1.5 font-semibold transition hover:bg-border"
		>
			<Download class="size-4" /> Export
		</a>
	</div>
	<div class="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
		<p class="max-w-sm text-muted">
			Restore an export into your account. It's merged with what you have: nothing is deleted and
			watches already here aren't duplicated.
		</p>
		<input
			bind:this={input}
			type="file"
			accept="application/json,.json"
			class="hidden"
			onchange={(event) => {
				const file = event.currentTarget.files?.[0];
				event.currentTarget.value = '';
				if (file) void restore(file);
			}}
		/>
		<Button size="sm" variant="secondary" disabled={running} onclick={() => input.click()}>
			{#if running}<LoaderCircle class="size-4 animate-spin" />{:else}<Upload class="size-4" />{/if}
			Restore
		</Button>
	</div>
	{#if job}
		<div class="rounded-xl bg-surface-2 p-3" role="status">
			{#if running}
				<p>Restoring… {job.doneTitles} of {job.totalTitles} titles</p>
				<div class="mt-2 h-1.5 overflow-hidden rounded-full bg-fg/15">
					<div
						class="h-full rounded-full bg-accent transition-[width]"
						style:width="{job.totalTitles ? (job.doneTitles / job.totalTitles) * 100 : 0}%"
					></div>
				</div>
			{:else if job.status === 'done'}
				<p class="text-success">
					Done: {job.addedEntries} library entries and {job.addedEvents} watches restored.
				</p>
			{:else}
				<p class="text-danger">Restore failed: {job.message}</p>
			{/if}
			{#if job.skipped.length}
				<details class="mt-2 text-muted">
					<summary>{job.skipped.length} item(s) skipped</summary>
					<ul class="mt-1 list-disc pl-5">
						{#each job.skipped as line, i (i)}<li>{line}</li>{/each}
					</ul>
				</details>
			{/if}
		</div>
	{/if}
</div>
