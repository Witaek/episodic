import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

/** Key/value store for instance-level facts (schema version notes, first-run state, …). */
export const appMeta = sqliteTable('app_meta', {
	key: text('key').primaryKey(),
	value: text('value').notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date())
});
