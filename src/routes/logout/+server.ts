import { redirect } from '@sveltejs/kit';
import { clearSessionCookie, deleteSession } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ locals, cookies }) => {
	if (locals.sessionToken) deleteSession(locals.sessionToken);
	clearSessionCookie(cookies);
	redirect(303, '/login');
};
