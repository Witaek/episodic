import { error, json } from '@sveltejs/kit';
import { requireUser } from '$lib/server/api';
import { getImportJob } from '$lib/server/services/portability';
import type { RequestHandler } from './$types';

/** Progress of a restore. */
export const GET: RequestHandler = ({ locals, params }) => {
	const user = requireUser(locals);
	const job = getImportJob(user.id, Number(params.id));
	if (!job) error(404, 'Not found');
	return json(job, { headers: { 'cache-control': 'no-store' } });
};
