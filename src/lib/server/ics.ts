/** Minimal iCalendar (RFC 5545) writer for the upcoming-episodes feed. */

export interface IcsEvent {
	uid: string;
	summary: string;
	description?: string;
	url?: string;
	/** All-day event on this local date ("YYYY-MM-DD"). */
	date?: string;
	/** Timed event: start (ISO) and length in minutes. */
	start?: string;
	minutes?: number;
	/** Last change, for calendar apps that track updates. */
	stamp: Date;
}

export function escapeText(value: string): string {
	return value
		.replace(/\\/g, '\\\\')
		.replace(/;/g, '\\;')
		.replace(/,/g, '\\,')
		.replace(/\r?\n/g, '\\n');
}

/** Lines longer than 75 octets are folded with CRLF + space (RFC 5545 §3.1). */
export function foldLine(line: string): string {
	const bytes = new TextEncoder().encode(line);
	if (bytes.length <= 75) return line;
	const parts: string[] = [];
	let current = '';
	let size = 0;
	for (const char of line) {
		const charSize = new TextEncoder().encode(char).length;
		if (size + charSize > (parts.length === 0 ? 75 : 74)) {
			parts.push(current);
			current = '';
			size = 0;
		}
		current += char;
		size += charSize;
	}
	parts.push(current);
	return parts.join('\r\n ');
}

const utc = (date: Date) =>
	date
		.toISOString()
		.replace(/[-:]/g, '')
		.replace(/\.\d{3}/, '');
const day = (date: string) => date.replace(/-/g, '');

function nextDay(date: string): string {
	const [y, m, d] = date.split('-').map(Number);
	const next = new Date(Date.UTC(y, m - 1, d + 1));
	return next.toISOString().slice(0, 10);
}

export function buildCalendar(name: string, events: IcsEvent[]): string {
	const lines = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//Episodic//Upcoming episodes//EN',
		'CALSCALE:GREGORIAN',
		'METHOD:PUBLISH',
		`X-WR-CALNAME:${escapeText(name)}`,
		'X-PUBLISHED-TTL:PT6H',
		'REFRESH-INTERVAL;VALUE=DURATION:PT6H'
	];
	for (const event of events) {
		lines.push('BEGIN:VEVENT', `UID:${event.uid}`, `DTSTAMP:${utc(event.stamp)}`);
		if (event.start) {
			const start = new Date(event.start);
			const end = new Date(start.getTime() + (event.minutes ?? 30) * 60_000);
			lines.push(`DTSTART:${utc(start)}`, `DTEND:${utc(end)}`);
		} else if (event.date) {
			lines.push(
				`DTSTART;VALUE=DATE:${day(event.date)}`,
				`DTEND;VALUE=DATE:${day(nextDay(event.date))}`
			);
			lines.push('TRANSP:TRANSPARENT');
		}
		lines.push(`SUMMARY:${escapeText(event.summary)}`);
		if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
		if (event.url) lines.push(`URL:${event.url}`);
		lines.push('END:VEVENT');
	}
	lines.push('END:VCALENDAR');
	return lines.map(foldLine).join('\r\n') + '\r\n';
}
