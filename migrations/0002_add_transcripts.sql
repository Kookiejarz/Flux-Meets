CREATE TABLE `Transcripts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`modified` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted` text,
	`meetingId` text NOT NULL,
	`userId` text NOT NULL,
	`userName` text NOT NULL,
	`text` text NOT NULL,
	`language` text,
	FOREIGN KEY (`meetingId`) REFERENCES `Meetings`(`id`) ON UPDATE no action ON DELETE no action
);
