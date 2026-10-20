import { describe, expect, it } from 'vitest';
import { airingSummary } from '../../src/lib/catalog/airing';
import type { TitleDetails } from '../../src/lib/catalog/types';

const now = new Date(2026, 9, 20, 12);

const show = (overrides: Partial<TitleDetails>): TitleDetails => ({
	ref: { provider: 'tmdb', kind: 'tv', id: '1' },
	mediaType: 'show',
	isAnime: false,
	name: 'Show',
	originalName: null,
	tagline: null,
	overview: null,
	poster: null,
	backdrop: null,
	logo: null,
	genres: [],
	status: 'returning',
	startDate: '2024-01-01',
	endDate: null,
	runtime: 45,
	rating: null,
	certification: null,
	companies: [],
	cast: [],
	seasons: [],
	episodeCount: null,
	nextEpisode: null,
	lastEpisode: null,
	recommendations: [],
	trailerUrl: null,
	externalIds: {},
	sourceUrl: null,
	...overrides
});

describe('airingSummary', () => {
	it('announces the next episode', () => {
		const summary = airingSummary(
			show({
				nextEpisode: { id: '1', seasonNumber: 2, number: 5, name: null, airDate: '2026-10-21' }
			}),
			now
		);
		expect(summary).toEqual({ label: 'S02E05 airs tomorrow', tone: 'soon' });
	});

	it('calls out season premieres', () => {
		const summary = airingSummary(
			show({
				nextEpisode: { id: '1', seasonNumber: 3, number: 1, name: null, airDate: '2026-10-21' }
			}),
			now
		);
		expect(summary?.label).toBe('Season 3 premieres tomorrow');
	});

	it('detects a renewed season without a date', () => {
		const summary = airingSummary(
			show({
				lastEpisode: { id: '1', seasonNumber: 2, number: 8, name: null, airDate: '2026-01-01' },
				seasons: [
					{ number: 1, name: 'Season 1', episodeCount: 8, airDate: '2024-01-01', poster: null },
					{ number: 2, name: 'Season 2', episodeCount: 8, airDate: '2025-11-01', poster: null },
					{ number: 3, name: 'Season 3', episodeCount: 0, airDate: null, poster: null }
				]
			}),
			now
		);
		expect(summary).toEqual({ label: 'Season 3 announced', tone: 'live' });
	});

	it('reports ended and canceled shows', () => {
		expect(airingSummary(show({ status: 'ended' }), now)?.label).toBe('Ended');
		expect(airingSummary(show({ status: 'canceled' }), now)?.label).toBe('Canceled');
	});

	it('shows nothing for released movies', () => {
		expect(
			airingSummary(show({ mediaType: 'movie', status: 'released', startDate: '2020-01-01' }), now)
		).toBeNull();
	});
});
