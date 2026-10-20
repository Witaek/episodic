import { error } from '@sveltejs/kit';
import { calendarFeed } from '$lib/server/services/calendar-feed';
import type { RequestHandler } from './$types';

/**
 * iCal feed of upcoming episodes, e.g. /calendar/<token>.ics. Calendar apps can't sign in, so the
 * secret token in the link is the credential; it can be reset in Settings.
 */
export const GET: RequestHandler = ({ params }) => {
	const feed = calendarFeed(params.token.replace(/\.ics$/, ''));
	if (!feed) error(404, 'Unknown calendar');
	return new Response(feed, {
		headers: {
			'content-type': 'text/calendar; charset=utf-8',
			'content-disposition': 'inline; filename="episodic.ics"',
			'cache-control': 'private, max-age=900'
		}
	});
};
