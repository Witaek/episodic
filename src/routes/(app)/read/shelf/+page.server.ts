import { loadLibraryPage } from '$lib/server/library-page';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => loadLibraryPage(event, 'read');
