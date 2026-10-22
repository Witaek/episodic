<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { ChevronRight, DatabaseBackup, LogOut, Users } from '@lucide/svelte';
	import Button from '$lib/components/Button.svelte';
	import CalendarFeedSection from '$lib/components/CalendarFeedSection.svelte';
	import DataSection from '$lib/components/DataSection.svelte';
	import NotificationsSection from '$lib/components/NotificationsSection.svelte';
	import FormField from '$lib/components/FormField.svelte';
	import InstallApp from '$lib/components/InstallApp.svelte';
	import SegmentedControl from '$lib/components/SegmentedControl.svelte';
	import { clearCachedPages } from '$lib/pwa.svelte';
	import { offline } from '$lib/offline/sync.svelte';
	import OfflineSection from '$lib/components/OfflineSection.svelte';
	import type { Theme } from '$lib/theme';
	import SettingsSection from '$lib/components/SettingsSection.svelte';
	import { formatDateTime } from '$lib/format';

	let { data, form } = $props();

	let theme = $derived<Theme>(data.theme);
	async function setTheme(value: Theme) {
		theme = value;
		document.documentElement.dataset.theme = value;
		const body = new FormData();
		body.set('theme', value);
		await fetch('?/theme', { method: 'POST', body, headers: { 'x-sveltekit-action': 'true' } });
		await invalidateAll();
	}

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
	<div class="flex items-center justify-between gap-4">
		<div>
			<h1 class="text-3xl font-semibold tracking-tight">Settings</h1>
			<p class="mt-1 text-sm text-muted">
				Signed in as <span class="font-medium text-fg">{data.user.username}</span>{data.isAdmin
					? ' · admin'
					: ''}
			</p>
		</div>
		<form
			method="POST"
			action="/logout"
			onsubmit={(event) => {
				const n = offline.count;
				if (
					n &&
					!confirm(
						`${n} change${n === 1 ? '' : 's'} made offline ${n === 1 ? "hasn't" : "haven't"} synced yet. They stay on this device and sync when you sign in again. Sign out?`
					)
				) {
					event.preventDefault();
					return;
				}
				void clearCachedPages();
			}}
		>
			<Button type="submit" variant="secondary" size="sm"><LogOut class="size-4" /> Sign out</Button
			>
		</form>
	</div>

	{#if data.isAdmin}
		<a
			href="/settings/users"
			class="flex items-center gap-4 rounded-2xl border border-border bg-surface px-5 py-4 transition hover:border-accent/50"
		>
			<span class="grid size-10 place-items-center rounded-xl bg-accent/15 text-accent"
				><Users class="size-5" /></span
			>
			<span class="flex-1">
				<span class="block font-medium">Users</span>
				<span class="block text-sm text-muted">Create accounts, reset passwords</span>
			</span>
			<ChevronRight class="size-5 text-muted" />
		</a>
		<a
			href="/settings/backups"
			class="flex items-center gap-4 rounded-2xl border border-border bg-surface px-5 py-4 transition hover:border-accent/50"
		>
			<span class="grid size-10 place-items-center rounded-xl bg-success/15 text-success"
				><DatabaseBackup class="size-5" /></span
			>
			<span class="flex-1">
				<span class="block font-medium">Backups</span>
				<span class="block text-sm text-muted"
					>Nightly database copies, download or back up now</span
				>
			</span>
			<ChevronRight class="size-5 text-muted" />
		</a>
	{/if}

	<SettingsSection title="Profile">
		<form
			method="POST"
			action="?/profile"
			use:enhance={() =>
				async ({ update }) =>
					update({ reset: false })}
			class="space-y-4 p-5"
		>
			<FormField
				label="Display name"
				name="displayName"
				value={data.user.displayName}
				required
				maxlength={60}
				error={form?.profile?.error}
			/>
			<div class="flex items-center justify-end gap-3">
				{#if form?.profile?.success}<span class="text-sm text-success">Saved</span>{/if}
				<Button type="submit" size="sm">Save</Button>
			</div>
		</form>
	</SettingsSection>

	<SettingsSection title="Appearance">
		<div class="flex flex-wrap items-center justify-between gap-4 p-5">
			<span>
				<span class="block font-medium">Theme</span>
				<span class="block text-sm text-muted">System follows your device setting.</span>
			</span>
			<SegmentedControl
				name="theme"
				value={theme}
				options={[
					{ value: 'system', label: 'System' },
					{ value: 'dark', label: 'Dark' },
					{ value: 'light', label: 'Light' }
				]}
				onchange={setTheme}
			/>
		</div>
	</SettingsSection>

	<SettingsSection title="Install the app">
		<InstallApp />
	</SettingsSection>

	<SettingsSection title="Preferences">
		<form
			method="POST"
			action="?/preferences"
			use:enhance={() =>
				async ({ update }) =>
					update({ reset: false })}
			class="p-5"
		>
			<label class="flex items-start justify-between gap-4">
				<span>
					<span class="block font-medium">Count specials</span>
					<span class="block text-sm text-muted"
						>Include season 0 (specials, OVAs) in progress and Up next.</span
					>
				</span>
				<input
					type="checkbox"
					name="includeSpecials"
					checked={data.user.prefs.includeSpecials ?? false}
					onchange={(event) => event.currentTarget.form?.requestSubmit()}
					class="mt-1 size-5 accent-[var(--accent)]"
				/>
			</label>
			<label class="mt-4 flex items-start justify-between gap-4 border-t border-border pt-4">
				<span>
					<span class="block font-medium">Automatic statuses</span>
					<span class="block text-sm text-muted">
						Move titles to Watching when you start, to Completed when you finish an ended show, and
						back to Watching when new episodes air.
					</span>
				</span>
				<input
					type="checkbox"
					name="autoStatus"
					checked={data.user.prefs.autoStatus ?? true}
					onchange={(event) => event.currentTarget.form?.requestSubmit()}
					class="mt-1 size-5 accent-[var(--accent)]"
				/>
			</label>
			<label class="mt-4 flex items-start justify-between gap-4 border-t border-border pt-4">
				<span>
					<span class="block font-medium">Notify for my watchlist too</span>
					<span class="block text-sm text-muted">
						New-episode notifications also cover shows you haven't started yet.
					</span>
				</span>
				<input
					type="checkbox"
					name="notifyWatchlist"
					checked={data.user.prefs.notifyWatchlist ?? false}
					onchange={(event) => event.currentTarget.form?.requestSubmit()}
					class="mt-1 size-5 accent-[var(--accent)]"
				/>
			</label>
		</form>
	</SettingsSection>

	<SettingsSection title="Offline">
		<OfflineSection />
	</SettingsSection>

	<SettingsSection title="Notifications">
		<NotificationsSection />
	</SettingsSection>

	<SettingsSection title="Calendar feed">
		<CalendarFeedSection token={data.calendarToken} appUrl={data.appUrl} />
	</SettingsSection>

	<SettingsSection title="Your data">
		<DataSection />
	</SettingsSection>

	<SettingsSection title="Password">
		<form method="POST" action="?/password" use:enhance class="space-y-4 p-5">
			<FormField
				label="Current password"
				name="current"
				type="password"
				autocomplete="current-password"
				required
			/>
			<FormField
				label="New password"
				name="password"
				type="password"
				autocomplete="new-password"
				required
				hint="At least 8 characters."
			/>
			<FormField
				label="Confirm new password"
				name="confirm"
				type="password"
				autocomplete="new-password"
				required
			/>
			{#if form?.password?.error}<p class="text-sm text-danger">{form.password.error}</p>{/if}
			<div class="flex items-center justify-end gap-3">
				{#if form?.password?.success}<span class="text-sm text-success"
						>Password changed. Other devices were signed out.</span
					>{/if}
				<Button type="submit" size="sm">Change password</Button>
			</div>
		</form>
		<form
			method="POST"
			action="?/signOutOthers"
			use:enhance
			class="flex items-center justify-between gap-4 border-t border-border p-5"
		>
			<span class="text-sm text-muted">
				{form?.sessions?.success
					? 'Other devices were signed out.'
					: 'Lost a device? Sign it out remotely.'}
			</span>
			<Button type="submit" size="sm" variant="secondary">Sign out other devices</Button>
		</form>
	</SettingsSection>

	<SettingsSection title="System status">
		<ul class="divide-y divide-border">
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
	</SettingsSection>

	{#if data.jobs.length}
		<SettingsSection title="Background jobs">
			{#if data.refreshTiers}
				<p class="border-b border-border px-5 py-3.5 text-sm text-muted">
					Tracking {data.refreshTiers.hot + data.refreshTiers.active + data.refreshTiers.settled} titles:
					{data.refreshTiers.hot} airing soon (updated every 6 h), {data.refreshTiers.active} running
					(daily),
					{data.refreshTiers.settled} finished (monthly).
				</p>
			{/if}
			<ul class="divide-y divide-border">
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
		</SettingsSection>
	{/if}

	<SettingsSection title="About">
		<div class="space-y-3 p-5 text-sm text-muted">
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
	</SettingsSection>
</div>
