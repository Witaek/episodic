import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { parseBody, requireUser } from '$lib/server/api';
import {
	addTarget,
	listTargets,
	vapidKeys,
	type NotificationTarget
} from '$lib/server/services/notifications';
import type { RequestHandler } from './$types';

/** What the browser may see: never the stored secrets. */
function publicTarget(t: NotificationTarget) {
	return {
		id: t.id,
		type: t.type,
		label: t.label,
		enabled: t.enabled,
		endpoint: t.config.subscription?.endpoint ?? null,
		lastError: t.lastError,
		lastSentAt: t.lastSentAt?.toISOString() ?? null
	};
}

export const GET: RequestHandler = ({ locals }) => {
	const user = requireUser(locals);
	return json({
		vapidPublicKey: vapidKeys().publicKey,
		targets: listTargets(user.id).map(publicTarget)
	});
};

const httpUrl = z.url().refine((u) => /^https?:\/\//.test(u), 'Use an http:// or https:// address');

const body = z.discriminatedUnion('type', [
	z.object({
		type: z.literal('webpush'),
		label: z.string().min(1).max(80),
		subscription: z.object({
			endpoint: z.url(),
			keys: z.object({ p256dh: z.string(), auth: z.string() })
		})
	}),
	z.object({
		type: z.literal('ntfy'),
		label: z.string().min(1).max(80),
		url: httpUrl,
		token: z.string().max(200).optional()
	}),
	z.object({
		type: z.literal('discord'),
		label: z.string().min(1).max(80),
		url: httpUrl.refine((u) => /\/api\/webhooks\//.test(u), 'That is not a Discord webhook URL')
	})
]);

export const POST: RequestHandler = async ({ locals, request }) => {
	const user = requireUser(locals);
	const input = await parseBody(request, body);
	if (input.type === 'ntfy' && new URL(input.url).pathname.replace(/\//g, '') === '') {
		error(400, 'Add the topic to the address, e.g. https://ntfy.sh/my-episodic-topic');
	}
	const target = addTarget(
		user.id,
		input.type,
		input.label,
		input.type === 'webpush'
			? { subscription: input.subscription }
			: { url: input.url, token: input.type === 'ntfy' ? input.token || undefined : undefined }
	);
	return json(publicTarget(target), { status: 201 });
};
