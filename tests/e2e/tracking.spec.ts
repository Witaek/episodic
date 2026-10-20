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

test('export your data and make a backup', async ({ page }) => {
	await signIn(page);
	const exported = await (await page.request.get('/api/export')).json();
	expect(exported.format).toBe('episodic-export');
	expect(Array.isArray(exported.activity)).toBe(true);

	await page.goto('/settings/backups');
	await page.getByRole('button', { name: 'Back up now' }).click();
	await expect(page.getByText(/Backup episodic-.*-manual\.db created\./)).toBeVisible();
	const link = page.getByRole('link', { name: /Download episodic-/ }).first();
	const response = await page.request.get((await link.getAttribute('href'))!);
	expect(response.headers()['content-type']).toBe('application/vnd.sqlite3');
});

test('calendar view, iCal feed and stats', async ({ page }) => {
	await signIn(page);
	// Make sure there is something to show (the first test may have run in another project).
	await page.request.put(`/api/titles/anime/${ANIME_ID}/library`, {
		data: { status: 'in_progress' }
	});
	await page.request.post(`/api/titles/anime/${ANIME_ID}/watch`, {
		data: { target: { type: 'episode', season: 1, number: 1 } }
	});

	await page.goto('/upcoming?view=calendar');
	await expect(page.getByRole('link', { name: 'Calendar' })).toHaveAttribute(
		'aria-current',
		'page'
	);
	await expect(
		page
			.getByRole('button', { name: 'Next month' })
			.or(page.getByRole('link', { name: 'Next month' }))
	).toBeVisible();

	await page.goto('/settings');
	const field = page.getByRole('textbox', { name: 'Calendar feed link' });
	// The desktop and phone runs share one account: the link may already exist.
	if (!(await field.isVisible()))
		await page.getByRole('button', { name: 'Create calendar link' }).click();
	const link = await field.inputValue();
	const ics = await page.request.get(new URL(link).pathname);
	expect(ics.headers()['content-type']).toContain('text/calendar');
	expect(await ics.text()).toContain('BEGIN:VCALENDAR');

	await page.goto('/stats');
	await expect(page.getByText('Time watched')).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Most watched' })).toBeVisible();
});

test('mark all watched, and the offer when completing a show', async ({ page }) => {
	await signIn(page);
	await page.request.post(`/api/titles/anime/${ANIME_ID}/unwatch`, {
		data: { target: { type: 'all' } }
	});
	await page.request.put(`/api/titles/anime/${ANIME_ID}/library`, {
		data: { status: 'in_progress' }
	});

	await page.goto(`/title/anime/${ANIME_ID}`);
	await page.getByRole('button', { name: 'Watching' }).click();
	await page.getByRole('menuitem', { name: 'Completed' }).click();
	await expect(page.getByText('2 aired episodes are not marked as watched.')).toBeVisible();
	await page.getByRole('button', { name: 'Mark all watched' }).last().click();
	await expect(page.getByText('2 of 2 aired episodes watched')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Completed' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Mark all watched' })).toHaveCount(0);
});
