import { loadSearchPage } from '$lib/server/search-page';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => loadSearchPage(event, 'read');
