import { expect, test } from '@playwright/test';
import { SERIES_ID, SERIES_NAME } from './fixtures';
import { signIn } from './helpers';

test('the Read side: track a series like a show, reading goal, separate shelf', async ({
	page
}) => {
	await signIn(page);
	// Reset from a previous project's run.
	await page.request.post(`/api/titles/series/${SERIES_ID}/unwatch`, {
		data: { target: { type: 'all' } }
	});
	await page.request.delete(`/api/titles/series/${SERIES_ID}/library`);

	// Watch | Read switch.
	await page.getByRole('link', { name: 'Read' }).first().click();
	await expect(page).toHaveURL(/\/read$/);
	await expect(page.getByRole('heading', { name: 'Reading', level: 1 })).toBeVisible();

	// A series is tracked book by book, like episodes.
	await page.goto(`/read/series/${SERIES_ID}`);
	await expect(page.getByRole('heading', { name: SERIES_NAME })).toBeVisible();
	await page.getByRole('button', { name: 'Mark Saga book 1 read' }).click();
	await expect(page.getByText('1 of 3 books read')).toBeVisible();

	// Reading now: one tap reads the next book.
	await page.goto('/read');
	const next = page.getByRole('button', { name: `Mark Book 2 of ${SERIES_NAME} read` });
	await expect(next).toBeVisible();
	await next.click();
	await expect(page.getByText('Book 2 read')).toBeVisible();

	// Yearly goal: books read this year count toward it.
	await page.goto('/read/stats');
	await page.getByRole('button', { name: /Set a goal|Change/ }).click();
	await page.locator('input[name="books"]').fill('12');
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('2 of 12 books')).toBeVisible();

	// The series is on the Shelf, not in the Watch library.
	await page.goto('/read/shelf');
	await expect(page.getByText(SERIES_NAME)).toBeVisible();
	await page.goto('/library');
	await expect(page.getByText(SERIES_NAME)).toHaveCount(0);
});
