import { redirect } from '@sveltejs/kit';
import { clearSessionCookie, deleteSession, isSecureRequest } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ locals, cookies, request }) => {
	if (locals.sessionToken) deleteSession(locals.sessionToken);
	clearSessionCookie(cookies, isSecureRequest(request));
	redirect(303, '/login');
};
