/** Appearance preference, stored in a cookie so the server renders the right theme. */
export const THEMES = ['system', 'dark', 'light'] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_COOKIE = 'episodic_theme';

export function parseTheme(value: string | undefined | null): Theme {
	return THEMES.includes(value as Theme) ? (value as Theme) : 'system';
}

/** Browser chrome color per theme (status bar, task switcher). */
export const THEME_COLORS = { dark: '#0b0b12', light: '#f7f7fb' } as const;
