CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer NOT NULL,
	`refresh_token_expires_at` integer NOT NULL,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `block_types` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`schema` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `block_types_slug_unique` ON `block_types` (`slug`);--> statement-breakpoint
CREATE TABLE `block_features` (
	`id` text PRIMARY KEY NOT NULL,
	`collection_id` text NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`title` text,
	`subtitle` text
);
--> statement-breakpoint
CREATE TABLE `block_features_features` (
	`id` text PRIMARY KEY NOT NULL,
	`block_id` text NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`title` text,
	`subtitle` text,
	`content` text,
	`icon` text
);
--> statement-breakpoint
CREATE TABLE `block_features_features_cta` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_id` text,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`title` text,
	`link` text
);
--> statement-breakpoint
CREATE TABLE `block_gallery` (
	`id` text PRIMARY KEY NOT NULL,
	`collection_id` text NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`title` text
);
--> statement-breakpoint
CREATE TABLE `block_gallery_images` (
	`id` text PRIMARY KEY NOT NULL,
	`block_id` text NOT NULL,
	`file_id` text,
	`sort` integer DEFAULT 0 NOT NULL,
	`alt_override` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `block_hero` (
	`id` text PRIMARY KEY NOT NULL,
	`collection_id` text NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`title` text,
	`subtitle` text,
	`content` text
);
--> statement-breakpoint
CREATE TABLE `block_hero_background_image` (
	`id` text PRIMARY KEY NOT NULL,
	`block_id` text NOT NULL,
	`file_id` text,
	`sort` integer DEFAULT 0 NOT NULL,
	`alt_override` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `block_media_text` (
	`id` text PRIMARY KEY NOT NULL,
	`collection_id` text NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`title` text,
	`subtitle` text,
	`content` text,
	`image_position` text
);
--> statement-breakpoint
CREATE TABLE `block_media_text_image` (
	`id` text PRIMARY KEY NOT NULL,
	`block_id` text NOT NULL,
	`file_id` text,
	`sort` integer DEFAULT 0 NOT NULL,
	`alt_override` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `block_rich_text` (
	`id` text PRIMARY KEY NOT NULL,
	`collection_id` text NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`title` text,
	`content` text
);
--> statement-breakpoint
CREATE TABLE `block_services` (
	`id` text PRIMARY KEY NOT NULL,
	`collection_id` text NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`title` text,
	`subtitle` text
);
--> statement-breakpoint
CREATE TABLE `block_services_services` (
	`id` text PRIMARY KEY NOT NULL,
	`block_id` text NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`title` text,
	`description` text
);
--> statement-breakpoint
CREATE TABLE `block_services_services_cta` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_id` text,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`title` text,
	`link` text
);
--> statement-breakpoint
CREATE TABLE `block_services_services_image` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_id` text,
	`file_id` text,
	`sort` integer DEFAULT 0 NOT NULL,
	`alt_override` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `collection_types` (
	`id` text PRIMARY KEY NOT NULL,
	`name_singular` text NOT NULL,
	`name_plural` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`icon` text,
	`schema` text NOT NULL,
	`options` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collection_types_slug_unique` ON `collection_types` (`slug`);--> statement-breakpoint
CREATE TABLE `collection_pages` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`title` text,
	`slug` text,
	`status` text,
	`author` text,
	`sort` integer DEFAULT 0 NOT NULL,
	`parent_id` text,
	`last_modified_by` text,
	`meta_title` text,
	`meta_description` text,
	`og_title` text,
	`og_description` text,
	`og_image` text,
	`canonical_url` text,
	`noindex` text,
	`content` text,
	`featured_image` text,
	`excerpt` text,
	`tags` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collection_pages_slug_unique` ON `collection_pages` (`slug`);--> statement-breakpoint
CREATE TABLE `collection_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`title` text,
	`slug` text,
	`status` text,
	`author` text,
	`sort` integer DEFAULT 0 NOT NULL,
	`parent_id` text,
	`last_modified_by` text,
	`meta_title` text,
	`meta_description` text,
	`og_title` text,
	`og_description` text,
	`og_image` text,
	`canonical_url` text,
	`noindex` text,
	`content` text,
	`excerpt` text,
	`featured_image` text,
	`tags` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collection_posts_slug_unique` ON `collection_posts` (`slug`);--> statement-breakpoint
CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer,
	`path` text NOT NULL,
	`url` text NOT NULL,
	`hash` text,
	`alt` text,
	`title` text,
	`description` text,
	`author` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `files_name_idx` ON `files` (`name`);--> statement-breakpoint
CREATE INDEX `files_mime_type_idx` ON `files` (`mime_type`);--> statement-breakpoint
CREATE INDEX `files_created_at_idx` ON `files` (`created_at`);--> statement-breakpoint
CREATE INDEX `files_hash_idx` ON `files` (`hash`);--> statement-breakpoint
CREATE TABLE `global_types` (
	`id` text PRIMARY KEY NOT NULL,
	`name_singular` text NOT NULL,
	`name_plural` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`icon` text,
	`data_type` text NOT NULL,
	`schema` text NOT NULL,
	`options` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `global_types_slug_unique` ON `global_types` (`slug`);--> statement-breakpoint
CREATE TABLE `global_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`parent_id` text,
	`title` text,
	`slug` text,
	`status` text,
	`author` text,
	`sort` integer DEFAULT 0 NOT NULL,
	`last_modified_by` text,
	`description` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `global_categories_slug_unique` ON `global_categories` (`slug`);--> statement-breakpoint
