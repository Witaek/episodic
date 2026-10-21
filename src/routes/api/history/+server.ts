import { json } from '@sveltejs/kit';
import { requireUser } from '$lib/server/api';
import { parseSection } from '$lib/section';
import { HISTORY_TYPES, listHistory, type HistoryType } from '$lib/server/services/history';
import type { RequestHandler } from './$types';

/** Next page of history ("Load more"). */
export const GET: RequestHandler = ({ locals, url }) => {
	const user = requireUser(locals);
	const section = parseSection(url.searchParams.get('section'));
	const typeParam = url.searchParams.get('type') as HistoryType | null;
	return json(
		listHistory(user.id, {
			cursor: url.searchParams.get('cursor'),
			type: typeParam && HISTORY_TYPES[section].includes(typeParam) ? typeParam : 'all',
			section
		})
	);
};
