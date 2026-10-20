<script lang="ts">
	import type { StatsCategory } from '$lib/server/services/stats';

	interface Props {
		months: { month: string; minutes: Record<StatsCategory, number> }[];
	}

	let { months }: Props = $props();

	// Fixed order = fixed color slot per category (validated in both themes).
	const series: { key: StatsCategory; label: string }[] = [
		{ key: 'show', label: 'TV shows' },
		{ key: 'anime', label: 'Anime' },
		{ key: 'movie', label: 'Movies' }
	];

	const W = 640;
	const H = 220;
	const PAD = { top: 12, right: 8, bottom: 26, left: 36 };
	const plotW = W - PAD.left - PAD.right;
	const plotH = H - PAD.top - PAD.bottom;
	const GAP = 2;

	const hours = (m: number) => m / 60;
	const totals = $derived(
		months.map((m) => hours(m.minutes.show + m.minutes.anime + m.minutes.movie))
	);
	const max = $derived(Math.max(...totals, 1));
	// A "nice" axis maximum and 3–4 ticks.
	const step = $derived.by(() => {
		const raw = max / 4;
		const magnitude = 10 ** Math.floor(Math.log10(raw));
		return [1, 2, 5, 10].map((f) => f * magnitude).find((s) => s >= raw) ?? raw;
	});
	const top = $derived(Math.ceil(max / step) * step);
	const ticks = $derived(Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step));
	const y = (value: number) => PAD.top + plotH - (value / top) * plotH;
	const band = $derived(plotW / months.length);
	const barW = $derived(Math.min(28, band * 0.6));

	const label = (month: string, long = false) =>
		new Date(Number(month.slice(0, 4)), Number(month.slice(5)) - 1, 1).toLocaleDateString(
			undefined,
			{
				month: long ? 'long' : 'short',
				year: long ? 'numeric' : undefined
			}
		);
	const format = (h: number) => (h >= 10 ? `${Math.round(h)} h` : `${h.toFixed(1)} h`);

	let hovered = $state<number | null>(null);
	let showTable = $state(false);

	/** Stacked segments from the baseline up; only the top segment gets rounded ends. */
	function segments(index: number) {
		const m = months[index].minutes;
		let base = 0;
		const parts = series
			.map((s) => ({ ...s, value: hours(m[s.key]) }))
			.filter((p) => p.value > 0)
			.map((p) => {
				const y0 = y(base);
				base += p.value;
				const y1 = y(base);
				return { ...p, y: y1, h: Math.max(y0 - y1 - GAP, 1) };
			});
		return parts.map((p, i) => ({ ...p, top: i === parts.length - 1 }));
	}
</script>

