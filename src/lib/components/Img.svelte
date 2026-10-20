<script lang="ts">
	import type { Image } from '$lib/catalog/types';

	interface Props {
		image: Image | null;
		alt: string;
		sizes?: string;
		class?: string;
		/** Load immediately (above the fold). */
		eager?: boolean;
	}

	let { image, alt, sizes = '200px', class: className = '', eager = false }: Props = $props();

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
>
	{#if image}
		{#key image.url}
			<img
				{@attach fadeIn}
				src={image.url}
				srcset={image.srcset}
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
