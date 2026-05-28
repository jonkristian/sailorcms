// Core system tables generator (users, files, roles, etc.)

export class CoreGenerator {
  constructor(adapter, userRoles) {
    this.adapter = adapter;
    this.userRoles = userRoles;
  }

  /**
   * Generate all core system tables
   */
  async generateCoreTables() {
    const tables = [];

    // Generate core table definitions
    const coreTableDefinitions = [
      // Users table
      `export const users = ${this.adapter.getTableFunction()}(
  'users',
  {
    id: ${this.adapter.getPrimaryKeyDefinition()},
    email: ${this.adapter.getTextFieldDefinition('email', { notNull: true, unique: true })},
    name: ${this.adapter.getTextFieldDefinition('name')},
    email_verified: ${this.adapter.getIntegerFieldDefinition('email_verified', { default: 0 })},
    image: ${this.adapter.getTextFieldDefinition('image')},
    role: ${this.adapter.getTextFieldDefinition('role')},
    banned: ${this.adapter.getIntegerFieldDefinition('banned', { default: 0 })},
    ban_reason: ${this.adapter.getTextFieldDefinition('ban_reason')},
    ban_expires: ${this.adapter.getTimestampDefinition('ban_expires')},
    preferences: ${this.adapter.getTextFieldDefinition('preferences')},
    created_at: ${this.adapter.getTimestampDefinition('created_at')},
    updated_at: ${this.adapter.getTimestampDefinition('updated_at')}
  },
  (table) => [
    index('users_email_idx').on(table.email),
    index('users_role_idx').on(table.role)
  ]
);`,

      // Roles table
      `export const roles = ${this.adapter.getTableFunction()}('roles', {
  id: ${this.adapter.getPrimaryKeyDefinition()},
  name: ${this.adapter.getTextFieldDefinition('name', { notNull: true, unique: true })},
  permissions: ${this.adapter.getTextFieldDefinition('permissions', { notNull: true })},
  created_at: ${this.adapter.getTimestampDefinition('created_at')},
  updated_at: ${this.adapter.getTimestampDefinition('updated_at')}
});`,

      // Collection types table
      `export const collectionTypes = ${this.adapter.getTableFunction()}('collection_types', {
  id: ${this.adapter.getPrimaryKeyDefinition()},
  name_singular: ${this.adapter.getTextFieldDefinition('name_singular', { notNull: true })},
  name_plural: ${this.adapter.getTextFieldDefinition('name_plural', { notNull: true })},
  slug: ${this.adapter.getTextFieldDefinition('slug', { notNull: true, unique: true })},
  description: ${this.adapter.getTextFieldDefinition('description')},
  icon: ${this.adapter.getTextFieldDefinition('icon')},
  schema: ${this.adapter.getTextFieldDefinition('schema', { notNull: true })},
  options: ${this.adapter.getTextFieldDefinition('options')},
  sort: ${this.adapter.getIntegerFieldDefinition('sort', { notNull: true, default: 0 })},
  created_at: ${this.adapter.getTimestampDefinition('created_at')},
  updated_at: ${this.adapter.getTimestampDefinition('updated_at')}
});`,

      // Block types table
      `export const blockTypes = ${this.adapter.getTableFunction()}('block_types', {
  id: ${this.adapter.getPrimaryKeyDefinition()},
  name: ${this.adapter.getTextFieldDefinition('name', { notNull: true })},
  slug: ${this.adapter.getTextFieldDefinition('slug', { notNull: true, unique: true })},
  description: ${this.adapter.getTextFieldDefinition('description')},
  schema: ${this.adapter.getTextFieldDefinition('schema', { notNull: true })},
  created_at: ${this.adapter.getTimestampDefinition('created_at')},
  updated_at: ${this.adapter.getTimestampDefinition('updated_at')}
});`,

      // Global types table
      `export const globalTypes = ${this.adapter.getTableFunction()}('global_types', {
  id: ${this.adapter.getPrimaryKeyDefinition()},
  name_singular: ${this.adapter.getTextFieldDefinition('name_singular', { notNull: true })},
  name_plural: ${this.adapter.getTextFieldDefinition('name_plural', { notNull: true })},
  slug: ${this.adapter.getTextFieldDefinition('slug', { notNull: true, unique: true })},
  description: ${this.adapter.getTextFieldDefinition('description')},
  icon: ${this.adapter.getTextFieldDefinition('icon')},
  data_type: ${this.adapter.getTextFieldDefinition('data_type', { notNull: true })},
  schema: ${this.adapter.getTextFieldDefinition('schema', { notNull: true })},
  options: ${this.adapter.getTextFieldDefinition('options')},
  sort: ${this.adapter.getIntegerFieldDefinition('sort', { notNull: true, default: 0 })},
  created_at: ${this.adapter.getTimestampDefinition('created_at')},
  updated_at: ${this.adapter.getTimestampDefinition('updated_at')}
});`,

      // Settings table
      `export const settings = ${this.adapter.getTableFunction()}('settings', {
  key: text('key').primaryKey().notNull(),
  value: ${this.adapter.getTextFieldDefinition('value', { notNull: true })},
  description: ${this.adapter.getTextFieldDefinition('description')},
  category: ${this.adapter.getTextFieldDefinition('category', { notNull: true })},
  source: ${this.adapter.getTextFieldDefinition('source', { notNull: true, default: 'user' })},
  created_at: ${this.adapter.getTimestampDefinition('created_at')},
  updated_at: ${this.adapter.getTimestampDefinition('updated_at')}
});`,

      // Files table
      `export const files = ${this.adapter.getTableFunction()}(
  'files',
  {
    id: ${this.adapter.getPrimaryKeyDefinition()},
    name: ${this.adapter.getTextFieldDefinition('name', { notNull: true })},
    mime_type: ${this.adapter.getTextFieldDefinition('mime_type', { notNull: true })},
    size: ${this.adapter.getIntegerFieldDefinition('size')},
    path: ${this.adapter.getTextFieldDefinition('path', { notNull: true })},
    url: ${this.adapter.getTextFieldDefinition('url', { notNull: true })},
    hash: ${this.adapter.getTextFieldDefinition('hash')},
    alt: ${this.adapter.getTextFieldDefinition('alt')},
    title: ${this.adapter.getTextFieldDefinition('title')},
    description: ${this.adapter.getTextFieldDefinition('description')},
    author: ${this.adapter.getTextFieldDefinition('author')},
    created_at: ${this.adapter.getTimestampDefinition('created_at')},
    updated_at: ${this.adapter.getTimestampDefinition('updated_at')},
    deleted_at: ${this.adapter.getNullableTimestampDefinition('deleted_at')},
    deleted_by: ${this.adapter.getTextFieldDefinition('deleted_by')}
  },
  (table) => [
    index('files_name_idx').on(table.name),
    index('files_mime_type_idx').on(table.mime_type),
    index('files_created_at_idx').on(table.created_at),
    index('files_hash_idx').on(table.hash)
  ]
);`,

      // Tags table
      `export const tags = ${this.adapter.getTableFunction()}(
  'tags',
  {
    id: ${this.adapter.getPrimaryKeyDefinition()},
    name: ${this.adapter.getTextFieldDefinition('name', { notNull: true })},
    slug: ${this.adapter.getTextFieldDefinition('slug', { notNull: true })},
    scope: ${this.adapter.getTextFieldDefinition('scope')},
    created_at: ${this.adapter.getTimestampDefinition('created_at')},
    updated_at: ${this.adapter.getTimestampDefinition('updated_at')},
    deleted_at: ${this.adapter.getNullableTimestampDefinition('deleted_at')},
    deleted_by: ${this.adapter.getTextFieldDefinition('deleted_by')}
  },
  (table) => [
    index('tags_name_idx').on(table.name),
    index('tags_slug_idx').on(table.slug),
    index('tags_scope_idx').on(table.scope),
    uniqueIndex('tags_name_scope_unique_idx').on(table.name, table.scope)
  ]
);`,

      // Taggables table
      `export const taggables = ${this.adapter.getTableFunction()}(
  'taggables',
  {
    id: ${this.adapter.getPrimaryKeyDefinition()},
    tag_id: ${this.adapter.getTextFieldDefinition('tag_id', { notNull: true })},
    taggable_type: ${this.adapter.getTextFieldDefinition('taggable_type', { notNull: true })},
    taggable_id: ${this.adapter.getTextFieldDefinition('taggable_id', { notNull: true })},
    created_at: ${this.adapter.getTimestampDefinition('created_at')}
  },
  (table) => [
    index('taggables_tag_id_idx').on(table.tag_id),
    index('taggables_taggable_type_idx').on(table.taggable_type),
    index('taggables_taggable_id_idx').on(table.taggable_id),
    index('taggables_composite_idx').on(table.taggable_type, table.taggable_id),
    index('taggables_unique_idx').on(table.tag_id, table.taggable_type, table.taggable_id)
  ]
);`,

      // Search index table (populated by SearchIndexService on content save;
      // queried by the search() utility). `locale` is nullable: non-localized
      // entities store NULL and have at most one row per item; localized
      // entities (collections marked `localized: true`) store one row per
      // (item, locale) so each translation is independently searchable.
      `export const searchIndex = ${this.adapter.getTableFunction()}(
  'search_index',
  {
    id: ${this.adapter.getPrimaryKeyDefinition()},
    entity_type: ${this.adapter.getTextFieldDefinition('entity_type', { notNull: true })},
    entity_name: ${this.adapter.getTextFieldDefinition('entity_name', { notNull: true })},
    entity_id: ${this.adapter.getTextFieldDefinition('entity_id', { notNull: true })},
    locale: ${this.adapter.getTextFieldDefinition('locale')},
    title: ${this.adapter.getTextFieldDefinition('title')},
    searchable_text: ${this.adapter.getTextFieldDefinition('searchable_text', { notNull: true })},
    status: ${this.adapter.getTextFieldDefinition('status')},
    updated_at: ${this.adapter.getTimestampDefinition('updated_at')}
  },
  (table) => [
    uniqueIndex('search_index_entity_unique_idx').on(table.entity_type, table.entity_name, table.entity_id, table.locale),
    index('search_index_entity_idx').on(table.entity_type, table.entity_name),
    index('search_index_locale_idx').on(table.locale),
    index('search_index_status_updated_idx').on(table.status, table.updated_at)
  ]
);`,

      // Better Auth tables
      `export const accounts = ${this.adapter.getTableFunction()}('accounts', {
  id: ${this.adapter.getPrimaryKeyDefinition()},
  user_id: ${this.adapter.getTextFieldDefinition('user_id', { notNull: true })},
  account_id: ${this.adapter.getTextFieldDefinition('account_id', { notNull: true })},
  provider_id: ${this.adapter.getTextFieldDefinition('provider_id', { notNull: true })},
  access_token: ${this.adapter.getTextFieldDefinition('access_token')},
  refresh_token: ${this.adapter.getTextFieldDefinition('refresh_token')},
  id_token: ${this.adapter.getTextFieldDefinition('id_token')},
  access_token_expires_at: ${this.adapter.getTimestampDefinition('access_token_expires_at')},
  refresh_token_expires_at: ${this.adapter.getTimestampDefinition('refresh_token_expires_at')},
  scope: ${this.adapter.getTextFieldDefinition('scope')},
  password: ${this.adapter.getTextFieldDefinition('password')},
  created_at: ${this.adapter.getTimestampDefinition('created_at')},
  updated_at: ${this.adapter.getTimestampDefinition('updated_at')}
});`,

      `export const sessions = ${this.adapter.getTableFunction()}('sessions', {
  id: ${this.adapter.getPrimaryKeyDefinition()},
  user_id: ${this.adapter.getTextFieldDefinition('user_id', { notNull: true })},
  token: ${this.adapter.getTextFieldDefinition('token', { notNull: true })},
  expires_at: ${this.adapter.getTextFieldDefinition('expires_at', { notNull: true })},
  ip_address: ${this.adapter.getTextFieldDefinition('ip_address')},
  user_agent: ${this.adapter.getTextFieldDefinition('user_agent')},
  impersonated_by: ${this.adapter.getTextFieldDefinition('impersonated_by')},
  created_at: ${this.adapter.getTimestampDefinition('created_at')},
  updated_at: ${this.adapter.getTimestampDefinition('updated_at')}
});`,

      `export const verifications = ${this.adapter.getTableFunction()}('verifications', {
  id: ${this.adapter.getPrimaryKeyDefinition()},
  identifier: ${this.adapter.getTextFieldDefinition('identifier', { notNull: true })},
  value: ${this.adapter.getTextFieldDefinition('value', { notNull: true })},
  expires_at: ${this.adapter.getTextFieldDefinition('expires_at', { notNull: true })},
  created_at: ${this.adapter.getTimestampDefinition('created_at')},
  updated_at: ${this.adapter.getTimestampDefinition('updated_at')}
});`,

      // Mail events: one row per logical email (not per attempt). Retries
      // update the same row in place — `attempts` increments, `status` flips
      // back to 'sent' on a successful retry so the outbox badge reflects
      // current state rather than carrying forever-stale "failed" rows. Audit
      // signal lives in `attempts` + `updated_at`; if per-attempt history is
      // ever needed it lands in a child table, not here. `user_id` is the
      // authenticated actor when triggered from an admin session (e.g. the
      // "Send test email" button), null for system-initiated sends like
      // password-reset emails. Pruning of body content is a separate concern
      // handled by future retention tooling.
      `export const mailEvents = ${this.adapter.getTableFunction()}(
  'mail_events',
  {
    id: ${this.adapter.getPrimaryKeyDefinition()},
    created_at: ${this.adapter.getTimestampDefinition('created_at')},
    // updated_at is nullable so an existing-data ALTER TABLE migration doesn't
    // trip SQLite's "NOT NULL with NULL default" rule when adding the column.
    // Application code stamps it on every write, so reads can rely on it.
    updated_at: ${this.adapter.getNullableTimestampDefinition('updated_at')},
    driver: ${this.adapter.getTextFieldDefinition('driver', { notNull: true })},
    to_address: ${this.adapter.getTextFieldDefinition('to_address', { notNull: true })},
    subject: ${this.adapter.getTextFieldDefinition('subject', { notNull: true })},
    body_text: ${this.adapter.getTextFieldDefinition('body_text')},
    body_html: ${this.adapter.getTextFieldDefinition('body_html')},
    status: ${this.adapter.getTextFieldDefinition('status', { notNull: true })},
    message_id: ${this.adapter.getTextFieldDefinition('message_id')},
    error_message: ${this.adapter.getTextFieldDefinition('error_message')},
    // Nullable + default 1 so backfilling existing rows on ALTER TABLE succeeds.
    // Reads use attempts ?? 1 since the application always sets it on insert.
    attempts: ${this.adapter.getIntegerFieldDefinition('attempts', { default: 1 })},
    user_id: ${this.adapter.getTextFieldDefinition('user_id')}
  },
  (table) => [
    index('mail_events_status_idx').on(table.status, table.created_at),
    index('mail_events_to_idx').on(table.to_address),
    index('mail_events_created_at_idx').on(table.created_at)
  ]
);`,

      // Revisions: polymorphic snapshots of collection items / globals at save time.
      // `entity_type` namespaces by source, e.g. 'collection:pages' / 'global:menu',
      // so collection slugs and global slugs can't collide. `data` is a full JSON
      // snapshot of the submitted payload (row + array fields + blocks + relations + tags),
      // so restore = re-running save with `data` as the new formData. Pruning is per
      // template, configurable via `options.revisions.keep` (default 50).
      `export const revisions = ${this.adapter.getTableFunction()}(
  'revisions',
  {
    id: ${this.adapter.getPrimaryKeyDefinition()},
    entity_type: ${this.adapter.getTextFieldDefinition('entity_type', { notNull: true })},
    entity_id: ${this.adapter.getTextFieldDefinition('entity_id', { notNull: true })},
    data: ${this.adapter.getTextFieldDefinition('data', { notNull: true })},
    created_by: ${this.adapter.getTextFieldDefinition('created_by')},
    created_at: ${this.adapter.getTimestampDefinition('created_at')}
  },
  (table) => [
    index('revisions_entity_idx').on(table.entity_type, table.entity_id, table.created_at),
    index('revisions_created_at_idx').on(table.created_at)
  ]
);`
    ];

    return coreTableDefinitions.join('\n\n');
  }

