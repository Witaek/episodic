<script lang="ts">
	import { onMount } from 'svelte';
	import { Bell, BellOff, Send, Trash2 } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import { isIos, isStandalone } from '$lib/pwa.svelte';
	import Button from './Button.svelte';
	import FormField from './FormField.svelte';

	interface Target {
		id: number;
		type: 'webpush' | 'ntfy' | 'discord';
		label: string;
		endpoint: string | null;
		lastError: string | null;
		lastSentAt: string | null;
	}

	let targets = $state<Target[]>([]);
	let vapidKey = $state('');
	let thisEndpoint = $state<string | null>(null);
	let pushSupport = $state<'ok' | 'insecure' | 'ios-install' | 'unsupported' | 'loading'>(
		'loading'
	);
	let busy = $state(false);

	let addType = $state<'ntfy' | 'discord' | null>(null);
	let addUrl = $state('');
	let addToken = $state('');

	const thisDevice = $derived(
		targets.find((t) => t.type === 'webpush' && t.endpoint === thisEndpoint)
	);

	async function load() {
		const response = await fetch('/api/notifications');
		if (!response.ok) return;
		const data = await response.json();
		targets = data.targets;
		vapidKey = data.vapidPublicKey;
	}

	onMount(async () => {
		if (!window.isSecureContext) pushSupport = 'insecure';
		else if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
			pushSupport = isIos() && !isStandalone() ? 'ios-install' : 'unsupported';
		} else pushSupport = 'ok';
		await load();
		if (pushSupport === 'ok') {
			const registration = await navigator.serviceWorker.getRegistration();
			thisEndpoint = (await registration?.pushManager.getSubscription())?.endpoint ?? null;
		}
	});

	function keyBytes(base64: string) {
		const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
			.replace(/-/g, '+')
			.replace(/_/g, '/');
		return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
	}

	function deviceName() {
		const ua = navigator.userAgent;
		const os = /iPhone/.test(ua)
			? 'iPhone'
			: /iPad/.test(ua)
				? 'iPad'
				: /Android/.test(ua)
					? 'Android'
					: /Mac/.test(ua)
						? 'Mac'
						: /Windows/.test(ua)
							? 'Windows'
							: 'This device';
		const browser = /Edg\//.test(ua)
			? 'Edge'
			: /Firefox\//.test(ua)
				? 'Firefox'
				: /Chrome\//.test(ua)
					? 'Chrome'
					: /Safari\//.test(ua)
						? 'Safari'
						: 'browser';
		return `${os} · ${browser}`;
	}

	async function enablePush() {
		busy = true;
		try {
			if ((await Notification.requestPermission()) !== 'granted') {
				toast.error('Notifications are blocked for this site in your browser settings.');
				return;
			}
			const registration = await navigator.serviceWorker.ready;
			const subscription =
				(await registration.pushManager.getSubscription()) ??
				(await registration.pushManager.subscribe({
					userVisibleOnly: true,
					applicationServerKey: keyBytes(vapidKey)
				}));
			const response = await fetch('/api/notifications', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					type: 'webpush',
					label: deviceName(),
					subscription: subscription.toJSON()
				})
			});
			if (!response.ok) throw new Error((await response.json()).message);
			thisEndpoint = subscription.endpoint;
			await load();
			toast.success('Notifications on for this device');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Couldn't turn on notifications");
		} finally {
			busy = false;
		}
	}

	async function remove(target: Target) {
		await fetch(`/api/notifications/${target.id}`, { method: 'DELETE' });
		if (target.endpoint && target.endpoint === thisEndpoint) {
			const registration = await navigator.serviceWorker.getRegistration();
			await (await registration?.pushManager.getSubscription())?.unsubscribe();
			thisEndpoint = null;
		}
		await load();
	}

	async function test(target: Target) {
		const response = await fetch(`/api/notifications/${target.id}/test`, { method: 'POST' });
		if (response.ok) toast.success('Test sent');
		else toast.error((await response.json().catch(() => ({}))).message ?? 'Test failed');
		await load();
	}

	async function addOther(event: SubmitEvent) {
		event.preventDefault();
		if (!addType) return;
		busy = true;
		const response = await fetch('/api/notifications', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				type: addType,
				label: addType === 'ntfy' ? `ntfy · ${new URL(addUrl).pathname.slice(1)}` : 'Discord',
				url: addUrl,
				token: addType === 'ntfy' ? addToken : undefined
			})
		}).catch(() => null);
		busy = false;
		if (!response?.ok) {
			toast.error((await response?.json().catch(() => ({})))?.message ?? "Couldn't add it");
			return;
		}
		const created = (await response.json()) as Target;
		addType = null;
		addUrl = '';
		addToken = '';
		await load();
		await test(created);
	}
