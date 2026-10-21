<script lang="ts">
	import { CheckCheck } from '@lucide/svelte';
	import type { Image } from '$lib/catalog/types';
	import Img from './Img.svelte';
	import ProgressBar from './ProgressBar.svelte';

	export interface LinkedTitleItem {
		href: string;
		name: string;
		year: number | null;
		poster: Image | null;
		label: string;
		done: boolean;
		percent: number | null;
	}

	/** Cards linking across Watch and Read: adaptations, or what a title is based on. */
	let { items }: { items: LinkedTitleItem[] } = $props();
</script>

<ul class="-mx-4 flex [scrollbar-width:none] gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
	{#each items as item (item.href)}
		<li class="w-32 shrink-0 md:w-36">
			<a href={item.href} class="group block">
				<div class="relative">
					<Img
						image={item.poster}
						alt=""
						sizes="144px"
						class="aspect-[2/3] rounded-xl shadow-md ring-1 ring-white/5 transition group-hover:-translate-y-0.5"
					/>
					{#if !item.poster}
						<span
							class="absolute inset-0 grid place-items-center p-3 text-center text-xs text-muted"
						>
							{item.name}
						</span>
					{/if}
					{#if item.done}
						<span
							class="absolute top-2 right-2 grid size-7 place-items-center rounded-full bg-success text-bg shadow"
							title="Done"
						>
							<CheckCheck class="size-4" />
						</span>
					{:else if item.percent}
						<div
							class="absolute inset-x-0 bottom-0 rounded-b-xl bg-gradient-to-t from-black/80 to-transparent p-2 pt-5"
						>
							<ProgressBar percent={item.percent} onImage />
						</div>
					{/if}
				</div>
				<p class="mt-2 line-clamp-2 text-sm leading-snug font-medium">{item.name}</p>
				<p class="text-xs text-muted">{[item.label, item.year].filter(Boolean).join(' · ')}</p>
			</a>
		</li>
	{/each}
</ul>
