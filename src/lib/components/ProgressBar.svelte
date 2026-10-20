<script lang="ts">
	let { percent, class: className = '' }: { percent: number; class?: string } = $props();
</script>

<div
	class="h-1.5 overflow-hidden rounded-full bg-white/15 {className}"
	role="progressbar"
	aria-valuemin={0}
	aria-valuemax={100}
	aria-valuenow={percent}
>
	<div
		class="h-full rounded-full bg-success transition-[width] duration-500 ease-out"
		style:width="{Math.max(percent, percent > 0 ? 3 : 0)}%"
	></div>
</div>
