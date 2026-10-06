CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `requests` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant` text NOT NULL,
	`request_key` text NOT NULL,
	`owner_name` text NOT NULL,
	`phone` text NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`dog_name` text NOT NULL,
	`breed` text NOT NULL,
	`size` text NOT NULL,
	`service` text NOT NULL,
	`address` text NOT NULL,
	`preferred_date` text NOT NULL,
	`time_window` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`scheduled_at` text,
	`seen` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_requests_tenant_created` ON `requests` (`tenant`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_requests_idempotency` ON `requests` (`tenant`,`request_key`);