import { requireUser } from '$lib/server/api';
import { exportUserData } from '$lib/server/services/portability';
import type { RequestHandler } from './$types';

/** Downloads the signed-in user's library and history as JSON. */
export const GET: RequestHandler = ({ locals }) => {
	const user = requireUser(locals);
	const date = new Date().toISOString().slice(0, 10);
	return new Response(JSON.stringify(exportUserData(user.id), null, 2), {
		headers: {
			'content-type': 'application/json',
			'content-disposition': `attachment; filename="episodic-${user.username}-${date}.json"`,
			'cache-control': 'no-store'
		}
	});
};
