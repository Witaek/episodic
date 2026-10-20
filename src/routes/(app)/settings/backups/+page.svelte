<script lang="ts">
	import { enhance } from '$app/forms';
	import { ArrowLeft, DatabaseBackup, Download, Trash2 } from '@lucide/svelte';
	import Button from '$lib/components/Button.svelte';
	import SettingsSection from '$lib/components/SettingsSection.svelte';
	import { formatDateTime } from '$lib/format';

	let { data, form } = $props();
	let creating = $state(false);

	const size = (bytes: number) =>
		bytes > 1024 * 1024
			? `${(bytes / 1024 / 1024).toFixed(1)} MB`
			: `${Math.round(bytes / 1024)} KB`;
</script>

<svelte:head><title>Backups · Episodic</title></svelte:head>

<div
	class="mx-auto max-w-2xl space-y-8 px-4 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-10 md:px-8"
>
	<div>
		<a
			href="/settings"
			class="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"
		>
			<ArrowLeft class="size-4" /> Settings
		</a>
		<h1 class="text-3xl font-semibold tracking-tight">Backups</h1>
		<p class="mt-1 text-sm text-muted">
			{#if data.retentionDays > 0}
				A full copy of the database is saved every night at 03:30 and kept for {data.retentionDays} days.
				Backups you make here are kept until you delete them.
			{:else}
				Automatic backups are off (<code>BACKUP_RETENTION_DAYS=0</code>). You can still make one
				here.
			{/if}
		</p>
	</div>

	{#if form?.message}
		<p class="rounded-xl bg-success/10 px-4 py-3 text-sm text-success" role="status">
			{form.message}
		</p>
	{:else if form?.error}
		<p class="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger" role="alert">{form.error}</p>
	{/if}

	<form
		method="POST"
		action="?/create"
		use:enhance={() => {
			creating = true;
			return async ({ update }) => {
				await update();
				creating = false;
			};
		}}
	>
		<Button type="submit" disabled={creating}
			><DatabaseBackup class="size-4" /> {creating ? 'Backing up…' : 'Back up now'}</Button
		>
	</form>

	<SettingsSection title="Saved backups">
		{#if data.backups.length}
			<ul class="divide-y divide-border">
				{#each data.backups as backup (backup.name)}
					<li class="flex items-center gap-3 px-5 py-3.5">
						<div class="min-w-0 flex-1">
							<p class="font-medium">{formatDateTime(backup.createdAt)}</p>
							<p class="truncate text-xs text-muted">
								{backup.name} · {size(backup.size)}{backup.manual ? ' · kept' : ''}
							</p>
						</div>
						<a
							href="/api/backups/{backup.name}"
							download
							class="grid size-9 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"
							aria-label="Download {backup.name}"
						>
							<Download class="size-5" />
						</a>
						<form
							method="POST"
							action="?/delete"
							use:enhance={({ cancel }) => {
								if (!confirm(`Delete backup ${backup.name}?`)) cancel();
							}}
						>
							<input type="hidden" name="name" value={backup.name} />
							<button
								type="submit"
								class="grid size-9 place-items-center rounded-full text-muted hover:bg-danger/10 hover:text-danger"
								aria-label="Delete {backup.name}"
							>
								<Trash2 class="size-5" />
							</button>
						</form>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="p-5 text-sm text-muted">
				No backups yet. The first one is made tonight, or tap “Back up now”.
			</p>
		{/if}
	</SettingsSection>

	<p class="text-sm text-muted">
		Backups are stored in <code class="text-fg">backups/</code> inside your data folder (<code
			class="text-fg">/DATA/AppData/episodic/backups</code
		>
		on CasaOS). To restore one, see
		<a
			class="text-accent hover:underline"
			href="https://github.com/Witaek/episodic/blob/main/docs/backup-restore.md"
			>backup and restore</a
		>.
	</p>
</div>
