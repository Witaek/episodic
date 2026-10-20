<script lang="ts">
	import AppNav from '$lib/components/AppNav.svelte';

	let { children } = $props();
</script>

<AppNav />

<div class="min-h-dvh pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0 lg:pl-60">
	{@render children()}
</div>
