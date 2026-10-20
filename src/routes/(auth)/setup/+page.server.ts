import { fail, redirect } from '@sveltejs/kit';
import {
	createSession,
	createUser,
	isSecureRequest,
	setSessionCookie,
	userCount,
	validatePassword,
	validateUsername
} from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	if (userCount() > 0) redirect(303, '/login');
};

export const actions: Actions = {
	default: async ({ request, cookies, url }) => {
		if (userCount() > 0) redirect(303, '/login');

		const form = await request.formData();
		const username = String(form.get('username') ?? '')
			.trim()
			.toLowerCase();
		const displayName = String(form.get('displayName') ?? '').trim();
		const password = String(form.get('password') ?? '');
		const confirm = String(form.get('confirm') ?? '');

		const errors = {
			username: validateUsername(username),
			password: validatePassword(password),
			confirm: password === confirm ? null : "The passwords don't match."
		};
		if (errors.username || errors.password || errors.confirm) {
			return fail(400, { username, displayName, errors });
		}

		const userId = await createUser({ username, displayName, password, role: 'admin' });
		const session = createSession(userId);
		setSessionCookie(cookies, session.token, session.expiresAt, isSecureRequest(request));
		redirect(303, '/');
	}
};
