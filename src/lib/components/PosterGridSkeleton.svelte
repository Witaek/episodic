<script lang="ts">
	let { count = 14 }: { count?: number } = $props();
</script>

<ul
	class="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8"
	aria-hidden="true"
>
	{#each Array(count) as _, i (i)}
		<li>
			<div class="aspect-[2/3] animate-pulse rounded-xl bg-surface-2"></div>
			<div class="mt-2 h-3.5 w-3/4 animate-pulse rounded bg-surface-2"></div>
			<div class="mt-1.5 h-3 w-1/3 animate-pulse rounded bg-surface-2"></div>
		</li>
	{/each}
</ul>
