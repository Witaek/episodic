import { json } from '@sveltejs/kit';
import { requireUser } from '$lib/server/api';
import { listHistory, type HistoryType } from '$lib/server/services/history';
import type { RequestHandler } from './$types';

const TYPES: HistoryType[] = ['all', 'tv', 'anime', 'movie', 'book'];

/** Next page of history ("Load more"). */
export const GET: RequestHandler = ({ locals, url }) => {
	const user = requireUser(locals);
	const typeParam = url.searchParams.get('type') as HistoryType | null;
	return json(
		listHistory(user.id, {
			cursor: url.searchParams.get('cursor'),
			type: typeParam && TYPES.includes(typeParam) ? typeParam : 'all'
		})
	);
};
