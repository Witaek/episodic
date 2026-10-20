import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import type { TitleKind } from '$lib/catalog/types';
import type { SessionUser } from './auth';
import { NotConfiguredError } from './providers';
import { isNotFound } from './services/catalog';
import { TrackingError } from './services/tracking';

/** Helpers for JSON API routes. */

export function requireUser(locals: App.Locals): SessionUser {
	if (!locals.user) error(401, 'Not signed in');
	return locals.user;
}

const KINDS = ['movie', 'tv', 'anime'] as const;

export function parseTitleParams(params: { kind: string; id: string }): {
	kind: TitleKind;
	id: string;
} {
	if (!KINDS.includes(params.kind as TitleKind) || !/^\d+$/.test(params.id)) {
		error(404, 'Unknown title');
	}
	return { kind: params.kind as TitleKind, id: params.id };
}

export async function parseBody<T extends z.ZodType>(
	request: Request,
	schema: T
): Promise<z.infer<T>> {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		error(400, 'Expected a JSON body');
	}
	const parsed = schema.safeParse(body);
	if (!parsed.success) error(400, parsed.error.issues[0]?.message ?? 'Invalid request');
	return parsed.data;
}

/** Turns known failures into clean JSON errors. */
export async function handleErrors<T>(run: () => Promise<T> | T): Promise<T | Response> {
	try {
		return await run();
	} catch (cause) {
		if (cause instanceof TrackingError) return json({ error: cause.message }, { status: 400 });
		if (cause instanceof NotConfiguredError) {
			return json({ error: 'TMDB is not configured' }, { status: 503 });
		}
		if (isNotFound(cause)) return json({ error: 'Title not found' }, { status: 404 });
		throw cause;
	}
}

export const watchTargetSchema = z.discriminatedUnion('type', [
	z.object({
		type: z.literal('episode'),
		season: z.number().int().min(0),
		number: z.number().int().min(0)
	}),
	z.object({ type: z.literal('season'), season: z.number().int().min(0) }),
	z.object({
		type: z.literal('upTo'),
		season: z.number().int().min(0),
		number: z.number().int().min(0)
	}),
	z.object({ type: z.literal('all') }),
	z.object({ type: z.literal('movie') })
]);
