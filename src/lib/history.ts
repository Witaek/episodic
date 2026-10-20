/** Groups items by local calendar day, with "Today"/"Yesterday" labels. */
export function groupByDay<T>(items: T[], dateOf: (item: T) => Date, now = new Date()) {
	const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
	const today = key(now);
	const yesterday = key(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
	const tomorrow = key(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
	const groups: { key: string; label: string; date: Date; items: T[] }[] = [];

	for (const item of items) {
		const date = dateOf(item);
		const k = key(date);
		let group = groups.at(-1);
		if (!group || group.key !== k) {
			const sameYear = date.getFullYear() === now.getFullYear();
			const label =
				k === today
					? 'Today'
					: k === yesterday
						? 'Yesterday'
						: k === tomorrow
							? 'Tomorrow'
							: date.toLocaleDateString(undefined, {
									weekday: 'long',
									day: 'numeric',
									month: 'long',
									year: sameYear ? undefined : 'numeric'
								});
			group = { key: k, label, date, items: [] };
			groups.push(group);
		}
		group.items.push(item);
	}
	return groups;
}
