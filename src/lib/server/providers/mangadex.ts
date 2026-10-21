import type { Image } from '$lib/catalog/types';
import { createHttpClient } from './http';

/**
 * MangaDex (no key): the volumes published so far, which chapters each one contains, and a cover
 * per volume. AniList only knows volume/chapter counts once a manga has finished.
 */
const API = 'https://api.mangadex.org';
const COVERS = 'https://uploads.mangadex.org/covers';
const USER_AGENT = 'Episodic (https://github.com/Witaek/episodic)';

// MangaDex allows about 5 requests per second.
const request = createHttpClient('mangadex', { burst: 4, perSecond: 3, concurrency: 2 });
const get = <T>(path: string) =>
	request<T>(`${API}${path}`, { headers: { 'user-agent': USER_AGENT } });

interface MangaRecord {
	id: string;
	attributes: { links?: Record<string, string> | null; title: Record<string, string> };
}

/** The MangaDex id of an AniList manga, found by title and confirmed by the AniList link. */
export async function findByAnilist(anilistId: number, titles: string[]): Promise<string | null> {
	for (const title of [...new Set(titles.filter(Boolean))].slice(0, 3)) {
		const params = new URLSearchParams({ title, limit: '10' });
		for (const rating of ['safe', 'suggestive', 'erotica'])
			params.append('contentRating[]', rating);
		const data = await get<{ data: MangaRecord[] }>(`/manga?${params}`);
		const match = data.data.find((m) => m.attributes.links?.al === String(anilistId));
		if (match) return match.id;
	}
	return null;
}

export interface MangaVolume {
	/** Volume number; null for chapters not yet collected in a volume. */
	volume: number | null;
	/** Whole-numbered chapters in this volume, ascending. */
	chapters: number[];
}

/** Volumes and their chapters (from all translations combined). */
export async function volumes(mangaId: string): Promise<MangaVolume[]> {
	const data = await get<{
		volumes: Record<string, { volume: string; chapters: Record<string, { chapter: string }> }>;
	}>(`/manga/${mangaId}/aggregate`);
	const seen = new Set<number>();
	const list: MangaVolume[] = Object.values(data.volumes ?? {}).map((v) => ({
		volume: v.volume === 'none' ? null : Number(v.volume),
		chapters: Object.values(v.chapters)
			.map((c) => Number(c.chapter))
			// Half chapters (10.5) are extras; chapter 0 is usually a oneshot prologue.
			.filter((n) => Number.isInteger(n) && n > 0)
			.sort((a, b) => a - b)
	}));
	list.sort(
		(a, b) => (a.volume ?? Number.MAX_SAFE_INTEGER) - (b.volume ?? Number.MAX_SAFE_INTEGER)
	);
	// Scanlations sometimes list a chapter in two volumes: keep it in the first.
	for (const v of list) {
		v.chapters = v.chapters.filter((n) => !seen.has(n) && seen.add(n));
	}
	return list.filter((v) => (v.volume !== null && Number.isInteger(v.volume)) || v.chapters.length);
}

/**
 * A cover per volume, preferring the reader's language, then the original Japanese one.
 */
export async function volumeCovers(mangaId: string, language = 'en'): Promise<Map<number, Image>> {
	const result = new Map<number, { image: Image; rank: number }>();
	const preference = [language.slice(0, 2), 'ja', 'en'];
	for (let offset = 0; offset < 500; offset += 100) {
		const params = new URLSearchParams({
			limit: '100',
			offset: String(offset),
			'order[volume]': 'asc'
		});
		params.append('manga[]', mangaId);
		const data = await get<{
			data: { attributes: { volume: string | null; fileName: string; locale: string | null } }[];
			total: number;
		}>(`/cover?${params}`);
		for (const { attributes: a } of data.data) {
			const volume = Number(a.volume);
			if (!Number.isInteger(volume)) continue;
			const index = preference.indexOf(a.locale ?? '');
			const rank = index === -1 ? preference.length : index;
			const current = result.get(volume);
			if (current && current.rank <= rank) continue;
			result.set(volume, {
				rank,
				image: {
					url: `${COVERS}/${mangaId}/${a.fileName}.512.jpg`,
					srcset: `${COVERS}/${mangaId}/${a.fileName}.256.jpg 256w, ${COVERS}/${mangaId}/${a.fileName}.512.jpg 512w`
				}
			});
		}
		if (offset + 100 >= data.total) break;
	}
	return new Map([...result].map(([v, { image }]) => [v, image]));
}
