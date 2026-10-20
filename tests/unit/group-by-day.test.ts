import { describe, expect, it } from 'vitest';
import { groupByDay } from '../../src/lib/history';

describe('groupByDay', () => {
	it('labels today and yesterday and keeps order', () => {
		const now = new Date(2026, 9, 20, 12);
		const dates = [
			new Date(2026, 9, 20, 9),
			new Date(2026, 9, 20, 1),
			new Date(2026, 9, 19, 23),
			new Date(2026, 9, 10, 8)
		];
		const groups = groupByDay(dates, (d) => d, now);
		expect(groups.map((g) => [g.label, g.items.length])).toEqual([
			['Today', 2],
			['Yesterday', 1],
			[expect.stringContaining('10'), 1]
		]);
	});
});
