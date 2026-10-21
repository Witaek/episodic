import { lt } from 'drizzle-orm';
import { purgeExpiredSessions } from '../auth';
import { purgeExpiredCache } from '../cache';
import { getDb } from '../db/client';
import { jobRuns } from '../db/schema';
import { mappingsAge, refreshAnimeMappings } from '../providers/anime-mapping';
import { scheduledBackup } from '../services/backup';
import { resolveAnimeMovies } from '../services/franchise';
import { absorbAllBooks } from '../services/book-series';
import { sendNewEpisodeNotifications } from '../services/notifications';
import { refreshDueTitles } from '../services/refresh';
import { registerJobs, type JobDefinition } from './scheduler';

const DAY = 24 * 60 * 60 * 1000;

export const jobs: JobDefinition[] = [
	{
		// Each pass refreshes the most overdue titles: shows airing soon every 6 hours, other
		// running shows daily, ended shows and released movies monthly.
		name: 'refresh-titles',
		schedule: '*/20 * * * *',
		runOnStart: true,
		run: () => refreshDueTitles(25)
	},
	{
		name: 'anime-mappings',
		schedule: '30 4 * * 1', // Mondays 04:30
		runOnStart: true,
		async run() {
			if (mappingsAge() < 6 * DAY) return 'mappings are fresh';
			const count = await refreshAnimeMappings();
			return `stored ${count} anime mappings`;
		}
	},
	{
		// Anime films the mapping only knows by IMDb id get their TMDB id (grouping with the show).
		name: 'anime-movie-links',
		schedule: '0 5 * * *', // daily 05:00
		runOnStart: true,
		run: () => resolveAnimeMovies()
	},
	{
		// Books tracked on their own that belong to a series are moved into the series.
		name: 'books-into-series',
		schedule: '45 4 * * *', // daily 04:45
		runOnStart: true,
		run: absorbAllBooks
	},
	{
		name: 'notify-new-episodes',
		schedule: '*/10 * * * *',
		run: () => sendNewEpisodeNotifications()
	},
	{
		name: 'backup',
		schedule: '30 3 * * *', // daily 03:30
		run: scheduledBackup
	},
	{
		name: 'cleanup',
		schedule: '15 4 * * *', // daily 04:15
		async run() {
			const cache = purgeExpiredCache();
			const sessions = purgeExpiredSessions();
			const runs = getDb()
				.delete(jobRuns)
				.where(lt(jobRuns.startedAt, new Date(Date.now() - 30 * DAY)))
				.run().changes;
			return `removed ${cache} cache entries, ${sessions} expired sessions and ${runs} old job runs`;
		}
	}
];

export function startJobs(): void {
	registerJobs(jobs);
}
