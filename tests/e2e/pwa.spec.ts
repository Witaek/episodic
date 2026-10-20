import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('installable, and works offline for visited pages', async ({ page, context }) => {
	const manifest = await (await page.request.get('/manifest.webmanifest')).json();
	expect(manifest.display).toBe('standalone');
	expect(manifest.icons.some((i: { purpose: string }) => i.purpose === 'maskable')).toBe(true);

	await signIn(page);

	// The service worker installs and takes control.
	await page.evaluate(() => navigator.serviceWorker.ready);
	await page.reload();
	await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
	await page.goto('/library');
	await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();

	await context.setOffline(true);
	await page.reload();
	await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();
	await page.goto('/settings/users');
	await expect(page.getByText("You're offline")).toBeVisible();
	await context.setOffline(false);
});
