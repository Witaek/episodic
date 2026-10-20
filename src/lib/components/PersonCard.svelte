<script lang="ts">
	import type { Person } from '$lib/catalog/types';
	import Img from './Img.svelte';

	let { person }: { person: Person } = $props();
</script>

<div class="w-24 text-center md:w-28">
	<Img
		image={person.photo}
		alt=""
		sizes="112px"
		class="mx-auto aspect-square w-20 rounded-full ring-1 ring-border md:w-24"
	/>
	<p class="mt-2 line-clamp-2 text-sm leading-tight font-medium">{person.name}</p>
	{#if person.role}
		<p class="mt-0.5 line-clamp-2 text-xs text-muted">{person.role}</p>
	{/if}
</div>
