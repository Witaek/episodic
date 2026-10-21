import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import Img from '../../src/lib/components/Img.svelte';
import { withTmdbOriginal } from '../../src/lib/images';

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

describe('full-size TMDB images for data stored by 1.5.x', () => {
	const tmdb = (path: string, sizes: [string, number][]) =>
		sizes.map(([size, w]) => `https://image.tmdb.org/t/p/${size}${path} ${w}w`).join(', ');

	it('adds the original back to backdrops and stills', () => {
		expect(
			withTmdbOriginal(
				tmdb('/b.jpg', [
					['w780', 780],
					['w1280', 1280]
				])
			)
		).toContain('https://image.tmdb.org/t/p/original/b.jpg 1920w');
		expect(
			withTmdbOriginal(
				tmdb('/s.jpg', [
					['w185', 185],
					['w300', 300]
				])
			)
		).toContain('https://image.tmdb.org/t/p/original/s.jpg 1280w');
	});

	it('leaves posters, other hosts and up-to-date data alone', () => {
		const poster = tmdb('/p.jpg', [
			['w342', 342],
			['w780', 780]
		]);
		expect(withTmdbOriginal(poster)).toBe(poster);
		const current = tmdb('/s.jpg', [
			['w300', 300],
			['original', 1280]
		]);
		expect(withTmdbOriginal(current)).toBe(current);
		expect(withTmdbOriginal('https://covers.openlibrary.org/b/id/1-L.jpg 500w')).toBe(
			'https://covers.openlibrary.org/b/id/1-L.jpg 500w'
		);
	});

	it('large cards get a sharp still, small thumbnails stay light', () => {
		const still = {
			url: 'https://image.tmdb.org/t/p/w300/s.jpg',
			srcset: tmdb('/s.jpg', [
				['w185', 185],
				['w300', 300]
			])
		};
		expect(render(Img, { props: { image: still, alt: '', maxWidth: 1280 } }).body).toContain(
			'original/s.jpg 1280w'
		);
		expect(render(Img, { props: { image: still, alt: '', maxWidth: 300 } }).body).not.toContain(
			'original'
		);
	});
});
