/** Display helpers shared by pages and components. All dates render in the viewer's locale. */

const DAY = 24 * 60 * 60 * 1000;

/** Parses "YYYY-MM-DD" as a local calendar date (no timezone shift). */
export function parseDate(value: string): Date {
	if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		const [y, m, d] = value.split('-').map(Number);
		return new Date(y, m - 1, d);
	}
	return new Date(value);
}

export function formatDate(
	value: string | null | undefined,
	style: 'short' | 'long' = 'short'
): string {
	if (!value) return '';
	const date = parseDate(value);
	const sameYear = date.getFullYear() === new Date().getFullYear();
	return date.toLocaleDateString(undefined, {
		day: 'numeric',
		month: style === 'long' ? 'long' : 'short',
		year: sameYear && style === 'short' ? undefined : 'numeric'
	});
}

export function formatDateTime(iso: string): string {
	return new Date(iso).toLocaleString(undefined, {
		weekday: 'short',
		day: 'numeric',
		month: 'short',
		hour: 'numeric',
		minute: '2-digit'
	});
}

export function formatRuntime(minutes: number | null | undefined): string {
	if (!minutes) return '';
	if (minutes < 60) return `${minutes}m`;
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	return m ? `${h}h ${m}m` : `${h}h`;
}

/** "today", "tomorrow", "in 5 days", "3 days ago", or a date when far away. */
export function relativeDay(value: string, now = new Date()): string {
	const date = parseDate(value);
	const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
	const days = Math.round((startOf(date) - startOf(now)) / DAY);
	if (days === 0) return 'today';
	if (days === 1) return 'tomorrow';
	if (days === -1) return 'yesterday';
	if (days > 1 && days < 7) return date.toLocaleDateString(undefined, { weekday: 'long' });
	if (days > 0 && days <= 30) return `in ${days} days`;
	if (days < 0 && days >= -30) return `${-days} days ago`;
	return formatDate(value);
}

export function isPast(value: string | null | undefined, now = new Date()): boolean {
	if (!value) return false;
	return parseDate(value).getTime() <= now.getTime();
}

export function year(value: string | null | undefined): string {
	return value ? value.slice(0, 4) : '';
}
