/**
 * Asks the service worker to save the pages of what you're watching and reading (and their
 * images), so they open, and can be tracked, without a connection. At most once an hour per page.
 */
const KEY = 'episodic-presaved';
const EVERY_MS = 60 * 60 * 1000;

export async function presave(items: { href: string; image?: string | null }[]) {
	if (typeof navigator === 'undefined' || !navigator.onLine || !navigator.serviceWorker) return;
	let saved: Record<string, number> = {};
	try {
		saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
	} catch {
		// Storage unavailable: save anyway.
	}
	const now = Date.now();
	const due = items.filter((i) => !(saved[pathOf(i.href)] > now - EVERY_MS));
	if (due.length === 0) return;
	const registration = await navigator.serviceWorker.ready.catch(() => null);
	registration?.active?.postMessage({
		type: 'presave',
		paths: due.map((i) => pathOf(i.href)),
		images: due.map((i) => i.image).filter((u): u is string => !!u)
	});
	for (const item of due) saved[pathOf(item.href)] = now;
	try {
		localStorage.setItem(KEY, JSON.stringify(saved));
	} catch {
		// Not remembered: it will be saved again next time.
	}
}

const pathOf = (href: string) => new URL(href, 'http://x').pathname;
