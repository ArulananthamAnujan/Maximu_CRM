CREATE TABLE `applications` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`provider_name` text,
	`course_or_visa_type` text NOT NULL,
	`intake_or_subclass` text,
	`external_reference` text,
	`status` text NOT NULL,
	`submitted_at` text,
	`outcome_at` text,
	`outcome` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `applications_case_idx` ON `applications` (`case_id`);--> statement-breakpoint
CREATE TABLE `appointments` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text,
	`client_id` text,
	`organiser_id` text NOT NULL,
	`title` text NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`timezone` text NOT NULL,
	`location` text,
	`google_calendar_event_id` text,
	`client_visible` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organiser_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `appointments_organiser_idx` ON `appointments` (`organiser_id`);--> statement-breakpoint
CREATE INDEX `appointments_client_idx` ON `appointments` (`client_id`);--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`actor_profile_id` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`case_id` text,
	`branch_id` text,
	`country_code` text,
	`before_json` text,
	`after_json` text,
	`ip_address` text,
	`user_agent` text,
	`occurred_at` text NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_entity_idx` ON `audit_events` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `audit_actor_idx` ON `audit_events` (`actor_profile_id`);--> statement-breakpoint
CREATE INDEX `audit_occurred_idx` ON `audit_events` (`occurred_at`);--> statement-breakpoint
CREATE TABLE `branches` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`country_code` text NOT NULL,
	`name` text NOT NULL,
	`legal_entity_name` text,
	`timezone` text NOT NULL,
	`email` text,
	`phone` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`country_code`) REFERENCES `countries`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `branches_organisation_idx` ON `branches` (`organisation_id`);--> statement-breakpoint
CREATE INDEX `branches_country_idx` ON `branches` (`country_code`);--> statement-breakpoint
CREATE TABLE `case_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`author_id` text NOT NULL,
	`body` text NOT NULL,
	`visibility` text DEFAULT 'internal' NOT NULL,
	`pinned` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `case_notes_case_idx` ON `case_notes` (`case_id`);--> statement-breakpoint
CREATE TABLE `case_stage_events` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`from_stage_id` text,
	`to_stage_id` text NOT NULL,
	`changed_by` text NOT NULL,
	`reason` text,
	`changed_at` text NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`from_stage_id`) REFERENCES `workflow_stages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_stage_id`) REFERENCES `workflow_stages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`changed_by`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `case_stage_events_case_idx` ON `case_stage_events` (`case_id`);--> statement-breakpoint
CREATE TABLE `cases` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`branch_id` text NOT NULL,
	`service_type` text NOT NULL,
	`destination_country_code` text NOT NULL,
	`workflow_id` text,
	`current_stage_id` text,
	`assigned_staff_id` text,
	`supervisor_id` text,
	`reference_number` text NOT NULL,
	`title` text NOT NULL,
	`visa_or_application_type` text,
	`status` text DEFAULT 'open' NOT NULL,
	`priority` text DEFAULT 'normal' NOT NULL,
	`risk_level` text DEFAULT 'healthy' NOT NULL,
	`opened_at` text NOT NULL,
	`due_at` text,
	`sla_due_at` text,
	`lodged_at` text,
	`decided_at` text,
	`closed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`destination_country_code`) REFERENCES `countries`(`code`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workflow_id`) REFERENCES `workflow_definitions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`current_stage_id`) REFERENCES `workflow_stages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assigned_staff_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`supervisor_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cases_reference_unique` ON `cases` (`reference_number`);--> statement-breakpoint
CREATE INDEX `cases_client_idx` ON `cases` (`client_id`);--> statement-breakpoint
CREATE INDEX `cases_branch_idx` ON `cases` (`branch_id`);--> statement-breakpoint
CREATE INDEX `cases_assigned_staff_idx` ON `cases` (`assigned_staff_id`);--> statement-breakpoint
CREATE INDEX `cases_status_idx` ON `cases` (`status`);--> statement-breakpoint
CREATE TABLE `clients` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`branch_id` text NOT NULL,
	`portal_profile_id` text,
	`assigned_staff_id` text,
	`kind` text NOT NULL,
	`status` text DEFAULT 'lead' NOT NULL,
	`first_name` text NOT NULL,
	`middle_name` text,
	`last_name` text NOT NULL,
	`preferred_name` text,
	`email` text,
	`phone` text,
	`date_of_birth` text,
	`gender` text,
	`nationality` text,
	`current_country` text,
	`address_json` text,
	`passport_number` text,
	`passport_country` text,
	`passport_expiry` text,
	`current_visa` text,
	`current_visa_expiry` text,
	`preferred_language` text,
	`consent_status` text DEFAULT 'pending' NOT NULL,
	`consent_at` text,
	`archived_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`portal_profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assigned_staff_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `clients_branch_idx` ON `clients` (`branch_id`);--> statement-breakpoint
CREATE INDEX `clients_assigned_staff_idx` ON `clients` (`assigned_staff_id`);--> statement-breakpoint
CREATE INDEX `clients_email_idx` ON `clients` (`email`);--> statement-breakpoint
CREATE INDEX `clients_passport_idx` ON `clients` (`passport_number`);--> statement-breakpoint
CREATE TABLE `countries` (
	`code` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`currency` text NOT NULL,
	`timezone` text NOT NULL,
	`privacy_region` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `dependants` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`full_name` text NOT NULL,
	`relationship` text NOT NULL,
	`date_of_birth` text,
	`nationality` text,
	`passport_number` text,
	`passport_expiry` text,
	`included_in_case` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `dependants_client_idx` ON `dependants` (`client_id`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`case_id` text,
	`uploaded_by` text,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`status` text NOT NULL,
	`google_drive_file_id` text,
	`google_drive_folder_id` text,
	`mime_type` text,
	`expiry_date` text,
	`client_visible` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`uploaded_by`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `documents_client_idx` ON `documents` (`client_id`);--> statement-breakpoint
CREATE INDEX `documents_case_idx` ON `documents` (`case_id`);--> statement-breakpoint
CREATE TABLE `education_history` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`institution` text NOT NULL,
	`country_code` text,
	`qualification` text NOT NULL,
	`field_of_study` text,
	`start_date` text,
	`end_date` text,
	`result` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `education_history_client_idx` ON `education_history` (`client_id`);--> statement-breakpoint
CREATE TABLE `employment_history` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`employer` text NOT NULL,
	`country_code` text,
	`position` text NOT NULL,
	`start_date` text,
	`end_date` text,
	`duties` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `employment_history_client_idx` ON `employment_history` (`client_id`);--> statement-breakpoint
CREATE TABLE `immigration_history` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`country_code` text NOT NULL,
	`visa_type` text,
	`outcome` text,
	`applied_at` text,
	`decided_at` text,
	`refusal_reason` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `immigration_history_client_idx` ON `immigration_history` (`client_id`);--> statement-breakpoint
CREATE TABLE `integration_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`provider` text NOT NULL,
	`status` text NOT NULL,
	`account_label` text,
	`secret_reference` text,
	`last_sync_at` text,
	`last_error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `integration_provider_unique` ON `integration_connections` (`organisation_id`,`provider`);--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`case_id` text,
	`branch_id` text NOT NULL,
	`invoice_number` text NOT NULL,
	`currency` text NOT NULL,
	`subtotal_minor` integer NOT NULL,
	`tax_minor` integer DEFAULT 0 NOT NULL,
	`total_minor` integer NOT NULL,
	`paid_minor` integer DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`issued_at` text,
	`due_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invoice_number_unique` ON `invoices` (`invoice_number`);--> statement-breakpoint
CREATE INDEX `invoices_client_idx` ON `invoices` (`client_id`);--> statement-breakpoint
CREATE TABLE `language_tests` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`test_type` text NOT NULL,
	`test_date` text,
	`overall_score` text,
	`listening_score` text,
	`reading_score` text,
	`writing_score` text,
	`speaking_score` text,
	`expiry_date` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `language_tests_client_idx` ON `language_tests` (`client_id`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text,
	`client_id` text,
	`created_by` text NOT NULL,
	`channel` text NOT NULL,
	`direction` text NOT NULL,
	`recipient` text,
	`subject` text,
	`body` text NOT NULL,
	`status` text NOT NULL,
	`provider_message_id` text,
	`sent_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `messages_case_idx` ON `messages` (`case_id`);--> statement-breakpoint
