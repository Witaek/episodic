import { upcoming } from '$lib/server/services/upcoming';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => upcoming(locals.user!.id, { days: 30 });
