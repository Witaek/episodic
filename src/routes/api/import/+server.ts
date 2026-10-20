import { error, json } from '@sveltejs/kit';
import { requireUser } from '$lib/server/api';
import { exportSchema, startImport } from '$lib/server/services/portability';
import type { RequestHandler } from './$types';

/** Starts restoring a JSON export into the signed-in user's account (merged, never deleting). */
export const POST: RequestHandler = async ({ locals, request }) => {
	const user = requireUser(locals);
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		error(400, "That file isn't valid JSON.");
	}
	const parsed = exportSchema.safeParse(body);
	if (!parsed.success) error(400, "That file isn't an Episodic export.");
	return json({ jobId: startImport(user.id, parsed.data) }, { status: 202 });
};
