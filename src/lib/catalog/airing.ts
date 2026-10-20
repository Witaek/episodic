import { formatEpisodeCode } from '$lib/media-types/types';
import { formatDate, formatDateTime, isPast, relativeDay } from '$lib/format';
import type { TitleDetails } from './types';

export type AiringTone = 'live' | 'soon' | 'neutral' | 'ended';

export interface AiringSummary {
	label: string;
	tone: AiringTone;
}

/**
 * One-line airing status for a title: next episode, announced season, or ended/canceled.
 * Exact air times are used when a provider knows them.
 */
export function airingSummary(title: TitleDetails, now = new Date()): AiringSummary | null {
	if (title.mediaType === 'movie') {
		if (title.status === 'upcoming' || (title.startDate && !isPast(title.startDate, now))) {
			return title.startDate
				? { label: `In cinemas ${formatDate(title.startDate)}`, tone: 'soon' }
				: { label: 'Coming soon', tone: 'soon' };
		}
		return null;
	}

	const next = title.nextEpisode;
	if (next && (next.airAt || next.airDate)) {
		const code = formatEpisodeCode({ season: next.seasonNumber, number: next.number });
		const when = next.airAt ? formatDateTime(next.airAt) : relativeDay(next.airDate!, now);
		const isPremiere = next.number === 1;
		return {
			label: isPremiere ? `Season ${next.seasonNumber} premieres ${when}` : `${code} airs ${when}`,
			tone: 'soon'
		};
	}

	const announced = announcedSeason(title, now);
	if (announced) return announced;

	switch (title.status) {
		case 'returning':
			return { label: 'Returning series', tone: 'live' };
		case 'in_production':
		case 'planned':
			return { label: 'In production', tone: 'live' };
		case 'upcoming':
			return title.startDate
				? { label: `Starts ${formatDate(title.startDate)}`, tone: 'soon' }
				: { label: 'Not yet aired', tone: 'soon' };
		case 'ended':
			return { label: 'Ended', tone: 'ended' };
		case 'canceled':
			return { label: 'Canceled', tone: 'ended' };
		default:
			return null;
	}
}

/** A season listed after the last aired one, i.e. renewed or scheduled. */
function announcedSeason(title: TitleDetails, now: Date): AiringSummary | null {
	const lastAiredSeason = title.lastEpisode?.seasonNumber ?? 0;
	const upcoming = title.seasons
		.filter((s) => s.number > lastAiredSeason && s.number > 0)
		.sort((a, b) => a.number - b.number)[0];
	if (!upcoming || lastAiredSeason === 0) return null;
	if (upcoming.airDate && !isPast(upcoming.airDate, now)) {
		return {
			label: `Season ${upcoming.number} premieres ${formatDate(upcoming.airDate)}`,
			tone: 'soon'
		};
	}
	if (!upcoming.airDate) return { label: `Season ${upcoming.number} announced`, tone: 'live' };
	return null;
}
