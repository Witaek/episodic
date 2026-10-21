import { SECTION_COOKIE, parseSection } from '$lib/section';
import { THEME_COOKIE, parseTheme } from '$lib/theme';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ cookies }) => ({
	theme: parseTheme(cookies.get(THEME_COOKIE)),
	remembered: parseSection(cookies.get(SECTION_COOKIE))
});
