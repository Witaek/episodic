<script lang="ts">
	import type { Image } from '$lib/catalog/types';

	interface Props {
		image: Image | null;
		alt: string;
		sizes?: string;
		class?: string;
		/** Load immediately (above the fold). */
		eager?: boolean;
		/** View Transition name, for morphing between pages. */
		transitionName?: string;
		/**
		 * Largest image width to download. Phones pick by screen density, so a 400px-wide card on a
		 * 3x screen would otherwise fetch a 1280px+ image.
		 */
		maxWidth?: number;
	}

	let {
		image,
		alt,
		sizes = '200px',
		class: className = '',
		eager = false,
		transitionName,
		maxWidth = 1280
	}: Props = $props();

	// Drop candidates wider than maxWidth (also fixes data stored before sizes were capped).
	const srcset = $derived.by(() => {
		if (!image?.srcset) return undefined;
		const kept = image.srcset
			.split(',')
			.map((c) => c.trim())
			.filter((c) => Number(c.match(/\s(\d+)w$/)?.[1] ?? 0) <= maxWidth);
		return kept.length ? kept.join(', ') : undefined;
	});
	// When the default is too big, use the largest kept candidate.
	const src = $derived.by(() => {
		if (!image) return undefined;
		const last = srcset?.split(',').at(-1)?.trim().split(/\s+/)[0];
		const defaultWidth = Number(image.url.match(/\/w(\d+)\//)?.[1] ?? 0);
		return last && defaultWidth > maxWidth ? last : image.url;
	});

	// The image is absolutely positioned inside; the wrapper needs a position unless one is given.
	const position = $derived(/\b(absolute|fixed|sticky)\b/.test(className) ? '' : 'relative');

	/**
	 * Fades the image in once it has loaded. Server-rendered images can finish loading before
	 * hydration (so `onload` never fires), which is why `complete` is checked first.
	 */
	function fadeIn(img: HTMLImageElement) {
		const show = () => img.classList.replace('opacity-0', 'opacity-100');
		const hide = () => img.classList.add('invisible');
		if (img.complete) {
			if (img.naturalWidth > 0) show();
			else hide();
			return;
		}
		img.addEventListener('load', show, { once: true });
		img.addEventListener('error', hide, { once: true });
		return () => {
			img.removeEventListener('load', show);
			img.removeEventListener('error', hide);
		};
	}
</script>

<div
	class="{position} overflow-hidden bg-surface-2 {className}"
	style:background-color={image?.color ?? undefined}
	style:view-transition-name={transitionName}
	data-hero-poster={transitionName ? '' : undefined}
>
	{#if image}
		{#key image.url}
			<img
				{@attach fadeIn}
				{src}
				{srcset}
				{sizes}
				{alt}
				loading={eager ? 'eager' : 'lazy'}
				fetchpriority={eager ? 'high' : 'auto'}
				decoding="async"
				class="absolute inset-0 size-full object-cover opacity-0 transition-opacity duration-500"
			/>
		{/key}
	{/if}
</div>
