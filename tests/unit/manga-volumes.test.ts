import { describe, expect, it } from 'vitest';
import { layoutVolumes } from '../../src/lib/server/services/manga-volumes';

const summary = (layout: ReturnType<typeof layoutVolumes>) =>
	layout.map(
		(v) =>
			`${v.volume ?? 'new'}:${v.chapters[0] ?? '-'}-${v.chapters.at(-1) ?? '-'}${v.estimated ? '~' : ''}`
	);

describe('layoutVolumes', () => {
	it('fills missing early volumes of a finished, licensed series (Demon Slayer)', () => {
		const layout = layoutVolumes({
			anilistVolumes: 23,
			anilistChapters: 205,
			mangadex: [
				{ volume: 16, chapters: [138, 139, 140, 141, 142] },
				{ volume: 23, chapters: [197, 198, 199, 200, 201, 202, 203, 204, 205] }
			]
		});
		expect(layout).toHaveLength(23);
		expect(layout[0]).toMatchObject({ volume: 1, estimated: true });
		expect(layout[0].chapters[0]).toBe(1);
		expect(layout[14].chapters.at(-1)).toBe(137); // volume 15 ends where 16 starts
		expect(layout[15]).toMatchObject({
			volume: 16,
			estimated: false,
			chapters: [138, 139, 140, 141, 142]
		});
		expect(layout.flatMap((v) => v.chapters)).toEqual(Array.from({ length: 205 }, (_, i) => i + 1));
	});

	it('uses covers to know volumes and adds newer chapters for an ongoing series', () => {
		const layout = layoutVolumes({
			mangadex: [
				{ volume: 1, chapters: [1, 2, 3, 4, 5, 6, 7] },
				{ volume: 3, chapters: [17, 18, 19, 20, 21, 22, 23, 24, 25] },
				{ volume: null, chapters: [30, 31] }
			],
			coverVolumes: [1, 2, 3, 4]
		});
		expect(summary(layout)).toEqual(['1:1-7', '2:8-16~', '3:17-25', '4:26-29~', 'new:30-31']);
	});

	it('handles nothing known, chapters only, and volumes without chapters', () => {
		expect(layoutVolumes({})).toEqual([]);
		expect(summary(layoutVolumes({ anilistChapters: 12 }))).toEqual(['new:1-12']);
		expect(summary(layoutVolumes({ anilistVolumes: 3 }))).toEqual(['1:---', '2:---', '3:---']);
	});
});
