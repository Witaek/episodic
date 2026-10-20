import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against a production build with a fresh database. Provider responses are
 * seeded into the response cache (tests/e2e/global-setup.ts), so no network access is needed.
 */
const PORT = 4300;
export const E2E_DATA_DIR = './test-results/e2e-data';

export default defineConfig({
	testDir: 'tests/e2e',
	fullyParallel: false,
	workers: 1,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? 'github' : 'list',
	globalSetup: './tests/e2e/global-setup.ts',
	use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
	projects: [
		{ name: 'desktop', use: { ...devices['Desktop Chrome'] } },
		{ name: 'mobile', use: { ...devices['Pixel 7'] } }
	],
	webServer: {
		command: 'npm run build && node build',
		port: PORT,
		reuseExistingServer: false,
		timeout: 180_000,
		env: { PORT: String(PORT), DATA_DIR: E2E_DATA_DIR, DISABLE_JOBS: '1', TMDB_ACCESS_TOKEN: '' }
	}
});
