/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { build, files, version } from '$service-worker';
import { flush, listQueued } from '$lib/offline/outbox';

/**
 * Offline support:
 * - the app shell (JS, CSS, fonts, icons) is precached per version;
 * - pages and their data are network-first, falling back to the last copy seen on this device,
 *   then to offline.html;
 * - posters and backdrops are cache-first, with a size cap;
 * - API calls always go to the network; tracking done offline waits in an outbox (IndexedDB) and
 *   is replayed by the app, or here through background sync where supported (Android);
 * - the app asks for the pages of what you're watching and reading to be saved ahead of time.
 */
const sw = self as unknown as ServiceWorkerGlobalScope;

const SHELL = `shell-${version}`;
const PAGES = 'pages-v1';
const IMAGES = 'images-v1';
const MAX_PAGES = 80;
const MAX_IMAGES = 400;
const IMAGE_HOSTS = [
	'image.tmdb.org',
	's4.anilist.co',
	'img.anili.st',
	'covers.openlibrary.org',
	'uploads.mangadex.org'
];

const shellAssets = [...build, ...files.filter((f) => !f.endsWith('.DS_Store'))];

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(SHELL)
			.then((cache) => cache.addAll(shellAssets))
			.then(() => sw.skipWaiting())
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			for (const key of await caches.keys()) {
				if (key.startsWith('shell-') && key !== SHELL) await caches.delete(key);
			}
			await sw.clients.claim();
		})()
	);
});

async function trim(cacheName: string, max: number) {
	const cache = await caches.open(cacheName);
	const keys = await cache.keys();
	for (const key of keys.slice(0, Math.max(0, keys.length - max))) await cache.delete(key);
}

async function networkFirst(request: Request): Promise<Response> {
	const cache = await caches.open(PAGES);
	try {
		const response = await fetch(request);
		// Only keep real pages, not redirects to /login or errors.
		if (response.ok && response.type === 'basic' && !response.redirected) {
			await cache.put(request, response.clone());
			void trim(PAGES, MAX_PAGES);
		}
		return response;
	} catch {
		// The same page with other parameters (?season=, SvelteKit's data flags) beats nothing.
		const cached =
			(await cache.match(request)) ?? (await cache.match(request, { ignoreSearch: true }));
		if (cached) return cached;
		if (request.mode === 'navigate') {
			const offline = await caches.match('/offline.html');
			if (offline) return offline;
		}
		return new Response('Offline', { status: 503, headers: { 'content-type': 'text/plain' } });
	}
}

async function cacheFirstImage(request: Request): Promise<Response> {
	const cache = await caches.open(IMAGES);
	const cached = await cache.match(request);
	if (cached) return cached;
	const response = await fetch(request);
	// Cross-origin images are opaque (status 0); they're still worth caching for offline use.
	if (response.ok || response.type === 'opaque') {
		await cache.put(request, response.clone());
		void trim(IMAGES, MAX_IMAGES);
	}
	return response;
}

sw.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;
	const url = new URL(request.url);

	// CORS requests (poster color sampling) must not get a cached opaque response.
	if (IMAGE_HOSTS.includes(url.hostname) && request.mode !== 'cors') {
		event.respondWith(cacheFirstImage(request));
		return;
	}
	if (url.origin !== sw.location.origin) return;
	if (url.pathname.startsWith('/api/') || url.pathname === '/logout') return;

	if (shellAssets.includes(url.pathname)) {
		event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request)));
		return;
	}
	if (request.mode === 'navigate' || url.pathname.endsWith('/__data.json')) {
		event.respondWith(networkFirst(request));
	}
});

/** Saves pages (and their data for in-app navigation) and images for use offline. */
async function presave(paths: string[], images: string[]) {
	const cache = await caches.open(PAGES);
	for (const path of paths) {
		const data = `${path === '/' ? '' : path}/__data.json`;
		for (const url of [path, data]) {
			try {
				const response = await fetch(url, { credentials: 'same-origin' });
				if (response.ok && !response.redirected) await cache.put(url, response);
			} catch {
				return; // Offline again: try next time.
			}
		}
	}
	void trim(PAGES, MAX_PAGES);
	for (const image of images) {
		await cacheFirstImage(new Request(image, { mode: 'no-cors' })).catch(() => {});
	}
}

sw.addEventListener('message', (event) => {
	// Sent by the app when signing out, so the next person on this device doesn't see cached pages.
	if (event.data === 'clear-user-data') event.waitUntil(caches.delete(PAGES));
	const message = event.data as { type?: string; paths?: string[]; images?: string[] } | null;
	if (message?.type === 'presave') {
		event.waitUntil(presave(message.paths ?? [], message.images ?? []));
	}
});

// ---------- Offline tracking: background sync (Android) ----------

sw.addEventListener('sync', ((
	event: Event & { tag: string; waitUntil(p: Promise<unknown>): void }
) => {
	if (event.tag !== 'episodic-outbox') return;
	event.waitUntil(
		(async () => {
			const people = [...new Set((await listQueued()).map((a) => a.userId))];
			let remaining = 0;
			for (const userId of people) remaining += (await flush(userId)).remaining;
			for (const client of await sw.clients.matchAll({ type: 'window' })) {
				client.postMessage('outbox-synced');
			}
			// Still waiting (offline again): the browser retries the sync later.
			if (remaining) throw new Error('Changes still waiting');
		})()
	);
}) as EventListener);

// ---------- Push notifications ----------

interface PushMessage {
	title: string;
	body: string;
	path: string;
	tag?: string;
}

sw.addEventListener('push', (event) => {
	let message: PushMessage;
	try {
		message = event.data?.json() as PushMessage;
	} catch {
		message = { title: 'Episodic', body: event.data?.text() ?? '', path: '/' };
	}
	event.waitUntil(
		sw.registration.showNotification(message.title, {
			body: message.body,
			tag: message.tag,
			icon: '/icons/icon-192.png',
			badge: '/icons/favicon-32.png',
			data: { path: message.path }
		})
	);
});

sw.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const path = (event.notification.data as { path?: string } | null)?.path ?? '/';
	const url = new URL(path, sw.location.origin).href;
	event.waitUntil(
		(async () => {
			const windows = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
			const open = windows.find((w) => new URL(w.url).origin === sw.location.origin);
			if (open) {
				await open.focus();
				await open.navigate(url).catch(() => {});
			} else {
				await sw.clients.openWindow(url);
			}
		})()
	);
});
