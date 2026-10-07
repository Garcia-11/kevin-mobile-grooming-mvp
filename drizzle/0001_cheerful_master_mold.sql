ALTER TABLE `requests` ADD `duration_minutes` integer DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE `requests` ADD `travel_minutes` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_requests_schedule` ON `requests` (`tenant`,`status`,`scheduled_at`);