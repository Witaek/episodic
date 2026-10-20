import { expect, type Page } from '@playwright/test';
import { ADMIN } from './fixtures';

/** Creates the admin on the first run, signs in afterwards (all tests share one server). */
export async function signIn(page: Page) {
	await page.goto('/');
	if (page.url().endsWith('/setup')) {
		await page.getByLabel('Username').fill(ADMIN.username);
		await page.getByLabel('Password', { exact: true }).fill(ADMIN.password);
		await page.getByLabel('Confirm password').fill(ADMIN.password);
		await page.getByRole('button', { name: 'Create account' }).click();
	} else if (page.url().includes('/login')) {
		await page.getByLabel('Username').fill(ADMIN.username);
		await page.getByLabel('Password').fill(ADMIN.password);
		await page.getByRole('button', { name: 'Sign in' }).click();
	}
	await expect(page.getByText(/Good (morning|afternoon|evening|night)/)).toBeVisible();
}
