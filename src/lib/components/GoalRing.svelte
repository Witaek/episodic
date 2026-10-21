<script lang="ts">
	interface Props {
		done: number;
		target: number;
		size?: number;
	}

	let { done, target, size = 72 }: Props = $props();
	const stroke = 7;
	const radius = $derived((size - stroke) / 2);
	const circumference = $derived(2 * Math.PI * radius);
	const fraction = $derived(target > 0 ? Math.min(done / target, 1) : 0);
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 {size} {size}"
	class="shrink-0 -rotate-90"
	role="img"
	aria-label="{done} of {target}"
>
	<circle
		cx={size / 2}
		cy={size / 2}
		r={radius}
		fill="none"
		stroke="currentColor"
		stroke-width={stroke}
		class="text-fg/10"
	/>
	<circle
		cx={size / 2}
		cy={size / 2}
		r={radius}
		fill="none"
		stroke="var(--accent)"
		stroke-width={stroke}
		stroke-linecap="round"
		stroke-dasharray={circumference}
		stroke-dashoffset={circumference * (1 - fraction)}
		class="transition-[stroke-dashoffset] duration-700"
	/>
</svg>
