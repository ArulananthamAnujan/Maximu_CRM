import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
};

export const organisations = sqliteTable("organisations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  tradingName: text("trading_name"),
  defaultCountryCode: text("default_country_code").notNull(),
  timezone: text("timezone").notNull(),
  ...timestamps,
});

export const countries = sqliteTable("countries", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  currency: text("currency").notNull(),
  timezone: text("timezone").notNull(),
  privacyRegion: text("privacy_region"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  ...timestamps,
});

export const branches = sqliteTable("branches", {
  id: text("id").primaryKey(),
  organisationId: text("organisation_id").notNull().references(() => organisations.id),
  countryCode: text("country_code").notNull().references(() => countries.code),
  name: text("name").notNull(),
  legalEntityName: text("legal_entity_name"),
  timezone: text("timezone").notNull(),
  email: text("email"),
  phone: text("phone"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  ...timestamps,
}, table => ({ organisationIdx: index("branches_organisation_idx").on(table.organisationId), countryIdx: index("branches_country_idx").on(table.countryCode) }));

export const profiles = sqliteTable("profiles", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  fullName: text("full_name").notNull(),
  role: text("role", { enum: ["super_admin", "country_manager", "admin", "staff", "finance", "compliance", "client"] }).notNull(),
  status: text("status", { enum: ["invited", "active", "suspended"] }).notNull().default("invited"),
  homeBranchId: text("home_branch_id").references(() => branches.id),
  googleSubject: text("google_subject"),
  lastLoginAt: text("last_login_at"),
  ...timestamps,
}, table => ({ emailUnique: uniqueIndex("profiles_email_unique").on(table.email), branchIdx: index("profiles_home_branch_idx").on(table.homeBranchId) }));

export const profileBranchAccess = sqliteTable("profile_branch_access", {
  id: text("id").primaryKey(),
  profileId: text("profile_id").notNull().references(() => profiles.id),
  branchId: text("branch_id").notNull().references(() => branches.id),
  accessLevel: text("access_level", { enum: ["read", "work", "manage"] }).notNull().default("work"),
  createdAt: text("created_at").notNull(),
}, table => ({ assignmentUnique: uniqueIndex("profile_branch_unique").on(table.profileId, table.branchId), profileIdx: index("profile_branch_profile_idx").on(table.profileId) }));

export const clients = sqliteTable("clients", {
  id: text("id").primaryKey(),
  organisationId: text("organisation_id").notNull().references(() => organisations.id),
  branchId: text("branch_id").notNull().references(() => branches.id),
  portalProfileId: text("portal_profile_id").references(() => profiles.id),
  assignedStaffId: text("assigned_staff_id").references(() => profiles.id),
  kind: text("kind", { enum: ["student", "migration_client"] }).notNull(),
  status: text("status", { enum: ["lead", "active", "on_hold", "completed", "archived"] }).notNull().default("lead"),
  firstName: text("first_name").notNull(),
  middleName: text("middle_name"),
  lastName: text("last_name").notNull(),
  preferredName: text("preferred_name"),
  email: text("email"),
  phone: text("phone"),
  dateOfBirth: text("date_of_birth"),
  gender: text("gender"),
  nationality: text("nationality"),
  currentCountry: text("current_country"),
  addressJson: text("address_json"),
  passportNumber: text("passport_number"),
  passportCountry: text("passport_country"),
  passportExpiry: text("passport_expiry"),
  currentVisa: text("current_visa"),
  currentVisaExpiry: text("current_visa_expiry"),
  preferredLanguage: text("preferred_language"),
  consentStatus: text("consent_status", { enum: ["pending", "granted", "withdrawn"] }).notNull().default("pending"),
  consentAt: text("consent_at"),
  archivedAt: text("archived_at"),
  ...timestamps,
}, table => ({ branchIdx: index("clients_branch_idx").on(table.branchId), assignedIdx: index("clients_assigned_staff_idx").on(table.assignedStaffId), emailIdx: index("clients_email_idx").on(table.email), passportIdx: index("clients_passport_idx").on(table.passportNumber) }));

