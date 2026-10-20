<script lang="ts">
	import { enhance } from '$app/forms';
	import {
		ArrowLeft,
		Ellipsis,
		KeyRound,
		ShieldCheck,
		Trash2,
		UserPlus,
		UserX
	} from '@lucide/svelte';
	import { DropdownMenu, Dialog } from 'bits-ui';
	import Button from '$lib/components/Button.svelte';
	import FormField from '$lib/components/FormField.svelte';
	import SettingsSection from '$lib/components/SettingsSection.svelte';
	import { menuContent, menuItem, menuSeparator } from '$lib/components/menu';
	import { formatDate } from '$lib/format';

	let { data, form } = $props();

	let resetFor = $state<{ id: number; username: string } | null>(null);
	let resetOpen = $state(false);
	let creating = $state(false);

	function submit(action: string, fields: Record<string, string | number>, confirmText?: string) {
		if (confirmText && !confirm(confirmText)) return;
		const formEl = document.createElement('form');
		formEl.method = 'POST';
		formEl.action = `?/${action}`;
		for (const [name, value] of Object.entries(fields)) {
			const input = document.createElement('input');
			input.type = 'hidden';
			input.name = name;
			input.value = String(value);
			formEl.append(input);
		}
		document.body.append(formEl);
		formEl.submit();
	}
</script>

<svelte:head><title>Users · Episodic</title></svelte:head>

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
		<h1 class="text-3xl font-semibold tracking-tight">Users</h1>
		<p class="mt-1 text-sm text-muted">Everyone gets their own library, history and settings.</p>
	</div>

	{#if form?.message}
		<p class="rounded-xl bg-success/10 px-4 py-3 text-sm text-success" role="status">
			{form.message}
		</p>
	{:else if form?.error && form.action !== 'create'}
		<p class="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger" role="alert">{form.error}</p>
	{/if}

	<SettingsSection title="Accounts">
		<ul class="divide-y divide-border">
			{#each data.users as user (user.id)}
				{@const isSelf = user.id === data.currentUserId}
				<li class="flex items-center gap-4 px-5 py-4 {user.disabled ? 'opacity-55' : ''}">
					<span
						class="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 font-semibold uppercase"
					>
						{user.displayName.slice(0, 1)}
					</span>
					<div class="min-w-0 flex-1">
						<p class="flex flex-wrap items-center gap-2 font-medium">
							{user.displayName}
							{#if user.role === 'admin'}<span
									class="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-accent"
									>Admin</span
								>{/if}
							{#if user.disabled}<span
									class="rounded-full bg-danger/15 px-2 py-0.5 text-[11px] font-semibold text-danger"
									>Disabled</span
								>{/if}
							{#if isSelf}<span class="text-xs text-muted">(you)</span>{/if}
						</p>
						<p class="text-sm text-muted">
							@{user.username} · {user.titles}
							{user.titles === 1 ? 'title' : 'titles'} · since {formatDate(
								user.createdAt.slice(0, 10)
							)}
						</p>
					</div>
					<DropdownMenu.Root>
						<DropdownMenu.Trigger
							class="grid size-9 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"
							aria-label="Actions for {user.username}"
						>
							<Ellipsis class="size-5" />
						</DropdownMenu.Trigger>
						<DropdownMenu.Portal>
							<DropdownMenu.Content class={menuContent} sideOffset={6} align="end">
								<DropdownMenu.Item
									class={menuItem}
									onSelect={() => {
										resetFor = { id: user.id, username: user.username };
										resetOpen = true;
									}}
								>
									<KeyRound class="size-4" /> Reset password
								</DropdownMenu.Item>
								{#if !isSelf}
									<DropdownMenu.Item
										class={menuItem}
										onSelect={() =>
											submit('role', {
												userId: user.id,
												role: user.role === 'admin' ? 'user' : 'admin'
											})}
									>
										<ShieldCheck class="size-4" />
										{user.role === 'admin' ? 'Remove admin rights' : 'Make admin'}
									</DropdownMenu.Item>
									<DropdownMenu.Item
										class={menuItem}
										onSelect={() => submit('toggleDisabled', { userId: user.id })}
									>
										<UserX class="size-4" />
										{user.disabled ? 'Enable account' : 'Disable account'}
									</DropdownMenu.Item>
									<DropdownMenu.Separator class={menuSeparator} />
									<DropdownMenu.Item
										class="{menuItem} text-danger"
										onSelect={() =>
											submit(
												'delete',
												{ userId: user.id },
												`Delete ${user.username} and all of their library and history? This can't be undone.`
											)}
									>
										<Trash2 class="size-4" /> Delete account
									</DropdownMenu.Item>
								{/if}
							</DropdownMenu.Content>
						</DropdownMenu.Portal>
					</DropdownMenu.Root>
				</li>
			{/each}
		</ul>
	</SettingsSection>

	<SettingsSection title="Add an account">
		<form
			method="POST"
			action="?/create"
			class="space-y-4 p-5"
			use:enhance={() => {
				creating = true;
				return async ({ update }) => {
					await update();
					creating = false;
				};
			}}
		>
			<div class="grid gap-4 sm:grid-cols-2">
				<FormField
					label="Username"
					name="username"
					autocapitalize="none"
					autocomplete="off"
					required
					value={form?.action === 'create' ? (form.username ?? '') : ''}
				/>
				<FormField
					label="Display name"
					name="displayName"
					autocomplete="off"
					value={form?.action === 'create' ? (form.displayName ?? '') : ''}
				/>
			</div>
			<FormField
				label="Temporary password"
				name="password"
				type="password"
				autocomplete="new-password"
				required
				hint="At least 8 characters. They can change it in Settings."
			/>
			<label class="flex items-center gap-2 text-sm">
				<input type="checkbox" name="role" value="admin" class="size-4 accent-[var(--accent)]" /> Admin
				(can manage users)
			</label>
			{#if form?.action === 'create' && form.error}<p class="text-sm text-danger">
					{form.error}
				</p>{/if}
			<div class="flex justify-end">
				<Button type="submit" size="sm" disabled={creating}
					><UserPlus class="size-4" /> Create account</Button
				>
			</div>
		</form>
	</SettingsSection>
</div>

<Dialog.Root bind:open={resetOpen}>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
		<Dialog.Content
			class="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 mx-auto max-w-sm rounded-3xl border border-border bg-surface p-6 shadow-2xl sm:top-1/2 sm:bottom-auto sm:-translate-y-1/2"
		>
			<Dialog.Title class="text-lg font-semibold">Reset password</Dialog.Title>
			<Dialog.Description class="mt-1 text-sm text-muted"
				>New password for @{resetFor?.username}. They'll be signed out everywhere.</Dialog.Description
			>
			<form
				method="POST"
				action="?/reset"
				class="mt-5 space-y-4"
				use:enhance={() =>
					async ({ update }) => {
						await update();
						resetOpen = false;
					}}
			>
				<input type="hidden" name="userId" value={resetFor?.id} />
				<FormField
					label="New password"
					name="password"
					type="password"
					autocomplete="new-password"
					required
					minlength={8}
				/>
				<div class="flex justify-end gap-2">
					<Button type="button" variant="ghost" onclick={() => (resetOpen = false)}>Cancel</Button>
					<Button type="submit">Reset</Button>
				</div>
			</form>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