CREATE INDEX `messages_client_idx` ON `messages` (`client_id`);--> statement-breakpoint
CREATE TABLE `organisations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`trading_name` text,
	`default_country_code` text NOT NULL,
	`timezone` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`method` text,
	`reference` text,
	`received_at` text NOT NULL,
	`recorded_by` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recorded_by`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `payments_invoice_idx` ON `payments` (`invoice_id`);--> statement-breakpoint
CREATE TABLE `profile_branch_access` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`branch_id` text NOT NULL,
	`access_level` text DEFAULT 'work' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profile_branch_unique` ON `profile_branch_access` (`profile_id`,`branch_id`);--> statement-breakpoint
CREATE INDEX `profile_branch_profile_idx` ON `profile_branch_access` (`profile_id`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`full_name` text NOT NULL,
	`role` text NOT NULL,
	`status` text DEFAULT 'invited' NOT NULL,
	`home_branch_id` text,
	`google_subject` text,
	`last_login_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`home_branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_email_unique` ON `profiles` (`email`);--> statement-breakpoint
CREATE INDEX `profiles_home_branch_idx` ON `profiles` (`home_branch_id`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text,
	`assigned_to` text NOT NULL,
	`created_by` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`priority` text DEFAULT 'normal' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`due_at` text,
	`completed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assigned_to`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `tasks_assignee_idx` ON `tasks` (`assigned_to`);--> statement-breakpoint
CREATE INDEX `tasks_case_idx` ON `tasks` (`case_id`);--> statement-breakpoint
CREATE TABLE `workflow_definitions` (
	`id` text PRIMARY KEY NOT NULL,
	`organisation_id` text NOT NULL,
	`country_code` text NOT NULL,
	`service_type` text NOT NULL,
	`visa_or_application_type` text,
	`name` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`country_code`) REFERENCES `countries`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `workflow_country_service_idx` ON `workflow_definitions` (`country_code`,`service_type`);--> statement-breakpoint
CREATE TABLE `workflow_stages` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_id` text NOT NULL,
	`name` text NOT NULL,
	`position` integer NOT NULL,
	`sla_hours` integer,
	`requires_qa` integer DEFAULT false NOT NULL,
	`checklist_json` text,
	`client_visible` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workflow_id`) REFERENCES `workflow_definitions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workflow_stage_position_unique` ON `workflow_stages` (`workflow_id`,`position`);