<div class="viz">
	<div class="mb-3 flex flex-wrap items-center justify-between gap-3">
		<ul class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted" aria-label="Legend">
			{#each series as s (s.key)}
				<li class="flex items-center gap-1.5">
					<span class="size-2.5 rounded-sm" style:background="var(--series-{s.key})"></span>
					{s.label}
				</li>
			{/each}
		</ul>
		<button
			type="button"
			class="text-sm font-medium text-accent hover:underline"
			aria-pressed={showTable}
			onclick={() => (showTable = !showTable)}
		>
			{showTable ? 'Show chart' : 'Show table'}
		</button>
	</div>

	{#if showTable}
		<div class="overflow-x-auto">
			<table class="w-full text-sm tabular-nums">
				<thead class="text-left text-muted">
					<tr>
						<th class="py-1.5 font-medium">Month</th>
						{#each series as s (s.key)}<th class="py-1.5 text-right font-medium">{s.label}</th
							>{/each}
						<th class="py-1.5 text-right font-medium">Total</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-border">
					{#each months as m, i (m.month)}
						<tr>
							<td class="py-1.5">{label(m.month, true)}</td>
							{#each series as s (s.key)}<td class="py-1.5 text-right"
									>{format(hours(m.minutes[s.key]))}</td
								>{/each}
							<td class="py-1.5 text-right font-medium">{format(totals[i])}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else}
		<div class="relative">
			<svg
				viewBox="0 0 {W} {H}"
				class="w-full"
				role="img"
				aria-label="Hours watched per month, last 12 months"
			>
				{#each ticks as tick (tick)}
					<line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} class="grid-line" />
					<text x={PAD.left - 6} y={y(tick)} dy="0.32em" text-anchor="end" class="axis">{tick}</text
					>
				{/each}
				{#each months as m, i (m.month)}
					{@const cx = PAD.left + band * i + band / 2}
					<g
						role="presentation"
						onpointerenter={() => (hovered = i)}
						onpointerleave={() => (hovered = null)}
					>
						<!-- Hit target: the whole column, bigger than the bar. -->
						<rect
							x={PAD.left + band * i}
							y={PAD.top}
							width={band}
							height={plotH}
							fill="transparent"
						/>
						{#if hovered === i}
							<rect
								x={PAD.left + band * i + 2}
								y={PAD.top}
								width={band - 4}
								height={plotH}
								rx="6"
								class="hover-band"
							/>
						{/if}
						{#each segments(i) as seg (seg.key)}
							<path
								d={seg.top
									? `M${cx - barW / 2},${seg.y + seg.h} V${seg.y + 4} Q${cx - barW / 2},${seg.y} ${cx - barW / 2 + 4},${seg.y} H${cx + barW / 2 - 4} Q${cx + barW / 2},${seg.y} ${cx + barW / 2},${seg.y + 4} V${seg.y + seg.h} Z`
									: `M${cx - barW / 2},${seg.y} h${barW} v${seg.h} h${-barW} Z`}
								fill="var(--series-{seg.key})"
							/>
						{/each}
						<text x={cx} y={H - 8} text-anchor="middle" class="axis"
							>{label(m.month).slice(0, 3)}</text
						>
					</g>
				{/each}
				<line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} class="baseline" />
			</svg>
			{#if hovered !== null}
				{@const m = months[hovered]}
				<div
					class="pointer-events-none absolute top-0 z-10 w-44 -translate-x-1/2 rounded-xl border border-border bg-surface p-3 text-sm shadow-xl"
					style:left="{((PAD.left + band * hovered + band / 2) / W) * 100}%"
					role="tooltip"
				>
					<p class="mb-1.5 font-semibold">{label(m.month, true)}</p>
					{#each series as s (s.key)}
						<p class="flex items-center justify-between gap-3 text-muted">
							<span class="flex items-center gap-1.5">
								<span class="size-2 rounded-sm" style:background="var(--series-{s.key})"
								></span>{s.label}
							</span>
							<span class="text-fg tabular-nums">{format(hours(m.minutes[s.key]))}</span>
						</p>
					{/each}
					<p class="mt-1.5 flex justify-between border-t border-border pt-1.5 font-medium">
						<span>Total</span><span class="tabular-nums">{format(totals[hovered])}</span>
					</p>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	/* Categorical slots, stepped per theme (validated: CVD ΔE ≥ 9.2, normal-vision ≥ 26). */
	.viz {
		--series-show: #3987e5;
		--series-anime: #d95926;
		--series-movie: #199e70;
	}
	:global(:root[data-theme='light']) .viz {
		--series-show: #2a78d6;
		--series-anime: #eb6834;
		--series-movie: #1baf7a;
	}
	@media (prefers-color-scheme: light) {
		:global(:root[data-theme='system']) .viz {
			--series-show: #2a78d6;
			--series-anime: #eb6834;
			--series-movie: #1baf7a;
		}
	}
	.grid-line {
		stroke: var(--border);
		stroke-width: 1;
		stroke-dasharray: 2 4;
	}
	.baseline {
		stroke: var(--muted);
		stroke-width: 1;
	}
	.axis {
		fill: var(--muted);
		font-size: 11px;
	}
	.hover-band {
		fill: var(--surface-2);
	}
</style>