  /**
   * Generate core table relations
   */
  generateCoreRelations() {
    const relationDefinitions = [
      `export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  sessions: many(sessions)
}));`,

      `export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, {
    fields: [accounts.user_id],
    references: [users.id]
  })
}));`,

      `export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.user_id],
    references: [users.id]
  }),
  impersonatedBy: one(users, {
    fields: [sessions.impersonated_by],
    references: [users.id]
  })
}));`,

      `export const collectionTypesRelations = relations(collectionTypes, ({ many }) => ({
  blocks: many(blockTypes)
}));`,

      `export const blockTypesRelations = relations(blockTypes, ({ one }) => ({
  collectionType: one(collectionTypes, {
    fields: [blockTypes.id],
    references: [collectionTypes.id]
  })
}));`,

      `export const tagsRelations = relations(tags, ({ many }) => ({
  taggables: many(taggables)
}));`,

      `export const taggablesRelations = relations(taggables, ({ one }) => ({
  tag: one(tags, {
    fields: [taggables.tag_id],
    references: [tags.id]
  })
}));`,

      `export const filesRelations = relations(files, ({ many }) => ({
  taggables: many(taggables)
}));`,

      `export const revisionsRelations = relations(revisions, ({ one }) => ({
  createdBy: one(users, {
    fields: [revisions.created_by],
    references: [users.id]
  })
}));`
    ];

    return relationDefinitions.join('\n\n');
  }
}
