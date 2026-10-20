<script lang="ts">
	import { CalendarClock } from '@lucide/svelte';
	import ComingSoon from '$lib/components/ComingSoon.svelte';
</script>

<svelte:head><title>Upcoming · Episodic</title></svelte:head>

<ComingSoon
	icon={CalendarClock}
	title="Upcoming episodes"
	description="Everything airing in the next 30 days for the shows you follow, with exact air times."
	phase="phase 3"
/>
