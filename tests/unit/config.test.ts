import { describe, expect, it } from 'vitest';
import { parseConfig } from '../../src/lib/server/config';

describe('parseConfig', () => {
	it('applies defaults', () => {
		const config = parseConfig({});
		expect(config.METADATA_LANGUAGE).toBe('en-US');
		expect(config.BACKUP_RETENTION_DAYS).toBe(14);
		expect(config.ALLOWED_ORIGINS).toEqual([]);
		expect(config.databasePath.endsWith('data/episodic.db')).toBe(true);
	});

	it('treats blank values as unset', () => {
		const config = parseConfig({ TMDB_ACCESS_TOKEN: '  ', APP_URL: '' });
		expect(config.TMDB_ACCESS_TOKEN).toBeUndefined();
		expect(config.APP_URL).toBeUndefined();
	});

	it('splits ALLOWED_ORIGINS', () => {
		const config = parseConfig({ ALLOWED_ORIGINS: 'http://a:1, https://b.ts.net ,' });
		expect(config.ALLOWED_ORIGINS).toEqual(['http://a:1', 'https://b.ts.net']);
	});

	it('rejects an invalid APP_URL', () => {
		expect(() => parseConfig({ APP_URL: 'not a url' })).toThrow(/APP_URL/);
	});
});
