import { describe, expect, it } from 'vitest';
import { buildCalendar, escapeText, foldLine } from '../../src/lib/server/ics';
import { streaks } from '../../src/lib/server/services/stats';

describe('ics', () => {
	it('escapes text', () => {
		expect(escapeText('a,b;c\\d\ne')).toBe(String.raw`a\,b\;c\\d\ne`);
	});

	it('folds long lines at 75 octets, multi-byte safe', () => {
		const line = `SUMMARY:${'é'.repeat(60)}`;
		const folded = foldLine(line);
		for (const part of folded.split('\r\n')) {
			expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
		}
		expect(folded.replace(/\r\n /g, '')).toBe(line);
	});

	it('writes all-day and timed events', () => {
		const ics = buildCalendar('Episodic', [
			{
				uid: 'a@x',
				summary: 'Show S01E01',
				date: '2026-12-31',
				stamp: new Date('2026-10-20T00:00:00Z')
			},
			{
				uid: 'b@x',
				summary: 'Show S01E02',
				start: '2026-10-23T14:00:00.000Z',
				minutes: 24,
				stamp: new Date('2026-10-20T00:00:00Z')
			}
		]);
		expect(ics).toContain('DTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270101');
		expect(ics).toContain('DTSTART:20261023T140000Z\r\nDTEND:20261023T142400Z');
		expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
		expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
	});
});

describe('streaks', () => {
	it('finds the longest and current runs', () => {
		const days = [
			'2026-10-01',
			'2026-10-02',
			'2026-10-03',
			'2026-10-10',
			'2026-10-19',
			'2026-10-20'
		];
		expect(streaks(days, '2026-10-20')).toEqual({ current: 2, longest: 3 });
		expect(streaks(days, '2026-10-21')).toEqual({ current: 2, longest: 3 });
		expect(streaks(days, '2026-10-23')).toEqual({ current: 0, longest: 3 });
		expect(streaks([], '2026-10-20')).toEqual({ current: 0, longest: 0 });
	});
});
