import { loadTitlePage } from '$lib/server/title-page';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => loadTitlePage(event, 'watch');
