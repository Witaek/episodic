import { createReadStream, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { error } from '@sveltejs/kit';
import { backupPath } from '$lib/server/services/backup';
import type { RequestHandler } from './$types';

/** Downloads a backup file (admins only). */
export const GET: RequestHandler = ({ locals, params }) => {
	if (locals.user?.role !== 'admin') error(403, 'Only admins can download backups.');
	const path = backupPath(params.name);
	if (!path) error(404, 'Backup not found');
	return new Response(Readable.toWeb(createReadStream(path)) as ReadableStream, {
		headers: {
			'content-type': 'application/vnd.sqlite3',
			'content-length': String(statSync(path).size),
			'content-disposition': `attachment; filename="${params.name}"`,
			'cache-control': 'no-store'
		}
	});
};
