import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { config } from '$lib/server/config';
import * as schema from './schema';

export type DB = BetterSQLite3Database<typeof schema>;

let sqlite: Database.Database | undefined;
let db: DB | undefined;

/** Opens the database lazily so that `vite build` never touches the data directory. */
export function getDb(): DB {
	if (db) return db;

	const { dataDir, databasePath } = config();
	mkdirSync(dataDir, { recursive: true });

	sqlite = new Database(databasePath);
	sqlite.pragma('journal_mode = WAL');
	sqlite.pragma('synchronous = NORMAL');
	sqlite.pragma('foreign_keys = ON');
	sqlite.pragma('busy_timeout = 5000');

	db = drizzle(sqlite, { schema });
	return db;
}

export function runMigrations(): void {
	migrate(getDb(), { migrationsFolder: resolve(process.cwd(), 'drizzle') });
}

/** The underlying better-sqlite3 handle, for online backups. */
export function getSqlite(): Database.Database {
	getDb();
	return sqlite!;
}

export function isDatabaseHealthy(): boolean {
	try {
		getDb();
		return sqlite?.prepare('select 1 as ok').get() !== undefined;
	} catch {
		return false;
	}
}

export function closeDb(): void {
	sqlite?.close();
	sqlite = undefined;
	db = undefined;
}
