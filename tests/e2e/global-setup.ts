import { mkdirSync } from 'node:fs';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { E2E_DATA_DIR } from '../../playwright.config';
import { ANIME_ID, ANIME_NAME, searchResults, season, title } from './fixtures';

/** Seeds provider responses into the response cache so the app never calls AniList/TMDB. */
export default function globalSetup() {
	mkdirSync(E2E_DATA_DIR, { recursive: true });
	const sqlite = new Database(`${E2E_DATA_DIR}/episodic.db`);
	sqlite.pragma('journal_mode = WAL');
	migrate(drizzle(sqlite), { migrationsFolder: 'drizzle' });

	const farFuture = Date.now() + 365 * 24 * 60 * 60 * 1000;
	const put = sqlite.prepare(
		'insert or replace into api_cache (key, value, expires_at) values (?, ?, ?)'
	);
	const query = ANIME_NAME.toLowerCase();
	put.run(`search:anilist:all:en-US:${query}`, JSON.stringify(searchResults), farFuture);
	put.run(`search:anilist:anime:en-US:${query}`, JSON.stringify(searchResults), farFuture);
	put.run('trending:anime:en-US', JSON.stringify(searchResults), farFuture);
	put.run(`title:anilist:${ANIME_ID}`, JSON.stringify(title), farFuture);
	put.run(`season:anilist:${ANIME_ID}`, JSON.stringify(season), farFuture);
	sqlite.close();
}
