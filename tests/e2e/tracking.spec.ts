import { expect, test } from '@playwright/test';
import { ANIME_ID, ANIME_NAME } from './fixtures';
import { signIn } from './helpers';

test('search, add, track and see progress everywhere', async ({ page }) => {
	await signIn(page);

	// Reset from a previous project's run.
	await page.request.post(`/api/titles/anime/${ANIME_ID}/unwatch`, {
		data: { target: { type: 'all' } }
	});
	await page.request.delete(`/api/titles/anime/${ANIME_ID}/library`);

	await page.goto('/search');
	await page.getByRole('searchbox', { name: 'Search' }).fill(ANIME_NAME);
	await page.getByRole('link', { name: ANIME_NAME }).first().click();
	await expect(page.getByRole('heading', { name: ANIME_NAME })).toBeVisible();

	await page.getByRole('button', { name: 'Add to Watchlist' }).click();
	await expect(page.getByText('Added to Watchlist')).toBeVisible();

	await page.getByRole('button', { name: 'Mark episode 1 watched' }).click();
	await expect(page.getByRole('button', { name: 'Mark episode 1 unwatched' })).toBeVisible();
	await expect(page.getByText('1 of 2 aired episodes watched')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Watching' })).toBeVisible();

	// Home: Up next shows episode 2; one tap marks it and the show is up to date.
	await page.goto('/');
	const check = page.getByRole('button', { name: `Mark S01E02 of ${ANIME_NAME} watched` });
	await expect(check).toBeVisible();
	await check.click();
	await expect(page.getByText(`You're up to date with ${ANIME_NAME}`)).toBeVisible();

	// Upcoming lists the unaired episode 3.
	await page.goto('/upcoming');
	await expect(page.getByText('S01E03')).toBeVisible();

	// History has both watches.
	await page.goto('/history');
	await expect(page.getByText(ANIME_NAME)).toHaveCount(2);
});

test('a second user does not see the first user library', async ({ page, browser }) => {
	await signIn(page);
	const username = `viewer-${test.info().project.name}`;
	await page.goto('/settings/users');
	if (!(await page.getByText(`@${username}`).isVisible())) {
		await page.getByLabel('Username').fill(username);
		await page.getByLabel('Temporary password').fill('viewer-password-1');
		await page.getByRole('button', { name: 'Create account' }).click();
		await expect(page.getByText(`Account "${username}" created.`)).toBeVisible();
	}

	const other = await browser.newContext();
	const viewer = await other.newPage();
	await viewer.goto('/login');
	await viewer.getByLabel('Username').fill(username);
	await viewer.getByLabel('Password').fill('viewer-password-1');
	await viewer.getByRole('button', { name: 'Sign in' }).click();
	await viewer.waitForURL('/');
	await viewer.goto('/library?status=planned');
	await expect(viewer.getByText('Nothing here yet')).toBeVisible();
	await viewer.goto('/history');
	await expect(viewer.getByText('No history yet')).toBeVisible();
	await other.close();
});
