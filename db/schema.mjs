import { sqliteTable, text, integer, primaryKey, index } from 'drizzle-orm/sqlite-core';

export const datasets = sqliteTable('datasets', {
  id: text('id').primaryKey(),
  fingerprint: text('fingerprint').notNull().unique(),
  status: text('status').notNull(),
  metadata: text('metadata_json').notNull(),
  expectedCount: integer('expected_count').notNull(),
  importedAt: text('imported_at').notNull(),
});

export const practices = sqliteTable(
  'practices',
  {
    datasetId: text('dataset_id')
      .notNull()
      .references(() => datasets.id),
    id: text('id').notNull(),
    postalCode: text('postal_code').notNull(),
    specialty: text('specialty').notNull(),
    record: text('record_json').notNull(),
    sourceFields: text('source_json').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.datasetId, table.id] }),
    index('practice_filter_idx').on(table.datasetId, table.postalCode, table.specialty),
  ],
);

export const appState = sqliteTable('app_state', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
