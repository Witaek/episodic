import { expect, test } from '@playwright/test';
import { SERIES_ID, SERIES_NAME } from './fixtures';
import { signIn } from './helpers';

test('track without a connection, synced once when back online', async ({ page, context }) => {
	await signIn(page);
	// Reset from a previous project's run.
	await page.request.post(`/api/titles/series/${SERIES_ID}/unwatch`, {
		data: { target: { type: 'all' } }
	});
	await page.request.delete(`/api/titles/series/${SERIES_ID}/library`);

	await page.goto(`/read/series/${SERIES_ID}`);
	await page.evaluate(() => navigator.serviceWorker.ready);
	await page.reload();
	await expect(page.getByRole('heading', { name: SERIES_NAME })).toBeVisible();

	// Offline: the taps work, and wait on this device.
	await context.setOffline(true);
	await page.getByRole('button', { name: 'Mark Saga book 1 read' }).click();
	await expect(page.getByText('Saved on this device').first()).toBeVisible();
	await expect(page.getByRole('button', { name: 'Mark Saga book 1 unread' })).toBeVisible();
	await page.getByRole('button', { name: 'Mark Saga book 2 read' }).click();
	await expect(page.getByText('2 changes waiting to sync')).toBeVisible();

	// Back online: both are sent, in order, and the page shows the server's state.
	await context.setOffline(false);
	await page.evaluate(() => window.dispatchEvent(new Event('online')));
	await expect(page.getByText('Synced 2 changes made offline')).toBeVisible();
	await expect(page.getByText('changes waiting to sync')).toHaveCount(0);
	await page.reload();
	await expect(page.getByText('2 of 3 books read')).toBeVisible();

	// Each read was recorded once.
	const history = await (await page.request.get('/api/history?section=read')).json();
	const reads = history.items.filter(
		(i: { title: { name: string } }) => i.title.name === SERIES_NAME
	);
	expect(reads).toHaveLength(2);
});

test('an offline change can be undone before it syncs', async ({ page, context }) => {
	await signIn(page);
	await page.request.post(`/api/titles/series/${SERIES_ID}/unwatch`, {
		data: { target: { type: 'all' } }
	});
	await page.goto(`/read/series/${SERIES_ID}`);
	await page.evaluate(() => navigator.serviceWorker.ready);

	await context.setOffline(true);
	await page.getByRole('button', { name: 'Mark Saga book 3 read' }).click();
	await expect(page.getByText('1 change waiting to sync')).toBeVisible();
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect(page.getByText('waiting to sync')).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Mark Saga book 3 read' })).toBeVisible();

	await context.setOffline(false);
	await page.reload();
	await expect(page.getByRole('button', { name: 'Mark Saga book 3 read' })).toBeVisible();
});

test('what you are reading is saved ahead of time for offline use', async ({ page, context }) => {
	await signIn(page);
	await page.request.put(`/api/titles/series/${SERIES_ID}/library`, {
		data: { status: 'in_progress' }
	});
	await page.goto('/read');
	await page.evaluate(() => navigator.serviceWorker.ready);
	await page.reload();
	// The Reading home asks the service worker to save the series page.
	await expect
		.poll(() =>
			page.evaluate(
				async (path) => !!(await caches.match(path, { ignoreSearch: true })),
				`/read/series/${SERIES_ID}`
			)
		)
		.toBe(true);

	await context.setOffline(true);
	await page.goto(`/read/series/${SERIES_ID}`);
	await expect(page.getByRole('heading', { name: SERIES_NAME })).toBeVisible();
	await context.setOffline(false);
});
