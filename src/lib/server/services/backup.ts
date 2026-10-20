import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config';
import { getSqlite } from '../db/client';

/**
 * Database backups in $DATA_DIR/backups, made with SQLite's online backup API (safe while the app
 * is running). Each backup is a complete, ready-to-use episodic.db.
 */

const NAME = /^episodic-\d{4}-\d{2}-\d{2}-\d{6}(-manual)?\.db$/;

export interface BackupFile {
	name: string;
	size: number;
	createdAt: string;
	manual: boolean;
}

export function backupDir(): string {
	return join(config().dataDir, 'backups');
}

function timestamp(date = new Date()): string {
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

export async function createBackup({ manual = false } = {}): Promise<BackupFile> {
	const dir = backupDir();
	mkdirSync(dir, { recursive: true });
	const name = `episodic-${timestamp()}${manual ? '-manual' : ''}.db`;
	await getSqlite().backup(join(dir, name));
	return describe(name)!;
}

function describe(name: string): BackupFile | null {
	try {
		const stats = statSync(join(backupDir(), name));
		return {
			name,
			size: stats.size,
			createdAt: stats.mtime.toISOString(),
			manual: name.endsWith('-manual.db')
		};
	} catch {
		return null;
	}
}

export function listBackups(): BackupFile[] {
	let names: string[];
	try {
		names = readdirSync(backupDir());
	} catch {
		return [];
	}
	return names
		.filter((n) => NAME.test(n))
		.map(describe)
		.filter((b): b is BackupFile => b !== null)
		.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function isBackupName(name: string): boolean {
	return NAME.test(name);
}

export function backupPath(name: string): string | null {
	return isBackupName(name) && describe(name) ? join(backupDir(), name) : null;
}

export function deleteBackup(name: string): boolean {
	const path = backupPath(name);
	if (!path) return false;
	rmSync(path);
	return true;
}

/** Deletes automatic backups older than the retention period; always keeps the newest one. */
export function pruneBackups(retentionDays: number, now = new Date()): number {
	const cutoff = now.getTime() - retentionDays * 24 * 60 * 60 * 1000;
	const [, ...rest] = listBackups();
	let removed = 0;
	for (const backup of rest) {
		if (!backup.manual && new Date(backup.createdAt).getTime() < cutoff) {
			deleteBackup(backup.name);
			removed++;
		}
	}
	return removed;
}

/** The daily job. */
export async function scheduledBackup(): Promise<string> {
	const days = config().BACKUP_RETENTION_DAYS;
	if (days === 0) return 'disabled (BACKUP_RETENTION_DAYS=0)';
	const backup = await createBackup();
	const removed = pruneBackups(days);
	return `saved ${backup.name} (${Math.round(backup.size / 1024)} KB), removed ${removed} old backup${removed === 1 ? '' : 's'}`;
}
