<script lang="ts">
	import { Toaster } from 'svelte-sonner';
	import AppNav from '$lib/components/AppNav.svelte';

	let { children } = $props();
</script>

<AppNav />

<div class="min-h-dvh pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0 lg:pl-60">
	{@render children()}
</div>

<Toaster
	theme="dark"
	position="bottom-center"
	richColors
	closeButton={false}
	offset={{ bottom: 'calc(5rem + env(safe-area-inset-bottom))' }}
	mobileOffset={{ bottom: 'calc(5rem + env(safe-area-inset-bottom))' }}
	toastOptions={{ class: 'episodic-toast' }}
/>
