import { error, fail } from '@sveltejs/kit';
import { and, asc, count, eq, ne } from 'drizzle-orm';
import {
	createUser,
	deleteUserSessions,
	findUserByUsername,
	hashPassword,
	validatePassword,
	validateUsername
} from '$lib/server/auth';
import { getDb } from '$lib/server/db/client';
import { libraryEntries, users } from '$lib/server/db/schema';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

function requireAdmin(locals: App.Locals) {
	if (locals.user?.role !== 'admin') error(403, 'Only admins can manage users.');
	return locals.user;
}

export const load: PageServerLoad = ({ locals }) => {
	const admin = requireAdmin(locals);
	const db = getDb();
	const rows = db
		.select({
			id: users.id,
			username: users.username,
			displayName: users.displayName,
			role: users.role,
			disabled: users.disabled,
			createdAt: users.createdAt,
			titles: count(libraryEntries.id)
		})
		.from(users)
		.leftJoin(libraryEntries, eq(libraryEntries.userId, users.id))
		.groupBy(users.id)
		.orderBy(asc(users.createdAt))
		.all();
	return {
		currentUserId: admin.id,
		users: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))
	};
};

type Result = { action: string; userId?: number; error?: string; message?: string };

async function target(event: RequestEvent) {
	const admin = requireAdmin(event.locals);
	const form = await event.request.formData();
	const userId = Number(form.get('userId'));
	const user = getDb().select().from(users).where(eq(users.id, userId)).get();
	if (!user) error(404, 'User not found');
	return { admin, form, user };
}

function otherAdmins(userId: number): number {
	return (
		getDb()
			.select({ n: count() })
			.from(users)
			.where(and(eq(users.role, 'admin'), eq(users.disabled, false), ne(users.id, userId)))
			.get()?.n ?? 0
	);
}

export const actions: Actions = {
	create: async ({ locals, request }) => {
		requireAdmin(locals);
		const form = await request.formData();
		const username = String(form.get('username') ?? '')
			.trim()
			.toLowerCase();
		const displayName = String(form.get('displayName') ?? '').trim();
		const password = String(form.get('password') ?? '');
		const role = form.get('role') === 'admin' ? 'admin' : 'user';

		const problem =
			validateUsername(username) ??
			(findUserByUsername(username) ? 'That username is taken.' : null) ??
			validatePassword(password);
		if (problem) {
			return fail(400, {
				action: 'create',
				error: problem,
				username,
				displayName
			} satisfies Result & Record<string, unknown>);
		}
		await createUser({ username, displayName, password, role });
		return { action: 'create', message: `Account "${username}" created.` } satisfies Result;
	},

	reset: async (event) => {
		const { form, user } = await target(event);
		const password = String(form.get('password') ?? '');
		const problem = validatePassword(password);
		if (problem)
			return fail(400, { action: 'reset', userId: user.id, error: problem } satisfies Result);
		getDb()
			.update(users)
			.set({ passwordHash: await hashPassword(password) })
			.where(eq(users.id, user.id))
			.run();
		deleteUserSessions(user.id);
		return {
			action: 'reset',
			userId: user.id,
			message: 'Password reset. They were signed out everywhere.'
		} satisfies Result;
	},

	toggleDisabled: async (event) => {
		const { admin, user } = await target(event);
		if (user.id === admin.id)
			return fail(400, {
				action: 'toggle',
				userId: user.id,
				error: "You can't disable yourself."
			} satisfies Result);
		if (!user.disabled && user.role === 'admin' && otherAdmins(user.id) === 0) {
			return fail(400, {
				action: 'toggle',
				userId: user.id,
				error: 'At least one admin must stay active.'
			} satisfies Result);
		}
		getDb().update(users).set({ disabled: !user.disabled }).where(eq(users.id, user.id)).run();
		if (!user.disabled) deleteUserSessions(user.id);
		return { action: 'toggle', userId: user.id } satisfies Result;
	},

	role: async (event) => {
		const { admin, form, user } = await target(event);
		const role = form.get('role') === 'admin' ? 'admin' : 'user';
		if (user.id === admin.id)
			return fail(400, {
				action: 'role',
				userId: user.id,
				error: "You can't change your own role."
			} satisfies Result);
		getDb().update(users).set({ role }).where(eq(users.id, user.id)).run();
		return { action: 'role', userId: user.id } satisfies Result;
	},

	delete: async (event) => {
		const { admin, user } = await target(event);
		if (user.id === admin.id)
			return fail(400, {
				action: 'delete',
				userId: user.id,
				error: "You can't delete yourself."
			} satisfies Result);
		if (user.role === 'admin' && otherAdmins(user.id) === 0) {
			return fail(400, {
				action: 'delete',
				userId: user.id,
				error: 'At least one admin must remain.'
			} satisfies Result);
		}
		// Library entries, history and sessions are removed with the user (foreign keys cascade).
		getDb().delete(users).where(eq(users.id, user.id)).run();
		return { action: 'delete', message: `Account "${user.username}" deleted.` } satisfies Result;
	}
};
