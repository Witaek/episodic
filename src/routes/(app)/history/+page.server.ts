import { listHistory, type HistoryType } from '$lib/server/services/history';
import type { PageServerLoad } from './$types';

const TYPES: HistoryType[] = ['all', 'tv', 'anime', 'movie'];

export const load: PageServerLoad = ({ locals, url }) => {
	const typeParam = url.searchParams.get('type') as HistoryType | null;
	const type = typeParam && TYPES.includes(typeParam) ? typeParam : 'all';
	return { type, ...listHistory(locals.user!.id, { type }) };
};
