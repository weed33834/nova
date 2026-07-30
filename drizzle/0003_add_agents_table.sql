-- Server-side persistence for custom agents.
-- Mirrors the `skills` table pattern. Custom agents were previously stored only
-- in browser localStorage/IndexedDB; this table makes them DB-backed.
-- Uses IF NOT EXISTS so it's safe to run even if the fallback createSchemaDirectly
-- path already created the table.

CREATE TABLE IF NOT EXISTS `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`system_prompt` text NOT NULL,
	`voice` text,
	`avatar` text,
	`allowed_actions_json` text DEFAULT '[]' NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`category` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `agents_owner_id_idx` ON `agents` (`owner_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `agents_category_idx` ON `agents` (`category`);
