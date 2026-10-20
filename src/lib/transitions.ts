export const HERO_POSTER = 'hero-poster';

/**
 * Marks the tapped poster so the View Transition morphs it into the title page's poster.
 * Only one element may carry the name, so any previous one is cleared first.
 */
export function markHeroPoster(element: HTMLElement | null | undefined) {
	if (!element || !('startViewTransition' in document)) return;
	for (const el of document.querySelectorAll<HTMLElement>('[data-hero-poster]')) {
		el.style.viewTransitionName = '';
		delete el.dataset.heroPoster;
	}
	element.style.viewTransitionName = HERO_POSTER;
	element.dataset.heroPoster = '';
}