CREATE TABLE `global_details` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_modified_by` text,
	`email` text,
	`address` text,
	`footerText` text
);
--> statement-breakpoint
CREATE TABLE `global_details_social_media` (
	`id` text PRIMARY KEY NOT NULL,
	`global_id` text NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`title` text,
	`url` text
);
--> statement-breakpoint
CREATE TABLE `global_faq` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`title` text,
	`slug` text,
	`status` text,
	`author` text,
	`sort` integer DEFAULT 0 NOT NULL,
	`parent_id` text,
	`last_modified_by` text,
	`answer` text,
	`tags` text,
	`featured` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `global_faq_slug_unique` ON `global_faq` (`slug`);--> statement-breakpoint
CREATE TABLE `global_menus` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`title` text,
	`slug` text,
	`status` text,
	`author` text,
	`sort` integer DEFAULT 0 NOT NULL,
	`parent_id` text,
	`last_modified_by` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `global_menus_slug_unique` ON `global_menus` (`slug`);--> statement-breakpoint
CREATE TABLE `global_menus_items` (
	`id` text PRIMARY KEY NOT NULL,
	`global_id` text NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`parent_id` text,
	`label` text,
	`url` text,
	`target` text
);
--> statement-breakpoint
CREATE TABLE `global_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`title` text,
	`slug` text,
	`status` text,
	`author` text,
	`sort` integer DEFAULT 0 NOT NULL,
	`parent_id` text,
	`last_modified_by` text,
	`name` text,
	`email` text,
	`phone` text,
	`subject` text,
	`message` text,
	`source` text,
	`notes` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `global_submissions_slug_unique` ON `global_submissions` (`slug`);--> statement-breakpoint
CREATE TABLE `junction_posts_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`collection_id` text NOT NULL,
	`target_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `roles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`permissions` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `roles_name_unique` ON `roles` (`name`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token` text NOT NULL,
	`expires_at` text NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `system_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`description` text,
	`category` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `system_settings_key_unique` ON `system_settings` (`key`);--> statement-breakpoint
CREATE TABLE `taggables` (
	`id` text PRIMARY KEY NOT NULL,
	`tag_id` text NOT NULL,
	`taggable_type` text NOT NULL,
	`taggable_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `taggables_tag_id_idx` ON `taggables` (`tag_id`);--> statement-breakpoint
CREATE INDEX `taggables_taggable_type_idx` ON `taggables` (`taggable_type`);--> statement-breakpoint
CREATE INDEX `taggables_taggable_id_idx` ON `taggables` (`taggable_id`);--> statement-breakpoint
CREATE INDEX `taggables_composite_idx` ON `taggables` (`taggable_type`,`taggable_id`);--> statement-breakpoint
CREATE INDEX `taggables_unique_idx` ON `taggables` (`tag_id`,`taggable_type`,`taggable_id`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`scope` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tags_name_idx` ON `tags` (`name`);--> statement-breakpoint
CREATE INDEX `tags_slug_idx` ON `tags` (`slug`);--> statement-breakpoint
CREATE INDEX `tags_scope_idx` ON `tags` (`scope`);--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_scope_unique_idx` ON `tags` (`name`,`scope`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`password` text,
	`email_verified` integer DEFAULT 0,
	`image` text,
	`role` text,
	`banned` integer DEFAULT 0,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `users_email_idx` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `users_role_idx` ON `users` (`role`);--> statement-breakpoint
CREATE TABLE `verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