export const dependants = sqliteTable("dependants", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull().references(() => clients.id),
  fullName: text("full_name").notNull(),
  relationship: text("relationship").notNull(),
  dateOfBirth: text("date_of_birth"),
  nationality: text("nationality"),
  passportNumber: text("passport_number"),
  passportExpiry: text("passport_expiry"),
  includedInCase: integer("included_in_case", { mode: "boolean" }).notNull().default(true),
  ...timestamps,
}, table => ({ clientIdx: index("dependants_client_idx").on(table.clientId) }));

export const workflowDefinitions = sqliteTable("workflow_definitions", {
  id: text("id").primaryKey(),
  organisationId: text("organisation_id").notNull().references(() => organisations.id),
  countryCode: text("country_code").notNull().references(() => countries.code),
  serviceType: text("service_type", { enum: ["study_abroad", "direct_visa"] }).notNull(),
  visaOrApplicationType: text("visa_or_application_type"),
  name: text("name").notNull(),
  version: integer("version").notNull().default(1),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  ...timestamps,
}, table => ({ countryServiceIdx: index("workflow_country_service_idx").on(table.countryCode, table.serviceType) }));

export const workflowStages = sqliteTable("workflow_stages", {
  id: text("id").primaryKey(),
  workflowId: text("workflow_id").notNull().references(() => workflowDefinitions.id),
  name: text("name").notNull(),
  position: integer("position").notNull(),
  slaHours: integer("sla_hours"),
  requiresQa: integer("requires_qa", { mode: "boolean" }).notNull().default(false),
  checklistJson: text("checklist_json"),
  clientVisible: integer("client_visible", { mode: "boolean" }).notNull().default(true),
  ...timestamps,
}, table => ({ workflowPositionUnique: uniqueIndex("workflow_stage_position_unique").on(table.workflowId, table.position) }));

export const cases = sqliteTable("cases", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull().references(() => clients.id),
  branchId: text("branch_id").notNull().references(() => branches.id),
  serviceType: text("service_type", { enum: ["study_abroad", "direct_visa"] }).notNull(),
  destinationCountryCode: text("destination_country_code").notNull().references(() => countries.code),
  workflowId: text("workflow_id").references(() => workflowDefinitions.id),
  currentStageId: text("current_stage_id").references(() => workflowStages.id),
  assignedStaffId: text("assigned_staff_id").references(() => profiles.id),
  supervisorId: text("supervisor_id").references(() => profiles.id),
  referenceNumber: text("reference_number").notNull(),
  title: text("title").notNull(),
  visaOrApplicationType: text("visa_or_application_type"),
  status: text("status", { enum: ["open", "waiting", "on_hold", "lodged", "approved", "refused", "withdrawn", "completed", "archived"] }).notNull().default("open"),
  priority: text("priority", { enum: ["low", "normal", "high", "urgent"] }).notNull().default("normal"),
  riskLevel: text("risk_level", { enum: ["healthy", "attention", "critical"] }).notNull().default("healthy"),
  openedAt: text("opened_at").notNull(),
  dueAt: text("due_at"),
  slaDueAt: text("sla_due_at"),
  lodgedAt: text("lodged_at"),
  decidedAt: text("decided_at"),
  closedAt: text("closed_at"),
  ...timestamps,
}, table => ({ referenceUnique: uniqueIndex("cases_reference_unique").on(table.referenceNumber), clientIdx: index("cases_client_idx").on(table.clientId), branchIdx: index("cases_branch_idx").on(table.branchId), assignedIdx: index("cases_assigned_staff_idx").on(table.assignedStaffId), statusIdx: index("cases_status_idx").on(table.status) }));

export const caseStageEvents = sqliteTable("case_stage_events", {
  id: text("id").primaryKey(),
  caseId: text("case_id").notNull().references(() => cases.id),
  fromStageId: text("from_stage_id").references(() => workflowStages.id),
  toStageId: text("to_stage_id").notNull().references(() => workflowStages.id),
  changedBy: text("changed_by").notNull().references(() => profiles.id),
  reason: text("reason"),
  changedAt: text("changed_at").notNull(),
}, table => ({ caseIdx: index("case_stage_events_case_idx").on(table.caseId) }));

export const caseNotes = sqliteTable("case_notes", {
  id: text("id").primaryKey(),
  caseId: text("case_id").notNull().references(() => cases.id),
  authorId: text("author_id").notNull().references(() => profiles.id),
  body: text("body").notNull(),
  visibility: text("visibility", { enum: ["internal", "client"] }).notNull().default("internal"),
  pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
  ...timestamps,
}, table => ({ caseIdx: index("case_notes_case_idx").on(table.caseId) }));

