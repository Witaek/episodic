<script lang="ts">
	import { onMount } from 'svelte';
	import { CircleCheck, Download, Share, SquarePlus } from '@lucide/svelte';
	import { isIos, isStandalone, pwa } from '$lib/pwa.svelte';
	import Button from './Button.svelte';

	let mode = $state<'loading' | 'installed' | 'prompt' | 'ios' | 'insecure' | 'manual'>('loading');

	onMount(() => {
		if (isStandalone() || pwa.installed) mode = 'installed';
		else if (!window.isSecureContext) mode = 'insecure';
		else if (isIos()) mode = 'ios';
		else mode = 'manual';
	});
	const effective = $derived(
		mode === 'manual' && pwa.prompt ? 'prompt' : pwa.installed ? 'installed' : mode
	);

	async function install() {
		if (!pwa.prompt) return;
		await pwa.prompt.prompt();
		const { outcome } = await pwa.prompt.userChoice;
		if (outcome === 'accepted') pwa.installed = true;
		pwa.prompt = null;
	}
</script>

<div class="p-5 text-sm">
	{#if effective === 'installed'}
		<p class="flex items-center gap-2 font-medium text-success">
			<CircleCheck class="size-5" /> Episodic is installed on this device.
		</p>
	{:else if effective === 'prompt'}
		<div class="flex items-center justify-between gap-4">
			<p class="text-muted">
				Add Episodic to your home screen or dock. It opens full-screen, like an app.
			</p>
			<Button size="sm" onclick={install}><Download class="size-4" /> Install</Button>
		</div>
	{:else if effective === 'ios'}
		<p class="mb-2 text-muted">To install on iPhone or iPad, in Safari:</p>
		<ol class="space-y-1.5">
			<li class="flex items-center gap-2">
				1. Tap <Share class="size-4 text-accent" /> <b>Share</b>
			</li>
			<li class="flex items-center gap-2">
				2. Choose <SquarePlus class="size-4 text-accent" /> <b>Add to Home Screen</b>
			</li>
			<li>3. Tap <b>Add</b></li>
		</ol>
	{:else if effective === 'insecure'}
		<p class="text-muted">
			Installing needs a secure (https://) address. Open Episodic through your Tailscale HTTPS
			address to install it. See <a
				class="text-accent hover:underline"
				href="https://github.com/Witaek/episodic/blob/main/docs/https-tailscale.md"
				>HTTPS with Tailscale</a
			>.
		</p>
	{:else if effective === 'manual'}
		<p class="text-muted">
			Use your browser's menu: <b>Install app</b> or <b>Add to Home screen</b> (Chrome, Edge), or
			<b>File → Add to Dock</b> (Safari on Mac).
		</p>
	{/if}
</div>
