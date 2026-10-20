import { fail, redirect } from '@sveltejs/kit';
import {
	clearLoginFailures,
	createSession,
	findUserByUsername,
	isSecureRequest,
	loginLockedFor,
	recordLoginFailure,
	setSessionCookie,
	verifyPassword
} from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';

function safeRedirect(target: string | null): string {
	return target && target.startsWith('/') && !target.startsWith('//') ? target : '/';
}

export const load: PageServerLoad = ({ locals, url }) => {
	if (locals.user) redirect(303, safeRedirect(url.searchParams.get('redirectTo')));
};

export const actions: Actions = {
	default: async ({ request, cookies, url, getClientAddress }) => {
		const form = await request.formData();
		const username = String(form.get('username') ?? '')
			.trim()
			.toLowerCase();
		const password = String(form.get('password') ?? '');
		const key = `${getClientAddress()}:${username}`;

		const wait = loginLockedFor(key);
		if (wait > 0) {
			return fail(429, { username, error: `Too many attempts. Try again in ${wait} seconds.` });
		}

		const user = username ? findUserByUsername(username) : undefined;
		const valid = user ? await verifyPassword(user.passwordHash, password) : false;
		if (!user || !valid || user.disabled) {
			recordLoginFailure(key);
			return fail(400, {
				username,
				error: user?.disabled && valid ? 'This account is disabled.' : 'Wrong username or password.'
			});
		}

		clearLoginFailures(key);
		const session = createSession(user.id);
		setSessionCookie(cookies, session.token, session.expiresAt, isSecureRequest(request));
		redirect(303, safeRedirect(url.searchParams.get('redirectTo')));
	}
};