export const educationHistory = sqliteTable("education_history", {
  id: text("id").primaryKey(), clientId: text("client_id").notNull().references(() => clients.id), institution: text("institution").notNull(), countryCode: text("country_code"), qualification: text("qualification").notNull(), fieldOfStudy: text("field_of_study"), startDate: text("start_date"), endDate: text("end_date"), result: text("result"), ...timestamps,
}, table => ({ clientIdx: index("education_history_client_idx").on(table.clientId) }));

export const employmentHistory = sqliteTable("employment_history", {
  id: text("id").primaryKey(), clientId: text("client_id").notNull().references(() => clients.id), employer: text("employer").notNull(), countryCode: text("country_code"), position: text("position").notNull(), startDate: text("start_date"), endDate: text("end_date"), duties: text("duties"), ...timestamps,
}, table => ({ clientIdx: index("employment_history_client_idx").on(table.clientId) }));

export const languageTests = sqliteTable("language_tests", {
  id: text("id").primaryKey(), clientId: text("client_id").notNull().references(() => clients.id), testType: text("test_type").notNull(), testDate: text("test_date"), overallScore: text("overall_score"), listeningScore: text("listening_score"), readingScore: text("reading_score"), writingScore: text("writing_score"), speakingScore: text("speaking_score"), expiryDate: text("expiry_date"), ...timestamps,
}, table => ({ clientIdx: index("language_tests_client_idx").on(table.clientId) }));

export const immigrationHistory = sqliteTable("immigration_history", {
  id: text("id").primaryKey(), clientId: text("client_id").notNull().references(() => clients.id), countryCode: text("country_code").notNull(), visaType: text("visa_type"), outcome: text("outcome"), appliedAt: text("applied_at"), decidedAt: text("decided_at"), refusalReason: text("refusal_reason"), ...timestamps,
}, table => ({ clientIdx: index("immigration_history_client_idx").on(table.clientId) }));

export const applications = sqliteTable("applications", {
  id: text("id").primaryKey(), caseId: text("case_id").notNull().references(() => cases.id), providerName: text("provider_name"), courseOrVisaType: text("course_or_visa_type").notNull(), intakeOrSubclass: text("intake_or_subclass"), externalReference: text("external_reference"), status: text("status").notNull(), submittedAt: text("submitted_at"), outcomeAt: text("outcome_at"), outcome: text("outcome"), ...timestamps,
}, table => ({ caseIdx: index("applications_case_idx").on(table.caseId) }));

export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(), clientId: text("client_id").notNull().references(() => clients.id), caseId: text("case_id").references(() => cases.id), uploadedBy: text("uploaded_by").references(() => profiles.id), name: text("name").notNull(), category: text("category").notNull(), status: text("status", { enum: ["requested", "received", "verified", "rejected", "expired"] }).notNull(), googleDriveFileId: text("google_drive_file_id"), googleDriveFolderId: text("google_drive_folder_id"), mimeType: text("mime_type"), expiryDate: text("expiry_date"), clientVisible: integer("client_visible", { mode: "boolean" }).notNull().default(true), ...timestamps,
}, table => ({ clientIdx: index("documents_client_idx").on(table.clientId), caseIdx: index("documents_case_idx").on(table.caseId) }));

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(), caseId: text("case_id").references(() => cases.id), assignedTo: text("assigned_to").notNull().references(() => profiles.id), createdBy: text("created_by").notNull().references(() => profiles.id), title: text("title").notNull(), description: text("description"), priority: text("priority", { enum: ["low", "normal", "high", "urgent"] }).notNull().default("normal"), status: text("status", { enum: ["open", "in_progress", "blocked", "completed", "cancelled"] }).notNull().default("open"), dueAt: text("due_at"), completedAt: text("completed_at"), ...timestamps,
}, table => ({ assigneeIdx: index("tasks_assignee_idx").on(table.assignedTo), caseIdx: index("tasks_case_idx").on(table.caseId) }));

