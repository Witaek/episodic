/** The two sides of the app: Watch (shows, anime, movies) and Read (books, series, manga). */
export type Section = 'watch' | 'read';
export const SECTION_COOKIE = 'episodic_section';

/** Pages shared by both sides (they keep the side you came from). */
const SHARED = ['/history', '/settings'];

export function parseSection(value: string | null | undefined): Section {
	return value === 'read' ? 'read' : 'watch';
}

/** Which side a page belongs to; shared pages use `?section=` or the remembered side. */
export function sectionFor(url: URL, remembered: Section): Section {
	if (url.pathname === '/read' || url.pathname.startsWith('/read/')) return 'read';
	if (SHARED.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`))) {
		const param = url.searchParams.get('section');
		return param ? parseSection(param) : remembered;
	}
	return 'watch';
}

/** Remembers the side in a cookie (one year), from the browser. */
export function rememberSection(section: Section) {
	document.cookie = `${SECTION_COOKIE}=${section}; path=/; max-age=31536000; samesite=lax`;
}
