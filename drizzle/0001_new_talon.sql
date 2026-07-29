CREATE TABLE `content_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`classroom_id` text NOT NULL,
	`version` integer NOT NULL,
	`stage_json` text NOT NULL,
	`scenes_json` text NOT NULL,
	`created_by` text,
	`label` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `learning_events` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`user_id` text,
	`classroom_id` text,
	`scene_id` text,
	`session_id` text,
	`verb` text NOT NULL,
	`object_type` text,
	`object_id` text,
	`result_json` text,
	`duration_ms` integer,
	`metadata_json` text
);