export const appointments = sqliteTable("appointments", {
  id: text("id").primaryKey(), caseId: text("case_id").references(() => cases.id), clientId: text("client_id").references(() => clients.id), organiserId: text("organiser_id").notNull().references(() => profiles.id), title: text("title").notNull(), startsAt: text("starts_at").notNull(), endsAt: text("ends_at").notNull(), timezone: text("timezone").notNull(), location: text("location"), googleCalendarEventId: text("google_calendar_event_id"), clientVisible: integer("client_visible", { mode: "boolean" }).notNull().default(true), ...timestamps,
}, table => ({ organiserIdx: index("appointments_organiser_idx").on(table.organiserId), clientIdx: index("appointments_client_idx").on(table.clientId) }));

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(), caseId: text("case_id").references(() => cases.id), clientId: text("client_id").references(() => clients.id), createdBy: text("created_by").notNull().references(() => profiles.id), channel: text("channel", { enum: ["email", "whatsapp", "sms", "internal"] }).notNull(), direction: text("direction", { enum: ["inbound", "outbound", "internal"] }).notNull(), recipient: text("recipient"), subject: text("subject"), body: text("body").notNull(), status: text("status", { enum: ["draft", "queued", "sent", "delivered", "failed", "received"] }).notNull(), providerMessageId: text("provider_message_id"), sentAt: text("sent_at"), ...timestamps,
}, table => ({ caseIdx: index("messages_case_idx").on(table.caseId), clientIdx: index("messages_client_idx").on(table.clientId) }));

export const invoices = sqliteTable("invoices", {
  id: text("id").primaryKey(), clientId: text("client_id").notNull().references(() => clients.id), caseId: text("case_id").references(() => cases.id), branchId: text("branch_id").notNull().references(() => branches.id), invoiceNumber: text("invoice_number").notNull(), currency: text("currency").notNull(), subtotalMinor: integer("subtotal_minor").notNull(), taxMinor: integer("tax_minor").notNull().default(0), totalMinor: integer("total_minor").notNull(), paidMinor: integer("paid_minor").notNull().default(0), status: text("status", { enum: ["draft", "issued", "part_paid", "paid", "overdue", "void", "refunded"] }).notNull(), issuedAt: text("issued_at"), dueAt: text("due_at"), ...timestamps,
}, table => ({ invoiceNumberUnique: uniqueIndex("invoice_number_unique").on(table.invoiceNumber), clientIdx: index("invoices_client_idx").on(table.clientId) }));

export const payments = sqliteTable("payments", {
  id: text("id").primaryKey(), invoiceId: text("invoice_id").notNull().references(() => invoices.id), amountMinor: integer("amount_minor").notNull(), currency: text("currency").notNull(), method: text("method"), reference: text("reference"), receivedAt: text("received_at").notNull(), recordedBy: text("recorded_by").notNull().references(() => profiles.id), createdAt: text("created_at").notNull(),
}, table => ({ invoiceIdx: index("payments_invoice_idx").on(table.invoiceId) }));

export const integrationConnections = sqliteTable("integration_connections", {
  id: text("id").primaryKey(), organisationId: text("organisation_id").notNull().references(() => organisations.id), provider: text("provider", { enum: ["google_workspace", "whatsapp", "supabase", "accounting"] }).notNull(), status: text("status", { enum: ["not_configured", "connected", "error", "disabled"] }).notNull(), accountLabel: text("account_label"), secretReference: text("secret_reference"), lastSyncAt: text("last_sync_at"), lastError: text("last_error"), ...timestamps,
}, table => ({ providerUnique: uniqueIndex("integration_provider_unique").on(table.organisationId, table.provider) }));

export const auditEvents = sqliteTable("audit_events", {
  id: text("id").primaryKey(), organisationId: text("organisation_id").notNull().references(() => organisations.id), actorProfileId: text("actor_profile_id").references(() => profiles.id), action: text("action").notNull(), entityType: text("entity_type").notNull(), entityId: text("entity_id").notNull(), caseId: text("case_id").references(() => cases.id), branchId: text("branch_id").references(() => branches.id), countryCode: text("country_code"), beforeJson: text("before_json"), afterJson: text("after_json"), ipAddress: text("ip_address"), userAgent: text("user_agent"), occurredAt: text("occurred_at").notNull(),
}, table => ({ entityIdx: index("audit_entity_idx").on(table.entityType, table.entityId), actorIdx: index("audit_actor_idx").on(table.actorProfileId), occurredIdx: index("audit_occurred_idx").on(table.occurredAt) }));
