import { resolve } from 'node:path';
import { z } from 'zod';

const csv = z
	.string()
	.optional()
	.transform((value) =>
		(value ?? '')
			.split(',')
			.map((item) => item.trim())
			.filter(Boolean)
	);

const blankToUndefined = (value: unknown) =>
	typeof value === 'string' && value.trim() === '' ? undefined : value;

const schema = z.object({
	DATA_DIR: z.string().default('./data'),
	APP_URL: z.preprocess(blankToUndefined, z.url().optional()),
	ALLOWED_ORIGINS: csv,
	TMDB_ACCESS_TOKEN: z.preprocess(blankToUndefined, z.string().optional()),
	METADATA_LANGUAGE: z.string().default('en-US'),
	METADATA_REGION: z.string().default('US'),
	TZ: z.string().default('UTC'),
	BACKUP_RETENTION_DAYS: z.coerce.number().int().min(0).default(14),
	ADMIN_USERNAME: z.preprocess(blankToUndefined, z.string().optional()),
	ADMIN_PASSWORD: z.preprocess(blankToUndefined, z.string().optional()),
	/** Development/testing: don't start background jobs (no outgoing requests). */
	DISABLE_JOBS: z
		.string()
		.optional()
		.transform((v) => v === '1' || v === 'true')
});

export type Config = z.infer<typeof schema> & { dataDir: string; databasePath: string };

export function parseConfig(env: Record<string, string | undefined>): Config {
	const parsed = schema.safeParse(env);
	if (!parsed.success) {
		const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
		throw new Error(`Invalid configuration:\n${issues.join('\n')}`);
	}
	const dataDir = resolve(parsed.data.DATA_DIR);
	return { ...parsed.data, dataDir, databasePath: resolve(dataDir, 'episodic.db') };
}

let cached: Config | undefined;

export function config(): Config {
	cached ??= parseConfig(process.env);
	return cached;
}
