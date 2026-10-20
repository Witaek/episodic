import { error, json } from '@sveltejs/kit';
import { requireUser } from '$lib/server/api';
import { removeTarget } from '$lib/server/services/notifications';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = ({ locals, params }) => {
	const user = requireUser(locals);
	if (!removeTarget(user.id, Number(params.id))) error(404, 'Not found');
	return json({ ok: true });
};
