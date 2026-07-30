import { sql } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  text,
  uuid,
  integer,
  bigint,
  timestamp,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { users } from './identity.js';
import { PaperSizeSchema } from '@kms/domain';

// ── Enums (values sourced exclusively from P02 — never re-typed literals) ──

export const paperSizeEnum = pgEnum('paper_size', [...PaperSizeSchema.options]);

// ── Tables ──

export const brandPresets = pgTable(
  'brand_presets',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id),
    name: text('name').notNull(),
    logoUrl: text('logo_url'),
    primaryColor: text('primary_color'),
    secondaryColor: text('secondary_color'),
    fontFamily: text('font_family'),
    headerText: text('header_text'),
    footerText: text('footer_text'),
    paperSize: paperSizeEnum('paper_size'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    version: integer('version').notNull().default(1),
  },
  (t) => ({
    // CHECK constraints per registry
    primaryColorFormat: check(
      'brand_presets_primary_color_format',
      sql`${t.primaryColor} IS NULL OR ${t.primaryColor} ~ '^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$'`,
    ),
    secondaryColorFormat: check(
      'brand_presets_secondary_color_format',
      sql`${t.secondaryColor} IS NULL OR ${t.secondaryColor} ~ '^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$'`,
    ),
    versionPositive: check('brand_presets_version_positive', sql`${t.version} > 0`),

    // Unique (owner_id, name)
    ownerNameUnique: uniqueIndex('brand_presets_owner_name_unique').on(t.ownerId, t.name),

    // Indexes
    ownerIdIdx: index('brand_presets_owner_id_idx').on(t.ownerId),
  }),
);

export const brandAssets = pgTable(
  'brand_assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    brandPresetId: text('brand_preset_id')
      .notNull()
      .references(() => brandPresets.id, { onDelete: 'cascade' }),
    ownerId: text('owner_id').notNull(),
    storageKey: text('storage_key').notNull(),
    sha256: text('sha256').notNull(),
    byteLength: bigint('byte_length', { mode: 'number' }).notNull(),
    kind: text('kind').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    // CHECK constraints per registry
    sha256Format: check('brand_assets_sha256_format', sql`${t.sha256} ~ '^[0-9a-fA-F]{64}$'`),
    byteLengthPositive: check('brand_assets_byte_length_positive', sql`${t.byteLength} > 0`),

    // Indexes
    brandPresetIdIdx: index('brand_assets_brand_preset_id_idx').on(t.brandPresetId),
  }),
);
