import { SECTION_COOKIE, parseSection, sectionFor } from '$lib/section';
import { HISTORY_TYPES, listHistory, type HistoryType } from '$lib/server/services/history';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url, cookies }) => {
	const section = sectionFor(url, parseSection(cookies.get(SECTION_COOKIE)));
	const typeParam = url.searchParams.get('type') as HistoryType | null;
	const type = typeParam && HISTORY_TYPES[section].includes(typeParam) ? typeParam : 'all';
	return { section, type, ...listHistory(locals.user!.id, { type, section }) };
};
