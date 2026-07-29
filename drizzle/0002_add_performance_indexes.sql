-- Add performance indexes for all major tables.
-- Uses IF NOT EXISTS so it's safe to run even if the fallback createSchemaDirectly
-- path already created some of these indexes.

CREATE INDEX IF NOT EXISTS `users_role_idx` ON `users` (`role`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `accounts_user_id_idx` ON `accounts` (`user_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `accounts_provider_idx` ON `accounts` (`provider`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sessions_user_id_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `classrooms_owner_id_idx` ON `classrooms` (`owner_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `classrooms_created_at_idx` ON `classrooms` (`created_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `classrooms_deleted_idx` ON `classrooms` (`deleted`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `skills_owner_id_idx` ON `skills` (`owner_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `skills_category_idx` ON `skills` (`category`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `usage_records_created_at_idx` ON `usage_records` (`created_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `usage_records_user_id_idx` ON `usage_records` (`user_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `usage_records_kind_idx` ON `usage_records` (`kind`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `audit_logs_actor_id_idx` ON `audit_logs` (`actor_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `audit_logs_action_idx` ON `audit_logs` (`action`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `audit_logs_entity_idx` ON `audit_logs` (`entity_type`, `entity_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `audit_logs_created_at_idx` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `api_keys_owner_id_idx` ON `api_keys` (`owner_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `learning_events_user_id_idx` ON `learning_events` (`user_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `learning_events_classroom_id_idx` ON `learning_events` (`classroom_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `learning_events_session_id_idx` ON `learning_events` (`session_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `learning_events_verb_idx` ON `learning_events` (`verb`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `learning_events_created_at_idx` ON `learning_events` (`created_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `content_versions_classroom_id_idx` ON `content_versions` (`classroom_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `content_versions_version_idx` ON `content_versions` (`version`);
