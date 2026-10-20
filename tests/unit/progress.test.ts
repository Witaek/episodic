import { describe, expect, it } from 'vitest';
import { computeProgress, isAired } from '../../src/lib/server/services/progress';
import { selectEpisodes } from '../../src/lib/server/services/tracking';

const now = new Date('2026-10-20T12:00:00');

let nextId = 1;
const ep = (
	seasonNumber: number,
	number: number,
	airDate: string | null,
	airAt: string | null = null
) => ({
	id: nextId++,
	titleId: 1,
	seasonNumber,
	number,
	name: `S${seasonNumber}E${number}`,
	overview: null,
	still: null,
	airDate,
	airAt,
	runtime: 45,
	externalId: null
});

// Season 1: 3 aired. Season 2: 2 aired, 1 upcoming. Specials: 1 aired.
const s1 = [ep(1, 1, '2026-01-01'), ep(1, 2, '2026-01-08'), ep(1, 3, '2026-01-15')];
const s2 = [ep(2, 1, '2026-10-01'), ep(2, 2, '2026-10-08'), ep(2, 3, '2026-10-27')];
const specials = [ep(0, 1, '2026-02-01')];
const all = [...specials, ...s2, ...s1];

describe('isAired', () => {
	it('uses exact times when known', () => {
		expect(
			isAired(
				{ airDate: '2026-10-20', airAt: '2026-10-20T15:00:00Z' },
				new Date('2026-10-20T14:00:00Z')
			)
		).toBe(false);
		expect(isAired({ airDate: '2026-10-20', airAt: null }, now)).toBe(true);
		expect(isAired({ airDate: null, airAt: null }, now)).toBe(false);
	});
});

describe('computeProgress', () => {
	it('starts at the first episode', () => {
		const p = computeProgress(all, new Set(), { now });
		expect(p).toMatchObject({ watched: 0, aired: 5, total: 6, percent: 0, upToDate: false });
		expect(p.nextUp).toMatchObject({ seasonNumber: 1, number: 1 });
		expect(p.nextToAir).toMatchObject({ seasonNumber: 2, number: 3 });
	});

	it('continues after the furthest watched episode, ignoring earlier gaps', () => {
		const watched = new Set([s1[0].id, s1[2].id]);
		const p = computeProgress(all, watched, { now });
		expect(p.nextUp).toMatchObject({ seasonNumber: 2, number: 1 });
		expect(p.watched).toBe(2);
		expect(p.percent).toBe(40);
	});

	it('is up to date when every aired episode after the furthest is watched', () => {
		const watched = new Set([...s1, s2[0], s2[1]].map((e) => e.id));
		const p = computeProgress(all, watched, { now });
		expect(p.nextUp).toBeNull();
		expect(p.upToDate).toBe(true);
		expect(p.percent).toBe(100);
	});

	it('counts specials only when asked', () => {
		const p = computeProgress(all, new Set(), { now, includeSpecials: true });
		expect(p.aired).toBe(6);
		expect(p.total).toBe(7);
	});
});

describe('selectEpisodes', () => {
	it('selects one episode, even if not aired yet', () => {
		expect(selectEpisodes(all, { type: 'episode', season: 2, number: 3 }, { now })).toHaveLength(1);
	});

	it('selects aired episodes of a season', () => {
		expect(
			selectEpisodes(all, { type: 'season', season: 2 }, { now }).map((e) => e.number)
		).toEqual([1, 2]);
	});

	it('selects everything up to an episode, without specials', () => {
		const picked = selectEpisodes(all, { type: 'upTo', season: 2, number: 1 }, { now });
		expect(picked.map((e) => `${e.seasonNumber}x${e.number}`)).toEqual([
			'1x1',
			'1x2',
			'1x3',
			'2x1'
		]);
	});

	it('throws for unknown episodes', () => {
		expect(() => selectEpisodes(all, { type: 'episode', season: 9, number: 1 }, { now })).toThrow();
	});
});