</script>

<div class="space-y-4 p-5 text-sm">
	<p class="text-muted">
		Get a notification when a new episode of a show you're watching comes out. To include shows on
		your watchlist, see Preferences below.
	</p>

	<div class="flex flex-wrap items-center justify-between gap-3">
		<span class="font-medium">This device</span>
		{#if pushSupport === 'ok'}
			{#if thisDevice}
				<span class="inline-flex items-center gap-1.5 text-success"><Bell class="size-4" /> On</span
				>
			{:else}
				<Button size="sm" onclick={enablePush} disabled={busy || !vapidKey}
					><Bell class="size-4" /> Turn on</Button
				>
			{/if}
		{:else if pushSupport === 'ios-install'}
			<span class="max-w-xs text-right text-muted"
				>Install the app first (Settings → Install the app), then turn notifications on from the
				installed app.</span
			>
		{:else if pushSupport === 'insecure'}
			<span class="max-w-xs text-right text-muted"
				>Needs an https:// address (see the Tailscale guide).</span
			>
		{:else if pushSupport === 'unsupported'}
			<span class="text-muted">Not supported by this browser.</span>
		{/if}
	</div>

	{#if targets.length}
		<ul class="divide-y divide-border rounded-xl border border-border">
			{#each targets as target (target.id)}
				<li class="flex items-center gap-3 px-3 py-2.5">
					<div class="min-w-0 flex-1">
						<p class="truncate font-medium">
							{target.label}{target.endpoint && target.endpoint === thisEndpoint
								? ' (this device)'
								: ''}
						</p>
						{#if target.lastError}
							<p class="truncate text-xs text-danger">Last attempt failed: {target.lastError}</p>
						{:else if target.lastSentAt}
							<p class="text-xs text-muted">
								Last sent {new Date(target.lastSentAt).toLocaleString()}
							</p>
						{/if}
					</div>
					<button
						type="button"
						class="grid size-8 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"
						onclick={() => test(target)}
						aria-label="Send a test to {target.label}"
					>
						<Send class="size-4" />
					</button>
					<button
						type="button"
						class="grid size-8 place-items-center rounded-full text-muted hover:bg-danger/10 hover:text-danger"
						onclick={() => remove(target)}
						aria-label="Remove {target.label}"
					>
						{#if target.type === 'webpush'}<BellOff class="size-4" />{:else}<Trash2
								class="size-4"
							/>{/if}
					</button>
				</li>
			{/each}
		</ul>
	{/if}

	{#if addType}
		<form class="space-y-3 rounded-xl border border-border p-3" onsubmit={addOther}>
			{#if addType === 'ntfy'}
				<FormField
					label="ntfy topic address"
					name="url"
					type="url"
					required
					placeholder="https://ntfy.sh/my-secret-episodic-topic"
					bind:value={addUrl}
					hint="Use a hard-to-guess topic name, or your own ntfy server."
				/>
				<FormField
					label="Access token"
					name="token"
					type="password"
					autocomplete="off"
					bind:value={addToken}
					hint="Optional, for protected topics."
				/>
			{:else}
				<FormField
					label="Discord webhook URL"
					name="url"
					type="url"
					required
					placeholder="https://discord.com/api/webhooks/…"
					bind:value={addUrl}
					hint="Server Settings → Integrations → Webhooks → New Webhook → Copy URL."
				/>
			{/if}
			<div class="flex justify-end gap-2">
				<Button type="button" size="sm" variant="ghost" onclick={() => (addType = null)}
					>Cancel</Button
				>
				<Button type="submit" size="sm" disabled={busy}>Add and send a test</Button>
			</div>
		</form>
	{:else}
		<div class="flex flex-wrap gap-2">
			<Button size="sm" variant="secondary" onclick={() => (addType = 'ntfy')}>Add ntfy</Button>
			<Button size="sm" variant="secondary" onclick={() => (addType = 'discord')}
				>Add Discord</Button
			>
		</div>
	{/if}
</div>
