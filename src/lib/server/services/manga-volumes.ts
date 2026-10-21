import type { MangaVolume } from '../providers/mangadex';

/**
 * Builds a manga's volume → chapters layout from incomplete sources:
 * - AniList knows total volumes/chapters only once a series has finished;
 * - MangaDex knows chapters per volume, but licensed series have gaps (removed chapters);
 * - MangaDex covers tell which volumes exist even when their chapters are missing.
 *
 * Volumes whose chapters are unknown get the chapters between their known neighbours, spread
 * evenly (marked `estimated`). Chapters published after the last volume form a final group.
 */

export interface VolumeLayout {
	/** Volume number, or null for "not in a volume yet". */
	volume: number | null;
	chapters: number[];
	/** Chapter numbers were spread evenly, not known. */
	estimated: boolean;
}

export interface VolumeSources {
	anilistVolumes?: number | null;
	anilistChapters?: number | null;
	mangadex?: MangaVolume[];
	coverVolumes?: number[];
}

const range = (from: number, to: number) =>
	to < from ? [] : Array.from({ length: to - from + 1 }, (_, i) => from + i);

export function layoutVolumes(sources: VolumeSources): VolumeLayout[] {
	const known = new Map<number, number[]>();
	let unvolumed: number[] = [];
	for (const v of sources.mangadex ?? []) {
		if (v.volume === null) unvolumed = v.chapters;
		else if (v.chapters.length) known.set(v.volume, v.chapters);
	}
	const allKnownChapters = [...known.values(), unvolumed].flat();
	const volumeCount = Math.max(
		sources.anilistVolumes ?? 0,
		...known.keys(),
		...(sources.coverVolumes ?? []),
		0
	);
	const chapterCount = Math.max(sources.anilistChapters ?? 0, ...allKnownChapters, 0);
	const finished = !!sources.anilistVolumes && !!sources.anilistChapters;

	// No volumes known: a flat chapter list (or nothing, if even the chapter count is unknown).
	if (volumeCount === 0) {
		return chapterCount
			? [{ volume: null, chapters: range(1, chapterCount), estimated: false }]
			: [];
	}

	const layout: VolumeLayout[] = range(1, volumeCount).map((volume) => ({
		volume,
		chapters: known.get(volume) ?? [],
		estimated: false
	}));

	// Where the chapters after the last volume start, if we can tell.
	const firstUnvolumed = unvolumed.length ? unvolumed[0] : finished ? chapterCount + 1 : null;

	// Fill each run of volumes with unknown chapters.
	let i = 0;
	while (i < layout.length) {
		if (layout[i].chapters.length) {
			i++;
			continue;
		}
		let j = i;
		while (j + 1 < layout.length && !layout[j + 1].chapters.length) j++;
		const before = i > 0 ? layout[i - 1].chapters.at(-1)! : 0;
		const after = j + 1 < layout.length ? layout[j + 1].chapters[0] : firstUnvolumed;
		if (after !== null && after - 1 > before) {
			const gap = range(before + 1, after - 1);
			const slots = j - i + 1;
			for (let k = 0; k < slots; k++) {
				const start = Math.round((gap.length * k) / slots);
				const end = Math.round((gap.length * (k + 1)) / slots);
				layout[i + k].chapters = gap.slice(start, end);
				layout[i + k].estimated = true;
			}
		}
		i = j + 1;
	}

	// Chapters newer than the last volume.
	const lastVolumed = Math.max(0, ...layout.flatMap((v) => v.chapters));
	const newer = [...new Set([...unvolumed, ...range(lastVolumed + 1, chapterCount)])]
		.filter((n) => n > lastVolumed)
		.sort((a, b) => a - b);
	if (newer.length) layout.push({ volume: null, chapters: newer, estimated: false });
	return layout;
}
