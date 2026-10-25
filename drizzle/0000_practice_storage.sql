CREATE TABLE `app_state` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `datasets` (
	`id` text PRIMARY KEY NOT NULL,
	`fingerprint` text NOT NULL,
	`status` text NOT NULL,
	`metadata_json` text NOT NULL,
	`expected_count` integer NOT NULL,
	`imported_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `datasets_fingerprint_unique` ON `datasets` (`fingerprint`);--> statement-breakpoint
CREATE TABLE `practices` (
	`dataset_id` text NOT NULL,
	`id` text NOT NULL,
	`postal_code` text NOT NULL,
	`specialty` text NOT NULL,
	`record_json` text NOT NULL,
	`source_json` text NOT NULL,
	PRIMARY KEY(`dataset_id`, `id`),
	FOREIGN KEY (`dataset_id`) REFERENCES `datasets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `practice_filter_idx` ON `practices` (`dataset_id`,`postal_code`,`specialty`);