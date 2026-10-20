import { error, json } from '@sveltejs/kit';
import { requireUser } from '$lib/server/api';
import { getTarget, sendToTarget } from '$lib/server/services/notifications';
import type { RequestHandler } from './$types';

/** Sends a test notification to one target. */
export const POST: RequestHandler = async ({ locals, params }) => {
	const user = requireUser(locals);
	const target = getTarget(user.id, Number(params.id));
	if (!target) error(404, 'Not found');
	const ok = await sendToTarget(target, {
		title: 'Episodic test',
		body: 'Notifications work. New episodes will show up like this.',
		path: '/',
		tag: 'test'
	});
	if (!ok)
		error(
			502,
			getTarget(user.id, target.id)?.lastError ?? 'The subscription expired; turn it on again.'
		);
	return json({ ok: true });
};
