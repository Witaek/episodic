<script lang="ts">
	import { navigating } from '$app/state';
	import { Toaster } from 'svelte-sonner';
	import { onMount } from 'svelte';
	import AppNav from '$lib/components/AppNav.svelte';
	import { listenForInstallPrompt } from '$lib/pwa.svelte';

	let { data, children } = $props();

	onMount(listenForInstallPrompt);

	// Show the progress bar only for navigations that take a moment.
	let showProgress = $state(false);
	$effect(() => {
		if (!navigating.to) {
			showProgress = false;
			return;
		}
		const timer = setTimeout(() => (showProgress = true), 150);
		return () => clearTimeout(timer);
	});
</script>

{#if showProgress}
	<div
		class="fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden"
		role="progressbar"
		aria-label="Loading"
	>
		<div class="nav-progress h-full w-1/3 rounded-full bg-accent"></div>
	</div>
{/if}

<AppNav />

<div class="min-h-dvh pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0 lg:pl-60">
	{@render children()}
</div>

<Toaster
	theme={data.theme}
	position="bottom-center"
	richColors
	closeButton={false}
	offset={{ bottom: 'calc(5rem + env(safe-area-inset-bottom))' }}
	mobileOffset={{ bottom: 'calc(5rem + env(safe-area-inset-bottom))' }}
/>

<style>
	.nav-progress {
		animation: nav-progress 1.1s ease-in-out infinite;
	}
	@keyframes nav-progress {
		from {
			transform: translateX(-100%);
		}
		to {
			transform: translateX(300%);
		}
	}
</style>
