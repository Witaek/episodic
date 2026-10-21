import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import Img from '../../src/lib/components/Img.svelte';

const still = {
	url: 'https://image.tmdb.org/t/p/w300/s.jpg',
	// As stored before sizes were capped: includes a 1280px original.
	srcset:
		'https://image.tmdb.org/t/p/w300/s.jpg 300w, https://image.tmdb.org/t/p/original/s.jpg 1280w'
};

describe('Img width cap', () => {
	it('drops candidates wider than maxWidth', () => {
		const { body } = render(Img, { props: { image: still, alt: '', maxWidth: 300 } });
		expect(body).toContain('w300/s.jpg 300w');
		expect(body).not.toContain('original');
	});

	it('falls back to the largest allowed candidate when the default is too big', () => {
		const backdrop = {
			url: 'https://image.tmdb.org/t/p/w1280/b.jpg',
			srcset:
				'https://image.tmdb.org/t/p/w300/b.jpg 300w, https://image.tmdb.org/t/p/w780/b.jpg 780w, https://image.tmdb.org/t/p/w1280/b.jpg 1280w'
		};
		const { body } = render(Img, { props: { image: backdrop, alt: '', maxWidth: 780 } });
		expect(body).toMatch(/src="https:\/\/image\.tmdb\.org\/t\/p\/w780\/b\.jpg"/);
		expect(body).not.toContain('w1280');
	});
});
