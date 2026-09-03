"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { orgDate, orgDateTime } from "@/lib/timezone";
import {
  Activity,
  AlertTriangle,
  Archive,
  ArrowRight,
  BarChart3,
  Bell,
  BookOpen,
  BrainCircuit,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Command,
  Copy,
  Download,
  FileCheck2,
  FileText,
  Filter,
  FolderOpen,
  GraduationCap,
  Inbox,
  LockKeyhole,
  LogOut,
  Mail,
  Menu,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  Search,
  School,
  Settings,
  ShieldCheck,
  Trash2,
  UserCog,
  Users,
  Workflow,
  X,
  CalendarCheck2,
  Cloud,
  Link2,
  RefreshCw,
  Send,
  Sparkles,
  Star,
} from "lucide-react";

type ModuleKey =
  | "dashboard"
  | "portal"
  | "ai"
  | "work"
  | "calendar"
  | "enquiries"
  | "students"
  | "applications"
  | "visas"
  | "direct_visas"
  | "defer"
  | "case_complete"
  | "documents"
  | "communications"
  | "courseFinder"
  | "templates"
  | "finance"
  | "reports"
  | "workflows"
  | "compliance"
  | "administration"
  | "integrations";
type AppRole = "super_admin" | "admin" | "staff" | "client";
type LifecycleStage =
  | "enquiry"
  | "student"
  | "application"
  | "visa"
  | "deferred"
  | "completed";
type ServiceMode = "study" | "direct_visa";
type ModalType =
  | "case"
  | "task"
  | "appointment"
  | "document"
  | "visaChecklist"
  | "message"
  | "invoice"
  | "template"
  | "workflow"
  | null;
type CaseRecord = {
  dbId?: string;
  clientId?: string;
  branchId?: string;
  id: string;
  name: string;
  email: string;
  phone: string;
  type: string;
  serviceType: string;
  matterType: string;
  target: string;
  stage: string;
  owner: string;
  ownerId: string;
  collaboratorIds?: string[];
  branch: string;
  due: string;
  health: "healthy" | "attention" | "critical";
  progress: number;
  status: "active" | "waiting" | "completed";
  lifecycleStage: LifecycleStage;
  visaExpiry: string;
  deferredApplications: number;
  completedAt: string;
  reopenedAt: string;
  createdAt: string;
  destinationCountry: string;
  intake: string;
  source: string;
  campaign: string;
  leadScore: number;
  lostReason: string;
  applicationStatus: string;
  visaCategory: string;
  latestNote: string;
  latestNoteAt: string;
  latestNoteAuthor: string;
};
// One student can hold several offers at once, so an application is a record in
// its own right rather than something inferred from the case it belongs to.
type ApplicationRow = {
  id: string;
  caseId: string;
  caseNumber: string;
  client: string;
  institution: string;
  course: string;
  campus: string;
  intake: string;
  reference: string;
  status: string;
  submittedOn: string;
  offerOn: string;
  coeOn: string;
  deadlineOn: string;
  owner: string;
  branch: string;
  associate: string;
  partner: string;
  notes: string;
  archived: boolean;
};
type VisaMatterRow = {
  id: string;
  caseId: string;
  caseNumber: string;
  client: string;
  matterType: string;
  currentVisa: string;
  subclass: string;
  stream: string;
  destination: string;
  currentVisaExpiry: string;
  bridgingVisa: string;
  lodgedOn: string;
  trn: string;
  reference: string;
  agent: string;
  marn: string;
  status: string;
  informationDueOn: string;
  informationProvidedOn: string;
  decisionOn: string;
  outcome: string;
  owner: string;
};
// A client who already looks like the person being entered, and why they
// matched. Shown before a second record is created for one human being.
type DuplicateMatch = {
  id: string;
  reference: string;
  name: string;
  email: string;
  phone: string;
  passport: string;
  dateOfBirth: string;
  stage: string;
  caseCount: number;
  reasons: string[];
};
type TaskRecord = {
  id: string;
  title: string;
  caseId: string;
  due: string;
  priority: string;
  completed: boolean;
};
type AppointmentRecord = {
  id: string;
  title: string;
  client: string;
  date: string;
  time: string;
  type: string;
  status: string;
  responseNote?: string;
};
type DocumentRecord = {
  id: string;
  title: string;
  client: string;
  folder: string;
  fileName: string;
  status: string;
  createdAt: string;
  caseId?: string;
  checklistKey?: string;
  note?: string;
  due?: string;
  clientVisible?: boolean;
};
type MessageRecord = {
  id: string;
  channel: "email" | "whatsapp" | "sms";
  to: string;
  subject: string;
  body: string;
  caseId: string;
  status: string;
  createdAt: string | null;
  sentAt: string | null;
};
type CampaignRecord = {
  id: string;
  name: string;
  channel: "email" | "whatsapp" | "sms";
  subject: string;
  body: string;
  status: string;
  scheduledAt: string;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
};
type InvoiceRecord = {
  id: string;
  invoiceNumber: string;
  client: string;
  currency: string;
  subtotal: number;
  tax: number;
  amount: number;
  paid: number;
  credited: number;
  balance: number;
  type: string;
  issued: string;
  due: string;
  status: string;
  pdfDocumentId: string;
};
type CommissionClaimRecord = {
  id: string;
  partnerName: string;
  institution: string;
  counterpartyType: string;
  counterpartyEmail: string;
  invoiceNumber: string;
  currency: string;
  netAmount: number;
  taxRate: number;
  taxAmount: number;
  expectedAmount: number;
  receivedAmount: number;
  pendingAmount: number;
  studentCount: number;
  caseIds: string[];
  status: string;
  issuedOn: string;
  dueOn: string;
};
type JourneyMilestone = {
  caseId: string;
  fromStage: string;
  toStage: string;
  at: string;
  reason: string;
};
type ClientDeclaration = {
  id: string;
  clientId: string;
  type: string;
  response: boolean | null;
  declaredAt: string | null;
};
type SavedView = {
  id: string;
  name: string;
  filters: Record<string, unknown>;
};
type TemplateRecord = {
  id: string;
  name: string;
  type: string;
  content: string;
  updatedAt: string;
};
type WorkflowRecord = {
  id: string;
  name: string;
  stages: string[];
  active: boolean;
};
type AuditRecord = { id: string; text: string; at: string };
type ChecklistItem = {
  id: string;
  title: string;
  status: string;
  required: boolean;
  due_at: string | null;
};
type CaseNote = {
  id: string;
  body: string;
  visibility: string;
  created_at: string;
  author_id: string | null;
};
// "key" is the template's database id -- named to match the visaDoc_${key}
// form field and checklist_key metadata this replaced a hard-coded list for.
type ChecklistTemplateRecord = {
  key: string;
  category: string;
  title: string;
  guidance: string;
  active: boolean;
};
type EmailTemplateRecord = {
  id: string;
  kind: string;
  subject: string;
  body: string;
};
type BranchRecord = { id: string; name: string; code: string };
type StaffRecord = {
  id: string;
  display_name: string;
  email: string;
  level: string;
  active: boolean;
};
type LiveIdentity = {
  profileId: string;
  organisationId: string;
  branchId: string | null;
  displayName: string;
  email: string;
  department: string | null;
  sourceLevel: string;
  role: AppRole;
};

const STUDY_MATTER_TYPES = [
  "Education enquiry",
  "Student admission",
  "Student visa",
];

const DIRECT_VISA_MATTER_TYPES = [
  "Migration enquiry",
  "Student Subclass 500",
  "Visitor Subclass 600",
  "Temporary Graduate Subclass 485",
  "Training Visa Subclass 407",
  "407 Training Visa",
  "Employer Sponsored Subclass 482",
  "482 Work Visa",
  "408 Temporary work activity",
  "485 Visa",
  "Offshore",
  "Subclass 408",
  "EOI / ROI",
  "EOI lodgement",
  "ACS Skill Assessment",
  "PSA Registration",
  "JRP Registration",
  "JRWA Registration",
  "CPA Skill Assessment",
  "Skill Assessment",
  "Skill assessment program",
  "Engineers Australia Skill Assessment",
  "494 Regional Work Visa",
  "500 Student Dependent",
  "Partner visa 820/801",
  "Partner visa 309/100",
  "Protection Visa 866",
  "600 Visitor Visa",
];

const DESTINATION_COUNTRIES = [
  "Australia",
  "Bangladesh",
  "Bhutan",
  "Canada",
  "China",
  "Finland",
  "France",
  "Georgia",
  "India",
  "Ireland",
  "Malaysia",
  "Malta",
  "Nepal",
  "New Zealand",
  "Pakistan",
  "Poland",
  "Singapore",
  "South Korea",
  "Sri Lanka",
  "Sweden",
  "United Arab Emirates",
  "United Kingdom",
  "United States",
];

if (
  typeof window !== "undefined" &&
  globalThis.crypto &&
  !globalThis.crypto.randomUUID
) {
  Object.defineProperty(globalThis.crypto, "randomUUID", {
    value: () =>
      `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
  });
}

const studyNavGroups = [
  {
    label: "Student journey",
    items: [
      ["enquiries", "Enquiries", Users],
      ["students", "Students", GraduationCap],
      ["applications", "Applications", BookOpen],
      ["visas", "Visa", BriefcaseBusiness],
      ["defer", "Defer", Clock3],
      ["case_complete", "Completed", FileCheck2],
    ],
  },
] as const;

const directVisaNavGroups = [
  {
    label: "Migration journey",
    items: [
      ["enquiries", "Enquiries", Users],
      ["direct_visas", "Clients", UserCog],
      ["visas", "Visa Applications", ShieldCheck],
      ["defer", "Deferred", Clock3],
      ["case_complete", "Case Complete", FileCheck2],
    ],
  },
] as const;

const clientNavGroups = [
  {
    label: "My journey",
    items: [
      ["portal", "Journey", GraduationCap],
      ["courseFinder", "Find a course", School],
      ["calendar", "Appointments", CalendarDays],
      ["documents", "Documents", FolderOpen],
      ["communications", "Messages", Mail],
      ["finance", "Invoices", CircleDollarSign],
    ],
  },
] as const;

const dailyNavGroups = [
  {
    label: "Workspace",
    items: [
      ["calendar", "Calendar", CalendarDays],
      ["work", "Tasks", Check],
    ],
  },
] as const;

const staffToolGroups = [
  {
    label: "Case tools",
    items: [
      ["documents", "File Manager", FolderOpen],
      ["communications", "Messages", Mail],
    ],
  },
] as const;

const adminToolGroups = [
  {
    label: "Operations",
    items: [
      ["finance", "Accounts", CircleDollarSign],
      ["reports", "Reports", BarChart3],
      ["documents", "File Manager", FolderOpen],
    ],
  },
  {
    label: "Communication",
    items: [
      ["communications", "Messages", Mail],
      ["templates", "Templates", FileCheck2],
    ],
  },
  {
    label: "Branch management",
    items: [
      ["workflows", "Workflow Templates", Workflow],
      ["administration", "Staff & Masters", Settings],
      ["compliance", "Activity & Compliance", LockKeyhole],
    ],
  },
] as const;

const superAdminToolGroups = [
  ...adminToolGroups,
  {
    label: "Organisation",
    items: [["integrations", "Integrations", Workflow]],
  },
] as const;

// The case pipeline. Cases move forward or back between the active stages, a
// visa case is completed once the visa is approved, and a completed case can be
// reopened into whichever stage the work resumes at. These rules mirror
// public.move_case_lifecycle, which enforces them.
const LIFECYCLE_STAGES: LifecycleStage[] = [
  "enquiry",
  "student",
  "application",
  "visa",
  "deferred",
  "completed",
];
// The stages a case is actively worked at. Deferred is a real pipeline
// position, but it is a case put down rather than a step forward, so it is not
// part of the straight line.
const WORKING_STAGES: LifecycleStage[] = [
  "enquiry",
  "student",
  "application",
  "visa",
];
const stageLabels: Record<LifecycleStage, string> = {
  enquiry: "Enquiry",
  student: "Student",
  application: "Application",
  visa: "Visa",
  deferred: "Deferred",
  completed: "Completed",
};
/** Direct Visa calls the same lifecycle stage by the agency's own words. */
function stageLabelFor(stage: LifecycleStage, direct: boolean): string {
  if (direct && stage === "student") return "Client";
  return stageLabels[stage];
}
const stageModule: Record<LifecycleStage, ModuleKey> = {
  enquiry: "enquiries",
  student: "students",
  application: "applications",
  visa: "visas",
  deferred: "defer",
  completed: "case_complete",
};
function allowedStageMoves(from: LifecycleStage): LifecycleStage[] {
  // A completed case reopens, and a deferred case resumes, into whichever
  // stage the work actually restarts at.
  if (from === "completed" || from === "deferred") return [...WORKING_STAGES];
  const moves: LifecycleStage[] = WORKING_STAGES.filter(
    (stage) => stage !== from,
  );
  moves.push("deferred");
  if (from === "visa") moves.push("completed");
  return moves;
}

/**
 * How each chip on the pipeline track is drawn. A deferred case is parked: the
 * record does not say which stage it was parked at, so nothing behind it is
 * claimed as done rather than guessed at.
 */
function stageChipState(step: LifecycleStage, stage: LifecycleStage): string {
  if (step === stage) return "current";
  if (stage === "deferred" || step === "deferred") return "";
  if (stage === "completed") return "done";
  const at = WORKING_STAGES.indexOf(stage);
  const here = WORKING_STAGES.indexOf(step);
  return here >= 0 && at >= 0 && here < at ? "done" : "";
}

const roleConfig: Record<
  AppRole,
  {
    label: string;
    legacy: string;
    scope: string;
    initials: string;
    modules: ModuleKey[];
  }
> = {
  super_admin: {
    label: "Super Admin",
    legacy: "Super Admin · Operational Head",
    scope: "All branches, users, configuration and records",
    initials: "SA",
    modules: [
      "dashboard",
      "ai",
      "work",
      "calendar",
      "enquiries",
      "students",
      "applications",
      "visas",
      "direct_visas",
      "defer",
      "case_complete",
      "documents",
      "communications",
      "courseFinder",
      "templates",
      "finance",
      "reports",
      "workflows",
      "compliance",
      "administration",
      "integrations",
    ],
  },
  admin: {
    label: "Admin",
    legacy: "Admin · Branch Manager / Manager",
    scope: "Own branch staff and operational records",
    initials: "AD",
    modules: [
      "dashboard",
      "ai",
      "work",
      "calendar",
      "enquiries",
      "students",
      "applications",
      "visas",
      "direct_visas",
      "defer",
      "case_complete",
      "documents",
      "communications",
      "courseFinder",
      "templates",
      "finance",
      "reports",
      "workflows",
      "compliance",
      "administration",
    ],
  },
  staff: {
    label: "Staff",
    legacy: "Employee teams",
    scope: "All cases and operational records in their branch",
    initials: "ST",
    modules: [
      "dashboard",
      "ai",
      "work",
      "calendar",
      "enquiries",
      "students",
      "applications",
      "visas",
      "direct_visas",
      "defer",
      "case_complete",
      "documents",
      "communications",
      "courseFinder",
      "templates",
      "finance",
      "reports",
      "workflows",
      "compliance",
    ],
  },
  client: {
    label: "Client / Student",
    legacy: "Student login",
    scope: "Only the linked personal journey and documents",
    initials: "CL",
    modules: ["portal", "courseFinder", "calendar", "documents", "communications", "finance"],
  },
};

const permissionRows = [
  ["Organisation, branches and integrations", true, false, false, false],
  ["Staff invitations, activation and roles", true, true, false, false],
  ["All organisation cases", true, false, false, false],
  ["All cases in their branch", true, true, true, false],
  ["Branch-wide shared case work", true, true, true, false],
  ["Own journey and next steps", false, false, false, true],
  ["Documents", true, true, true, true],
  ["Gmail and internal communication", true, true, true, true],
  ["Case invoices, receipts and payments", true, true, true, true],
  ["Reports and case audit history", true, true, true, false],
] as const;

const featureCoverage = [
  [
    "Client operations",
    "Enquiries, students/clients, dependants, education applications, visa matters and case notes",
    "Working model + backend",
  ],
  [
    "Team administration",
    "Branches, staff invitations, activation, configurable staff roles and login activity",
    "Backend ready",
  ],
  [
    "Master configuration",
    "Organisation defaults, branches, staff, statuses, document checklists, workflows, courses and institutions",
    "Working model + backend",
  ],
  [
    "Daily workflow",
    "Tasks, appointments, case stages, deadlines, handovers and branch reporting",
    "Working model + backend",
  ],
  [
    "Google Workspace",
    "Student-named Drive folders, document jobs, staff Gmail connections and case-linked email threads",
    "Connector required",
  ],
  [
    "Finance",
    "Invoices, payments, refunds and institution commission claims",
    "Working model + backend",
  ],
  [
    "Client portal",
    "Own case, approved milestones, appointments, documents, messages and invoices only",
    "Working model + RLS",
  ],
  [
    "Governance upgrades",
    "Case health, audit history, consent, AI citations and human approval for AI actions",
    "Backend ready",
  ],
] as const;

/**
 * What each screen is called in the client portal. The staff labels name
 * commissions, partner claims and internal drafts; a client must never see any
 * of that, so their screens are titled separately rather than reworded.
 */
const clientMeta: Partial<Record<ModuleKey, [string, string, string]>> = {
  portal: [
    "My journey",
    "Maximus",
    "Where your application has got to, and what we need from you next.",
  ],
  courseFinder: [
    "Find a course",
    "Study options",
    "Search and compare current courses, fees, intakes and entry requirements.",
  ],
  calendar: [
    "My appointments",
    "Maximus",
    "Consultations and reviews booked with your case team.",
  ],
  documents: [
    "My documents",
    "Maximus",
    "The documents we have asked you for, and the ones you have sent us.",
  ],
  communications: [
    "My messages",
    "Maximus",
    "Messages between you and your case team.",
  ],
  finance: [
    "My invoices",
    "Maximus",
    "What you have been invoiced, what you have paid and what is outstanding.",
  ],
};

const meta: Record<ModuleKey, [string, string, string]> = {
  dashboard: [
    "Operations dashboard",
    "Workspace overview",
    "Live activity, reminders, missed follow-ups and team handovers.",
  ],
  portal: [
    "Client portal experience",
    "Customer view",
    "The portal reflects the client records you create.",
  ],
  ai: [
    "Maximus AI workspace",
    "Optional integration",
    "Connect an AI provider when your backend is ready.",
  ],
  work: [
    "Task management",
    "Tasks",
    "Priority, status, type, branch, assignee and due-date tracking.",
  ],
  calendar: [
    "CRM calendar",
    "Appointments",
    "Enquiry, student, application, visa and invoice events.",
  ],
  enquiries: [
    "Enquiries",
    "Client intake",
    "Capture enquiries, follow-ups and appointments before conversion.",
  ],
  students: [
    "Students",
    "Study Abroad",
    "Manage converted students, academics, tests and partner assignment.",
  ],
  applications: [
    "Applications",
    "Admissions",
    "Track university, course, intake, offers, documents and defer requests.",
  ],
  visas: [
    "Visa applications",
    "Case management",
    "Track evidence, lodgement, comments and outcomes.",
  ],
  direct_visas: [
    "Clients",
    "Direct Visa",
    "Manage migration clients independently from the education pathway.",
  ],
  defer: [
    "Deferred",
    "Study Abroad",
    "Cases parked at the deferred stage, and applications moved to a later intake.",
  ],
  case_complete: [
    "Completed cases",
    "Direct Visa",
    "Review finalised migration matters and their outcomes.",
  ],
  documents: [
    "File Manager",
    "Documents",
    "Manage standard documents and client documents.",
  ],
  communications: [
    "Messages",
    "Communication",
    "Send and receive case-linked Gmail conversations using the address saved in each client profile.",
  ],
  courseFinder: [
    "Course Finder",
    "Advising reference",
    "Institutions and the courses they offer, for advising a client on their options.",
  ],
  templates: [
    "Templates",
    "Reusable content",
    "Approved wording for messages and document requests.",
  ],
  finance: [
    "Accounts",
    "Client fees",
    "Client invoices, payments and outstanding balances.",
  ],
  reports: [
    "Reports",
    "Operational intelligence",
    "Enquiry, client, follow-up, appointment, application, visa, finance and activity reports.",
  ],
  workflows: [
    "Statuses & document checklists",
    "Master configuration",
    "Configure the existing CRM statuses and checklists.",
  ],
  compliance: [
    "Activity & compliance",
    "Governance",
    "Login activity, staff activity and audit controls.",
  ],
  administration: [
    "Staff & Masters",
    "Organisation settings",
    "Staff, roles, branches, partners, institutions, courses and integrations.",
  ],
  integrations: [
    "Integrations",
    "Connected services",
    "Manage Google Workspace, WhatsApp, email and external service connections.",
  ],
};

/**
 * True on a phone-sized screen. Used where the layout has to change rather than
 * just reflow -- nine tabs across a 390px drawer is a scroll bar, not a
 * navigation.
 */
function useCompactScreen() {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 760px)");
    const apply = () => setCompact(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);
  return compact;
}

function useStored<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const saved = localStorage.getItem(key);
      return saved ? JSON.parse(saved) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }, [key, value]);
  return [value, setValue] as const;
}
function Status({ value }: { value: string }) {
  const cls = /critical|overdue|unpaid/i.test(value)
    ? "danger"
    : /attention|waiting|draft/i.test(value)
      ? "warning"
      : "success";
  return <span className={`status ${cls}`}>{value}</span>;
}
function EmptyState({
  icon: Icon,
  title,
  copy,
  action,
  onAction,
}: {
  icon: typeof Users;
  title: string;
  copy: string;
  // A read-only role sees the explanation without a call to action.
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="emptyState">
      <div>
        <Icon size={25} />
      </div>
      <h3>{title}</h3>
      <p>{copy}</p>
      {action && onAction && (
        <button className="primaryButton" onClick={onAction}>
          <Plus size={15} />
          {action}
        </button>
      )}
    </div>
  );
}

/** Shared selection behaviour for operational lists. Keeping it here makes
 * every bulk-enabled screen use the same select-all, clear and stale-record
 * handling instead of each page inventing a slightly different interaction. */
function useBulkSelection<T extends { id: string }>(items: T[]) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const membership = items.map((item) => item.id).join("|");
  const [selectionMembership, setSelectionMembership] = useState(membership);
  if (selectionMembership !== membership) {
    setSelectionMembership(membership);
    setSelectedIds(new Set());
  }
  const selected = items.filter((item) => selectedIds.has(item.id));
  const toggle = (id: string) =>
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () =>
    setSelectedIds(
      selected.length === items.length
        ? new Set()
        : new Set(items.map((item) => item.id)),
    );
  const clear = () => setSelectedIds(new Set());
  return {
    selected,
    selectedIds,
    toggle,
    toggleAll,
    clear,
    allSelected: items.length > 0 && selected.length === items.length,
  };
}

function SelectAllControl({
  checked,
  onChange,
  label = "Select all shown records",
}: {
  checked: boolean;
  onChange: () => void;
  label?: string;
}) {
  return (
    <label className="bulkSelectAll">
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span>{label}</span>
    </label>
  );
}

function BulkActionBar({
  count,
  onClear,
  children,
}: {
  count: number;
  onClear: () => void;
  children: React.ReactNode;
}) {
  if (!count) return null;
  return (
    <div className="bulkActionBar" role="region" aria-label="Bulk actions">
      <strong>{count} selected</strong>
      <div className="bulkActionChoices">{children}</div>
      <button type="button" className="linkButton" onClick={onClear}>
        Clear selection
      </button>
    </div>
  );
}

function RowSelection({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <label className="bulkRowSelect" onClick={(event) => event.stopPropagation()}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        aria-label={label}
      />
    </label>
  );
}

function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const cell = (value: unknown) => {
    const text = value == null ? "" : Array.isArray(value) ? value.join(" | ") : String(value);
    return `"${text.replaceAll('"', '""')}"`;
  };
  const csv = [
    columns.map(cell).join(","),
    ...rows.map((row) => columns.map((column) => cell(row[column])).join(",")),
  ].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function downloadCalendarFile(filename: string, appointments: AppointmentRecord[]) {
  if (!appointments.length) return;
  const escapeIcs = (value: string) =>
    value.replaceAll("\\", "\\\\").replaceAll(",", "\\,").replaceAll(";", "\\;").replaceAll("\n", "\\n");
  const events = appointments.flatMap((appointment) => {
    const start = `${appointment.date.replaceAll("-", "")}T${appointment.time.replaceAll(":", "").padEnd(6, "0")}`;
    return [
      "BEGIN:VEVENT",
      `UID:${appointment.id}@maximus-crm`,
      `DTSTART:${start}`,
      `SUMMARY:${escapeIcs(appointment.title)}`,
      `DESCRIPTION:${escapeIcs(`${appointment.type} appointment with Maximus`)}`,
      "END:VEVENT",
    ];
  });
  const calendar = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Maximus CRM//Client appointments//EN", ...events, "END:VCALENDAR"].join("\r\n");
  const url = URL.createObjectURL(new Blob([calendar], { type: "text/calendar;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function downloadDocumentFiles(documentIds: string[]) {
  documentIds.forEach((documentId, index) => {
    window.setTimeout(() => {
      const anchor = document.createElement("a");
      anchor.href = `/api/crm/documents?documentId=${encodeURIComponent(documentId)}`;
      anchor.download = "";
      anchor.rel = "noopener";
      anchor.click();
    }, index * 180);
  });
}

function matchesSearch(query: string, values: unknown[]) {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  return values.some((value) =>
    String(value ?? "").toLocaleLowerCase().includes(needle),
  );
}

function ListFilterBar({
  query,
  onQuery,
  placeholder,
  children,
  resultCount,
}: {
  query: string;
  onQuery: (value: string) => void;
  placeholder: string;
  children?: React.ReactNode;
  resultCount: number;
}) {
  return (
    <div className="listFilterBar">
      <label className="listFilterSearch">
        <Search size={16} aria-hidden="true" />
        <input
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
        />
        {query && (
          <button type="button" onClick={() => onQuery("")} aria-label="Clear search">
            <X size={14} />
          </button>
        )}
      </label>
      {children}
      <span className="filterResultCount">{resultCount.toLocaleString()} shown</span>
    </div>
  );
}
function LiveLogin({ onLogin }: { onLogin: () => Promise<void> }) {
  const [portal, setPortal] = useState<"staff" | "client">("staff"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [showPassword, setShowPassword] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: String(form.get("email") || ""),
          password: String(form.get("password") || ""),
        }),
      });
      const result = (await response.json()) as {
        ok?: boolean;
        error?: string;
      };
      if (!response.ok) throw new Error(result.error || "Sign-in failed.");
      await onLogin();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="demoLogin unifiedLogin">
      <header className="loginBrand">
        <div className="brandMark">M</div>
        <div>
          <strong>MAXIMUS</strong>
          <span>Education & Migration CRM</span>
        </div>
      </header>
      <div className="unifiedLoginShell">
        <section className="loginStory">
          <div className="loginGlow">
            <Sparkles size={17} />
            Secure Maximus workspace
          </div>
          <span>MAXIMUS EDUCATION & MIGRATION</span>
          <h1>Welcome back to Maximus.</h1>
          <p>
            One secure place for your education and migration work. Sign in and
            we will open the right workspace for your account.
          </p>
          <div className="loginBenefits">
            <div>
              <Check size={18} />
              <span>
                <b>Connected records</b>
                <small>Cases, tasks and communication together</small>
              </span>
            </div>
            <div>
              <CalendarCheck2 size={18} />
              <span>
                <b>Clear next steps</b>
                <small>Deadlines and appointments in one view</small>
              </span>
            </div>
            <div>
              <ShieldCheck size={18} />
              <span>
                <b>Role-based access</b>
                <small>Only the right people see each workspace</small>
              </span>
            </div>
          </div>
        </section>
        <form className="unifiedLoginCard" onSubmit={submit}>
          <div
            className="portalSwitch"
            role="group"
            aria-label="Choose login type"
          >
            <button
              type="button"
              className={portal === "staff" ? "active" : ""}
              onClick={() => setPortal("staff")}
            >
              <UserCog size={19} />
              <span>
                <b>Staff workspace</b>
                <small>Super Admin, Admin &amp; Staff</small>
              </span>
            </button>
            <button
              type="button"
              className={portal === "client" ? "active" : ""}
              onClick={() => setPortal("client")}
            >
              <GraduationCap size={19} />
              <span>
                <b>Student / Client</b>
                <small>Personal journey portal</small>
              </span>
            </button>
          </div>
          <div className="loginCardTitle">
            <span>
              {portal === "staff" ? "STAFF ACCESS" : "STUDENT & CLIENT ACCESS"}
            </span>
            <h2>
              {portal === "staff"
                ? "Sign in to Maximus"
                : "Open your journey"}
            </h2>
            <p>
              Use the email address registered with your Maximus account.
            </p>
          </div>
          <div className="loginFields">
            <label>
              Email address
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder={
                  portal === "staff"
                    ? "name@maximuseducation.com.au"
                    : "Your registered email"
                }
              />
            </label>
            <label>
              Password
              <span className="passwordField">
                <input
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="passwordVisibility"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  title={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? <EyeOff size={21} /> : <Eye size={21} />}
                </button>
              </span>
            </label>
          </div>
          {error ? (
            <div className="loginError">
              <AlertTriangle size={16} />
              {error}
            </div>
          ) : null}
          <button className="singleLoginButton" type="submit" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
            <ArrowRight size={18} />
          </button>
          {portal === "staff" ? (
            <button
              type="button"
              className="googleLoginButton"
              onClick={() => {
                window.location.href = "/api/auth/google/start";
              }}
            >
              <div className="googleG">G</div>
              <span>
                <b>Continue with Google</b>
                <small>Use your Maximus Workspace account</small>
              </span>
              <ChevronDown size={17} />
            </button>
          ) : null}
          <footer>
            <LockKeyhole size={16} />
            Secure, role-based access to your Maximus workspace.
          </footer>
        </form>
      </div>
    </main>
  );
}

function Sidebar({
  active,
  setActive,
  open,
  setOpen,
  role,
  serviceMode,
}: {
  active: ModuleKey;
  setActive: (x: ModuleKey) => void;
  open: boolean;
  setOpen: (x: boolean) => void;
  role: AppRole;
  serviceMode: ServiceMode;
}) {
  const config = roleConfig[role],
    journey = serviceMode === "study" ? studyNavGroups : directVisaNavGroups,
    tools =
      role === "super_admin"
        ? superAdminToolGroups
        : role === "admin"
          ? adminToolGroups
          : staffToolGroups,
    source = role === "client" ? clientNavGroups : [...journey, ...tools],
    groups = source
      .map((g) => ({
        ...g,
        items: g.items.filter(([key]) =>
          config.modules.includes(key as ModuleKey),
        ),
      }))
      .filter((g) => g.items.length);
  return (
    <aside className={`sidebar ${open ? "open" : ""}`}>
      <div className="brand">
        <button
          className="brandHome"
          onClick={() => {
            setActive(role === "client" ? "portal" : "dashboard");
            setOpen(false);
          }}
          aria-label={role === "client" ? "Open my journey" : "Open dashboard"}
          title={role === "client" ? "Open my journey" : "Open dashboard"}
        >
          <span className="brandMark" aria-hidden="true">M</span>
          <span className="brandWords">
            <strong>MAXIMUS</strong>
            <span>Education &amp; Migration</span>
          </span>
        </button>
        <button
          className="mobileClose"
          onClick={() => setOpen(false)}
          aria-label="Close menu"
          title="Close menu"
        >
          <X size={20} />
        </button>
      </div>
      <div className="sidebarContext">
        <span>
          {role === "client"
            ? "MY JOURNEY"
            : serviceMode === "study"
              ? "STUDY ABROAD"
              : "DIRECT VISA"}
        </span>
        <strong>{role === "client" ? "Client portal" : config.label}</strong>
      </div>
      <nav>
        {groups.map((g) => (
          <div className={`navGroup ${["Operations", "Communication", "Branch management", "Organisation"].includes(g.label) ? "navDropdownGroup" : ""}`} key={g.label}>
            <p>{g.label}{["Operations", "Communication", "Branch management", "Organisation"].includes(g.label) ? <ChevronDown size={12} /> : null}</p>
            {g.items.map(([key, label, Icon]) => (
              <button
                key={key}
                className={active === key ? "active" : ""}
                onClick={() => {
                  setActive(key as ModuleKey);
                  setOpen(false);
                }}
              >
                <Icon size={18} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        ))}
      </nav>
      <div className="sidebarFooter">
        <div className="avatar">{config.initials}</div>
        <div>
          <strong>{config.label}</strong>
          <span>
            {role === "client"
              ? "Client portal"
              : serviceMode === "study"
                ? "Study Abroad"
                : "Direct Visa"}
          </span>
        </div>
      </div>
    </aside>
  );
}

function ProfileServiceSwitch({
  serviceMode,
  setServiceMode,
  setActive,
}: {
  serviceMode: ServiceMode;
  setServiceMode: (x: ServiceMode) => void;
  setActive: (x: ModuleKey) => void;
}) {
  const switchMode = (next: ServiceMode) => {
    setServiceMode(next);
    setActive("dashboard");
  };
  return (
    <div
      className="profileServiceSwitch"
      role="group"
      aria-label="Choose service workspace"
    >
      <button
        className={serviceMode === "study" ? "active" : ""}
        onClick={() => switchMode("study")}
        aria-label="Study Abroad workspace"
        title="Study Abroad workspace"
      >
        <GraduationCap size={16} />
        <span>Study Abroad</span>
      </button>
      <button
        className={serviceMode === "direct_visa" ? "active" : ""}
        onClick={() => switchMode("direct_visa")}
        aria-label="Direct Visa workspace"
        title="Direct Visa workspace"
      >
        <ShieldCheck size={16} />
        <span>Direct Visa</span>
      </button>
    </div>
  );
}

function DailyTopNav({
  active,
  setActive,
}: {
  active: ModuleKey;
  setActive: (x: ModuleKey) => void;
}) {
  return (
    <nav className="dailyTopNav" aria-label="Daily workspace navigation">
      {dailyNavGroups[0].items.map(([key, label, Icon]) => (
        <button
          key={key}
          className={active === key ? "active" : ""}
          onClick={() => setActive(key)}
          aria-label={label}
          title={label}
        >
          <Icon size={17} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

function WorkspaceDashboard({
  cases,
  tasks,
  appointments,
  documents,
  openModal,
  setActive,
  onOpenCase,
  serviceMode,
  role,
}: {
  cases: CaseRecord[];
  tasks: TaskRecord[];
  appointments: AppointmentRecord[];
  documents: DocumentRecord[];
  openModal: (x: ModalType) => void;
  setActive: (x: ModuleKey) => void;
  onOpenCase: (x: CaseRecord) => void;
  serviceMode: ServiceMode;
  role: AppRole;
}) {
  const [dashboardSearch, setDashboardSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [intakeFilter, setIntakeFilter] = useState("");
  const [visaTypeFilter, setVisaTypeFilter] = useState("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const direct = serviceMode === "direct_visa",
    // Classify by the recorded service stream, never by the matter label: a
    // "Student visa" matter belongs to study abroad, not migration.
    allWorkspaceCases = cases.filter((c) =>
      direct
        ? c.serviceType === "direct_visa"
        : c.serviceType !== "direct_visa",
    ),
    workspaceCases = allWorkspaceCases.filter((c) => {
      const searchable = `${c.name} ${c.id} ${c.email} ${c.phone} ${c.target} ${c.matterType}`.toLowerCase();
      const created = c.createdAt?.slice(0, 10) ?? "";
      return (
        (!dashboardSearch || searchable.includes(dashboardSearch.toLowerCase())) &&
        (!branchFilter || c.branch === branchFilter) &&
        (!countryFilter || c.destinationCountry === countryFilter) &&
        (!intakeFilter || c.intake.toLowerCase().includes(intakeFilter.toLowerCase())) &&
        (!visaTypeFilter || c.visaCategory === visaTypeFilter) &&
        (!createdFrom || created >= createdFrom) &&
        (!createdTo || created <= createdTo)
      );
    }),
    attention = workspaceCases.filter((c) => c.health !== "healthy").length,
    waiting = workspaceCases.filter((c) => c.status === "waiting").length,
    completed = workspaceCases.filter((c) => c.status === "completed").length,
    today = new Date().toISOString().slice(0, 10),
    openTasks = tasks.filter((task) => !task.completed),
    dueToday = openTasks.filter((task) => task.due === today),
    overdueTasks = openTasks.filter((task) => task.due && task.due < today),
    pendingDocuments = documents.filter(
      (document) => !["received", "completed", "uploaded"].includes(document.status.toLowerCase()),
    ),
    upcomingAppointments = appointments
      .filter((appointment) => appointment.date >= today)
      .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)),
    nextAppointments = upcomingAppointments.slice(0, 3),
    visaDeadlines = workspaceCases.filter(
      (record) => record.lifecycleStage === "visa" && record.status !== "completed",
    ),
    priorityCases = [...workspaceCases].sort((a, b) => {
      const healthRank = { critical: 0, attention: 1, healthy: 2 };
      return healthRank[a.health] - healthRank[b.health] || (a.due || "9999").localeCompare(b.due || "9999");
    }),
    openList = direct ? "direct_visas" : "students",
    branchOptions = [...new Set(allWorkspaceCases.map((c) => c.branch).filter(Boolean))].sort(),
    countryOptions = [...new Set(allWorkspaceCases.map((c) => c.destinationCountry).filter(Boolean))].sort(),
    visaTypeOptions = [...new Set(allWorkspaceCases.map((c) => c.visaCategory).filter(Boolean))].sort(),
    categoryCounts = [...workspaceCases.reduce((map, record) => {
      const key = direct ? record.visaCategory || "Uncategorised" : humanise(record.lifecycleStage);
      map.set(key, (map.get(key) ?? 0) + 1);
      return map;
    }, new Map<string, number>())].sort((a, b) => b[1] - a[1]),
    statusCounts = [...workspaceCases.reduce((map, record) => {
      const key = direct ? record.stage || "Not set" : humanise(record.applicationStatus || record.stage || "Not set");
      map.set(key, (map.get(key) ?? 0) + 1);
      return map;
    }, new Map<string, number>())].sort((a, b) => b[1] - a[1]);
  return (
    <>
      <section
        className={`workspaceHero ${direct ? "migration" : "education"}`}
      >
        <div className="heroEyebrow">
          {direct ? "MAXIMUS MIGRATION SERVICES" : "MAXIMUS EDUCATION SERVICES"}
        </div>
        <div className="workspaceHeroGrid">
          <div>
            <h2>
              {direct
                ? "Migration operations desk"
                : "Student operations desk"}
            </h2>
            <p>
              {direct
                ? "See the matters that need action, the deadlines at risk and the next client commitments from one place."
                : "See the students who need action, the work due today and the next application commitments from one place."}
            </p>
            <div className="welcomeActions">
              <button className="heroPrimary" onClick={() => openModal("case")}>
                <Plus size={16} />
                {direct ? "Add client" : "Add enquiry"}
              </button>
              <button
                className="heroSecondary"
                onClick={() => openModal("task")}
              >
                <Check size={16} />
                Create task
              </button>
            </div>
          </div>
          <div className="heroSummary">
            <span>
              {direct ? "MIGRATION WORKSPACE" : "STUDY ABROAD WORKSPACE"}
            </span>
            <strong>
              {workspaceCases.filter((c) => c.status !== "completed").length}
            </strong>
            <small>
              active {direct ? "client matters" : "student journeys"}
            </small>
            <div>
              <i />
              <b>{attention ? `${attention} need attention` : "No case risks flagged"}</b>
            </div>
          </div>
        </div>
      </section>
      <section className="dashboardFilters" aria-label="Dashboard filters">
        <div className="dashboardFilterSearch">
          <Search size={16} />
          <input value={dashboardSearch} onChange={(event) => setDashboardSearch(event.target.value)} placeholder="Search client, case, email, mobile or target" />
        </div>
        <select aria-label="Filter dashboard by branch" value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)}><option value="">All branches</option>{branchOptions.map((value) => <option key={value}>{value}</option>)}</select>
        <select aria-label="Filter dashboard by country" value={countryFilter} onChange={(event) => setCountryFilter(event.target.value)}><option value="">All countries</option>{countryOptions.map((value) => <option key={value}>{value}</option>)}</select>
        {direct ? (
          <select aria-label="Filter dashboard by visa category" value={visaTypeFilter} onChange={(event) => setVisaTypeFilter(event.target.value)}><option value="">All visa categories</option>{visaTypeOptions.map((value) => <option key={value}>{value}</option>)}</select>
        ) : (
          <input aria-label="Filter dashboard by intake" value={intakeFilter} onChange={(event) => setIntakeFilter(event.target.value)} placeholder="Intake" />
        )}
        <label>Created from<input type="date" value={createdFrom} onChange={(event) => setCreatedFrom(event.target.value)} /></label>
        <label>Created to<input type="date" value={createdTo} onChange={(event) => setCreatedTo(event.target.value)} /></label>
        <button className="ghostButton" onClick={() => { setDashboardSearch(""); setBranchFilter(""); setCountryFilter(""); setIntakeFilter(""); setVisaTypeFilter(""); setCreatedFrom(""); setCreatedTo(""); }}>Reset</button>
        <span>{workspaceCases.length} of {allWorkspaceCases.length} records</span>
      </section>
      <section className="operationsBrief" aria-label="Today's priorities">
        <div className="sectionIntro">
          <div>
            <span className="kicker">TODAY</span>
            <h2>What needs your team&apos;s attention</h2>
          </div>
          <p>Open the queue and continue the work without searching across modules.</p>
        </div>
        <div className="priorityStrip">
          <button onClick={() => setActive("work")} className={overdueTasks.length ? "urgent" : ""}>
            <span><Check size={18} /></span>
            <strong>{overdueTasks.length}</strong>
            <small>overdue task{overdueTasks.length === 1 ? "" : "s"}</small>
            <ArrowRight size={15} />
          </button>
          <button onClick={() => setActive("documents")}>
            <span><FileCheck2 size={18} /></span>
            <strong>{pendingDocuments.length}</strong>
            <small>document request{pendingDocuments.length === 1 ? "" : "s"} open</small>
            <ArrowRight size={15} />
          </button>
          <button onClick={() => setActive("calendar")}>
            <span><CalendarDays size={18} /></span>
            <strong>{upcomingAppointments.length}</strong>
            <small>upcoming appointment{upcomingAppointments.length === 1 ? "" : "s"}</small>
            <ArrowRight size={15} />
          </button>
        </div>
      </section>
      <section className="dashboardBreakdowns" aria-label="Operational breakdowns">
        <article className="panel">
          <div className="panelHead"><div><span className="kicker">WORKLOAD MIX</span><h2>{direct ? "Visa category summary" : "Journey stage summary"}</h2></div></div>
          <div className="summaryRows">
            {categoryCounts.length ? categoryCounts.map(([label, count]) => <div key={label}><span>{label}</span><strong>{count}</strong></div>) : <p>No categorised records yet.</p>}
          </div>
        </article>
        <article className="panel">
          <div className="panelHead"><div><span className="kicker">STATUS VISIBILITY</span><h2>{direct ? "Client status summary" : "Application status summary"}</h2></div></div>
          <div className="summaryRows">
            {statusCounts.length ? statusCounts.map(([label, count]) => <div key={label}><span>{label}</span><strong>{count}</strong></div>) : <p>No status updates recorded yet.</p>}
          </div>
        </article>
      </section>
      <section className="signalGrid">
        <button className="signal ocean" onClick={() => setActive(openList)}>
          <div>
            <span>Active cases</span>
            <strong>
              {workspaceCases.filter((c) => c.status !== "completed").length}
            </strong>
            <small>{workspaceCases.length} total records</small>
          </div>
          <div className="signalIcon blue">
            {direct ? <ShieldCheck size={22} /> : <GraduationCap size={22} />}
          </div>
        </button>
        <button className="signal sunshine" onClick={() => setActive(openList)}>
          <div>
            <span>Due today</span>
            <strong>{dueToday.length}</strong>
            <small>Open tasks requiring action</small>
          </div>
          <div className="signalIcon amber">
            <AlertTriangle size={22} />
          </div>
        </button>
        <button className="signal coral" onClick={() => setActive(openList)}>
          <div>
            <span>Awaiting documents</span>
            <strong>{pendingDocuments.length}</strong>
            <small>Document requests still open</small>
          </div>
          <div className="signalIcon">
            <Clock3 size={22} />
          </div>
        </button>
        <button className="signal mint" onClick={() => setActive("case_complete")}>
          <div>
            <span>Visa deadlines</span>
            <strong>{visaDeadlines.length}</strong>
            <small>Active visa matters</small>
          </div>
          <div className="signalIcon green">
            <Check size={22} />
          </div>
        </button>
      </section>
      <section className="dashboardGrid">
        <article className="panel pipelinePanel">
          <div className="panelHead">
            <div>
              <span className="kicker">LIVE WORKSPACE</span>
              <h2>Priority cases</h2>
            </div>
            <button className="ghostButton" onClick={() => setActive(openList)}>
              View all <ArrowRight size={15} />
            </button>
          </div>
          {workspaceCases.length === 0 ? (
            <EmptyState
              icon={direct ? ShieldCheck : GraduationCap}
              title={
                direct ? "No migration clients yet" : "No student journeys yet"
              }
              copy={
                direct
                  ? "Add the first Direct Visa enquiry or client when you are ready."
                  : "Add the first Study Abroad enquiry or student when you are ready."
              }
              action={direct ? "Add client" : "Add enquiry"}
              onAction={() => openModal("case")}
            />
          ) : (
            <div className="caseTable priorityCaseTable">
              <div className="caseTableHeader" aria-hidden="true">
                <span>Client &amp; case</span><span>Stage</span><span>Next action</span><span>Due</span><span />
              </div>
              {priorityCases.slice(0, 5).map((c) => (
                <button
                  className="caseRow compactRecord"
                  key={c.id}
                  onClick={() => onOpenCase(c)}
                >
                  <span className="clientCell">
                    <b>{c.name}</b>
                    <small>
                      {c.id} · {c.type}
                    </small>
                  </span>
                  <span>
                    <b>{c.stage}</b>
                    <small><Status value={c.health} /></small>
                  </span>
                  <span>
                    <b>{c.target || "Open case workspace"}</b>
                    <small>{c.applicationStatus || c.matterType}</small>
                  </span>
                  <span>{c.due || "No due date"}</span>
                  <ArrowRight size={16} />
                </button>
              ))}
            </div>
          )}
        </article>
        <aside className="rightRail">
          <article className="panel attentionPanel">
            <div className="panelHead">
              <div>
                <span className="kicker">ACTION CENTRE</span>
                <h2>Today&apos;s workload</h2>
              </div>
              <Activity size={19} />
            </div>
            <button
              className="radarItem actionRow"
              onClick={() => setActive("work")}
            >
              <div className="radarIcon amber">
                <Check size={17} />
              </div>
              <div>
                <strong>
                  {tasks.filter((t) => !t.completed).length} open tasks
                </strong>
                <span>View and update assignments</span>
              </div>
              <ArrowRight size={15} />
            </button>
            <button
              className="radarItem actionRow"
              onClick={() => setActive("documents")}
            >
              <div className="radarIcon blue">
                <FileCheck2 size={17} />
              </div>
              <div>
                <strong>{documents.length} documents</strong>
                <span>Open the file manager</span>
              </div>
              <ArrowRight size={15} />
            </button>
            {nextAppointments.length > 0 ? (
              <div className="dashboardAppointments">
                <span className="kicker">NEXT APPOINTMENTS</span>
                {nextAppointments.map((appointment) => (
                  <button key={appointment.id} onClick={() => setActive("calendar")}>
                    <CalendarDays size={15} />
                    <span>
                      <strong>{appointment.client || appointment.title}</strong>
                      <small>{appointment.date} · {appointment.time || "Time not set"}</small>
                    </span>
                    <ArrowRight size={14} />
                  </button>
                ))}
              </div>
            ) : null}
            {(role === "admin" || role === "super_admin") ? (
              <div className="dashboardAdminTools">
                <span className="kicker">ADMIN TOOLS</span>
                <button onClick={() => setActive("administration")}><UserCog size={16} /><span><strong>Invite staff</strong><small>Add a team member</small></span><ArrowRight size={14} /></button>
                <button onClick={() => setActive("administration")}><Settings size={16} /><span><strong>Staff &amp; Masters</strong><small>Roles, branches and master data</small></span><ArrowRight size={14} /></button>
                <button onClick={() => setActive("workflows")}><Workflow size={16} /><span><strong>Workflow Templates</strong><small>Manage repeatable processes</small></span><ArrowRight size={14} /></button>
              </div>
            ) : null}
          </article>
        </aside>
      </section>
    </>
  );
}

function CaseWorkspace({
  title,
  module,
  cases,
  filter,
  setFilter,
  openModal,
  onSelect,
  onBulkStage,
  onBulkArchive,
  onAddNote,
  onMoveStage,
}: {
  title: string;
  // Which screen this is, so a saved view is offered back only on the same
  // screen it was saved from.
  module: string;
  cases: CaseRecord[];
  filter: string;
  setFilter: (x: string) => void;
  openModal: (x: ModalType) => void;
  onSelect: (x: CaseRecord) => void;
  onBulkStage: (records: CaseRecord[], stage: LifecycleStage) => Promise<void>;
  onBulkArchive: (records: CaseRecord[]) => Promise<void>;
  onAddNote: (record: CaseRecord, note: string) => Promise<void>;
  onMoveStage: (record: CaseRecord, stage: LifecycleStage, reason: string) => Promise<void>;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [assigning, setAssigning] = useState(false);
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [listQuery, setListQuery] = useState("");
  const [branchFilter, setBranchFilter] = useState("all");
  const [healthFilter, setHealthFilter] = useState("all");
  const [dueFilter, setDueFilter] = useState("all");
  const [rowActionId, setRowActionId] = useState("");
  // A screen switch must not carry a selection from one case list into the
  // next; adjusted here, during render, rather than in an effect.
  const [selectionModule, setSelectionModule] = useState(module);
  if (selectionModule !== module) {
    setSelectionModule(module);
    setSelectedIds(new Set());
  }
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(
          `/api/crm/saved-views?module=${encodeURIComponent(module)}`,
          { cache: "no-store" },
        );
        const result = await response.json();
        if (!cancelled && response.ok) setSavedViews(result.views ?? []);
      } catch {
        // A saved view is a convenience; its absence is not worth an error.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [module]);

  const today = new Date().toISOString().slice(0, 10);
  const weekAhead = new Date(Date.parse(`${today}T00:00:00Z`) + 7 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const shown = cases.filter((record) => {
    if (filter !== "all" && record.status !== filter) return false;
    if (
      listQuery &&
      !`${record.name} ${record.id} ${record.email} ${record.type} ${record.target} ${record.latestNote}`
        .toLowerCase()
        .includes(listQuery.toLowerCase())
    ) return false;
    if (branchFilter !== "all" && record.branchId !== branchFilter) return false;
    if (healthFilter !== "all" && record.health !== healthFilter) return false;
    if (dueFilter === "overdue" && (!record.due || record.due >= today)) return false;
    if (
      dueFilter === "next7" &&
      (!record.due || record.due < today || record.due > weekAhead)
    ) return false;
    if (dueFilter === "none" && record.due) return false;
    return true;
  });
  const activeFilterCount = [
    listQuery,
    branchFilter !== "all" ? branchFilter : "",
    healthFilter !== "all" ? healthFilter : "",
    dueFilter !== "all" ? dueFilter : "",
  ].filter(Boolean).length;
  const clearFilters = () => {
    setListQuery("");
    setBranchFilter("all");
    setHealthFilter("all");
    setDueFilter("all");
  };
  const toggleOne = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () =>
    setSelectedIds((prev) =>
      prev.size === shown.length ? new Set() : new Set(shown.map((c) => c.id)),
    );
  const selectedRecords = shown.filter((c) => selectedIds.has(c.id));
  const bulkStageOptions = LIFECYCLE_STAGES.filter((stage) =>
    selectedRecords.every((record) =>
      allowedStageMoves(record.lifecycleStage).includes(stage),
    ),
  );

  const saveCurrentView = async () => {
    const name = window.prompt("Name this view (for example, \"My waiting cases\")");
    if (!name?.trim()) return;
    try {
      const response = await fetch("/api/crm/saved-views", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          module,
          name: name.trim(),
          filters: {
            filter,
            query: listQuery,
            branch: branchFilter,
            health: healthFilter,
            due: dueFilter,
          },
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The view could not be saved.");
      setSavedViews(result.views ?? []);
    } catch {
      // Non-critical; the filter tab itself still works.
    }
  };
  const deleteView = async (id: string) => {
    try {
      const response = await fetch("/api/crm/saved-views", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id, module }),
      });
      const result = await response.json();
      if (response.ok) setSavedViews(result.views ?? []);
    } catch {
      // Non-critical.
    }
  };

  return (
    <article className="panel listPanel">
      <div className="toolbar">
        <div className="tabs">
          {[
            ["all", "All"],
            ["active", "Active"],
            ["waiting", "Waiting"],
            ["completed", "Completed"],
          ].map(([k, l]) => (
            <button
              key={k}
              className={filter === k ? "selected" : ""}
              onClick={() => setFilter(k)}
            >
              {l}
            </button>
          ))}
        </div>
        <div>
          <button
            className="ghostButton"
            aria-expanded={showFilters}
            onClick={() => setShowFilters((value) => !value)}
          >
            <Filter size={15} />
            Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}
          </button>
          <button className="primaryButton" onClick={() => openModal("case")}>
            <Plus size={16} />
            Add new
          </button>
        </div>
      </div>
      {showFilters ? (
        <div className="caseFilterPanel">
          <label className="caseFilterSearch">
            <span>Search this list</span>
            <div>
              <Search size={16} />
              <input
                value={listQuery}
                onChange={(event) => setListQuery(event.target.value)}
                placeholder="Name, case number, email or matter"
              />
            </div>
          </label>
          <label>
            <span>Branch</span>
            <select value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)}>
              <option value="all">All branches</option>
              {Array.from(
                new Map(
                  cases
                    .filter((record) => record.branchId)
                    .map((record) => [record.branchId, record.branch]),
                ).entries(),
              ).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
          <label>
            <span>Case health</span>
            <select value={healthFilter} onChange={(event) => setHealthFilter(event.target.value)}>
              <option value="all">All health states</option>
              <option value="critical">Critical</option>
              <option value="attention">Needs attention</option>
              <option value="healthy">Healthy</option>
            </select>
          </label>
          <label>
            <span>Due date</span>
            <select value={dueFilter} onChange={(event) => setDueFilter(event.target.value)}>
              <option value="all">Any due date</option>
              <option value="overdue">Overdue</option>
              <option value="next7">Next 7 days</option>
              <option value="none">No due date</option>
            </select>
          </label>
          <div className="caseFilterSummary">
            <strong>{shown.length}</strong>
            <span>of {cases.length} cases</span>
            {activeFilterCount ? <button className="linkButton" onClick={clearFilters}>Clear filters</button> : null}
          </div>
        </div>
      ) : null}
      <div className="savedViewsBar">
        {savedViews.map((view) => (
            <span className="savedViewChip" key={view.id}>
              <button
                type="button"
                onClick={() => {
                  setFilter(String(view.filters?.filter ?? "all"));
                  setListQuery(String(view.filters?.query ?? ""));
                  setBranchFilter(String(view.filters?.branch ?? "all"));
                  setHealthFilter(String(view.filters?.health ?? "all"));
                  setDueFilter(String(view.filters?.due ?? "all"));
                  setShowFilters(true);
                }}
              >
                {view.name}
              </button>
              <button
                type="button"
                aria-label={`Delete saved view ${view.name}`}
                onClick={() => void deleteView(view.id)}
              >
                <X size={11} />
              </button>
            </span>
          ))}
        <button type="button" className="savedViewSave" onClick={() => void saveCurrentView()}>
          <Plus size={11} />
          Save this view
        </button>
      </div>
      {shown.length === 0 ? (
        <EmptyState
          icon={Users}
          title={`No ${title.toLowerCase()} found`}
          copy="Use Add new to create a secure record in the shared Maximus workspace."
          action="Add record"
          onAction={() => openModal("case")}
        />
      ) : (
        <>
          <BulkActionBar
            count={selectedRecords.length}
            onClear={() => setSelectedIds(new Set())}
          >
            <select
              aria-label="Move selected cases to stage"
              disabled={assigning}
              defaultValue=""
              onChange={async (event) => {
                const stage = event.target.value as LifecycleStage;
                if (!stage) return;
                setAssigning(true);
                await onBulkStage(selectedRecords, stage);
                setAssigning(false);
                setSelectedIds(new Set());
                event.target.value = "";
              }}
            >
              <option value="">Move stage…</option>
              {bulkStageOptions.map((stage) => (
                <option key={stage} value={stage}>{stageLabelFor(stage, cases[0]?.serviceType === "direct_visa")}</option>
              ))}
            </select>
            <button
              type="button"
              className="ghostButton"
              onClick={() =>
                downloadCsv(
                  `${module}-selected.csv`,
                  selectedRecords.map((record) => ({
                    caseNumber: record.id,
                    client: record.name,
                    email: record.email,
                    phone: record.phone,
                    matter: record.type,
                    stage: record.lifecycleStage,
                    branch: record.branch,
                    due: record.due,
                    health: record.health,
                    status: record.status,
                  })),
                )
              }
            >
              <Download size={14} /> Export selected
            </button>
            <button
              type="button"
              className="ghostButton dangerAction"
              disabled={assigning}
              onClick={async () => {
                const verb = "archive";
                if (!confirm(`${verb[0].toUpperCase()}${verb.slice(1)} ${selectedRecords.length} selected case${selectedRecords.length === 1 ? "" : "s"}?`)) return;
                setAssigning(true);
                await onBulkArchive(selectedRecords);
                setAssigning(false);
                setSelectedIds(new Set());
              }}
            >
              Archive selected
            </button>
          </BulkActionBar>
          <div className="richTable caseWorkTable">
            <div className="richHeaderWrap">
              <span className="rowCheckboxCell">
                <input
                  type="checkbox"
                  aria-label="Select all shown cases"
                  checked={selectedRecords.length > 0 && selectedRecords.length === shown.length}
                  onChange={toggleAll}
                />
              </span>
              <div className="richHeader">
                <span>Client</span>
                <span>Matter</span>
                <span>Current stage</span>
                <span>Latest note</span>
                <span>Move to</span>
              </div>
            </div>
            {shown.map((c) => (
              <div className="richRowWrap" key={c.id}>
                <span className="rowCheckboxCell">
                  <input
                    type="checkbox"
                    aria-label={`Select ${c.name}`}
                    checked={selectedIds.has(c.id)}
                    onChange={() => toggleOne(c.id)}
                  />
                </span>
                <div className="richRow">
                  <button type="button" className="caseRowOpen clientCell" onClick={() => onSelect(c)}>
                    <b>{c.name}</b>
                    <small>
                      {c.id} · {c.branch || "No branch"}
                    </small>
                  </button>
                  <button type="button" className="caseRowOpen" onClick={() => onSelect(c)}>
                    <b>{c.type}</b>
                    <small>{c.target || "No target"}</small>
                  </button>
                  <button type="button" className="caseRowOpen progressCell" onClick={() => onSelect(c)}>
                    <b>{c.stage}</b>
                    <div>
                      <i style={{ width: `${c.progress}%` }} />
                    </div>
                    <small>{c.progress}% complete</small>
                  </button>
                  <span className="latestCaseNote">
                    <button type="button" className="caseNotePreview" onClick={() => onSelect(c)}>
                      <b>{c.latestNote || "No notes yet"}</b>
                      <small>
                        {c.latestNoteAt
                          ? `${c.latestNoteAuthor || "Team member"} · ${orgDateTime(c.latestNoteAt)}`
                          : "Add the first note for this case"}
                      </small>
                    </button>
                    <button
                      type="button"
                      className="addCaseNote"
                      disabled={rowActionId === c.id}
                      onClick={async () => {
                        const note = window.prompt(`Add a note for ${c.name}`);
                        if (!note?.trim()) return;
                        setRowActionId(c.id);
                        await onAddNote(c, note.trim());
                        setRowActionId("");
                      }}
                    >
                      <Plus size={13} /> Add note
                    </button>
                  </span>
                  <span className="caseMoveCell">
                    <select
                      aria-label={`Move ${c.name} to another section`}
                      disabled={rowActionId === c.id}
                      defaultValue=""
                      onChange={async (event) => {
                        const stage = event.target.value as LifecycleStage;
                        if (!stage) return;
                        const reason = window.prompt(
                          `Reason for moving ${c.name} to ${stageLabelFor(stage, c.serviceType === "direct_visa")}`,
                          "Progressed to the next section",
                        );
                        if (reason === null) {
                          event.target.value = "";
                          return;
                        }
                        setRowActionId(c.id);
                        await onMoveStage(c, stage, reason);
                        setRowActionId("");
                        event.target.value = "";
                      }}
                    >
                      <option value="">Move to…</option>
                      {allowedStageMoves(c.lifecycleStage).map((stage) => (
                        <option key={stage} value={stage}>
                          {stageLabelFor(stage, c.serviceType === "direct_visa")}
                        </option>
                      ))}
                    </select>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </article>
  );
}

/**
 * Applications and visa matters are records in their own right: a student can
 * hold three offers at once, and a visa matter carries the references and
 * deadlines the case row knows nothing about. These two screens list those
 * records; selecting one opens the case it belongs to.
 */
const overdue = (date: string) =>
  Boolean(date) && date < new Date().toISOString().slice(0, 10);

function BoardEmpty({ what }: { what: string }) {
  return <p className="boardEmpty">No {what} recorded yet.</p>;
}

function ApplicationsBoard({
  rows,
  onOpen,
}: {
  rows: ApplicationRow[];
  onOpen: (caseId: string) => void;
}) {
  const [showArchived, setShowArchived] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const archivedCount = rows.filter((row) => row.archived).length;
  const statuses = [...new Set(rows.map((row) => row.status).filter(Boolean))].sort();
  const shown = (showArchived ? rows : rows.filter((row) => !row.archived))
    .filter((row) => !status || row.status === status)
    .filter((row) => matchesSearch(query, [row.client, row.institution, row.course, row.campus, row.intake, row.reference, row.caseNumber, row.associate, row.partner]));
  const selection = useBulkSelection(shown);
  return (
    <article className="panel listPanel">
      <div className="panelHead">
        <div>
          <span className="kicker">EVERY APPLICATION</span>
          <h2>Institution applications</h2>
        </div>
        {archivedCount > 0 && (
          <button
            className="ghostButton"
            onClick={() => setShowArchived(!showArchived)}
          >
            {showArchived
              ? "Hide withdrawn"
              : `Show ${archivedCount} withdrawn`}
          </button>
        )}
      </div>
      <ListFilterBar query={query} onQuery={setQuery} placeholder="Search student, institution, course, intake or reference" resultCount={shown.length}>
        <label className="compactFilter">Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{statuses.map((item) => <option key={item} value={item}>{humanise(item)}</option>)}</select></label>
      </ListFilterBar>
      {shown.length === 0 ? (
        <BoardEmpty what="applications" />
      ) : (
        <>
        <div className="listSelectionTools">
          <SelectAllControl checked={selection.allSelected} onChange={selection.toggleAll} />
        </div>
        <BulkActionBar count={selection.selected.length} onClear={selection.clear}>
          <button className="ghostButton" onClick={() => downloadCsv("applications-selected.csv", selection.selected as unknown as Record<string, unknown>[])}>
            <Download size={14} /> Export selected
          </button>
        </BulkActionBar>
        <div className="recordTableWrap">
          <table className="recordTable boardTable">
            <thead>
              <tr>
                <th scope="col" className="selectionColumn"><span className="srOnly">Select</span></th>
                <th scope="col">Student</th>
                <th scope="col">Institution</th>
                <th scope="col">Course</th>
                <th scope="col">Campus</th>
                <th scope="col">Intake</th>
                <th scope="col">Reference</th>
                <th scope="col">Partner / associate</th>
                <th scope="col">Status</th>
                <th scope="col">Submitted</th>
                <th scope="col">Offer</th>
                <th scope="col">CoE</th>
                <th scope="col">Deadline</th>
                <th scope="col">Case</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={row.id} className={row.archived ? "archivedRow" : ""}>
                  <td className="selectionColumn"><RowSelection checked={selection.selectedIds.has(row.id)} onChange={() => selection.toggle(row.id)} label={`Select ${row.client || "application"}`} /></td>
                  <td>{row.client || "—"}</td>
                  <td>{row.institution || "—"}</td>
                  <td>{row.course || "—"}</td>
                  <td>{row.campus || "—"}</td>
                  <td>{row.intake || "—"}</td>
                  <td>{row.reference || "—"}</td>
                  <td>{[row.partner, row.associate].filter(Boolean).join(" · ") || "—"}</td>
                  <td>
                    {humanise(row.status)}
                    {row.archived ? " · withdrawn" : ""}
                  </td>
                  <td>{row.submittedOn || "—"}</td>
                  <td>{row.offerOn || "—"}</td>
                  <td>{row.coeOn || "—"}</td>
                  <td className={overdue(row.deadlineOn) ? "overdueCell" : ""}>
                    {row.deadlineOn || "—"}
                  </td>
                  <td>
                    <button
                      className="linkButton"
                      onClick={() => onOpen(row.caseId)}
                    >
                      {row.caseNumber || "Open case"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </article>
  );
}

function VisaMattersBoard({
  rows,
  onOpen,
}: {
  rows: VisaMatterRow[];
  onOpen: (caseId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const statuses = [...new Set(rows.map((row) => row.status).filter(Boolean))].sort();
  const shown = rows
    .filter((row) => !status || row.status === status)
    .filter((row) => matchesSearch(query, [row.client, row.subclass, row.matterType, row.destination, row.currentVisa, row.trn, row.reference, row.agent, row.owner, row.marn, row.caseNumber]));
  const selection = useBulkSelection(shown);
  return (
    <article className="panel listPanel">
      <div className="panelHead">
        <div>
          <span className="kicker">EVERY VISA MATTER</span>
          <h2>Visa matters</h2>
        </div>
      </div>
      <ListFilterBar query={query} onQuery={setQuery} placeholder="Search client, visa subclass, TRN, MARN or destination" resultCount={shown.length}>
        <label className="compactFilter">Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{statuses.map((item) => <option key={item} value={item}>{humanise(item)}</option>)}</select></label>
      </ListFilterBar>
      {shown.length === 0 ? (
        <BoardEmpty what="visa matters" />
      ) : (
        <>
        <div className="listSelectionTools">
          <SelectAllControl checked={selection.allSelected} onChange={selection.toggleAll} />
        </div>
        <BulkActionBar count={selection.selected.length} onClear={selection.clear}>
          <button className="ghostButton" onClick={() => downloadCsv("visa-matters-selected.csv", selection.selected as unknown as Record<string, unknown>[])}>
            <Download size={14} /> Export selected
          </button>
        </BulkActionBar>
        <div className="recordTableWrap">
          <table className="recordTable boardTable">
            <thead>
              <tr>
                <th scope="col" className="selectionColumn"><span className="srOnly">Select</span></th>
                <th scope="col">Client</th>
                <th scope="col">Subclass</th>
                <th scope="col">Destination</th>
                <th scope="col">Current visa</th>
                <th scope="col">Expiry</th>
                <th scope="col">Lodged</th>
                <th scope="col">TRN</th>
                <th scope="col">Agent</th>
                <th scope="col">MARN</th>
                <th scope="col">Status</th>
                <th scope="col">s56 due</th>
                <th scope="col">Outcome</th>
                <th scope="col">Case</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={row.id}>
                  <td className="selectionColumn"><RowSelection checked={selection.selectedIds.has(row.id)} onChange={() => selection.toggle(row.id)} label={`Select ${row.client || "visa matter"}`} /></td>
                  <td>{row.client || "—"}</td>
                  <td>{row.subclass || row.matterType || "—"}</td>
                  <td>{row.destination || "—"}</td>
                  <td>{row.currentVisa || "—"}</td>
                  <td
                    className={
                      overdue(row.currentVisaExpiry) ? "overdueCell" : ""
                    }
                  >
                    {row.currentVisaExpiry || "—"}
                  </td>
                  <td>{row.lodgedOn || "Not lodged"}</td>
                  <td>{row.trn || row.reference || "—"}</td>
                  <td>{row.agent || row.owner || "Unassigned"}</td>
                  <td>{row.marn || "—"}</td>
                  <td>{humanise(row.status)}</td>
                  <td
                    className={
                      row.informationDueOn &&
                      !row.informationProvidedOn &&
                      overdue(row.informationDueOn)
                        ? "overdueCell"
                        : ""
                    }
                  >
                    {row.informationDueOn
                      ? row.informationProvidedOn
                        ? `${row.informationDueOn} · answered`
                        : row.informationDueOn
                      : "—"}
                  </td>
                  <td>{row.outcome ? humanise(row.outcome) : "—"}</td>
                  <td>
                    <button
                      className="linkButton"
                      onClick={() => onOpen(row.caseId)}
                    >
                      {row.caseNumber || "Open case"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </article>
  );
}

function TasksView({
  tasks,
  cases,
  setTasks,
  openModal,
  onBulkAction,
}: {
  tasks: TaskRecord[];
  cases: CaseRecord[];
  setTasks: (x: TaskRecord[]) => void;
  openModal: (x: ModalType) => void;
  onBulkAction: (resource: string, operation: string, ids: string[], extra?: Record<string, unknown>) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState("open");
  const [priority, setPriority] = useState("");
  const shown = tasks
    .filter((task) => state === "all" || (state === "done" ? task.completed : !task.completed))
    .filter((task) => !priority || task.priority === priority)
    .filter((task) => matchesSearch(query, [task.title, task.priority, task.due, cases.find((c) => c.dbId === task.caseId)?.name]));
  const priorities = [...new Set(tasks.map((task) => task.priority).filter(Boolean))].sort();
  const selection = useBulkSelection(shown);
  const run = async (operation: string, extra: Record<string, unknown> = {}) => {
    await onBulkAction("task", operation, selection.selected.map((item) => item.id), extra);
    selection.clear();
  };
  return (
    <article className="panel listPanel">
      <div className="panelHead">
        <div>
          <span className="kicker">ASSIGNED WORK</span>
          <h2>Tasks</h2>
        </div>
        <button className="primaryButton" onClick={() => openModal("task")}>
          <Plus size={16} />
          New task
        </button>
      </div>
      <ListFilterBar query={query} onQuery={setQuery} placeholder="Search task, client or due date" resultCount={shown.length}>
        <label className="compactFilter">Status<select value={state} onChange={(event) => setState(event.target.value)}><option value="open">Open</option><option value="done">Completed</option><option value="all">All</option></select></label>
        <label className="compactFilter">Priority<select value={priority} onChange={(event) => setPriority(event.target.value)}><option value="">All priorities</option>{priorities.map((item) => <option key={item} value={item}>{humanise(item)}</option>)}</select></label>
      </ListFilterBar>
      {shown.length === 0 ? (
        <EmptyState
          icon={Check}
          title="No tasks"
          copy="Create tasks and link them to a case."
          action="Create task"
          onAction={() => openModal("task")}
        />
      ) : (
        <>
        <div className="listSelectionTools">
          <SelectAllControl checked={selection.allSelected} onChange={selection.toggleAll} />
        </div>
        <BulkActionBar count={selection.selected.length} onClear={selection.clear}>
          <button className="ghostButton" onClick={() => void run("toggle", { completed: true })}>
            <Check size={14} /> Mark complete
          </button>
          <button className="ghostButton" onClick={() => void run("toggle", { completed: false })}>
            Reopen
          </button>
          <button className="ghostButton dangerAction" onClick={() => {
            if (confirm(`Delete ${selection.selected.length} selected task${selection.selected.length === 1 ? "" : "s"}?`)) void run("delete");
          }}>
            <Trash2 size={14} /> Delete
          </button>
        </BulkActionBar>
        {shown.map((t) => (
          <div className="functionalRow bulkEnabled" key={t.id}>
            <RowSelection checked={selection.selectedIds.has(t.id)} onChange={() => selection.toggle(t.id)} label={`Select ${t.title}`} />
            <button
              className={`taskCheck ${t.completed ? "done" : ""}`}
              onClick={() =>
                setTasks(
                  tasks.map((x) =>
                    x.id === t.id ? { ...x, completed: !x.completed } : x,
                  ),
                )
              }
            >
              {t.completed ? <Check size={15} /> : null}
            </button>
            <div>
              <strong>{t.title}</strong>
              <span>
                {cases.find((c) => c.dbId === t.caseId)?.name || "General task"} ·
                Due {t.due || "not set"}
              </span>
            </div>
            <Status value={t.priority} />
            <button
              className="iconButton"
              onClick={() => setTasks(tasks.filter((x) => x.id !== t.id))}
              aria-label="Delete task"
              title="Delete task"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        </>
      )}
    </article>
  );
}
function CalendarView({
  items,
  openModal,
  setItems,
  setActive,
  onBulkAction,
  onRespond,
}: {
  items: AppointmentRecord[];
  openModal: (x: ModalType) => void;
  setItems: (x: AppointmentRecord[]) => void;
  setActive: (x: ModuleKey) => void;
  onBulkAction: (resource: string, operation: string, ids: string[]) => Promise<void>;
  onRespond: (appointment: AppointmentRecord, status: "scheduled" | "declined") => void;
}) {
  const [calendarNow] = useState(() => new Date());
  const [connection, setConnection] = useState<MailboxStatus | null>(null);
  const [connectionError, setConnectionError] = useState("");
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    today = calendarNow.getDay();
  const types = [...new Set(items.map((item) => item.type).filter(Boolean))].sort();
  const shown = items
    .filter((item) => !type || item.type === type)
    .filter((item) => matchesSearch(query, [item.title, item.client, item.type, item.date, item.time]));
  const selection = useBulkSelection(shown);

  const loadConnection = async () => {
    try {
      const response = await fetch("/api/crm/calendar-connection", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "The calendar connection could not be read.");
      setConnection(result);
      setConnectionError("");
    } catch (reason) {
      setConnectionError(
        reason instanceof Error
          ? reason.message
          : "The calendar connection could not be read.",
      );
    }
  };
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!cancelled) await loadConnection();
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const disconnectCalendar = async () => {
    if (!confirm("Disconnect your Google Calendar? You can reconnect at any time."))
      return;
    try {
      const response = await fetch("/api/crm/calendar-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disconnect" }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || "Your calendar could not be disconnected.");
      }
      await loadConnection();
    } catch (reason) {
      setConnectionError(
        reason instanceof Error
          ? reason.message
          : "Your calendar could not be disconnected.",
      );
    }
  };

  return (
    <section className="calendarWorkspace">
      <article className="calendarConnectBar">
        <div className="googleG">G</div>
        {!connection ? (
          <div>
            <span>GOOGLE CALENDAR</span>
            <strong>Checking your connection…</strong>
          </div>
        ) : !connection.oauthConfigured ? (
          <>
            <div>
              <span>GOOGLE CALENDAR</span>
              <strong>Calendar sync is ready for administrator setup</strong>
              <small>
                Once configured, a new appointment is created on the calendar
                of whoever it is assigned to. Nothing is read back from
                Google -- moving or deleting an event there does not change
                the CRM.
              </small>
            </div>
            <Status value="Setup required" />
            <button
              className="ghostButton"
              onClick={() => setActive("integrations")}
            >
              <Link2 size={15} />
              Configure
            </button>
          </>
        ) : connection.connected ? (
          <>
            <div>
              <span>GOOGLE CALENDAR</span>
              <strong>Connected as {connection.email}</strong>
              <small>
                New appointments you own are created on this calendar.
                Nothing is read back from Google.
              </small>
            </div>
            <Status value="Connected" />
            <button className="ghostButton" onClick={() => void disconnectCalendar()}>
              Disconnect
            </button>
          </>
        ) : (
          <>
            <div>
              <span>GOOGLE CALENDAR</span>
              <strong>Your calendar is not connected</strong>
              <small>
                Connect your own Google Calendar so appointments assigned to
                you appear on it automatically.
              </small>
            </div>
            <button
              className="ghostButton"
              onClick={() => {
                window.location.href = "/api/auth/calendar/start";
              }}
            >
              <Link2 size={15} />
              Connect Calendar
            </button>
          </>
        )}
      </article>
      {connectionError && <p className="caseWorkError">{connectionError}</p>}
      <section className="calendarLayout">
        <article className="panel calendarBoard">
          <div className="panelHead">
            <div>
              <span className="kicker">TEAM WEEK</span>
              <h2>Appointments and CRM deadlines</h2>
            </div>
            <div className="calendarActions">
              <button className="ghostButton" onClick={() => setActive("work")}>
                <Check size={15} />
                Tasks
              </button>
              <button
                className="primaryButton"
                onClick={() => openModal("appointment")}
              >
                <Plus size={16} />
                New appointment
              </button>
            </div>
          </div>
          <ListFilterBar query={query} onQuery={setQuery} placeholder="Search appointment, client or date" resultCount={shown.length}>
            <label className="compactFilter">Type<select value={type} onChange={(event) => setType(event.target.value)}><option value="">All types</option>{types.map((item) => <option key={item} value={item}>{humanise(item)}</option>)}</select></label>
          </ListFilterBar>
          <div className="weekGrid">
            {days.map((day, index) => (
              <div className={today === index + 1 ? "today" : ""} key={day}>
                <header>
                  <span>{day.slice(0, 3)}</span>
                  <b>
                    {String(
                      new Date(
                        calendarNow.getTime() + (index + 1 - today) * 86400000,
                      ).getDate(),
                    ).padStart(2, "0")}
                  </b>
                </header>
                {shown
                  .filter(
                    (a) =>
                      new Date(`${a.date}T00:00:00`).getDay() === index + 1,
                  )
                  .map((a) => (
                    <button
                      key={a.id}
                      className="calendarEvent"
                      onClick={() =>
                        alert(
                          `${a.title}\n${a.client || "Internal"} · ${a.time || "Time not set"}`,
                        )
                      }
                    >
                      <time>{a.time || "TBC"}</time>
                      <strong>{a.title}</strong>
                      <small>{a.client || "Internal"}</small>
                    </button>
                  ))}
                {!shown.some(
                  (a) => new Date(`${a.date}T00:00:00`).getDay() === index + 1,
                ) ? (
                  <span className="freeDay">No CRM events</span>
                ) : null}
              </div>
            ))}
          </div>
        </article>
        <aside className="panel calendarAgenda">
          <div className="panelHead">
            <div>
              <span className="kicker">UPCOMING</span>
              <h2>Team agenda</h2>
            </div>
            <CalendarCheck2 size={19} />
          </div>
          {shown.length === 0 ? (
            <div className="agendaEmpty">
              <CalendarDays size={28} />
              <strong>Your schedule is clear</strong>
              <p>
                Create an appointment now. Google events will appear here after
                connection.
              </p>
              <button
                className="primaryButton"
                onClick={() => openModal("appointment")}
              >
                <Plus size={15} />
                Add appointment
              </button>
            </div>
          ) : (
            <>
            <div className="listSelectionTools compactSelectionTools">
              <SelectAllControl checked={selection.allSelected} onChange={selection.toggleAll} />
            </div>
            <BulkActionBar count={selection.selected.length} onClear={selection.clear}>
              <button className="ghostButton dangerAction" onClick={async () => {
                if (!confirm(`Cancel ${selection.selected.length} selected appointment${selection.selected.length === 1 ? "" : "s"}? Connected Google Calendar events will also be cancelled.`)) return;
                await onBulkAction("appointment", "delete", selection.selected.map((item) => item.id));
                selection.clear();
              }}>
                <Trash2 size={14} /> Cancel selected
              </button>
            </BulkActionBar>
            {shown.slice(0, 12).map((a) => (
              <div className="agendaItem" key={a.id}>
                <RowSelection checked={selection.selectedIds.has(a.id)} onChange={() => selection.toggle(a.id)} label={`Select ${a.title}`} />
                <div className="dateTile">
                  <b>{a.date?.slice(8, 10) || "–"}</b>
                  <span>{a.time || "TBC"}</span>
                </div>
                <div>
                  <strong>{a.title}</strong>
                  <span>
                    {a.client || "Internal"} · {a.type}
                  </span>
                </div>
                <Status value={a.status} />
                {a.status === "requested" ? (
                  <div className="staffActions">
                    <button className="linkButton" onClick={() => onRespond(a, "scheduled")}>Confirm</button>
                    <button className="linkButton dangerLink" onClick={() => onRespond(a, "declined")}>Decline</button>
                  </div>
                ) : null}
                <button
                  className="iconButton"
                  onClick={() => setItems(items.filter((x) => x.id !== a.id))}
                  aria-label="Delete appointment"
                  title="Delete appointment"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            </>
          )}
        </aside>
      </section>
    </section>
  );
}
function DocumentsView({
  items,
  setItems,
  storageConnected,
  onBulkAction,
}: {
  items: DocumentRecord[];
  setItems: (x: DocumentRecord[]) => void;
  storageConnected: boolean;
  onBulkAction: (resource: string, operation: string, ids: string[]) => Promise<void>;
}) {
  // An archived document is kept for the retention period but is not part of
  // the working file, so it is out of the way until it is asked for.
  const [showArchived, setShowArchived] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const archivedCount = items.filter((d) => d.status === "archived").length;
  const statuses = [...new Set(items.map((item) => item.status).filter(Boolean))].sort();
  const shown = (showArchived
    ? items
    : items.filter((d) => d.status !== "archived"))
    .filter((item) => !status || item.status === status)
    .filter((item) => matchesSearch(query, [item.client, item.title, item.folder, item.fileName, item.status]));
  // Every file, grouped by the client it belongs to -- an archive to browse
  // and download from, not where a request gets started. Requesting a
  // document happens from that client's own case now, so it is never out of
  // step with which case it was actually asked for on.
  const byClient = new Map<string, DocumentRecord[]>();
  for (const d of shown) {
    const key = d.client || "No client";
    byClient.set(key, [...(byClient.get(key) ?? []), d]);
  }
  const selection = useBulkSelection(shown);
  return (
    <section className="moduleGrid">
      <article className="panel widePanel">
        <div className="panelHead">
          <div>
            <span className="kicker">DOCUMENT INDEX</span>
            <h2>Documents</h2>
          </div>
          <div className="panelHeadActions">
            {archivedCount > 0 && (
              <button
                className="ghostButton"
                onClick={() => setShowArchived(!showArchived)}
              >
                {showArchived
                  ? "Hide archived"
                  : `Show ${archivedCount} archived`}
              </button>
            )}
          </div>
        </div>
        <ListFilterBar query={query} onQuery={setQuery} placeholder="Search client, document, folder or filename" resultCount={shown.length}>
          <label className="compactFilter">Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{statuses.map((item) => <option key={item} value={item}>{humanise(item)}</option>)}</select></label>
        </ListFilterBar>
        {shown.length === 0 ? (
          <EmptyState
            icon={FolderOpen}
            title={
              archivedCount > 0
                ? "Nothing in the working file"
                : "No documents requested"
            }
            copy={
              storageConnected
                ? "Every document requested from a client, across every case, ends up here once it's on file. Open a case's Documents tab to request one -- this screen is the archive, not where a request starts."
                : "Every document requested from a client, across every case, ends up here once it's on file. Shared Drive storage is not configured, so files cannot be uploaded yet."
            }
          />
        ) : (
          <>
          <div className="listSelectionTools">
            <SelectAllControl checked={selection.allSelected} onChange={selection.toggleAll} />
          </div>
          <BulkActionBar count={selection.selected.length} onClear={selection.clear}>
            <button className="ghostButton" onClick={() => downloadCsv("documents-selected.csv", selection.selected.map((document) => ({
              client: document.client, title: document.title, folder: document.folder,
              fileName: document.fileName, status: document.status, createdAt: document.createdAt,
            })))}><Download size={14} /> Export index</button>
            <button className="ghostButton dangerAction" onClick={async () => {
              if (!confirm(`Archive ${selection.selected.length} selected document record${selection.selected.length === 1 ? "" : "s"}? Files stay in Drive for retention.`)) return;
              await onBulkAction("document", "delete", selection.selected.map((item) => item.id));
              selection.clear();
            }}><Trash2 size={14} /> Archive selected</button>
          </BulkActionBar>
          {[...byClient.entries()].map(([client, docs]) => (
            <div className="documentClientGroup" key={client}>
              <h3 className="documentClientGroupHead">{client}</h3>
              {docs.map((d) => (
                <div className="functionalRow bulkEnabled" key={d.id}>
                  <RowSelection checked={selection.selectedIds.has(d.id)} onChange={() => selection.toggle(d.id)} label={`Select ${d.title}`} />
                  <div className="docIcon">
                    <FileText size={18} />
                  </div>
                  <div>
                    <strong>{d.title}</strong>
                    <span>
                      {d.folder || "Unfiled"} · {d.fileName}
                    </span>
                  </div>
                  <Status value={d.status} />
                  <button
                    className="iconButton"
                    onClick={() => setItems(items.filter((x) => x.id !== d.id))}
                    aria-label="Remove document"
                    title="Remove document"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          ))}
          </>
        )}
      </article>
      <aside className="panel drivePanel">
        <FolderOpen size={27} />
        <h2>
          {storageConnected
            ? "Shared Drive connected"
            : "Shared Drive not configured"}
        </h2>
        <p>
          {storageConnected
            ? "Files are uploaded to the organisation's Google Shared Drive, filed under each client, and downloaded back through this CRM."
            : "Requests and metadata are stored in Supabase, but no file can be uploaded until the Shared Drive service account is configured."}
        </p>
        <p className="drivePanelHint">
          {storageConnected
            ? "Configured through the Shared Drive service account."
            : "An administrator connects it under Integrations."}
        </p>
      </aside>
    </section>
  );
}
/** A draft has never been sent, so it is dated by when it was written. */
function messageWhen(message: MessageRecord): string {
  const when = message.sentAt ?? message.createdAt;
  if (!when) return "Not sent";
  const stamp = orgDateTime(when);
  if (!stamp) return "Not sent";
  return message.sentAt ? `Sent ${stamp}` : `Drafted ${stamp}`;
}

type MailboxStatus = {
  oauthConfigured: boolean;
  connected: boolean;
  email: string | null;
};

function MessagesView({
  items,
  campaigns,
  cases,
  openModal,
  setItems,
  canSend,
  onBulkAction,
  onCampaignChange,
  onClose,
}: {
  items: MessageRecord[];
  campaigns: CampaignRecord[];
  cases: CaseRecord[];
  openModal: (x: ModalType) => void;
  setItems: (x: MessageRecord[]) => void;
  // A client's own portal login can raise a message to their case team, but
  // only staff ever dispatch mail as the agency.
  canSend: boolean;
  onBulkAction: (resource: string, operation: string, ids: string[], extra?: Record<string, unknown>) => Promise<void>;
  onCampaignChange: () => Promise<void>;
  onClose: () => void;
}) {
  // A discarded draft is kept for the record but is not part of the outbox.
  const [showDiscarded, setShowDiscarded] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [channelFilter, setChannelFilter] = useState("");
  const [mailbox, setMailbox] = useState<MailboxStatus | null>(null);
  const [whatsappConfigured, setWhatsappConfigured] = useState(false);
  const [smsConfigured, setSmsConfigured] = useState(false);
  const [mailboxError, setMailboxError] = useState("");
  const [gmailMessages, setGmailMessages] = useState<Array<{
    id: string; threadId: string; from: string; to: string; subject: string;
    date: string; snippet: string; body: string; unread: boolean; inbox: boolean; sent: boolean; starred: boolean;
  }>>([]);
  const [gmailSearch, setGmailSearch] = useState("");
  const [gmailLoading, setGmailLoading] = useState(false);
  const [openGmailId, setOpenGmailId] = useState<string | null>(null);
  const [mailFolder, setMailFolder] = useState<"inbox" | "starred" | "sent" | "drafts">("inbox");
  const [localStars, setLocalStars] = useState<Set<string>>(new Set());
  const [sendingId, setSendingId] = useState<string | null>(null);
  // Sent locally, ahead of the next full refresh -- kept separate from the
  // shared items/setItems wiring so a send can never collide with the
  // draft/ready toggle that setItems already carries.
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());

  const loadMailbox = async () => {
    try {
      const response = await fetch("/api/crm/mailbox", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "The mailbox status could not be read.");
      setMailbox(result);
      setMailboxError("");
    } catch (reason) {
      setMailboxError(
        reason instanceof Error
          ? reason.message
          : "The mailbox status could not be read.",
      );
    }
  };

  useEffect(() => {
    if (!canSend) return;
    let cancelled = false;
    void (async () => {
      if (!cancelled) await loadMailbox();
    })();
    return () => {
      cancelled = true;
    };
  }, [canSend]);

  useEffect(() => {
    if (!canSend) return;
    void fetch("/api/crm/sms", { cache: "no-store" })
      .then((response) => response.json())
      .then((result) => setSmsConfigured(Boolean(result.configured)))
      .catch(() => setSmsConfigured(false));
  }, [canSend]);

  useEffect(() => {
    if (!canSend) return;
    void fetch("/api/crm/whatsapp", { cache: "no-store" })
      .then((response) => response.json())
      .then((result) => setWhatsappConfigured(Boolean(result.configured)))
      .catch(() => setWhatsappConfigured(false));
  }, [canSend]);

  const disconnectMailbox = async () => {
    if (!confirm("Disconnect your Gmail account? You can reconnect at any time."))
      return;
    try {
      const response = await fetch("/api/crm/mailbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disconnect" }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || "Your Gmail account could not be disconnected.");
      }
      await loadMailbox();
    } catch (reason) {
      setMailboxError(
        reason instanceof Error
          ? reason.message
          : "Your Gmail account could not be disconnected.",
      );
    }
  };

  const loadGmailInbox = async (
    search = gmailSearch,
    folder: "inbox" | "starred" | "sent" | "drafts" = mailFolder,
  ) => {
    if (folder === "drafts") return;
    setGmailLoading(true);
    setMailboxError("");
    try {
      const params = new URLSearchParams({ view: "inbox" });
      const folderQuery = folder === "inbox" ? "in:inbox" : folder === "sent" ? "in:sent" : "is:starred";
      params.set("q", `${folderQuery}${search.trim() ? ` ${search.trim()}` : ""}`);
      const response = await fetch(`/api/crm/mailbox?${params}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Gmail could not be loaded.");
      setMailbox(result);
      setGmailMessages(result.messages ?? []);
    } catch (reason) {
      setMailboxError(reason instanceof Error ? reason.message : "Gmail could not be loaded.");
    } finally {
      setGmailLoading(false);
    }
  };

  useEffect(() => {
    if (canSend && mailbox?.connected && gmailMessages.length === 0)
      void loadGmailInbox("", "inbox");
  }, [canSend, mailbox?.connected]);

  const sendNow = async (message: MessageRecord) => {
    setSendingId(message.id);
    setMailboxError("");
    try {
      const response = await fetch(message.channel === "whatsapp" ? "/api/crm/whatsapp" : message.channel === "sms" ? "/api/crm/sms" : "/api/crm/mailbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send_message", messageId: message.id }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(result.error || "The message could not be sent.");
      setSentIds((prev) => new Set(prev).add(message.id));
    } catch (reason) {
      setMailboxError(
        reason instanceof Error ? reason.message : "The message could not be sent.",
      );
    } finally {
      setSendingId(null);
    }
  };

  const discarded = (message: MessageRecord) =>
    message.status.toLowerCase() === "discarded";
  const discardedCount = items.filter(discarded).length;
  const statuses = [...new Set(items.map((item) => item.status).filter(Boolean))].sort();
  const shown = (showDiscarded ? items : items.filter((m) => !discarded(m)))
    .filter((item) => !channelFilter || item.channel === channelFilter)
    .filter((item) => !statusFilter || item.status === statusFilter)
    .filter((item) => matchesSearch(query, [item.subject, item.body, item.status, messageWhen(item), cases.find((entry) => (entry.dbId || entry.id) === item.caseId)?.name]));
  const selectable = shown.filter((message) =>
    message.channel === "email" && !sentIds.has(message.id) && message.status.toLowerCase() !== "sent",
  );
  const selection = useBulkSelection(selectable);
  const draftMessages = items.filter((message) =>
    message.channel === "email" && !discarded(message) && !sentIds.has(message.id) && message.status.toLowerCase() !== "sent",
  );
  const openedGmail = gmailMessages.find((message) => message.id === openGmailId) ?? null;
  const openFolder = (folder: "inbox" | "starred" | "sent" | "drafts") => {
    setMailFolder(folder);
    setOpenGmailId(null);
    if (folder !== "drafts") void loadGmailInbox("", folder);
  };
  const formatMailDate = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };
  return (
    <section className="gmailWorkspace" aria-label="Gmail workspace">
      <header className="gmailWorkspaceHeader">
        <button className="gmailBackToCrm" onClick={onClose} title="Back to CRM dashboard">
          <ChevronLeft size={20} />
          <img src="/maximus-logo-dark.svg" alt="Maximus Education and Migration" />
        </button>
        <div className="gmailBrand"><Mail size={25} /><strong>Gmail</strong></div>
        <form className="gmailSearchBar" onSubmit={(event) => { event.preventDefault(); void loadGmailInbox(gmailSearch, mailFolder); }}>
          <Search size={20} />
          <input value={gmailSearch} onChange={(event) => setGmailSearch(event.target.value)} placeholder="Search Gmail exactly as you would in Gmail" />
          <button disabled={gmailLoading} aria-label="Search Gmail">Search</button>
        </form>
        <div className="gmailAccount">
          <span><strong>{mailbox?.email || "Maximus Gmail"}</strong><small>{mailbox?.connected ? "Connected to CRM" : "Not connected"}</small></span>
          <div>{(mailbox?.email || "MG").slice(0, 2).toUpperCase()}</div>
        </div>
      </header>
      <div className="gmailWorkspaceBody">
        <aside className="gmailFolderRail">
          <button className="gmailCompose" onClick={() => openModal("message")}><Plus size={20} />Compose</button>
          <nav>
            <button className={mailFolder === "inbox" ? "active" : ""} onClick={() => openFolder("inbox")}><Inbox size={18} /><span>Inbox</span>{gmailMessages.filter((message) => message.unread).length > 0 ? <b>{gmailMessages.filter((message) => message.unread).length}</b> : null}</button>
            <button className={mailFolder === "starred" ? "active" : ""} onClick={() => openFolder("starred")}><Star size={18} /><span>Starred</span></button>
            <button className={mailFolder === "sent" ? "active" : ""} onClick={() => openFolder("sent")}><Send size={18} /><span>Sent</span></button>
            <button className={mailFolder === "drafts" ? "active" : ""} onClick={() => openFolder("drafts")}><FileText size={18} /><span>Drafts</span>{draftMessages.length > 0 ? <b>{draftMessages.length}</b> : null}</button>
          </nav>
          <div className="gmailCaseNote"><Link2 size={15} /><span>Messages sent here remain linked to the client case.</span></div>
          {mailbox?.connected ? <button className="gmailDisconnect" onClick={() => void disconnectMailbox()}>Disconnect Gmail</button> : null}
        </aside>
        <main className="gmailMailboxPane">
          {!mailbox?.oauthConfigured || !mailbox.connected ? (
            <div className="gmailConnectState">
              <Mail size={42} />
              <h1>Connect your Gmail inbox</h1>
              <p>Open your complete Maximus mailbox here and keep every client conversation connected to the correct case.</p>
              {mailbox?.oauthConfigured ? <button onClick={() => { window.location.href = "/api/auth/gmail/start"; }}><Link2 size={17} />Connect Gmail</button> : <span>Gmail OAuth must be configured for this deployment.</span>}
              {mailboxError ? <em>{mailboxError}</em> : null}
            </div>
          ) : openedGmail ? (
            <article className="gmailReader">
              <div className="gmailMailboxToolbar">
                <button onClick={() => setOpenGmailId(null)} aria-label="Back to message list"><ChevronLeft size={19} /></button>
                <button aria-label="Archive"><Archive size={18} /></button>
                <button aria-label="Delete"><Trash2 size={18} /></button>
              </div>
              <div className="gmailReaderContent">
                <h1>{openedGmail.subject}</h1>
                <div className="gmailSenderLine"><div>{(openedGmail.sent ? openedGmail.to : openedGmail.from).slice(0, 2).toUpperCase()}</div><span><strong>{openedGmail.sent ? `To: ${openedGmail.to}` : openedGmail.from}</strong><small>to {openedGmail.sent ? openedGmail.to : openedGmail.to || mailbox.email}</small></span><time>{new Date(openedGmail.date).toLocaleString()}</time></div>
                <pre>{openedGmail.body || openedGmail.snippet}</pre>
                <div className="gmailReplyActions"><button onClick={() => openModal("message")}><ArrowRight size={16} />Reply</button><button onClick={() => openModal("message")}><Send size={16} />Forward</button></div>
              </div>
            </article>
          ) : (
            <>
              <div className="gmailMailboxToolbar">
                <input type="checkbox" aria-label="Select all messages" />
                <button disabled={gmailLoading} onClick={() => void loadGmailInbox("", mailFolder)} aria-label="Refresh inbox"><RefreshCw size={18} /></button>
                <button aria-label="Archive"><Archive size={18} /></button>
                <strong>{mailFolder === "drafts" ? "Drafts" : humanise(mailFolder)}</strong>
                <span>{mailFolder === "drafts" ? `${draftMessages.length} drafts` : `${gmailMessages.length} messages`}</span>
              </div>
              {mailboxError ? <p className="gmailMailboxError">{mailboxError}</p> : null}
              {gmailLoading ? <div className="gmailLoading"><RefreshCw size={20} />Loading messages…</div> : mailFolder === "drafts" ? (
                <div className="gmailMailList">
                  {draftMessages.length === 0 ? <div className="gmailEmptyFolder">No saved drafts.</div> : draftMessages.map((message) => (
                    <div className="gmailMailRow" key={message.id}>
                      <input type="checkbox" aria-label={`Select ${message.subject}`} />
                      <Star size={17} />
                      <button className="gmailMailOpen" onClick={() => openModal("message")}>
                        <strong>{cases.find((item) => (item.dbId || item.id) === message.caseId)?.name || "Linked case"}</strong>
                        <span><b>{message.subject}</b><em> — {message.body}</em></span>
                        <time>{messageWhen(message).replace("Drafted ", "")}</time>
                      </button>
                    </div>
                  ))}
                </div>
              ) : gmailMessages.length === 0 ? (
                <div className="gmailEmptyFolder">No messages in {mailFolder}.</div>
              ) : (
                <div className="gmailMailList">
                  {gmailMessages.map((message) => {
                    const starred = message.starred || localStars.has(message.id);
                    return <div className={`gmailMailRow ${message.unread ? "unread" : ""}`} key={message.id}>
                      <input type="checkbox" aria-label={`Select ${message.subject}`} />
                      <button className={starred ? "gmailStar starred" : "gmailStar"} onClick={() => setLocalStars((current) => { const next = new Set(current); if (next.has(message.id)) next.delete(message.id); else next.add(message.id); return next; })} aria-label={starred ? "Unstar message" : "Star message"}><Star size={17} fill={starred ? "currentColor" : "none"} /></button>
                      <button className="gmailMailOpen" onClick={() => setOpenGmailId(message.id)}>
                        <strong>{message.sent ? `To: ${message.to}` : message.from}</strong>
                        <span><b>{message.subject}</b><em> — {message.snippet}</em></span>
                        <time>{formatMailDate(message.date)}</time>
                      </button>
                    </div>;
                  })}
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </section>
  );
}

function CampaignsPanel({ items, cases, onChange }: {
  items: CampaignRecord[];
  cases: CaseRecord[];
  onChange: () => Promise<void>;
}) {
  const [creating, setCreating] = useState(false);
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");
  const send = async (payload: Record<string, unknown>) => {
    setWorking(String(payload.campaignId || "create"));
    setError("");
    try {
      const response = await fetch("/api/crm/campaigns", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The campaign action failed.");
      await onChange();
      setCreating(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The campaign action failed.");
    } finally {
      setWorking("");
    }
  };
  return (
    <article className="panel listPanel">
      <div className="panelHead">
        <div><span className="kicker">CAMPAIGNS</span><h2>Email, SMS and WhatsApp campaigns</h2></div>
        <button className="primaryButton" onClick={() => setCreating(!creating)}><Plus size={16} /> {creating ? "Close" : "New campaign"}</button>
      </div>
      <p className="coverageIntro">Build a reviewed recipient list from cases you can access. Each delivery is recorded against the campaign; free-form address uploads are not accepted.</p>
      {creating && (
        <form className="stackedForm" onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          void send({ action: "create", name: data.get("name"), channel: data.get("channel"), subject: data.get("subject"), body: data.get("body"), caseIds: data.getAll("caseIds") });
        }}>
          <label>Campaign name *<input name="name" required /></label>
          <label>Channel *<select name="channel" defaultValue="email"><option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option></select></label>
          <label>Subject (required for email)<input name="subject" /></label>
          <label>Recipients *<select name="caseIds" multiple required size={Math.min(8, Math.max(3, cases.length))}>{cases.map((item) => <option key={item.dbId || item.id} value={item.dbId || item.id}>{item.name} · {item.id}</option>)}</select><small className="fieldHint">Use Ctrl/Cmd to select multiple cases.</small></label>
          <label className="wide">Message *<textarea name="body" required placeholder="Use {{client_name}} and {{case_number}} where needed." /></label>
          <button className="primaryButton" disabled={Boolean(working)}><Check size={15} /> Save draft campaign</button>
        </form>
      )}
      {error && <p className="caseWorkError">{error}</p>}
      {items.length === 0 ? <p className="caseWorkEmpty">No campaigns have been created yet.</p> : items.map((item) => (
        <div className="functionalRow" key={item.id}>
          <div><strong>{item.name}</strong><span>{humanise(item.channel)} · {item.recipientCount} recipients · {item.sentCount} sent{item.failedCount ? ` · ${item.failedCount} failed` : ""}</span></div>
          <Status value={item.status} />
          {["draft", "failed"].includes(item.status.toLowerCase()) ? <button className="primaryButton" disabled={working === item.id} onClick={() => {
            if (confirm(`Send “${item.name}” to ${item.recipientCount} selected case${item.recipientCount === 1 ? "" : "s"}?`)) void send({ action: "launch", campaignId: item.id });
          }}><Send size={14} /> {working === item.id ? "Sending…" : "Review & send"}</button> : null}
        </div>
      ))}
    </article>
  );
}
function FinanceView({
  items,
  openModal,
  setItems,
  canManage,
  onRefund,
  onCreditNote,
  onPayment,
  onReminder,
  onBulkAction,
}: {
  items: InvoiceRecord[];
  openModal: (x: ModalType) => void;
  setItems: (x: InvoiceRecord[]) => void;
  // Invoices are writable only by manager level and above, so a case officer
  // sees the ledger without controls the database would refuse.
  canManage: boolean;
  onRefund: (invoice: InvoiceRecord) => void;
  onCreditNote: (invoice: InvoiceRecord) => void;
  onPayment: (invoice: InvoiceRecord) => void;
  onReminder: (invoice: InvoiceRecord) => void;
  onBulkAction: (resource: string, operation: string, ids: string[]) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const total = items.reduce((s, x) => s + x.amount, 0);
  const statuses = [...new Set(items.map((item) => item.status).filter(Boolean))].sort();
  const types = [...new Set(items.map((item) => item.type).filter(Boolean))].sort();
  const shown = items
    .filter((item) => !status || item.status === status)
    .filter((item) => !type || item.type === type)
    .filter((item) => matchesSearch(query, [item.invoiceNumber, item.client, item.type, item.status, item.due, item.amount]));
  const selection = useBulkSelection(shown);
  return (
    <>
      <div className="miniStats">
        <article>
          <span>Total invoiced</span>
          <strong>${total.toLocaleString()}</strong>
          <small>{items.length} invoices</small>
        </article>
        <article>
          <span>Outstanding</span>
          <strong>
            $
            {items
              .filter((x) => x.status !== "Paid")
              .reduce((s, x) => s + x.amount, 0)
              .toLocaleString()}
          </strong>
          <small>Live CRM total</small>
        </article>
        <article>
          <span>Paid</span>
          <strong>
            $
            {items
              .filter((x) => x.status === "Paid")
              .reduce((s, x) => s + x.amount, 0)
              .toLocaleString()}
          </strong>
          <small>Live CRM total</small>
        </article>
      </div>
      <article className="panel listPanel">
        <div className="panelHead">
          <div>
            <span className="kicker">INVOICES</span>
            <h2>Financial records</h2>
          </div>
          {canManage && (
            <button
              className="primaryButton"
              onClick={() => openModal("invoice")}
            >
              <Plus size={16} />
              New invoice
            </button>
          )}
        </div>
        <ListFilterBar query={query} onQuery={setQuery} placeholder="Search invoice number, client, type or due date" resultCount={shown.length}>
          <label className="compactFilter">Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{statuses.map((item) => <option key={item} value={item}>{humanise(item)}</option>)}</select></label>
          <label className="compactFilter">Type<select value={type} onChange={(event) => setType(event.target.value)}><option value="">All types</option>{types.map((item) => <option key={item} value={item}>{humanise(item)}</option>)}</select></label>
        </ListFilterBar>
        {shown.length === 0 ? (
          <EmptyState
            icon={CircleDollarSign}
            title="No invoices"
            copy={
              canManage
                ? "Create an invoice to start tracking fees and payments."
                : "Invoices raised by your managers will appear here."
            }
            action={canManage ? "Create invoice" : undefined}
            onAction={canManage ? () => openModal("invoice") : undefined}
          />
        ) : (
          <>
          <div className="listSelectionTools">
            <SelectAllControl checked={selection.allSelected} onChange={selection.toggleAll} />
          </div>
          <BulkActionBar count={selection.selected.length} onClear={selection.clear}>
            <button className="ghostButton" onClick={() => downloadCsv("invoices-selected.csv", selection.selected.map((invoice) => ({
              invoiceNumber: invoice.invoiceNumber, client: invoice.client,
              type: invoice.type, currency: invoice.currency, subtotal: invoice.subtotal,
              tax: invoice.tax, total: invoice.amount, paid: invoice.paid,
              balance: invoice.balance, issued: invoice.issued, due: invoice.due,
              status: invoice.status,
            })))}><Download size={14} /> Export selected</button>
            {canManage && (
              <button className="ghostButton dangerAction" onClick={async () => {
                if (!confirm(`Void ${selection.selected.length} selected invoice${selection.selected.length === 1 ? "" : "s"}? This keeps the accounting history and cannot be changed back here.`)) return;
                await onBulkAction("invoice", "delete", selection.selected.map((item) => item.id));
                selection.clear();
              }}><Trash2 size={14} /> Void selected</button>
            )}
          </BulkActionBar>
          {shown.map((i) => (
            <div className="functionalRow bulkEnabled" key={i.id}>
              <RowSelection checked={selection.selectedIds.has(i.id)} onChange={() => selection.toggle(i.id)} label={`Select invoice ${i.invoiceNumber || i.client}`} />
              <div>
                <strong>{i.invoiceNumber || i.client}</strong>
                <span>{i.client} · Due {i.due || "not set"}</span>
              </div>
              <b>{i.currency} {i.amount.toLocaleString()}</b>
              {i.pdfDocumentId ? (
                <a className="ghostButton" href={`/api/crm/documents?documentId=${i.pdfDocumentId}`}>
                  <FileText size={14} /> Invoice PDF
                </a>
              ) : null}
              {canManage ? (
                <>
                  <button
                    className="ghostButton"
                    onClick={() => onPayment(i)}
                    disabled={i.balance <= 0 || i.status === "Void"}
                  >
                    Record payment
                  </button>
                  {i.status === "Paid" && (
                    <button className="ghostButton" onClick={() => onRefund(i)}>
                      Record refund
                    </button>
                  )}
                  {i.status !== "Paid" && i.status !== "Void" && (
                    <button className="ghostButton" onClick={() => onCreditNote(i)}>
                      Credit note
                    </button>
                  )}
                  {i.balance > 0 && i.status !== "Void" ? (
                    <button className="ghostButton" onClick={() => onReminder(i)}>Send reminder</button>
                  ) : null}
                  <button
                    className="iconButton"
                    onClick={() => setItems(items.filter((x) => x.id !== i.id))}
                    aria-label="Delete invoice"
                    title="Delete invoice"
                  >
                    <Trash2 size={16} />
                  </button>
                </>
              ) : (
                <Status value={i.status} />
              )}
            </div>
          ))}
          </>
        )}
      </article>
    </>
  );
}
/** Commissions an institution or partner owes the agency -- a table that
 * existed with no way in or out of it: raised nowhere, received nowhere. */
function CommissionClaimsPanel({
  items,
  cases,
  canManage,
  onCreate,
  onMarkReceived,
  onSendInvoice,
  onSendReceipt,
}: {
  items: CommissionClaimRecord[];
  cases: CaseRecord[];
  canManage: boolean;
  onCreate: (data: { counterpartyType: string; partnerName: string; institution: string; counterpartyEmail: string; netAmount: number; taxRate: number; currency: string; dueOn: string; caseIds: string[] }) => void;
  onMarkReceived: (claim: CommissionClaimRecord) => void;
  onSendInvoice: (claim: CommissionClaimRecord) => void;
  onSendReceipt: (claim: CommissionClaimRecord) => void;
}) {
  const [adding, setAdding] = useState(false);
  if (!canManage) return null;
  return (
    <article className="panel listPanel">
      <div className="panelHead">
        <div>
          <span className="kicker">COMMISSIONS</span>
          <h2>Partner and institution claims</h2>
        </div>
        <button className="primaryButton" onClick={() => setAdding(!adding)}>
          <Plus size={16} />
          {adding ? "Close" : "New claim"}
        </button>
      </div>
      {adding && (
        <form
          className="stackedForm"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            onCreate({
              counterpartyType: String(data.get("counterpartyType") || "partner"),
              partnerName: String(data.get("partnerName") || ""),
              institution: String(data.get("institution") || ""),
              counterpartyEmail: String(data.get("counterpartyEmail") || ""),
              netAmount: Number(data.get("netAmount") || 0),
              taxRate: Number(data.get("taxRate") || 0),
              currency: String(data.get("currency") || "AUD"),
              dueOn: String(data.get("dueOn") || ""),
              caseIds: data.getAll("caseIds").map(String),
            });
            setAdding(false);
          }}
        >
          <label>
            Account type
            <select name="counterpartyType" defaultValue="partner">
              <option value="partner">Partner invoice</option>
              <option value="university">University invoice</option>
            </select>
          </label>
          <label>
            Partner / university *<input name="partnerName" required />
          </label>
          <label>
            Institution
            <input name="institution" />
          </label>
          <label>
            Accounts email
            <input name="counterpartyEmail" type="email" />
          </label>
          <label>
            Net commission *
            <input name="netAmount" type="number" min="0.01" step="0.01" required />
          </label>
          <label>
            Tax %
            <input name="taxRate" type="number" min="0" max="100" step="0.01" defaultValue="0" />
          </label>
          <label>
            Currency
            <select name="currency" defaultValue="AUD">
              {["AUD", "USD", "GBP", "CAD", "NZD", "AED", "EUR", "INR", "LKR"].map((currency) => <option key={currency}>{currency}</option>)}
            </select>
          </label>
          <label>
            Due
            <input name="dueOn" type="date" />
          </label>
          <label>
            Students included
            <select name="caseIds" multiple size={Math.min(8, Math.max(3, cases.length))}>
              {cases.filter((caseItem) => caseItem.dbId).map((caseItem) => (
                <option key={caseItem.id} value={caseItem.dbId}>{caseItem.name} · {caseItem.id}</option>
              ))}
            </select>
          </label>
          <div className="formActions">
            <button className="primaryButton">
              <Check size={15} />
              Raise claim
            </button>
          </div>
        </form>
      )}
      {items.length === 0 ? (
        <EmptyState
          icon={CircleDollarSign}
          title="No commission claims"
          copy="Raise a claim when a partner or institution owes the agency a commission."
          action="New claim"
          onAction={() => setAdding(true)}
        />
      ) : (
        items.map((claim) => (
          <div className="functionalRow" key={claim.id}>
            <div>
              <strong>{claim.invoiceNumber || "Commission invoice"} · {claim.partnerName}</strong>
              <span>
                {claim.counterpartyType === "university" ? "University" : "Partner"}
                {claim.institution ? ` · ${claim.institution}` : ""}
                {` · ${claim.studentCount} student${claim.studentCount === 1 ? "" : "s"}`}
                {claim.dueOn ? ` · Due ${claim.dueOn}` : ""}
              </span>
              <span>Net {claim.currency} {claim.netAmount.toLocaleString()} · Tax {claim.taxRate}% ({claim.taxAmount.toLocaleString()})</span>
            </div>
            <b>
              {claim.currency} {claim.receivedAmount.toLocaleString()} received · {claim.pendingAmount.toLocaleString()} pending
            </b>
            <div className="rowActions">
              <button className="ghostButton" onClick={() => onSendInvoice(claim)}>Send invoice</button>
              {claim.receivedAmount > 0 ? <button className="ghostButton" onClick={() => onSendReceipt(claim)}>Send receipt</button> : null}
              {claim.status !== "received" ? (
              <button
                className="ghostButton"
                onClick={() => onMarkReceived(claim)}
              >
                Add payment
              </button>
              ) : <Status value="Received" />}
            </div>
          </div>
        ))
      )}
    </article>
  );
}
function TemplatesView({
  items,
  openModal,
  setItems,
  canManage,
  onBulkAction,
}: {
  items: TemplateRecord[];
  openModal: (x: ModalType) => void;
  setItems: (x: TemplateRecord[]) => void;
  // Approved templates are writable only by manager level and above.
  canManage: boolean;
  onBulkAction: (resource: string, operation: string, ids: string[]) => Promise<void>;
}) {
  const selection = useBulkSelection(items);
  return (
    <article className="panel listPanel">
      <div className="panelHead">
        <div>
          <span className="kicker">APPROVED CONTENT</span>
          <h2>Templates</h2>
        </div>
        {canManage && (
          <button
            className="primaryButton"
            onClick={() => openModal("template")}
          >
            <Plus size={16} />
            New template
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <EmptyState
          icon={FileCheck2}
          title="No templates"
          copy={
            canManage
              ? "Create reusable emails, notes and document requests."
              : "Approved templates published by your managers will appear here."
          }
          action={canManage ? "Create template" : undefined}
          onAction={canManage ? () => openModal("template") : undefined}
        />
      ) : (
        <>
        <div className="listSelectionTools">
          <SelectAllControl checked={selection.allSelected} onChange={selection.toggleAll} />
        </div>
        <BulkActionBar count={selection.selected.length} onClear={selection.clear}>
          <button className="ghostButton" onClick={() => navigator.clipboard?.writeText(selection.selected.map((item) => `${item.name}\n${item.content}`).join("\n\n---\n\n")).then(() => alert("Selected templates copied."))}>
            Copy selected
          </button>
          {canManage && <button className="ghostButton dangerAction" onClick={async () => {
            if (!confirm(`Delete ${selection.selected.length} selected template${selection.selected.length === 1 ? "" : "s"}?`)) return;
            await onBulkAction("template", "delete", selection.selected.map((item) => item.id));
            selection.clear();
          }}><Trash2 size={14} /> Delete</button>}
        </BulkActionBar>
        {items.map((t) => (
          <div className="functionalRow bulkEnabled" key={t.id}>
            <RowSelection checked={selection.selectedIds.has(t.id)} onChange={() => selection.toggle(t.id)} label={`Select ${t.name}`} />
            <div className="docIcon">
              <FileText size={17} />
            </div>
            <div>
              <strong>{t.name}</strong>
              <span>
                {t.type} · Updated {orgDate(t.updatedAt)}
              </span>
            </div>
            <button
              className="ghostButton"
              onClick={() =>
                navigator.clipboard
                  ?.writeText(t.content)
                  .then(() => alert("Template copied."))
              }
            >
              Copy
            </button>
            {canManage && (
              <button
                className="iconButton"
                onClick={() => setItems(items.filter((x) => x.id !== t.id))}
                aria-label="Delete template"
                title="Delete template"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        ))}
        </>
      )}
    </article>
  );
}

function TemplatesWorkspace({
  items, checklistTemplates, emailTemplates, openModal, setItems,
  canManage, reloadChecklist, reloadEmails, onBulkAction,
}: {
  items: TemplateRecord[]; checklistTemplates: ChecklistTemplateRecord[];
  emailTemplates: EmailTemplateRecord[]; openModal: (x: ModalType) => void;
  setItems: (x: TemplateRecord[]) => void; canManage: boolean;
  reloadChecklist: () => Promise<void>; reloadEmails: () => Promise<void>;
  onBulkAction: (resource: string, operation: string, ids: string[]) => Promise<void>;
}) {
  const [section, setSection] = useState<"documents" | "emails" | "content">("documents");
  const sections = [
    { key: "documents" as const, label: "Document requests", icon: FileCheck2, count: checklistTemplates.length },
    { key: "emails" as const, label: "Client emails", icon: Mail, count: emailTemplates.length },
    { key: "content" as const, label: "Reusable content", icon: FileText, count: items.length },
  ];
  return (
    <section className="templateWorkspace">
      <div className="templateWorkspaceIntro">
        <div>
          <span className="kicker">CONTROL CENTRE</span>
          <h2>Standardise every client interaction</h2>
          <p>Maintain the approved requests and messages your team uses every day, without making staff search through one long settings page.</p>
        </div>
        <div className="templateWorkspaceSummary">
          <strong>{checklistTemplates.filter((item) => item.active).length}</strong>
          <span>active document requests</span>
        </div>
      </div>
      <div className="templateWorkspaceTabs" role="tablist" aria-label="Template types">
        {sections.map(({ key, label, icon: Icon, count }) => (
          <button key={key} role="tab" aria-selected={section === key}
            className={section === key ? "active" : ""} onClick={() => setSection(key)}>
            <Icon size={17} /><span>{label}</span><b>{count}</b>
          </button>
        ))}
      </div>
      {section === "documents" && <DocumentChecklistTemplatesPanel templates={checklistTemplates} canManage={canManage} reload={reloadChecklist} />}
      {section === "emails" && <EmailTemplatesPanel templates={emailTemplates} canManage={canManage} reload={reloadEmails} />}
      {section === "content" && <TemplatesView items={items} openModal={openModal} setItems={setItems} canManage={canManage} onBulkAction={onBulkAction} />}
    </section>
  );
}
function WorkflowView({
  items,
  openModal,
  setItems,
  canManage,
  onBulkAction,
}: {
  items: WorkflowRecord[];
  openModal: (x: ModalType) => void;
  setItems: (x: WorkflowRecord[]) => void;
  canManage: boolean;
  onBulkAction: (resource: string, operation: string, ids: string[], extra?: Record<string, unknown>) => Promise<void>;
}) {
  const selection = useBulkSelection(items);
  return (
    <article className="panel listPanel">
      <div className="panelHead">
        <div>
          <span className="kicker">CASE WORKFLOWS</span>
          <h2>Stage templates</h2>
        </div>
        {canManage && (
          <button
            className="primaryButton"
            onClick={() => openModal("workflow")}
          >
            <Plus size={16} />
            New workflow
          </button>
        )}
      </div>
      <p className="coverageIntro">
        Every case also follows the fixed pipeline — enquiry, student,
        application, visa and completed. These templates add the stages your
        team works through inside it.
      </p>
      {items.length === 0 ? (
        <EmptyState
          icon={Workflow}
          title="No workflows yet"
          copy={
            canManage
              ? "Create a workflow to define the stages a case moves through."
              : "Workflows published by your managers will appear here."
          }
          action={canManage ? "Create workflow" : undefined}
          onAction={canManage ? () => openModal("workflow") : undefined}
        />
      ) : (
        <>
        <div className="listSelectionTools">
          <SelectAllControl checked={selection.allSelected} onChange={selection.toggleAll} />
        </div>
        <BulkActionBar count={selection.selected.length} onClear={selection.clear}>
          {canManage && <>
            <button className="ghostButton" onClick={async () => { await onBulkAction("workflow", "toggle", selection.selected.map((item) => item.id), { active: true }); selection.clear(); }}>Activate</button>
            <button className="ghostButton" onClick={async () => { await onBulkAction("workflow", "toggle", selection.selected.map((item) => item.id), { active: false }); selection.clear(); }}>Deactivate</button>
          </>}
          <button className="ghostButton" onClick={() => downloadCsv("workflow-templates-selected.csv", selection.selected.map((item) => ({ name: item.name, stages: item.stages, active: item.active })))}><Download size={14} /> Export</button>
        </BulkActionBar>
        {items.map((w) => (
          <div className="functionalRow bulkEnabled" key={w.id}>
            <RowSelection checked={selection.selectedIds.has(w.id)} onChange={() => selection.toggle(w.id)} label={`Select ${w.name}`} />
            <div className="workflowIcon">
              <Workflow size={17} />
            </div>
            <div>
              <strong>{w.name}</strong>
              <span>
                {w.stages.length
                  ? w.stages.join(" → ")
                  : "No stages configured"}
              </span>
            </div>
            <Status value={w.active ? "Active" : "Inactive"} />
            {canManage && (
              <button
                className="ghostButton"
                onClick={() =>
                  setItems(
                    items.map((x) =>
                      x.id === w.id ? { ...x, active: !x.active } : x,
                    ),
                  )
                }
              >
                {w.active ? "Deactivate" : "Activate"}
              </button>
            )}
          </div>
        ))}
        </>
      )}
    </article>
  );
}

/**
 * The document-request checklist offered on any case, not just a visa
 * matter -- masters data now, so an agency can add, reword or retire an
 * item without a code change. Every organisation starts with the same 35
 * items the code used to hard-code; this is where they get edited from
 * that point on.
 */
function DocumentChecklistTemplatesPanel({
  templates,
  canManage,
  reload,
}: {
  templates: ChecklistTemplateRecord[];
  canManage: boolean;
  reload: () => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [editingKey, setEditingKey] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");

  const send = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/crm/document-checklist-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(result.error || "That could not be saved.");
        return false;
      }
      await reload();
      return true;
    } finally {
      setBusy(false);
    }
  };

  const categories = [...new Set(templates.map((item) => item.category))].sort();
  const visibleTemplates = templates.filter((item) => {
    const haystack = `${item.title} ${item.guidance} ${item.category}`.toLowerCase();
    return (!query.trim() || haystack.includes(query.trim().toLowerCase())) &&
      (categoryFilter === "all" || item.category === categoryFilter) &&
      (statusFilter === "all" || (statusFilter === "active" ? item.active : !item.active));
  });
  const byCategory = new Map<string, ChecklistTemplateRecord[]>();
  for (const t of visibleTemplates)
    byCategory.set(t.category, [...(byCategory.get(t.category) ?? []), t]);
  const checklistSelection = useBulkSelection(
    visibleTemplates.map((item) => ({ ...item, id: item.key })),
  );

  const bulkSetActive = async (active: boolean) => {
    const ok = await send({
      action: "bulk_update",
      templateIds: checklistSelection.selected.map((item) => item.key),
      active,
    });
    if (ok) checklistSelection.clear();
  };

  return (
    <article className="panel listPanel checklistTemplatesPanel">
      <div className="panelHead">
        <div>
          <span className="kicker">DOCUMENT REQUESTS</span>
          <h2>Document checklist</h2>
        </div>
        {canManage && (
          <button className="primaryButton" onClick={() => setAdding(!adding)}>
            <Plus size={16} />
            {adding ? "Close" : "Add item"}
          </button>
        )}
      </div>
      <p className="coverageIntro">
        What &ldquo;Document checklist&rdquo; offers when requesting documents
        from a client, on any case. Deactivating an item removes it from new
        requests without touching anything already asked for under it.
      </p>
      {templates.length > 0 && (
        <div className="templateFilters">
          <label className="templateSearch"><Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search document requests" aria-label="Search document requests" />
          </label>
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} aria-label="Filter by category">
            <option value="all">All categories</option>
            {categories.map((category) => <option value={category} key={category}>{category}</option>)}
          </select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by status">
            <option value="active">Active only</option><option value="inactive">Inactive only</option><option value="all">All statuses</option>
          </select>
          <span className="templateResultCount">{visibleTemplates.length} of {templates.length}</span>
        </div>
      )}
      {error && <p className="caseWorkError">{error}</p>}
      {adding && (
        <form
          className="stackedForm"
          onSubmit={async (event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const ok = await send({
              action: "create",
              category: data.get("category"),
              title: data.get("title"),
              guidance: data.get("guidance"),
            });
            if (ok) setAdding(false);
          }}
        >
          <label>
            Category *<input name="category" required placeholder="e.g. Identity" />
          </label>
          <label>
            Title *<input name="title" required placeholder="e.g. Passport bio page" />
          </label>
          <label className="wide">
            Guidance
            <input name="guidance" placeholder="What the client should actually send" />
          </label>
          <button className="primaryButton" disabled={busy}>
            {busy ? "Saving…" : "Add to checklist"}
          </button>
        </form>
      )}
      {templates.length === 0 ? (
        <EmptyState
          icon={FileCheck2}
          title="No checklist items yet"
          copy={
            canManage
              ? "Add the documents your team asks clients for most often."
              : "Your managers have not set up the document checklist yet."
          }
          action={canManage ? "Add item" : undefined}
          onAction={canManage ? () => setAdding(true) : undefined}
        />
      ) : visibleTemplates.length === 0 ? (
        <EmptyState icon={Search} title="No matching document requests" copy="Clear a filter or search with a broader phrase." />
      ) : (
        <>
        <div className="listSelectionTools">
          <SelectAllControl checked={checklistSelection.allSelected} onChange={checklistSelection.toggleAll} />
        </div>
        <BulkActionBar count={checklistSelection.selected.length} onClear={checklistSelection.clear}>
          {canManage && <>
            <button className="ghostButton" disabled={busy} onClick={() => void bulkSetActive(true)}>Activate selected</button>
            <button className="ghostButton" disabled={busy} onClick={() => void bulkSetActive(false)}>Deactivate selected</button>
          </>}
          <button className="ghostButton" onClick={() => downloadCsv("document-checklist-selected.csv", checklistSelection.selected.map((item) => ({ category: item.category, title: item.title, guidance: item.guidance, status: item.active ? "Active" : "Inactive" })))}><Download size={14} /> Export</button>
        </BulkActionBar>
        {[...byCategory.entries()].map(([category, items]) => (
          <div key={category}>
            <h3 className="documentClientGroupHead">{category}</h3>
            {items.map((item) =>
              editingKey === item.key ? (
                <form
                  className="stackedForm"
                  key={item.key}
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const data = new FormData(event.currentTarget);
                    const ok = await send({
                      action: "update",
                      templateId: item.key,
                      category: data.get("category"),
                      title: data.get("title"),
                      guidance: data.get("guidance"),
                    });
                    if (ok) setEditingKey("");
                  }}
                >
                  <label>
                    Category *
                    <input name="category" required defaultValue={item.category} />
                  </label>
                  <label>
                    Title *<input name="title" required defaultValue={item.title} />
                  </label>
                  <label className="wide">
                    Guidance
                    <input name="guidance" defaultValue={item.guidance} />
                  </label>
                  <button className="primaryButton" disabled={busy}>
                    {busy ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    className="ghostButton"
                    onClick={() => setEditingKey("")}
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <div className="functionalRow bulkEnabled" key={item.key}>
                  <RowSelection checked={checklistSelection.selectedIds.has(item.key)} onChange={() => checklistSelection.toggle(item.key)} label={`Select ${item.title}`} />
                  <div className="docIcon">
                    <FileCheck2 size={17} />
                  </div>
                  <div>
                    <strong>{item.title}</strong>
                    <span>{item.guidance || "No guidance added"}</span>
                  </div>
                  <Status value={item.active ? "Active" : "Inactive"} />
                  {canManage && (
                    <>
                      <button
                        className="ghostButton"
                        onClick={() => setEditingKey(item.key)}
                      >
                        Edit
                      </button>
                      <button
                        className="ghostButton"
                        disabled={busy}
                        onClick={() =>
                          void send({
                            action: "update",
                            templateId: item.key,
                            active: !item.active,
                          })
                        }
                      >
                        {item.active ? "Deactivate" : "Activate"}
                      </button>
                    </>
                  )}
                </div>
              ),
            )}
          </div>
        ))}
        </>
      )}
    </article>
  );
}

const EMAIL_TEMPLATE_LABELS: Record<string, string> = {
  document_request: "Document requested",
  invoice_request: "Invoice raised",
  portal_welcome: "Portal access sent",
};

function EmailTemplatesPanel({
  templates,
  canManage,
  reload,
}: {
  templates: EmailTemplateRecord[];
  canManage: boolean;
  reload: () => Promise<void>;
}) {
  const [editingId, setEditingId] = useState("");
  const [previewId, setPreviewId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async (templateId: string, subject: string, body: string) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/crm/email-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", templateId, subject, body }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(result.error || "That could not be saved.");
        return false;
      }
      await reload();
      return true;
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="panel listPanel checklistTemplatesPanel">
      <div className="panelHead">
        <div>
          <span className="kicker">CLIENT NOTICES</span>
          <h2>Email templates</h2>
        </div>
      </div>
      <p className="coverageIntro">
        What the CRM sends a client on its own: a document request, an
        invoice, and the message that goes out when a staff member sends
        portal access. <code>{"{{tokens}}"}</code> are filled in automatically
        when each email is sent.
      </p>
      {error && <p className="caseWorkError">{error}</p>}
      {templates.length === 0 ? (
        <EmptyState
          icon={Mail}
          title="Email templates are not set up yet"
          copy="These are seeded automatically for every organisation. Reload if you don't see them."
        />
      ) : (
        templates.map((item) =>
          editingId === item.id ? (
            <form
              className="stackedForm"
              key={item.id}
              onSubmit={async (event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                const ok = await save(
                  item.id,
                  String(data.get("subject") || ""),
                  String(data.get("body") || ""),
                );
                if (ok) setEditingId("");
              }}
            >
              <label className="wide">
                Subject *
                <input name="subject" required defaultValue={item.subject} />
              </label>
              <label className="wide">
                Body *
                <textarea name="body" required rows={6} defaultValue={item.body} />
              </label>
              <button className="primaryButton" disabled={busy}>
                {busy ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                className="ghostButton"
                onClick={() => setEditingId("")}
              >
                Cancel
              </button>
            </form>
          ) : (
            <div className="emailTemplateCard" key={item.id}>
              <div className="emailTemplateCardHead">
                <div className="docIcon"><Mail size={17} /></div>
                <div><strong>{EMAIL_TEMPLATE_LABELS[item.kind] || item.kind}</strong><span>{item.subject}</span></div>
                <button className="ghostButton" onClick={() => setPreviewId(previewId === item.id ? "" : item.id)}>
                  <Eye size={15} />{previewId === item.id ? "Close preview" : "Preview"}
                </button>
                {canManage && <button className="primaryButton" onClick={() => setEditingId(item.id)}><Pencil size={15} />Edit wording</button>}
              </div>
              {previewId === item.id && (
                <div className="emailTemplatePreview">
                  <div><b>Subject</b><p>{item.subject}</p></div>
                  <div><b>Message</b><p>{item.body}</p></div>
                  <div className="templateTokens"><b>Automatic fields</b>
                    {[...new Set(`${item.subject} ${item.body}`.match(/{{[^}]+}}/g) || [])].map((token) => <code key={token}>{token}</code>)}
                  </div>
                </div>
              )}
            </div>
          ),
        )
      )}
    </article>
  );
}

const REQUIRED_CONSENTS: { type: string; label: string; detail: string }[] = [
  {
    type: "privacy_policy",
    label: "Privacy policy",
    detail: "How Maximus collects, stores and uses your personal information.",
  },
  {
    type: "data_processing",
    label: "Data processing consent",
    detail:
      "Sharing what your case needs with institutions, visa authorities and other parties involved in it.",
  },
];

function PortalView({
  cases,
  journeyHistory,
  declarations,
}: {
  cases: CaseRecord[];
  journeyHistory: JourneyMilestone[];
  declarations: ClientDeclaration[];
}) {
  const [editingContact, setEditingContact] = useState(false);
  const [contactError, setContactError] = useState("");
  const [savingContact, setSavingContact] = useState(false);
  const [consentError, setConsentError] = useState("");
  const [savingConsent, setSavingConsent] = useState("");

  const c = cases[0];
  if (!c)
    return (
      <article className="panel clientEmpty">
        <div>
          <GraduationCap size={28} />
        </div>
        <h2>No client account is linked yet</h2>
        <p>
          This restricted portal will display only the student/client record
          linked to the signed-in account. No demonstration data has been
          added.
        </p>
        <button
          className="ghostButton"
          onClick={() =>
            alert(
              "Please contact your Maximus case officer to link your account.",
            )
          }
        >
          Contact Maximus
        </button>
      </article>
    );

  const milestones = journeyHistory
    .filter((row) => row.caseId === c.dbId)
    .slice()
    .reverse();
  const ownDeclarations = declarations.filter((row) => row.clientId === c.clientId);
  const acknowledge = async (type: string) => {
    setSavingConsent(type);
    setConsentError("");
    try {
      const response = await fetch("/api/crm/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "acknowledge_consent",
          declarationType: type,
          response: true,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "That could not be recorded.");
      window.location.reload();
    } catch (reason) {
      setConsentError(reason instanceof Error ? reason.message : "That could not be recorded.");
    } finally {
      setSavingConsent("");
    }
  };

  return (
    <section className="clientPortal">
      <article className="clientWelcome">
        <div>
          <span>PRIVATE CLIENT PORTAL</span>
          <h2>Welcome, {c.name}.</h2>
          <p>
            Your {c.type.toLowerCase()} journey is currently at {c.stage}.
          </p>
        </div>
        <div className="clientAvatar">
          {c.name
            .split(" ")
            .map((x) => x[0])
            .slice(0, 2)
            .join("")}
        </div>
      </article>
      <article className="panel journeyProgress">
        <div className="panelHead">
          <div>
            <span className="kicker">YOUR JOURNEY</span>
            <h2>{c.target || c.type}</h2>
          </div>
          <Status value={c.health} />
        </div>
        <div className="clientNext">
          <div className="nextIcon">
            <Check size={20} />
          </div>
          <div>
            <span>CURRENT STAGE</span>
            <strong>{c.stage}</strong>
            <small>{c.due ? `Due ${c.due}` : "No deadline set"}</small>
          </div>
          <button
            className="heroPrimary"
            onClick={() =>
              alert(
                "Your next action and approved instructions will appear here.",
              )
            }
          >
            View next step
          </button>
        </div>
        {milestones.length > 0 && (
          <div className="journeyTimeline">
            <span className="kicker">HOW YOU GOT HERE</span>
            {milestones.map((m, index) => (
              <div className="journeyStep" key={`${m.at}-${index}`}>
                <div className="journeyDot" />
                <div>
                  <strong>{m.toStage}</strong>
                  <small>
                    {m.fromStage ? `from ${m.fromStage} · ` : ""}
                    {orgDateTime(m.at)}
                  </small>
                </div>
              </div>
            ))}
          </div>
        )}
      </article>

      <article className="panel listPanel">
        <div className="panelHead">
          <div>
            <span className="kicker">MY DETAILS</span>
            <h2>Contact information</h2>
          </div>
          <button className="ghostButton" onClick={() => setEditingContact(!editingContact)}>
            {editingContact ? "Close" : "Edit"}
          </button>
        </div>
        {editingContact ? (
          <form
            className="stackedForm"
            onSubmit={async (event) => {
              event.preventDefault();
              setSavingContact(true);
              setContactError("");
              const data = new FormData(event.currentTarget);
              try {
                const response = await fetch("/api/crm/workspace", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    action: "update_own_contact",
                    email: data.get("email"),
                    mobile: data.get("mobile"),
                    preferredName: data.get("preferredName"),
                  }),
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || "Your details could not be updated.");
                window.location.reload();
              } catch (reason) {
                setContactError(
                  reason instanceof Error ? reason.message : "Your details could not be updated.",
                );
              } finally {
                setSavingContact(false);
              }
            }}
          >
            <label>
              Email
              <input name="email" type="email" defaultValue={c.email} />
            </label>
            <label>
              Mobile
              <input name="mobile" type="tel" defaultValue={c.phone} />
            </label>
            <label>
              Preferred name
              <input name="preferredName" placeholder="What should we call you?" />
            </label>
            {contactError && <p className="caseWorkError">{contactError}</p>}
            <button className="primaryButton" type="submit" disabled={savingContact}>
              {savingContact ? "Saving…" : "Save changes"}
            </button>
          </form>
        ) : (
          <div className="functionalRow">
            <div>
              <strong>{c.email || "No email on file"}</strong>
              <span>{c.phone || "No mobile on file"}</span>
            </div>
          </div>
        )}
      </article>

      <article className="panel listPanel">
        <div className="panelHead">
          <div>
            <span className="kicker">CONSENT</span>
            <h2>Privacy and data acknowledgements</h2>
          </div>
        </div>
        {consentError && <p className="caseWorkError">{consentError}</p>}
        {REQUIRED_CONSENTS.map((item) => {
          const given = ownDeclarations.find(
            (row) => row.type === item.type && row.response === true,
          );
          return (
            <div className="functionalRow" key={item.type}>
              <div>
                <strong>{item.label}</strong>
                <span>{item.detail}</span>
              </div>
              {given ? (
                <Status value="Acknowledged" />
              ) : (
                <button
                  className="ghostButton"
                  disabled={savingConsent === item.type}
                  onClick={() => void acknowledge(item.type)}
                >
                  {savingConsent === item.type ? "Saving…" : "I acknowledge"}
                </button>
              )}
            </div>
          );
        })}
      </article>
    </section>
  );
}

function ClientModuleView({
  module,
  client,
  appointments,
  documents,
  storageConnected,
  messages,
  invoices,
  openModal,
}: {
  module: ModuleKey;
  client: CaseRecord | undefined;
  appointments: AppointmentRecord[];
  documents: DocumentRecord[];
  storageConnected: boolean;
  messages: MessageRecord[];
  invoices: InvoiceRecord[];
  openModal: (x: ModalType) => void;
}) {
  const [uploading, setUploading] = useState("");
  const [portalError, setPortalError] = useState("");
  const [confirming, setConfirming] = useState("");
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set());
  const [appointmentQuery, setAppointmentQuery] = useState("");
  const [documentQuery, setDocumentQuery] = useState("");
  const [messageQuery, setMessageQuery] = useState("");
  const [invoiceQuery, setInvoiceQuery] = useState("");
  const ownAppointments = appointments
    .filter((x) => Boolean(client) && x.client === client?.name)
    .filter((x) => matchesSearch(appointmentQuery, [x.title, x.date, x.time, x.type]));
  const ownDocuments = documents.filter(
    (x) => Boolean(client) && x.client === client?.name && x.clientVisible !== false && x.status !== "archived",
  ).filter((x) => matchesSearch(documentQuery, [x.title, x.folder, x.fileName, x.status]));
  const ownMessages = messages
    .filter((x) => Boolean(client) && x.caseId === client?.id)
    .filter((x) => matchesSearch(messageQuery, [x.subject, x.body, x.status, messageWhen(x)]));
  const ownInvoices = invoices.filter(
    (x) => Boolean(client) && x.client === client?.name && CLIENT_INVOICE_TYPES.includes(x.type),
  ).filter((x) => matchesSearch(invoiceQuery, [x.invoiceNumber, x.type, x.status, x.due, x.amount]));
  const appointmentSelection = useBulkSelection(ownAppointments);
  const documentSelection = useBulkSelection(ownDocuments);
  const messageSelection = useBulkSelection(ownMessages);
  const invoiceSelection = useBulkSelection(ownInvoices);
  // Acknowledging a document or invoice request reached them -- recorded on
  // the case history and told to the case owner. It never changes the
  // record's own state, so the confirmation is tracked locally rather than
  // read back from a field that does not exist on it.
  const confirmReceipt = async (kind: "confirm_document" | "confirm_invoice", id: string) => {
    setConfirming(id);
    setPortalError("");
    try {
      const response = await fetch("/api/crm/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: kind, id }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(result.error || "That could not be confirmed.");
      setConfirmedIds((current) => new Set(current).add(id));
    } catch (reason) {
      setPortalError(
        reason instanceof Error ? reason.message : "That could not be confirmed.",
      );
    } finally {
      setConfirming("");
    }
  };
  const confirmSelectedReceipts = async (
    kind: "confirm_document" | "confirm_invoice",
    ids: string[],
    clear: () => void,
  ) => {
    for (const id of ids.filter((itemId) => !confirmedIds.has(itemId))) {
      await confirmReceipt(kind, id);
    }
    clear();
  };
  // A client supplies a document that was asked of them. The API and the
  // database both limit this to their own requested documents.
  const uploadOwn = async (documentId: string, chosen: File) => {
    setUploading(documentId);
    setPortalError("");
    try {
      const body = new FormData();
      body.append("documentId", documentId);
      body.append("file", chosen);
      const response = await fetch("/api/crm/documents", {
        method: "POST",
        body,
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "The file was not sent.");
      window.location.reload();
    } catch (reason) {
      setPortalError(
        reason instanceof Error ? reason.message : "The file was not sent.",
      );
    } finally {
      setUploading("");
    }
  };

  if (!client)
    return (
      <article className="panel clientEmpty">
        <LockKeyhole size={28} />
        <h2>Your file is not connected to this login yet</h2>
        <p>
          Your Maximus case team needs to connect your file to this account
          before your journey, documents, appointments and invoices appear here.
          Contact your case officer and they can do it in a moment.
        </p>
      </article>
    );
  if (module === "documents") {
    const own = ownDocuments;
    return (
      <article className="panel listPanel">
        <div className="panelHead">
          <div>
            <span className="kicker">MY FILES</span>
            <h2>Documents Maximus has asked for</h2>
          </div>
        </div>
        <ListFilterBar query={documentQuery} onQuery={setDocumentQuery} placeholder="Search my documents" resultCount={own.length} />
        {own.length ? (
          <>
          <div className="listSelectionTools">
            <SelectAllControl checked={documentSelection.allSelected} onChange={documentSelection.toggleAll} label="Select all my documents" />
          </div>
          <BulkActionBar count={documentSelection.selected.length} onClear={documentSelection.clear}>
            <button className="ghostButton" onClick={() => downloadCsv("my-documents-selected.csv", documentSelection.selected as unknown as Record<string, unknown>[])}>
              <Download size={14} /> Export selected
            </button>
            {documentSelection.selected.some((item) => Boolean(item.fileName)) && (
              <button className="ghostButton" onClick={() => downloadDocumentFiles(documentSelection.selected.filter((item) => Boolean(item.fileName)).map((item) => item.id))}>
                <Download size={14} /> Download files
              </button>
            )}
            <button className="ghostButton" disabled={Boolean(confirming)} onClick={() => void confirmSelectedReceipts("confirm_document", documentSelection.selected.map((item) => item.id), documentSelection.clear)}>
              <Check size={14} /> Confirm received
            </button>
          </BulkActionBar>
          {own.map((d) => (
            <div className="functionalRow bulkEnabled" key={d.id}>
              <RowSelection checked={documentSelection.selectedIds.has(d.id)} onChange={() => documentSelection.toggle(d.id)} label={`Select ${d.title}`} />
              <FileText size={18} />
              <div>
                <strong>{d.title}</strong>
                <span>
                  {d.folder || "Client uploads"} · {d.fileName}
                </span>
                {d.note ? <small>{d.note}</small> : null}
                {d.due ? <small>Requested by {d.due}</small> : null}
              </div>
              <Status value={d.status} />
              {confirmedIds.has(d.id) ? (
                <span className="portalConfirmed">
                  <Check size={14} /> Confirmed
                </span>
              ) : (
                <button
                  type="button"
                  className="ghostButton"
                  disabled={confirming === d.id}
                  onClick={() => void confirmReceipt("confirm_document", d.id)}
                >
                  {confirming === d.id ? "Confirming…" : "Confirm received"}
                </button>
              )}
              {storageConnected && /request|reject/i.test(d.status) ? (
                <label className="ghostButton fileButton">
                  <Cloud size={14} />
                  {uploading === d.id ? "Sending…" : "Upload"}
                  <input
                    type="file"
                    disabled={uploading === d.id}
                    onChange={(event) => {
                      const chosen = event.target.files?.[0];
                      event.target.value = "";
                      if (chosen) void uploadOwn(d.id, chosen);
                    }}
                  />
                </label>
              ) : null}
            </div>
          ))}
          </>
        ) : (
          <p className="restrictedEmpty">
            No documents are linked to this client account.
          </p>
        )}
        {portalError && <p className="caseWorkError">{portalError}</p>}
      </article>
    );
  }
  if (module === "calendar") {
    const own = ownAppointments;
    return (
      <article className="panel listPanel">
        <div className="panelHead">
          <div>
            <span className="kicker">MY APPOINTMENTS</span>
            <h2>Consultations and reviews</h2>
          </div>
          <button
            className="primaryButton"
            onClick={() => openModal("appointment")}
          >
            <Plus size={16} />
            Request appointment
          </button>
        </div>
        <ListFilterBar query={appointmentQuery} onQuery={setAppointmentQuery} placeholder="Search my appointments" resultCount={own.length} />
        {own.length ? (
          <>
          <div className="listSelectionTools">
            <SelectAllControl checked={appointmentSelection.allSelected} onChange={appointmentSelection.toggleAll} label="Select all my appointments" />
          </div>
          <BulkActionBar count={appointmentSelection.selected.length} onClear={appointmentSelection.clear}>
            <button className="ghostButton" onClick={() => downloadCalendarFile("maximus-appointments.ics", appointmentSelection.selected)}>
              <CalendarDays size={14} /> Add to calendar
            </button>
            <button className="ghostButton" onClick={() => downloadCsv("my-appointments-selected.csv", appointmentSelection.selected as unknown as Record<string, unknown>[])}>
              <Download size={14} /> Export selected
            </button>
          </BulkActionBar>
          {own.map((a) => (
            <div className="functionalRow bulkEnabled" key={a.id}>
              <RowSelection checked={appointmentSelection.selectedIds.has(a.id)} onChange={() => appointmentSelection.toggle(a.id)} label={`Select ${a.title}`} />
              <CalendarDays size={18} />
              <div>
                <strong>{a.title}</strong>
                <span>
                  {a.date} · {a.time}
                </span>
              </div>
              <Status value={a.type} />
            </div>
          ))}
          </>
        ) : (
          <p className="restrictedEmpty">No appointments are scheduled.</p>
        )}
      </article>
    );
  }
  if (module === "communications") {
    const own = ownMessages;
    return (
      <article className="panel listPanel">
        <div className="panelHead">
          <div>
            <span className="kicker">MY MESSAGES</span>
            <h2>Contact your case team</h2>
          </div>
          <button
            className="primaryButton"
            onClick={() => openModal("message")}
          >
            <Mail size={16} />
            New message
          </button>
        </div>
        <ListFilterBar query={messageQuery} onQuery={setMessageQuery} placeholder="Search my messages" resultCount={own.length} />
        {own.length ? (
          <>
          <div className="listSelectionTools">
            <SelectAllControl checked={messageSelection.allSelected} onChange={messageSelection.toggleAll} label="Select all my messages" />
          </div>
          <BulkActionBar count={messageSelection.selected.length} onClear={messageSelection.clear}>
            <button className="ghostButton" onClick={() => downloadCsv("my-messages-selected.csv", messageSelection.selected as unknown as Record<string, unknown>[])}>
              <Download size={14} /> Export selected
            </button>
            <button className="ghostButton" onClick={() => void navigator.clipboard.writeText(messageSelection.selected.map((item) => `${item.subject}\n${item.body || ""}`).join("\n\n---\n\n"))}>
              <Copy size={14} /> Copy messages
            </button>
          </BulkActionBar>
          {own.map((m) => (
            <div className="functionalRow bulkEnabled" key={m.id}>
              <RowSelection checked={messageSelection.selectedIds.has(m.id)} onChange={() => messageSelection.toggle(m.id)} label={`Select ${m.subject}`} />
              <Mail size={18} />
              <div>
                <strong>{m.subject}</strong>
                <span>{messageWhen(m)}</span>
              </div>
              <Status value={m.status} />
            </div>
          ))}
          </>
        ) : (
          <p className="restrictedEmpty">
            No messages are linked to your case.
          </p>
        )}
      </article>
    );
  }
  // Only what this client has been billed. A commission claim raised against a
  // partner or an institution is never a client's business and never appears
  // here, whatever else the finance module holds.
  const own = ownInvoices;
  const billed = own.reduce((sum, i) => sum + i.amount, 0);
  const paid = own.reduce((sum, i) => sum + i.paid, 0);
  const outstanding = own.reduce((sum, i) => sum + i.balance, 0);
  const money = (value: number) =>
    `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  return (
    <>
      <div className="miniStats">
        <article>
          <span>Invoiced</span>
          <strong>{money(billed)}</strong>
          <small>
            {own.length} invoice{own.length === 1 ? "" : "s"}
          </small>
        </article>
        <article>
          <span>Paid</span>
          <strong>{money(paid)}</strong>
          <small>Thank you</small>
        </article>
        <article>
          <span>Outstanding</span>
          <strong>{money(outstanding)}</strong>
          <small>
            {outstanding > 0 ? "Balance still to pay" : "Nothing outstanding"}
          </small>
        </article>
      </div>
      <article className="panel listPanel">
        <div className="panelHead">
          <div>
            <span className="kicker">MY ACCOUNT</span>
            <h2>Invoices and receipts</h2>
          </div>
          <LockKeyhole size={18} />
        </div>
        <ListFilterBar query={invoiceQuery} onQuery={setInvoiceQuery} placeholder="Search my invoices" resultCount={own.length} />
        {own.length ? (
          <>
          <div className="listSelectionTools">
            <SelectAllControl checked={invoiceSelection.allSelected} onChange={invoiceSelection.toggleAll} label="Select all my invoices" />
          </div>
          <BulkActionBar count={invoiceSelection.selected.length} onClear={invoiceSelection.clear}>
            <button className="ghostButton" onClick={() => downloadCsv("my-invoices-selected.csv", invoiceSelection.selected as unknown as Record<string, unknown>[])}>
              <Download size={14} /> Export selected
            </button>
            {invoiceSelection.selected.some((item) => Boolean(item.pdfDocumentId)) && (
              <button className="ghostButton" onClick={() => downloadDocumentFiles(invoiceSelection.selected.flatMap((item) => item.pdfDocumentId ? [item.pdfDocumentId] : []))}>
                <FileText size={14} /> Download invoice PDFs
              </button>
            )}
            <button className="ghostButton" disabled={Boolean(confirming)} onClick={() => void confirmSelectedReceipts("confirm_invoice", invoiceSelection.selected.map((item) => item.id), invoiceSelection.clear)}>
              <Check size={14} /> Confirm received
            </button>
          </BulkActionBar>
          {own.map((i) => (
            <div className="functionalRow bulkEnabled" key={i.id}>
              <RowSelection checked={invoiceSelection.selectedIds.has(i.id)} onChange={() => invoiceSelection.toggle(i.id)} label={`Select invoice ${i.invoiceNumber || i.id}`} />
              <CircleDollarSign size={18} />
              <div>
                <strong>{i.invoiceNumber || money(i.amount)}</strong>
                <span>
                  {i.currency} {i.amount.toLocaleString()} · {i.issued ? `Issued ${i.issued} · ` : ""}Due{" "}
                  {i.due || "not set"} · Paid {money(i.paid)} · Balance{" "}
                  {money(i.balance)}
                </span>
              </div>
              <Status value={i.status} />
              {i.pdfDocumentId ? (
                <a className="ghostButton" href={`/api/crm/documents?documentId=${i.pdfDocumentId}`}>
                  <FileText size={14} /> View invoice
                </a>
              ) : null}
              {confirmedIds.has(i.id) ? (
                <span className="portalConfirmed">
                  <Check size={14} /> Confirmed
                </span>
              ) : (
                <button
                  type="button"
                  className="ghostButton"
                  disabled={confirming === i.id}
                  onClick={() => void confirmReceipt("confirm_invoice", i.id)}
                >
                  {confirming === i.id ? "Confirming…" : "Confirm received"}
                </button>
              )}
            </div>
          ))}
          </>
        ) : (
          <p className="restrictedEmpty">
            You have not been invoiced for anything yet.
          </p>
        )}
        {portalError && <p className="caseWorkError">{portalError}</p>}
      </article>
    </>
  );
}
type AgencyReport = {
  pipeline: {
    total: number;
    open: number;
    byStage: Record<string, number>;
    byStream: Record<string, number>;
    byMatter: Record<string, number>;
    byHealth: Record<string, number>;
  };
  conversion: {
    enquiries: number;
    converted: number;
    conversionRate: number;
    applicationsSubmitted: number;
    offers: number;
    offerRate: number;
    coes: number;
    coeRate: number;
    deferred: number;
    deferralRate: number;
  };
  leads: {
    total: number;
    averageScore: number;
    missedFollowUps: number;
    byStatus: Record<string, number>;
    bySource: Record<string, number>;
    lostReasons: Record<string, number>;
  };
  campaignPerformance: {
    id: string; name: string; channel: string; status: string;
    recipients: number; sent: number; failed: number; deliveryRate: number; createdAt: string;
  }[];
  visas: {
    matters: number;
    lodged: number;
    granted: number;
    refused: number;
    grantRate: number;
    awaitingDecision: number;
  };
  deadlines: {
    informationRequests: {
      caseId: string;
      dueAt: string;
      daysRemaining: number | null;
    }[];
    informationOverdue: number;
    visaExpiry: { in30: number; in60: number; in90: number; expired: number };
    applicationDeadlines: number;
    overdueTasks: number;
    documentsOutstanding: number;
    casesPastDue: number;
  };
  workload: {
    staffId: string;
    name: string;
    branch: string;
    openCases: number;
    needingAttention: number;
    openTasks: number;
    overdueTasks: number;
  }[];
  branches: {
    branchId: string;
    name: string;
    cases: number;
    open: number;
    completed: number;
  }[];
  finance: {
    invoiced: number;
    collected: number;
    outstanding: number;
    overdueInvoices: number;
    byState: Record<string, number>;
  };
  generatedAt: string;
};

/**
 * Every figure here is something a person acts on, so each is shown as a number
 * to read rather than a shape to interpret. Urgency is always carried by a word
 * as well as a colour.
 */
function Attention({
  label,
  count,
  detail,
  level,
}: {
  label: string;
  count: number;
  detail: string;
  level: "critical" | "serious" | "warning" | "calm";
}) {
  const settled = count === 0;
  const shown = settled ? "calm" : level;
  return (
    <div className={`attentionRow level-${shown}`}>
      {shown === "calm" ? <Check size={16} /> : <AlertTriangle size={16} />}
      <div>
        <b>{label}</b>
        <small>{settled ? "Nothing outstanding" : detail}</small>
      </div>
      <strong>{count}</strong>
    </div>
  );
}

type CourseFinderCourse = {
  id: string;
  institution_name: string;
  country: string;
  institution_city: string | null;
  institution_website: string | null;
  institution_id: string;
  name: string;
  level: string | null;
  field_of_study: string | null;
  duration_months: number | null;
  tuition_fee: number | null;
  currency: string;
  intake_months: string | null;
  notes: string | null;
  active: boolean;
  campus: string | null;
  website: string | null;
  application_fee: number | null;
  expected_commission: string | null;
  ielts_overall: number | null;
  ielts_band: string | null;
  toefl_overall: number | null;
  toefl_band: string | null;
  pte_overall: number | null;
  pte_band: string | null;
  duolingo_score: number | null;
  gpa_score: string | null;
  application_deadline: string | null;
  entry_requirements: string | null;
  scholarship: string | null;
  source_key: string | null;
  external_code?: string | null;
  source_url?: string | null;
  institution_source_url?: string | null;
  catalogue_verified_at?: string | null;
  source_updated_at: string | null;
  legacy_data: Record<string, string | null> | null;
};
type CourseFacet = { value: string; amount: number };
type CourseInstitution = { id: string; name: string; country: string; city: string | null };
type CourseCatalogueHealth = {
  course_count: number;
  institution_count: number;
  country_count: number;
  stale_count: number;
  missing_fee_count: number;
  missing_website_count: number;
  last_verified_at: string | null;
};
type CourseSourceStatus = {
  country_code: string;
  country_name: string;
  source_name: string;
  source_url: string;
  coverage: string;
  sync_mode: string;
  status: string;
  last_success_at: string | null;
};

function cleanCatalogueText(value: string | null | undefined, fallback = "Not supplied") {
  if (!value?.trim()) return fallback;
  // The legacy MySQL export contains UTF-8 bytes that were previously read as
  // Windows-1252. Unicode escapes keep these repairs stable through every
  // compiler and deployment environment.
  return value
    .replace(/\u00e2\u20ac\u2122/g, "’").replace(/\u00e2\u20ac\u02dc/g, "‘")
    .replace(/\u00e2\u20ac\u0153/g, "“").replace(/\u00e2\u20ac\ufffd/g, "”")
    .replace(/\u00e2\u20ac\u201c/g, "–").replace(/\u00e2\u20ac\u201d/g, "—")
    .replace(/\u00e2\u20ac\u00a6/g, "…").replace(/\u00e2\u201a\u00ac/g, "€")
    .replace(/\u00c2\u00b7/g, "·")
    .replace(/\u00c3\u00a9/g, "é").replace(/\u00c3\u00a8/g, "è").replace(/\u00c3\u00aa/g, "ê").replace(/\u00c3\u00ab/g, "ë")
    .replace(/\u00c3\u00a1/g, "á").replace(/\u00c3\u00a0/g, "à").replace(/\u00c3\u00a2/g, "â").replace(/\u00c3\u00a4/g, "ä")
    .replace(/\u00c3\u00ad/g, "í").replace(/\u00c3\u00ac/g, "ì").replace(/\u00c3\u00ae/g, "î").replace(/\u00c3\u00af/g, "ï")
    .replace(/\u00c3\u00b3/g, "ó").replace(/\u00c3\u00b2/g, "ò").replace(/\u00c3\u00b4/g, "ô").replace(/\u00c3\u00b6/g, "ö")
    .replace(/\u00c3\u00ba/g, "ú").replace(/\u00c3\u00b9/g, "ù").replace(/\u00c3\u00bb/g, "û").replace(/\u00c3\u00bc/g, "ü")
    .replace(/\u00c3\u00b1/g, "ñ").replace(/\u00c3\u00a7/g, "ç").replace(/\u00c2/g, "")
    .replace(/\s+/g, " ").trim();
}

function catalogueLevelLabel(value: string | null | undefined) {
  const clean = cleanCatalogueText(value, "Unclassified");
  return /^\d+(?:\.\d+)?$/.test(clean) ? "Other / Unclassified" : clean;
}

/**
 * Institutions and the courses they offer -- reference data for advising a
 * client, not tied to any one case. "Course or visa target" on a case has
 * always been free text; this is the canonical list it was never backed by.
 */
function CourseFinderView({ canManage }: { canManage: boolean }) {
  const [catalogueNow] = useState(() => Date.now());
  const [courses, setCourses] = useState<CourseFinderCourse[]>([]);
  const [countries, setCountries] = useState<CourseFacet[]>([]);
  const [levels, setLevels] = useState<CourseFacet[]>([]);
  const [fields, setFields] = useState<CourseFacet[]>([]);
  const [institutions, setInstitutions] = useState<CourseInstitution[]>([]);
  const [health, setHealth] = useState<CourseCatalogueHealth | null>(null);
  const [sources, setSources] = useState<CourseSourceStatus[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("");
  const [level, setLevel] = useState("");
  const [field, setField] = useState("");
  const [intake, setIntake] = useState("");
  const [maxFee, setMaxFee] = useState("");
  const [maxDuration, setMaxDuration] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [institution, setInstitution] = useState("");
  const [institutionQuery, setInstitutionQuery] = useState("");
  const [institutionOpen, setInstitutionOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const pageSize = 50;
  const availableInstitutions = useMemo(() => {
    const needle = institutionQuery.trim().toLocaleLowerCase();
    return institutions
      .filter((item) => !country || item.country === country)
      .filter((item) => !needle || [item.name, item.city, item.country].some((part) =>
        cleanCatalogueText(part, "").toLocaleLowerCase().includes(needle),
      ))
      .slice(0, 12);
  }, [institutions, country, institutionQuery]);
  const selectedInstitution = institutions.find((item) => item.id === institution);
  // A destination change can leave the picked institution in a country no
  // longer selected. Cleared during render on the pattern React recommends
  // for adjusting state from a prop, rather than in an effect.
  const [institutionCountryCheckpoint, setInstitutionCountryCheckpoint] = useState(country);
  if (country !== institutionCountryCheckpoint) {
    setInstitutionCountryCheckpoint(country);
    if (selectedInstitution && country && selectedInstitution.country !== country) {
      setInstitution("");
      setInstitutionQuery("");
    }
  }

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
      if (query.trim()) params.set("q", query.trim());
      if (country) params.set("country", country);
      if (level) params.set("level", level);
      if (field) params.set("field", field);
      if (intake.trim()) params.set("intake", intake.trim());
      if (maxFee) params.set("maxFee", maxFee);
      if (maxDuration) params.set("maxDuration", maxDuration);
      if (verifiedOnly) params.set("verified", "true");
      if (institution) params.set("institution", institution);
      const response = await fetch(`/api/crm/course-finder?${params}`, { cache: "no-store", signal });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Course Finder could not be loaded.");
      setCourses(result.courses || []);
      setCountries(result.countries || []);
      setLevels(result.levels || []);
      setFields(result.fields || []);
      setInstitutions(result.institutions || []);
      setHealth(result.health || null);
      setSources(result.sources || []);
      setTotal(Number(result.total) || 0);
      setError("");
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setError(
        reason instanceof Error ? reason.message : "Course Finder could not be loaded.",
      );
    } finally {
      setLoaded(true);
    }
  }, [query, country, level, field, intake, maxFee, maxDuration, verifiedOnly, institution, page]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(controller.signal), 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [load]);

  if (!loaded)
    return (
      <article className="panel listPanel" aria-busy="true">
        <p className="reportProgress">Loading Course Finder…</p>
      </article>
    );
  if (error && courses.length === 0)
    return (
      <article className="panel listPanel">
        <p className="caseWorkError">{error}</p>
      </article>
    );

  return (
    <article className="panel listPanel courseFinderPanel">
      <div className="panelHead">
        <div>
          <span className="kicker">GLOBAL COURSE CATALOGUE</span>
          <h2>Find the right study option</h2>
          <p className="courseFinderIntro">Compare institutions, entry requirements, intakes and fees without leaving the client conversation.</p>
        </div>
        <span className="catalogueCount">{total.toLocaleString()} courses</span>
      </div>
      {health && (
        <div className="catalogueHealthStrip">
          <span><b>{health.country_count.toLocaleString()}</b> countries</span>
          <span><b>{health.institution_count.toLocaleString()}</b> institutions</span>
          <span><b>{health.course_count.toLocaleString()}</b> active courses</span>
          <span className={health.stale_count ? "catalogueNeedsReview" : "catalogueCurrent"}>
            <RefreshCw size={14} /> {health.stale_count ? `${health.stale_count.toLocaleString()} need source review` : "Sources current"}
          </span>
        </div>
      )}
      {canManage && sources.length > 0 ? (
        <details className="catalogueSourceCoverage">
          <summary>Official source coverage by destination</summary>
          <div className="sourceCoverageGrid">
            {sources.map((source) => (
              <div key={`${source.country_code}-${source.source_name}`}>
                <strong>{source.country_name}</strong>
                <span>{humanise(source.coverage)} · {humanise(source.sync_mode)}</span>
                <Status value={source.status} />
                <a href={source.source_url} target="_blank" rel="noreferrer">{source.source_name}</a>
              </div>
            ))}
          </div>
        </details>
      ) : null}
      <div className="courseFinderFilters courseFinderFilterGrid">
        <label className="searchField courseFinderMainSearch">Course, institution, campus or course code<input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Search Bachelor of Nursing, Monash, CRICOS code…" /></label>
        <label>Destination<select value={country} onChange={(e) => { setCountry(e.target.value); setPage(1); }}><option value="">All countries</option>{countries.map((item) => <option value={item.value} key={item.value}>{item.value} ({item.amount.toLocaleString()})</option>)}</select></label>
        <label>Study level<select value={level} onChange={(e) => { setLevel(e.target.value); setPage(1); }}><option value="">All levels</option>{levels.map((item) => <option value={item.value} key={item.value}>{catalogueLevelLabel(item.value)} ({item.amount.toLocaleString()})</option>)}</select></label>
        <label>Field of study<select value={field} onChange={(e) => { setField(e.target.value); setPage(1); }}><option value="">All fields</option>{fields.map((item) => <option value={item.value} key={item.value}>{cleanCatalogueText(item.value)} ({item.amount.toLocaleString()})</option>)}</select></label>
        <div className="institutionPicker">
          <label htmlFor="course-institution-search">Institution</label>
          <div className="institutionPickerControl">
            <Search size={16} aria-hidden="true" />
            <input
              id="course-institution-search"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={institutionOpen}
              aria-controls="course-institution-options"
              value={institutionOpen ? institutionQuery : selectedInstitution ? cleanCatalogueText(selectedInstitution.name) : institutionQuery}
              onFocus={() => { setInstitutionOpen(true); if (selectedInstitution) setInstitutionQuery(""); }}
              onChange={(event) => { setInstitutionQuery(event.target.value); setInstitution(""); setInstitutionOpen(true); setPage(1); }}
              placeholder="Search institution…"
            />
            {(institution || institutionQuery) && <button type="button" aria-label="Clear institution" onClick={() => { setInstitution(""); setInstitutionQuery(""); setInstitutionOpen(false); setPage(1); }}><X size={15} /></button>}
          </div>
          {institutionOpen && <div className="institutionOptions" id="course-institution-options" role="listbox">
            <button type="button" role="option" aria-selected={!institution} onClick={() => { setInstitution(""); setInstitutionQuery(""); setInstitutionOpen(false); setPage(1); }}>
              <span>All institutions</span><small>{country ? `Across ${cleanCatalogueText(country)}` : "Across all destinations"}</small>
            </button>
            {availableInstitutions.map((item) => <button type="button" role="option" aria-selected={item.id === institution} key={item.id} onClick={() => { setInstitution(item.id); setInstitutionQuery(""); setInstitutionOpen(false); setPage(1); }}>
              <span>{cleanCatalogueText(item.name)}</span><small>{[cleanCatalogueText(item.country, ""), cleanCatalogueText(item.city, "")].filter(Boolean).join(" · ")}</small>
            </button>)}
            {availableInstitutions.length === 0 && <p>No institutions match this search.</p>}
          </div>}
        </div>
        <label>Intake<input value={intake} onChange={(event) => { setIntake(event.target.value); setPage(1); }} placeholder="February, July, 2027…" /></label>
        <label>Maximum annual tuition<input type="number" min="0" step="1000" value={maxFee} onChange={(event) => { setMaxFee(event.target.value); setPage(1); }} placeholder="e.g. 40000" /></label>
        <label>Maximum duration<select value={maxDuration} onChange={(event) => { setMaxDuration(event.target.value); setPage(1); }}><option value="">Any duration</option><option value="12">Up to 1 year</option><option value="24">Up to 2 years</option><option value="36">Up to 3 years</option><option value="48">Up to 4 years</option></select></label>
        <label className="verifiedCourseFilter"><input type="checkbox" checked={verifiedOnly} onChange={(event) => { setVerifiedOnly(event.target.checked); setPage(1); }} /> Source checked in the last 6 months</label>
        {(query || country || level || field || institution || intake || maxFee || maxDuration || verifiedOnly) && (
          <button type="button" className="ghostButton clearCourseFilters" onClick={() => { setQuery(""); setCountry(""); setLevel(""); setField(""); setInstitution(""); setInstitutionQuery(""); setIntake(""); setMaxFee(""); setMaxDuration(""); setVerifiedOnly(false); setPage(1); }}>Clear all filters</button>
        )}
      </div>
      {error && <p className="caseWorkError">{error}</p>}
      {courses.length === 0 ? (
        <EmptyState icon={School} title="No matching courses" copy="Try removing a filter or using a broader course name." />
      ) : (
        <div className="courseCardGrid">
          {courses.map((course) => {
            const verifiedAt = course.catalogue_verified_at || course.source_updated_at;
            const current = verifiedAt ? catalogueNow - new Date(verifiedAt).valueOf() < 180 * 86400000 : false;
            return (
              <article className={`courseResultCard ${expanded === course.id ? "open" : ""}`} key={course.id}>
                <header>
                  <div className="courseInstitutionMark"><School size={19} /></div>
                  <div>
                    <span>{cleanCatalogueText(course.country)} · {cleanCatalogueText(course.campus || course.institution_city, "Campus to confirm")}</span>
                    <strong>{cleanCatalogueText(course.institution_name)}</strong>
                  </div>
                  <span className={current ? "sourceCurrentBadge" : "sourceReviewBadge"}>{current ? "Source checked" : "Verify with provider"}</span>
                </header>
                <div className="courseCardBody">
                  <div className="courseCardTitle">
                    <span>{catalogueLevelLabel(course.level)}</span>
                    <h3>{cleanCatalogueText(course.name)}</h3>
                    <p>{cleanCatalogueText(course.field_of_study, "Field of study not classified")}{course.external_code ? ` · ${course.external_code}` : ""}</p>
                  </div>
                  <div className="courseQuickFacts">
                    <div><Clock3 size={16} /><span>Duration<b>{course.duration_months ? `${course.duration_months} months` : "Confirm"}</b></span></div>
                    <div><CalendarDays size={16} /><span>Intakes<b>{cleanCatalogueText(course.intake_months, "Confirm")}</b></span></div>
                    <div><CircleDollarSign size={16} /><span>Tuition<b>{course.tuition_fee ? `${cleanCatalogueText(course.currency, "")} ${Number(course.tuition_fee).toLocaleString()}` : "On request"}</b></span></div>
                    <div><GraduationCap size={16} /><span>English<b>{course.ielts_overall ? `IELTS ${course.ielts_overall}` : course.pte_overall ? `PTE ${course.pte_overall}` : "See requirements"}</b></span></div>
                  </div>
                  {(course.scholarship || course.application_deadline) && <div className="courseHighlights">{course.scholarship && <span><Sparkles size={14} /> {cleanCatalogueText(course.scholarship)}</span>}{course.application_deadline && <span><Clock3 size={14} /> Apply by {cleanCatalogueText(course.application_deadline)}</span>}</div>}
                </div>
                <footer>
                  {(course.website || course.institution_website || course.source_url || course.institution_source_url) && <a className="ghostButton" href={course.website || course.institution_website || course.source_url || course.institution_source_url || "#"} target="_blank" rel="noreferrer">Official course page <ArrowRight size={14} /></a>}
                  <button className="primaryButton courseDetailsButton" onClick={() => setExpanded(expanded === course.id ? null : course.id)}>{expanded === course.id ? "Close details" : "Compare full details"}</button>
                </footer>
                {expanded === course.id && <CourseFinderDetails course={course} canManage={canManage} />}
              </article>
            );
          })}
        </div>
      )}
      {total > pageSize && <div className="cataloguePager"><button className="ghostButton" disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button><span>Page {page} of {Math.ceil(total / pageSize)}</span><button className="ghostButton" disabled={page * pageSize >= total} onClick={() => setPage((value) => value + 1)}>Next</button></div>}
      {canManage && <p className="catalogueAdminNote">Catalogue maintenance is restricted to administrators; staff can safely search and advise.</p>}
    </article>
  );
}

function CourseFinderDetails({ course, canManage }: { course: CourseFinderCourse; canManage: boolean }) {
  const money = (value: number | null, applicationFee = false) =>
    value === null || value <= 0
      ? "Not supplied"
      : applicationFee && course.tuition_fee && value > course.tuition_fee
        ? "Verify with provider"
        : `${course.currency} ${Number(value).toLocaleString()}`;
  const english = (score: number | null, band: string | null) =>
    [score && score > 0 ? score : null, band].filter((value) => value !== null && value !== "").join(" · ") || "Not supplied";
  return <div className="legacyCourseDetails">
    <section><h4>Course information</h4><dl><div><dt>Country</dt><dd>{cleanCatalogueText(course.country)}</dd></div><div><dt>Institution</dt><dd>{cleanCatalogueText(course.institution_name)}</dd></div><div><dt>Campus</dt><dd>{cleanCatalogueText(course.campus)}</dd></div><div><dt>Course level</dt><dd>{catalogueLevelLabel(course.level)}</dd></div><div><dt>Field of study</dt><dd>{cleanCatalogueText(course.field_of_study)}</dd></div><div><dt>Duration</dt><dd>{course.duration_months ? `${course.duration_months} months` : "Not supplied"}</dd></div><div><dt>Intake</dt><dd>{cleanCatalogueText(course.intake_months)}</dd></div><div><dt>Application deadline</dt><dd>{cleanCatalogueText(course.application_deadline)}</dd></div></dl></section>
    <section><h4>Fees and commercial information</h4><dl><div><dt>Tuition fee</dt><dd>{money(course.tuition_fee)}</dd></div><div><dt>Application fee</dt><dd>{money(course.application_fee, true)}</dd></div><div><dt>Currency</dt><dd>{cleanCatalogueText(course.currency)}</dd></div><div><dt>Expected commission</dt><dd>{cleanCatalogueText(course.expected_commission)}</dd></div><div><dt>Scholarship</dt><dd>{cleanCatalogueText(course.scholarship)}</dd></div></dl></section>
    <section><h4>English and academic requirements</h4><dl><div><dt>IELTS score / bands</dt><dd>{english(course.ielts_overall, course.ielts_band)}</dd></div><div><dt>TOEFL score / bands</dt><dd>{english(course.toefl_overall, course.toefl_band)}</dd></div><div><dt>PTE score / bands</dt><dd>{english(course.pte_overall, course.pte_band)}</dd></div><div><dt>Duolingo score</dt><dd>{course.duolingo_score ?? "Not supplied"}</dd></div><div><dt>GPA requirement</dt><dd>{cleanCatalogueText(course.gpa_score)}</dd></div></dl>{course.entry_requirements && <div className="requirementNote"><b>Complete entry requirements</b><p>{cleanCatalogueText(course.entry_requirements)}</p></div>}</section>
    <section><h4>Links and source</h4><dl><div><dt>Catalogue status</dt><dd>{course.active ? "Active" : "Inactive"}</dd></div><div><dt>Last source update</dt><dd>{course.source_updated_at ? new Date(course.source_updated_at).toLocaleDateString() : course.legacy_data?.updated_date || "Not supplied"}</dd></div>{canManage && <><div><dt>Legacy course ID</dt><dd>{course.source_key || "Not supplied"}</dd></div><div><dt>Legacy institution ID</dt><dd>{course.legacy_data?.legacy_university_id || "Not supplied"}</dd></div><div><dt>Created by / date</dt><dd>{[course.legacy_data?.created_by, course.legacy_data?.created_date].filter(Boolean).join(" · ") || "Not supplied"}</dd></div><div><dt>Updated by / date</dt><dd>{[course.legacy_data?.updated_by, course.legacy_data?.updated_date].filter(Boolean).join(" · ") || "Not supplied"}</dd></div></>}</dl>{(course.website || course.institution_website) ? <a className="primaryButton courseWebsiteLink" href={course.website || course.institution_website || "#"} target="_blank" rel="noreferrer">Open official website</a> : <p className="courseMissingValue">Official website not supplied</p>}</section>
  </div>;
}

function ReportsView({
  exportData,
  canSeeFinance,
  serviceMode,
}: {
  exportData: () => void;
  canSeeFinance: boolean;
  serviceMode: ServiceMode;
}) {
  const [report, setReport] = useState<AgencyReport | null>(null);
  const [error, setError] = useState("");
  const stream = serviceMode === "direct_visa" ? "direct_visa" : "study_abroad";
  // Switching workspace must not show the other workspace's figures while the
  // new report loads. Cleared during render on the pattern React recommends
  // for adjusting state from a prop, rather than in the effect below.
  const [reportFor, setReportFor] = useState(stream);
  if (stream !== reportFor) {
    setReportFor(stream);
    setReport(null);
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/crm/reports?stream=${stream}`, {
          cache: "no-store",
        });
        const result = await response.json();
        if (cancelled) return;
        if (!response.ok)
          throw new Error(result.error || "The report could not be built.");
        setReport(result.report as AgencyReport);
        setError("");
      } catch (reason) {
        if (!cancelled)
          setError(
            reason instanceof Error
              ? reason.message
              : "The report could not be built.",
          );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stream]);

  if (error)
    return (
      <article className="panel listPanel">
        <p className="caseWorkError">{error}</p>
      </article>
    );
  if (!report)
    return (
      <>
        <div className="miniStats" aria-hidden="true">
          {[0, 1, 2, 3].map((slot) => (
            <article key={slot} className="skeletonStat">
              <span className="skeletonBar short" />
              <span className="skeletonBar tall" />
              <span className="skeletonBar" />
            </article>
          ))}
        </div>
        <article className="panel listPanel" aria-busy="true">
          <div className="panelHead">
            <div>
              <span className="kicker">NEEDS ATTENTION</span>
              <h2>Building the report</h2>
            </div>
          </div>
          <p className="reportProgress">
            Reading the pipeline, applications, visa matters, deadlines and
            invoices across every case you can see. This takes a moment on a
            large workspace.
          </p>
          {[0, 1, 2, 3, 4].map((slot) => (
            <div className="skeletonRow" key={slot}>
              <span className="skeletonBar" />
              <span className="skeletonBar short" />
            </div>
          ))}
        </article>
      </>
    );

  const {
    pipeline,
    conversion,
    leads,
    campaignPerformance,
    visas,
    deadlines,
    workload,
    branches,
    finance,
  } = report;
  const money = (value: number) =>
    `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  return (
    <>
      <div className="miniStats">
        <article>
          <span>Open cases</span>
          <strong>{pipeline.open}</strong>
          <small>{pipeline.total} on file</small>
        </article>
        <article>
          <span>Enquiry conversion</span>
          <strong>{conversion.conversionRate}%</strong>
          <small>
            {conversion.converted} of {conversion.enquiries} moved past enquiry
          </small>
        </article>
        <article>
          <span>Visa grant rate</span>
          <strong>{visas.grantRate}%</strong>
          <small>
            {visas.granted} granted · {visas.refused} refused
          </small>
        </article>
        {canSeeFinance && (
          <article>
            <span>Outstanding fees</span>
            <strong>{money(finance.outstanding)}</strong>
            <small>{money(finance.collected)} collected</small>
          </article>
        )}
      </div>

      <article className="panel listPanel">
        <div className="panelHead">
          <div>
            <span className="kicker">NEEDS ATTENTION</span>
            <h2>What falls due next</h2>
          </div>
          <button className="ghostButton" onClick={exportData}>
            <Download size={15} />
            Export
          </button>
        </div>
        <Attention
          label="Requests for further information overdue"
          count={deadlines.informationOverdue}
          detail="A s56 request left unanswered can end the application"
          level="critical"
        />
        <Attention
          label="Visas already expired"
          count={deadlines.visaExpiry.expired}
          detail="Open cases whose recorded visa expiry has passed"
          level="critical"
        />
        <Attention
          label="Visas expiring within 30 days"
          count={deadlines.visaExpiry.in30}
          detail="Lodge or arrange a bridging visa"
          level="serious"
        />
        <Attention
          label="Cases past their next action date"
          count={deadlines.casesPastDue}
          detail="The follow-up date has gone by"
          level="serious"
        />
        <Attention
          label="Overdue tasks"
          count={deadlines.overdueTasks}
          detail="Assigned work past its due date"
          level="warning"
        />
        <Attention
          label="Documents still outstanding"
          count={deadlines.documentsOutstanding}
          detail="Requested from clients and not yet provided"
          level="warning"
        />
        <Attention
          label="Application deadlines within 30 days"
          count={deadlines.applicationDeadlines}
          detail="Institution closing dates approaching"
          level="warning"
        />
        {deadlines.informationRequests.length > 0 && (
          <div className="recordTableWrap">
            <table className="recordTable">
              <thead>
                <tr>
                  <th>Request for further information</th>
                  <th>Due</th>
                  <th>Days left</th>
                </tr>
              </thead>
              <tbody>
                {deadlines.informationRequests.slice(0, 10).map((entry) => (
                  <tr key={entry.caseId}>
                    <td>Case {String(entry.caseId).slice(0, 8)}</td>
                    <td>{String(entry.dueAt).slice(0, 10)}</td>
                    <td>
                      {entry.daysRemaining === null
                        ? "—"
                        : entry.daysRemaining < 0
                          ? `${Math.abs(entry.daysRemaining)} overdue`
                          : entry.daysRemaining}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>

      <article className="panel listPanel">
        <div className="panelHead"><div><span className="kicker">LEADS & FOLLOW-UP</span><h2>Enquiry operations</h2></div></div>
        <div className="miniStats inline">
          <article><span>Enquiries recorded</span><strong>{leads.total}</strong><small>Lead records</small></article>
          <article><span>Average lead score</span><strong>{leads.averageScore}</strong><small>Out of 100</small></article>
          <article><span>Missed follow-ups</span><strong>{leads.missedFollowUps}</strong><small>Past SLA date and not converted</small></article>
        </div>
        <div className="recordTableWrap"><table className="recordTable"><thead><tr><th>Status</th><th>Count</th></tr></thead><tbody>{Object.entries(leads.byStatus).map(([label, count]) => <tr key={label}><td>{humanise(label)}</td><td>{count}</td></tr>)}</tbody></table></div>
      </article>

      <article className="panel listPanel">
        <div className="panelHead"><div><span className="kicker">CAMPAIGN PERFORMANCE</span><h2>Email and WhatsApp delivery</h2></div></div>
        {campaignPerformance.length === 0 ? <p className="caseWorkEmpty">No campaigns have been launched yet.</p> : <div className="recordTableWrap"><table className="recordTable"><thead><tr><th>Campaign</th><th>Channel</th><th>Recipients</th><th>Sent</th><th>Failed</th><th>Delivery</th><th>Status</th></tr></thead><tbody>{campaignPerformance.map((item) => <tr key={item.id}><td>{item.name}</td><td>{humanise(item.channel)}</td><td>{item.recipients}</td><td>{item.sent}</td><td>{item.failed}</td><td>{item.deliveryRate}%</td><td><Status value={item.status} /></td></tr>)}</tbody></table></div>}
      </article>

      <article className="panel listPanel">
        <div className="panelHead">
          <div>
            <span className="kicker">
              {serviceMode === "direct_visa" ? "MIGRATION PIPELINE" : "EDUCATION PIPELINE"}
            </span>
            <h2>
              {serviceMode === "direct_visa"
                ? "Enquiry to visa outcome"
                : "Enquiry to confirmation of enrolment"}
            </h2>
          </div>
        </div>
        <ol className="funnel">
          {(
            serviceMode === "direct_visa"
              ? [
                  ["Enquiries", conversion.enquiries, ""],
                  [
                    "Converted to client",
                    conversion.converted,
                    `${conversion.conversionRate}% of enquiries`,
                  ],
                  ["Visa matters lodged", visas.lodged, `of ${visas.matters} matters`],
                  [
                    "Granted",
                    visas.granted,
                    `${visas.grantRate}% of lodged and decided`,
                  ],
                  ["Refused", visas.refused, ""],
                ]
              : [
                  ["Enquiries", conversion.enquiries, ""],
                  [
                    "Converted",
                    conversion.converted,
                    `${conversion.conversionRate}% of enquiries`,
                  ],
                  ["Applications submitted", conversion.applicationsSubmitted, ""],
                  [
                    "Offers received",
                    conversion.offers,
                    `${conversion.offerRate}% of submitted`,
                  ],
                  [
                    "CoEs received",
                    conversion.coes,
                    `${conversion.coeRate}% of offers`,
                  ],
                  [
                    "Deferred to a later intake",
                    conversion.deferred,
                    `${conversion.deferralRate}% of submitted`,
                  ],
                ]
          ).map(([label, value, note]) => (
            <li key={label}>
              <span>
                <b>{label}</b>
                {note ? <small>{note}</small> : null}
              </span>
              <strong>{value}</strong>
            </li>
          ))}
        </ol>
      </article>

      <article className="panel listPanel">
        <div className="panelHead">
          <div>
            <span className="kicker">VISA MATTERS</span>
            <h2>Lodgement and decisions</h2>
          </div>
        </div>
        <div className="miniStats inline">
          <article>
            <span>Lodged</span>
            <strong>{visas.lodged}</strong>
            <small>of {visas.matters} matters</small>
          </article>
          <article>
            <span>Awaiting decision</span>
            <strong>{visas.awaitingDecision}</strong>
            <small>Lodged, no decision recorded</small>
          </article>
          <article>
            <span>Granted</span>
            <strong>{visas.granted}</strong>
            <small>Recorded outcome</small>
          </article>
          <article>
            <span>Refused</span>
            <strong>{visas.refused}</strong>
            <small>Recorded outcome</small>
          </article>
        </div>
      </article>

      <article className="panel listPanel">
        <div className="panelHead">
          <div>
            <span className="kicker">TEAM</span>
            <h2>Workload</h2>
          </div>
        </div>
        {workload.length === 0 ? (
          <p className="caseWorkEmpty">No staff accounts to report on.</p>
        ) : (
          <div className="recordTableWrap">
            <table className="recordTable">
              <thead>
                <tr>
                  <th>Staff</th>
                  <th>Branch</th>
                  <th>Open cases</th>
                  <th>Needing attention</th>
                  <th>Open tasks</th>
                  <th>Overdue</th>
                </tr>
              </thead>
              <tbody>
                {workload.map((person) => (
                  <tr key={person.staffId}>
                    <td>{person.name || "—"}</td>
                    <td>{person.branch || "—"}</td>
                    <td>{person.openCases}</td>
                    <td>{person.needingAttention}</td>
                    <td>{person.openTasks}</td>
                    <td>{person.overdueTasks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>

      <article className="panel listPanel">
        <div className="panelHead">
          <div>
            <span className="kicker">BRANCHES</span>
            <h2>Performance</h2>
          </div>
        </div>
        {branches.length === 0 ? (
          <p className="caseWorkEmpty">No branches to report on.</p>
        ) : (
          <div className="recordTableWrap">
            <table className="recordTable">
              <thead>
                <tr>
                  <th>Branch</th>
                  <th>Cases</th>
                  <th>Open</th>
                  <th>Completed</th>
                </tr>
              </thead>
              <tbody>
                {branches.map((branch) => (
                  <tr key={branch.branchId}>
                    <td>{branch.name || "—"}</td>
                    <td>{branch.cases}</td>
                    <td>{branch.open}</td>
                    <td>{branch.completed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>

      {canSeeFinance && (
        <article className="panel listPanel">
          <div className="panelHead">
            <div>
              <span className="kicker">FINANCE</span>
              <h2>Fees</h2>
            </div>
          </div>
          <div className="miniStats inline">
            <article>
              <span>Invoiced</span>
              <strong>{money(finance.invoiced)}</strong>
              <small>All invoices</small>
            </article>
            <article>
              <span>Collected</span>
              <strong>{money(finance.collected)}</strong>
              <small>Recorded payments</small>
            </article>
            <article>
              <span>Outstanding</span>
              <strong>{money(finance.outstanding)}</strong>
              <small>{finance.overdueInvoices} invoices overdue</small>
            </article>
          </div>
        </article>
      )}

      <p className="reportFooter">
        Scoped to what your account may see. Built{" "}
        {orgDateTime(report.generatedAt)}.
      </p>
    </>
  );
}

type AIInteraction = {
  id: string;
  purpose: string;
  response: string;
  at: string;
};

type IntegrationStatus = {
  key: string;
  name: string;
  purpose: string;
  state: "connected" | "not_configured" | "not_built";
  detail: string;
  setup: string[];
};

const integrationLabels: Record<IntegrationStatus["state"], string> = {
  connected: "Connected",
  not_configured: "Not configured",
  not_built: "Not built",
};

/**
 * What is actually connected. The server probes Google Drive for real rather
 * than reporting that some environment variables are present, so a key that
 * does not match the service account shows as broken here instead of at the
 * moment somebody tries to upload a passport.
 */
/**
 * The case-file assistant. It only ever drafts and summarises against a case
 * the signed-in person can already read -- the server enforces that, this
 * screen just picks which case. Nothing it writes is saved until a person
 * clicks "Save as case note" or "Save as message draft", which go through the
 * same audited endpoints those buttons use everywhere else in the CRM.
 */
function AIAssistantView({
  cases,
  say,
}: {
  cases: CaseRecord[];
  say: (text: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CaseRecord | null>(null);
  const [history, setHistory] = useState<AIInteraction[]>([]);
  const [instruction, setInstruction] = useState("");
  const [response, setResponse] = useState("");
  const [asking, setAsking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const matches =
    query.trim().length > 1
      ? cases
          .filter((c) =>
            `${c.name} ${c.id}`.toLowerCase().includes(query.toLowerCase()),
          )
          .slice(0, 8)
      : [];

  const loadHistory = async (caseId: string) => {
    try {
      const response_ = await fetch(`/api/crm/ai?caseId=${caseId}`, {
        cache: "no-store",
      });
      const result = await response_.json();
      if (response_.ok) setHistory(result.interactions ?? []);
    } catch {
      // History is a convenience; failing to load it should not block asking.
    }
  };

  const pick = (record: CaseRecord) => {
    setSelected(record);
    setQuery("");
    setResponse("");
    setError("");
    if (record.dbId) void loadHistory(record.dbId);
  };

  const ask = async () => {
    if (!selected?.dbId || !instruction.trim()) return;
    setAsking(true);
    setError("");
    try {
      const result = await fetch("/api/crm/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId: selected.dbId,
          instruction: instruction.trim(),
        }),
      });
      const body = await result.json();
      if (!result.ok)
        throw new Error(body.error || "The assistant could not answer that.");
      setResponse(body.response);
      setInstruction("");
      void loadHistory(selected.dbId);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The assistant could not answer that.",
      );
    } finally {
      setAsking(false);
    }
  };

  const saveAsNote = async () => {
    if (!selected?.dbId || !response) return;
    setSaving(true);
    try {
      const result = await fetch("/api/crm/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "case_note",
          caseId: selected.dbId,
          body: response,
          visibility: "case_team",
        }),
      });
      if (!result.ok) throw new Error((await result.json()).error);
      say("Saved as a case note.");
    } catch (reason) {
      say(reason instanceof Error ? reason.message : "That did not save.");
    } finally {
      setSaving(false);
    }
  };

  const saveAsDraft = async () => {
    if (!selected?.dbId || !response) return;
    if (!selected.email) {
      say("This client has no email address on file yet.");
      return;
    }
    setSaving(true);
    try {
      const result = await fetch("/api/crm/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "message",
          caseId: selected.dbId,
          clientId: selected.clientId,
          to: selected.email,
          subject: `${selected.name} -- ${selected.matterType || selected.type}`,
          body: response,
        }),
      });
      if (!result.ok) throw new Error((await result.json()).error);
      say(
        "Saved as a message draft. Review it under Messages before it's sent.",
      );
    } catch (reason) {
      say(reason instanceof Error ? reason.message : "That did not save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="workspaceHub">
      <article className="panel listPanel">
        <div className="panelHead">
          <div>
            <span className="kicker">CASE-SCOPED</span>
            <h2>Assistant</h2>
          </div>
        </div>
        <p className="coverageIntro">
          Drafts and summarises from the facts on one case file -- nothing it
          writes is saved until you choose to. It never sends a message or
          changes a record on its own.
        </p>

        {!selected ? (
          <div className="aiCasePicker">
            <label>
              Find a case
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by client name or case number"
                autoFocus
              />
            </label>
            {matches.length > 0 && (
              <div className="aiCaseMatches">
                {matches.map((c) => (
                  <button key={c.id} onClick={() => pick(c)}>
                    <strong>{c.name}</strong>
                    <span>
                      {c.id} · {c.matterType || c.type}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="aiCaseChip">
              <div>
                <strong>{selected.name}</strong>
                <span>
                  {selected.id} · {selected.matterType || selected.type}
                </span>
              </div>
              <button
                className="ghostButton"
                onClick={() => {
                  setSelected(null);
                  setHistory([]);
                  setResponse("");
                }}
              >
                Change case
              </button>
            </div>

            <form
              className="aiInstructionForm"
              onSubmit={(e) => {
                e.preventDefault();
                void ask();
              }}
            >
              <textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="e.g. Summarise where this case is up to, or draft a message asking for a bank statement"
                rows={3}
                disabled={asking}
              />
              <button
                className="primaryButton"
                type="submit"
                disabled={asking || !instruction.trim()}
              >
                <BrainCircuit size={15} />
                {asking ? "Thinking…" : "Ask"}
              </button>
            </form>
            {error && <p className="caseWorkError">{error}</p>}

            {response && (
              <div className="aiResponse">
                <p>{response}</p>
                <div className="aiResponseActions">
                  <button
                    className="ghostButton"
                    disabled={saving}
                    onClick={() => void saveAsNote()}
                  >
                    Save as case note
                  </button>
                  <button
                    className="ghostButton"
                    disabled={saving}
                    onClick={() => void saveAsDraft()}
                  >
                    Save as message draft
                  </button>
                </div>
              </div>
            )}

            {history.length > 0 && (
              <div className="aiHistory">
                <span className="kicker">EARLIER ON THIS CASE</span>
                {history
                  .filter((row) => row.response !== response)
                  .map((row) => (
                    <div className="aiHistoryRow" key={row.id}>
                      <p>{row.response}</p>
                      <small>{orgDateTime(row.at)}</small>
                    </div>
                  ))}
              </div>
            )}
          </>
        )}
      </article>
    </section>
  );
}

function GoogleWorkspaceView() {
  const [integrations, setIntegrations] = useState<IntegrationStatus[] | null>(
    null,
  );
  const [error, setError] = useState("");
  const [checkedAt, setCheckedAt] = useState("");
  const [checking, setChecking] = useState(false);

  // Reads the status without touching React state, so the mount effect and the
  // button can each decide what to do with the answer.
  const read = async () => {
    const response = await fetch("/api/crm/integrations", {
      cache: "no-store",
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.error || "The status could not be read.");
    return result as { integrations: IntegrationStatus[]; checkedAt: string };
  };

  const check = async () => {
    setChecking(true);
    try {
      const result = await read();
      setIntegrations(result.integrations);
      setCheckedAt(String(result.checkedAt || ""));
      setError("");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The status could not be read.",
      );
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await read();
        if (cancelled) return;
        setIntegrations(result.integrations);
        setCheckedAt(String(result.checkedAt || ""));
      } catch (reason) {
        if (!cancelled)
          setError(
            reason instanceof Error
              ? reason.message
              : "The status could not be read.",
          );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const connected = (integrations ?? []).filter(
    (row) => row.state === "connected",
  ).length;
  const configurable = (integrations ?? []).filter(
    (row) => row.state !== "not_built",
  ).length;

  return (
    <section className="workspaceHub">
      <article className="panel listPanel">
        <div className="panelHead">
          <div>
            <span className="kicker">CHECKED, NOT ASSUMED</span>
            <h2>Integration status</h2>
          </div>
          <button
            className="ghostButton"
            onClick={() => void check()}
            disabled={checking}
          >
            <RefreshCw size={15} />
            {checking ? "Checking…" : "Check again"}
          </button>
        </div>
        {error && <p className="caseWorkError">{error}</p>}
        {!integrations && !error ? (
          <div className="skeletonRow">
            <span className="skeletonBar" />
            <span className="skeletonBar short" />
          </div>
        ) : null}
        {integrations && (
          <>
            <p className="coverageIntro">
              {connected} of {configurable} configurable integrations are
              working. Everything marked <b>Not built</b> is absent from this
              CRM: no amount of configuration turns it on, and nothing in the
              interface pretends otherwise.
            </p>
            {integrations.map((row) => (
              <div className="integrationRow" key={row.key}>
                <div>
                  <strong>{row.name}</strong>
                  <span>{row.purpose}</span>
                  <small>{row.detail}</small>
                  {row.setup.length > 0 && row.state !== "connected" ? (
                    <small className="integrationSetup">
                      Set {row.setup.join(", ")} in the deployment environment.
                    </small>
                  ) : null}
                </div>
                <span className={`integrationState ${row.state}`}>
                  {row.state === "connected" ? (
                    <Check size={13} />
                  ) : (
                    <AlertTriangle size={13} />
                  )}
                  {integrationLabels[row.state]}
                </span>
              </div>
            ))}
            {checkedAt ? (
              <p className="reportFooter">
                Checked {orgDateTime(checkedAt)}.
              </p>
            ) : null}
          </>
        )}
      </article>
    </section>
  );
}

function FeatureCoverage() {
  return (
    <article className="panel coveragePanel">
      <div className="panelHead">
        <div>
          <span className="kicker">EARLIER CRM + UPLIFT</span>
          <h2>Functional coverage and connection status</h2>
        </div>
        <Status value="No placeholder claims" />
      </div>
      <p className="coverageIntro">
        This register separates usable screens from database-ready functions and
        integrations that still require Google approval. It prevents unfinished
        connectors from being presented as working.
      </p>
      <div className="coverageTable">
        <div>
          <b>Area</b>
          <b>Included functions</b>
          <b>Status</b>
        </div>
        {featureCoverage.map(([area, features, status]) => (
          <div key={area}>
            <strong>{area}</strong>
            <span>{features}</span>
            <Status value={status} />
          </div>
        ))}
      </div>
    </article>
  );
}
function ReadinessPanel() {
  const [state, setState] = useState<{
    status?: string;
    latencyMs?: number;
    readiness?: Record<string, unknown>;
    error?: string;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/crm/health", { cache: "no-store" });
        const result = await response.json();
        if (!cancelled)
          setState(
            response.ok
              ? result
              : { error: result.error || "Readiness is unavailable." },
          );
      } catch {
        if (!cancelled) setState({ error: "Readiness is unavailable." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const labels: Record<string, string> = {
    active_branches: "Active branches",
    active_internal_users: "Internal users",
    workflow_templates: "Active workflows",
    retention_rules: "Retention rules",
    open_incidents: "Open incidents",
    pending_import_rows: "Import rows to resolve",
  };
  return (
    <article className="panel listPanel">
      <div className="panelHead">
        <div>
          <span className="kicker">PRODUCTION READINESS</span>
          <h2>Live service check</h2>
        </div>
        {state?.status && (
          <Status value={state.status === "healthy" ? "Healthy" : "Degraded"} />
        )}
      </div>
      {!state ? (
        <p className="coverageIntro">Checking the database…</p>
      ) : state.error ? (
        <p className="coverageIntro">{state.error}</p>
      ) : (
        <>
          <p className="coverageIntro">
            Database responded in {state.latencyMs ?? 0}ms.
          </p>
          <div className="miniStats">
            {Object.entries(labels).map(([key, label]) => (
              <article key={key}>
                <span>{label}</span>
                <strong>
                  {String(
                    (state.readiness as Record<string, unknown>)?.[key] ?? 0,
                  )}
                </strong>
                <small>
                  {key === "open_incidents" || key === "pending_import_rows"
                    ? "Lower is better"
                    : "Configured"}
                </small>
              </article>
            ))}
          </div>
        </>
      )}
    </article>
  );
}

const STAFF_LEVELS: [string, string][] = [
  ["staff", "Staff — every case in their branch"],
  ["partner", "Partner — every case in their branch"],
  ["manager", "Manager — their branch's cases and finance"],
  ["branch_admin", "Branch Manager — their branch, staff and finance"],
  ["super_admin", "Super Admin — everything, every branch"],
  ["student", "Client / Student — their own file only"],
];
const levelLabel = (level: string) =>
  STAFF_LEVELS.find(([key]) => key === level)?.[1].split(" — ")[0] ??
  humanise(level);

type AdminProfile = {
  id: string;
  display_name: string;
  email: string;
  level: string;
  department: string | null;
  branch_id: string | null;
  active: boolean;
  created_at: string;
};
type AdminInvitation = {
  id: string;
  email: string;
  display_name: string | null;
  level: string | null;
  branch_id: string | null;
  status: string;
  expires_at: string;
  created_at: string;
};
type AdminBranch = {
  id: string;
  name: string;
  code: string;
  country_code: string;
  active: boolean;
};
type MasterSettings = {
  timezone: string;
  default_currency: string;
  tax_label: string;
  tax_rate: number;
  invoice_prefix: string;
  receipt_prefix: string;
  credit_note_prefix: string;
  payment_terms_days: number;
  overdue_reminders_enabled: boolean;
  appointment_duration_minutes: number;
};

type ClientSearchResult = { id: string; title: string; subtitle: string };

/** A live-search picker for one client record, used twice by MergeClientsPanel. */
function ClientPicker({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: ClientSearchResult | null;
  onSelect: (x: ClientSearchResult | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ClientSearchResult[]>([]);
  const searchable = !selected && query.trim().length >= 2;
  useEffect(() => {
    if (!searchable) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch(`/api/crm/search?q=${encodeURIComponent(query)}`);
          const result = await response.json();
          if (cancelled || !response.ok) return;
          setResults(
            (result.results ?? [])
              .filter((row: { type: string }) => row.type === "client")
              .map((row: { id: string; title: string; subtitle: string }) => ({
                id: row.id,
                title: row.title,
                subtitle: row.subtitle,
              })),
          );
        } catch {
          if (!cancelled) setResults([]);
        }
      })();
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, searchable]);

  if (selected)
    return (
      <label>
        {label}
        <div className="pickedRecord">
          <span>{selected.title}</span>
          <button
            type="button"
            className="iconButton"
            aria-label={`Change ${label.toLowerCase()}`}
            onClick={() => onSelect(null)}
          >
            <X size={14} />
          </button>
        </div>
      </label>
    );
  return (
    <label>
      {label}
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search by name, email or mobile…"
      />
      {results.length > 0 && (
        <div className="searchResults">
          {results.map((row) => (
            <button
              type="button"
              key={row.id}
              onClick={() => {
                onSelect(row);
                setQuery("");
              }}
            >
              <b>{row.title}</b>
              <small>{row.subtitle}</small>
            </button>
          ))}
        </div>
      )}
    </label>
  );
}

/** Two duplicate client records that turned out to be the same person,
 * merged into one -- everything on the duplicate moves to the survivor. */
function MergeClientsPanel() {
  const [keep, setKeep] = useState<ClientSearchResult | null>(null);
  const [away, setAway] = useState<ClientSearchResult | null>(null);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const merge = async () => {
    if (!keep || !away) return;
    if (
      !confirm(
        `Merge "${away.title}" into "${keep.title}"? Everything on ${away.title}'s record -- cases, documents, invoices -- moves to ${keep.title}, and the duplicate record is then removed. This cannot be undone.`,
      )
    )
      return;
    setWorking(true);
    setError("");
    try {
      const response = await fetch("/api/crm/duplicates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "merge", keepClientId: keep.id, mergeClientId: away.id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The records could not be merged.");
      setMessage(`Merged. "${away.title}" no longer exists as a separate record.`);
      setKeep(null);
      setAway(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The records could not be merged.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <article className="panel listPanel">
      <div className="panelHead">
        <div>
          <span className="kicker">DATA QUALITY</span>
          <h2>Merge duplicate clients</h2>
        </div>
      </div>
      <p className="coverageIntro">
        Two records that turned out to be the same person. Everything on the
        duplicate -- cases, documents, invoices, messages -- moves onto the
        one you keep, and the duplicate is removed.
      </p>
      <div className="stackedForm">
        <ClientPicker label="Keep this record" selected={keep} onSelect={setKeep} />
        <ClientPicker label="Merge this one away" selected={away} onSelect={setAway} />
        {error && <p className="caseWorkError">{error}</p>}
        {message && <p className="coverageIntro">{message}</p>}
        <button
          type="button"
          className="primaryButton"
          disabled={!keep || !away || keep.id === away.id || working}
          onClick={() => void merge()}
        >
          {working ? "Merging…" : "Merge records"}
        </button>
      </div>
    </article>
  );
}

const LEGACY_IMPORT_TYPES = [
  ["study_records", "Original Study Abroad enquiry / student export (automatic)"],
  ["direct_visa_records", "Original Direct Visa enquiry / client export (automatic)"],
  ["clients", "Clients / students / enquiries"],
  ["cases", "Study Abroad and Direct Visa cases"],
  ["applications", "Education applications"],
  ["visa_matters", "Visa applications"],
  ["notes", "History, notes and remarks"],
  ["tasks", "Tasks and follow-ups"],
  ["appointments", "Appointments"],
  ["communications", "Email, SMS and WhatsApp history"],
  ["documents", "Document metadata"],
  ["invoices", "Client invoices"],
  ["payments", "Payments"],
  ["commission_claims", "Partner and university commission invoices"],
  ["commission_payments", "Commission payments and receipts"],
] as const;

function legacyHeader(value: unknown): string {
  return String(value ?? "").trim().replace(/^\uFEFF/, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function parseLegacyCsv(text: string): Record<string, unknown>[] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"' && quoted && text[index + 1] === '"') { cell += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell); if (row.some((value) => value.trim())) rows.push(row); row = []; cell = "";
    } else cell += char;
  }
  row.push(cell); if (row.some((value) => value.trim())) rows.push(row);
  const headers = (rows.shift() ?? []).map(legacyHeader);
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ""])));
}

async function readLegacyWorkbook(file: File): Promise<Record<string, unknown>[]> {
  if (/\.csv$/i.test(file.name)) return parseLegacyCsv(await file.text());
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const cells = (row: import("exceljs").Row) => row.values as unknown[];
  const headers = cells(sheet.getRow(1)).slice(1).map(legacyHeader);
  const rows: Record<string, unknown>[] = [];
  sheet.eachRow((excelRow, rowNumber) => {
    if (rowNumber === 1) return;
    const values = cells(excelRow).slice(1);
    const record = Object.fromEntries(headers.map((header, index) => [header, values[index] instanceof Date ? (values[index] as Date).toISOString() : values[index] ?? ""]));
    if (Object.values(record).some((value) => String(value).trim())) rows.push(record);
  });
  return rows;
}

function LegacyImportPanel({ branches }: { branches: AdminBranch[] }) {
  const [entityType, setEntityType] = useState("clients");
  const [branchId, setBranchId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [summary, setSummary] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [working, setWorking] = useState(false);
  const validateFile = async (file: File) => {
    setWorking(true); setErrors([]); setBatchId("");
    try {
      const rows = await readLegacyWorkbook(file);
      if (!rows.length) throw new Error("The selected export has no data rows.");
      const response = await fetch("/api/crm/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "validate", entityType, branchId: branchId || null, fileName: file.name, sourceSystem: "legacy_maximus", rows }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The export could not be validated.");
      setSummary(`${result.total} rows checked · ${result.valid} ready · ${result.invalid} need correction`);
      setErrors((result.errors ?? []).flatMap((item: { row: number; errors: string[] }) => item.errors.map((error) => `Row ${item.row}: ${error}`)));
      if (!result.invalid) setBatchId(result.batchId);
    } catch (reason) { setErrors([reason instanceof Error ? reason.message : "The export could not be read."]); }
    finally { setWorking(false); }
  };
  const commit = async () => {
    setWorking(true); setErrors([]);
    try {
      const response = await fetch("/api/crm/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "commit", batchId }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The import could not be completed.");
      setSummary(`${result.imported} ${humanise(entityType)} records imported with their legacy identifiers preserved.`); setBatchId("");
    } catch (reason) { setErrors([reason instanceof Error ? reason.message : "The import could not be completed."]); }
    finally { setWorking(false); }
  };
  return (
    <article className="panel listPanel">
      <div className="panelHead"><div><span className="kicker">OLD CRM MIGRATION</span><h2>Import legacy Excel or CSV exports</h2></div></div>
      <p className="coverageIntro">Use either automatic mode for the original combined Enquiry, Student or Client Excel export. The detailed modes support separate module exports. Stable old CRM IDs reconnect every row instead of restarting client progress.</p>
      <div className="stackedForm">
        <label>Export type<select value={entityType} onChange={(event) => { setEntityType(event.target.value); setBatchId(""); setSummary(""); setErrors([]); }}>{LEGACY_IMPORT_TYPES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>Default branch<select value={branchId} onChange={(event) => setBranchId(event.target.value)}><option value="">Use branch column / my branch</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
        <label>Old CRM export<input type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" disabled={working} onChange={(event) => { const file = event.target.files?.[0]; if (file) void validateFile(file); }} /></label>
        {summary && <p className="coverageIntro">{summary}</p>}
        {errors.length > 0 && <div className="caseWorkError" role="alert">{errors.slice(0, 25).map((error) => <div key={error}>{error}</div>)}</div>}
        {batchId && <button className="primaryButton" disabled={working} onClick={() => void commit()}><Check size={15} /> {working ? "Importing…" : "Import validated records"}</button>}
      </div>
    </article>
  );
}

/**
 * Staff & Masters. This is where an agency owner adds a person to the team,
 * which is the one thing the screen never used to do: it showed role artwork
 * and a permission table, and the invitation the API could write was read by
 * nothing.
 */
function AdminView({
  roles,
  isOwner,
  currentProfileId,
  clients,
}: {
  roles: { id: string; name: string; scope: string }[];
  isOwner: boolean;
  currentProfileId: string;
  clients: { id: string; name: string }[];
}) {
  const [profiles, setProfiles] = useState<AdminProfile[]>([]);
  const [invitations, setInvitations] = useState<AdminInvitation[]>([]);
  const [adminBranches, setAdminBranches] = useState<AdminBranch[]>([]);
  const [clientLinks, setClientLinks] = useState<
    { profile_id: string; client_id: string }[]
  >([]);
  const [settings, setSettings] = useState<MasterSettings | null>(null);
  const [replacementByProfile, setReplacementByProfile] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addingBranch, setAddingBranch] = useState(false);
  const [staffSearch, setStaffSearch] = useState("");
  const [staffStatus, setStaffStatus] = useState("active");
  const [staffBranch, setStaffBranch] = useState("");
  const [handover, setHandover] = useState<{
    message: string;
    setupLink?: string;
  } | null>(null);

  const read = async () => {
    const response = await fetch("/api/crm/admin", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.error || "Administration could not be loaded.");
    return result as {
      profiles: AdminProfile[];
      invitations: AdminInvitation[];
      branches: AdminBranch[];
      clientLinks: { profile_id: string; client_id: string }[];
      settings: MasterSettings | null;
    };
  };
  const apply = (result: {
    profiles: AdminProfile[];
    invitations: AdminInvitation[];
    branches: AdminBranch[];
    clientLinks: { profile_id: string; client_id: string }[];
    settings: MasterSettings | null;
  }) => {
    setProfiles(result.profiles ?? []);
    setInvitations(result.invitations ?? []);
    setAdminBranches(result.branches ?? []);
    setClientLinks(result.clientLinks ?? []);
    setSettings(result.settings ?? null);
  };
  const reload = async () => {
    try {
      apply(await read());
      setError("");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "That could not be loaded.",
      );
    }
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await read();
        if (!cancelled) {
          apply(result);
          setLoading(false);
        }
      } catch (reason) {
        if (!cancelled) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Administration could not be loaded.",
          );
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Posts an administration action and refreshes the screen. */
  const send = async (body: Record<string, unknown>) => {
    setWorking(true);
    try {
      // Connecting a portal login lives with the other case operations, so the
      // caller says which endpoint the action belongs to.
      const { endpoint, ...payload } = body as { endpoint?: string };
      const response = await fetch(
        endpoint === "operations" ? "/api/crm/operations" : "/api/crm/admin",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "That did not save.");
      await reload();
      setError("");
      return result as { message?: string; setupLink?: string };
    } catch (reason) {
      const message =
        reason instanceof Error ? reason.message : "That did not save.";
      setError(message);
      return null;
    } finally {
      setWorking(false);
    }
  };

  const branchName = (id: string | null) =>
    adminBranches.find((branch) => branch.id === id)?.name ?? "No branch";
  const actionableInvitations = invitations.filter(
    (row) => row.status !== "accepted",
  );
  const portalAccounts = profiles.filter((row) => row.level === "student");
  const visibleProfiles = profiles.filter((person) => {
    const needle = staffSearch.trim().toLowerCase();
    return (
      person.level !== "student" &&
      (!needle || `${person.display_name} ${person.email} ${person.department ?? ""}`.toLowerCase().includes(needle)) &&
      (staffStatus === "all" || (staffStatus === "active" ? person.active : !person.active)) &&
      (!staffBranch || person.branch_id === staffBranch)
    );
  });
  const selectableProfiles = visibleProfiles.filter(
    (person) => person.id !== currentProfileId,
  );
  const staffSelection = useBulkSelection(selectableProfiles);

  const bulkUpdateStaff = async (changes: Record<string, unknown>) => {
    const result = await send({
      action: "bulk_update_profiles",
      profileIds: staffSelection.selected.map((person) => person.id),
      ...changes,
    });
    if (result) staffSelection.clear();
  };

  return (
    <section className="adminStack">
      <LegacyImportPanel branches={adminBranches} />
      {isOwner && settings ? (
        <article className="panel listPanel">
          <div className="panelHead"><div><span className="kicker">MASTER CONFIGURATION</span><h2>Organisation defaults</h2></div></div>
          <p className="coverageIntro">These values control new invoices, receipts, reminders and appointments across every branch.</p>
          <form className="stackedForm" onSubmit={async (event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            await send({
              action: "update_settings",
              timezone: data.get("timezone"), defaultCurrency: data.get("defaultCurrency"),
              taxLabel: data.get("taxLabel"), taxRate: Number(data.get("taxRate")),
              invoicePrefix: data.get("invoicePrefix"), receiptPrefix: data.get("receiptPrefix"),
              creditNotePrefix: data.get("creditNotePrefix"), paymentTermsDays: Number(data.get("paymentTermsDays")),
              appointmentDurationMinutes: Number(data.get("appointmentDurationMinutes")),
              overdueRemindersEnabled: data.get("overdueRemindersEnabled") === "on",
            });
          }}>
            <label>Timezone<input name="timezone" required defaultValue={settings.timezone} /></label>
            <label>Currency<input name="defaultCurrency" required maxLength={3} defaultValue={settings.default_currency} /></label>
            <label>Tax label<input name="taxLabel" required defaultValue={settings.tax_label} /></label>
            <label>Tax rate<input name="taxRate" type="number" min="0" max="1" step="0.0001" required defaultValue={settings.tax_rate} /></label>
            <label>Invoice prefix<input name="invoicePrefix" required defaultValue={settings.invoice_prefix} /></label>
            <label>Receipt prefix<input name="receiptPrefix" required defaultValue={settings.receipt_prefix} /></label>
            <label>Credit-note prefix<input name="creditNotePrefix" required defaultValue={settings.credit_note_prefix} /></label>
            <label>Payment terms (days)<input name="paymentTermsDays" type="number" min="0" max="365" required defaultValue={settings.payment_terms_days} /></label>
            <label>Appointment duration (minutes)<input name="appointmentDurationMinutes" type="number" min="15" max="480" required defaultValue={settings.appointment_duration_minutes} /></label>
            <label className="checkboxLabel"><input name="overdueRemindersEnabled" type="checkbox" defaultChecked={settings.overdue_reminders_enabled} /> Automatic overdue reminders</label>
            <button className="primaryButton" disabled={working}><Check size={15} /> Save master configuration</button>
          </form>
        </article>
      ) : null}
      <article className="panel listPanel">
        <div className="panelHead">
          <div>
            <span className="kicker">YOUR TEAM</span>
            <h2>Staff accounts</h2>
          </div>
          <div className="panelHeadActions">
            <button
              className="primaryButton"
              onClick={() => {
                setAdding(!adding);
                setHandover(null);
              }}
            >
              <Plus size={16} />
              {adding ? "Close" : "Add staff member"}
            </button>
          </div>
        </div>
        {error && <p className="caseWorkError">{error}</p>}

        <div className="staffFilters" aria-label="Staff filters">
          <label>
            Search team
            <input
              type="search"
              value={staffSearch}
              onChange={(event) => setStaffSearch(event.target.value)}
              placeholder="Name, email or department"
            />
          </label>
          <label>
            Status
            <select value={staffStatus} onChange={(event) => setStaffStatus(event.target.value)}>
              <option value="active">Active</option>
              <option value="inactive">Deactivated</option>
              <option value="all">All</option>
            </select>
          </label>
          <label>
            Branch
            <select value={staffBranch} onChange={(event) => setStaffBranch(event.target.value)}>
              <option value="">All branches</option>
              {adminBranches.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
          </label>
        </div>

        {handover && (
          <div className="handoverPanel">
            <strong>{handover.message}</strong>
            {handover.setupLink && (
              <>
                <code>{handover.setupLink}</code>
                <small>
                  Automatic email delivery is not configured. Share this
                  one-time setup link securely; no password is exposed.
                </small>
              </>
            )}
            <button className="ghostButton" onClick={() => setHandover(null)}>
              Done
            </button>
          </div>
        )}

        {adding && (
          <form
            className="stackedForm"
            onSubmit={async (event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const result = await send({
                action: "create_staff",
                displayName: data.get("displayName"),
                email: data.get("email"),
                level: data.get("level"),
                branchId: data.get("branchId") || null,
                department: data.get("department"),
              });
              if (result) {
                setAdding(false);
                setHandover({
                  message: result.message ?? "Staff account created.",
                  setupLink: result.setupLink,
                });
              }
            }}
          >
            <label>
              Full name *<input name="displayName" required />
            </label>
            <label>
              Work email *
              <input name="email" type="email" required />
              <small className="fieldHint">
                This is the address they sign in with.
              </small>
            </label>
            <label>
              Account level *
              <select name="level" defaultValue="staff">
                {STAFF_LEVELS.filter(
                  ([key]) => isOwner || key === "staff" || key === "partner",
                ).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
              {!isOwner && (
                <small className="fieldHint">
                  Only a Super Admin can create an administrator account.
                </small>
              )}
            </label>
            <label>
              Branch
              <select name="branchId" defaultValue="">
                <option value="">Your own branch</option>
                {adminBranches
                  .filter((branch) => branch.active)
                  .map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name} ({branch.code})
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Department
              <input name="department" placeholder="e.g. Admissions" />
            </label>
            <div className="formActions">
              <button className="primaryButton" disabled={working}>
                <Check size={15} />
                {working ? "Creating…" : "Create staff account"}
              </button>
              <button
                type="button"
                className="ghostButton"
                onClick={() => setAdding(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <div className="skeletonRow">
            <span className="skeletonBar" />
            <span className="skeletonBar short" />
          </div>
        ) : visibleProfiles.length === 0 ? (
          <p className="boardEmpty">No staff match these filters.</p>
        ) : (
          <>
          <div className="listSelectionTools">
            <SelectAllControl checked={staffSelection.allSelected} onChange={staffSelection.toggleAll} label="Select all shown staff except yourself" />
          </div>
          <BulkActionBar count={staffSelection.selected.length} onClear={staffSelection.clear}>
            <select
              aria-label="Move selected staff to branch"
              defaultValue=""
              disabled={working}
              onChange={(event) => {
                if (!event.target.value) return;
                void bulkUpdateStaff({ branchId: event.target.value });
                event.target.value = "";
              }}
            >
              <option value="">Move to branch…</option>
              {adminBranches.filter((branch) => branch.active).map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
            <button className="ghostButton" disabled={working} onClick={() => void bulkUpdateStaff({ active: true })}>Reactivate</button>
            <button className="ghostButton dangerAction" disabled={working} onClick={() => {
              if (confirm(`Deactivate ${staffSelection.selected.length} selected staff account${staffSelection.selected.length === 1 ? "" : "s"}? Their history will be retained.`)) void bulkUpdateStaff({ active: false });
            }}>Deactivate</button>
            <button className="ghostButton" onClick={() => downloadCsv("staff-selected.csv", staffSelection.selected.map((person) => ({
              name: person.display_name, email: person.email, level: person.level,
              branch: branchName(person.branch_id), department: person.department,
              status: person.active ? "Active" : "Deactivated",
            })))}><Download size={14} /> Export</button>
          </BulkActionBar>
          <div className="recordTableWrap">
            <table className="recordTable boardTable">
              <thead>
                <tr>
                  <th scope="col" className="selectionColumn"><span className="srOnly">Select</span></th>
                  <th scope="col">Name</th>
                  <th scope="col">Email</th>
                  <th scope="col">Level</th>
                  <th scope="col">Branch</th>
                  <th scope="col">Department</th>
                  <th scope="col">Status</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {visibleProfiles.map((person) => (
                  <tr
                    key={person.id}
                    className={person.active ? "" : "archivedRow"}
                  >
                    <td className="selectionColumn">
                      {person.id === currentProfileId ? <span className="bulkSelectionSpacer" /> : (
                        <RowSelection checked={staffSelection.selectedIds.has(person.id)} onChange={() => staffSelection.toggle(person.id)} label={`Select ${person.display_name}`} />
                      )}
                    </td>
                    <td>{person.display_name}</td>
                    <td>{person.email}</td>
                    <td>
                      {isOwner && person.level !== "student" ? (
                        <select
                          aria-label={`Account level for ${person.display_name}`}
                          value={person.level}
                          disabled={working}
                          onChange={(event) =>
                            void send({
                              action: "update_profile",
                              profileId: person.id,
                              level: event.target.value,
                            })
                          }
                        >
                          {STAFF_LEVELS.map(([key]) => (
                            <option key={key} value={key}>
                              {levelLabel(key)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        levelLabel(person.level)
                      )}
                    </td>
                    <td>
                      <select
                        aria-label={`Branch for ${person.display_name}`}
                        value={person.branch_id ?? ""}
                        disabled={working}
                        onChange={(event) =>
                          void send({
                            action: "update_profile",
                            profileId: person.id,
                            branchId: event.target.value || null,
                          })
                        }
                      >
                        <option value="">No branch</option>
                        {adminBranches.map((branch) => (
                          <option key={branch.id} value={branch.id}>
                            {branch.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>{person.department || "—"}</td>
                    <td>{person.active ? "Active" : "Deactivated"}</td>
                    <td>
                      {person.id === currentProfileId ? (
                        <span className="mutedCell">This is you</span>
                      ) : (
                        <div className="staffActions">
                          <button
                            className="linkButton"
                            disabled={working}
                            onClick={() => void send({ action: "update_profile", profileId: person.id, active: !person.active })}
                          >
                            {person.active ? "Deactivate" : "Reactivate"}
                          </button>
                          {isOwner && !person.active && (
                            <>
                              <select aria-label={`Replacement owner for ${person.display_name}`} value={replacementByProfile[person.id] ?? ""} onChange={(event) => setReplacementByProfile((current) => ({ ...current, [person.id]: event.target.value }))}>
                                <option value="">No active work to transfer</option>
                                {profiles.filter((candidate) => candidate.active && candidate.id !== person.id && candidate.level !== "student").map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.display_name}</option>)}
                              </select>
                              <button
                                className="linkButton dangerLink"
                                disabled={working}
                                onClick={() => {
                                  if (confirm(`Remove ${person.display_name}'s login and transfer all open responsibilities to the selected replacement? Historical actions will remain attributed to ${person.display_name}.`))
                                    void send({ action: "remove_staff", profileId: person.id, replacementProfileId: replacementByProfile[person.id] || null });
                                }}
                              >
                                Transfer and remove
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
        <p className="coverageIntro">
          Deactivating somebody keeps their history and stops them signing in.
          Deactivation is reversible. Remove account releases the email for a
          future account while retaining the historical actor required by the
          case and audit record; open cases must be transferred first.
        </p>
      </article>

      {actionableInvitations.length > 0 && (
        <article className="panel listPanel">
          <div className="panelHead">
            <div>
              <span className="kicker">WAITING TO SIGN IN</span>
              <h2>Invitations</h2>
            </div>
          </div>
          <p className="coverageIntro">
            Their CRM account is created the first time they sign in with the
            Supabase login for that address.
          </p>
          {actionableInvitations.map((invitation) => (
            <div className="functionalRow" key={invitation.id}>
              <UserCog size={18} />
              <div>
                <strong>{invitation.display_name || invitation.email}</strong>
                <span>
                  {invitation.email} · {levelLabel(invitation.level ?? "staff")}{" "}
                  · {branchName(invitation.branch_id)} · expires{" "}
                  {invitation.expires_at.slice(0, 10)}
                </span>
              </div>
              <Status value={invitation.status} />
              {invitation.status === "pending" ? (
                <button
                  className="linkButton"
                  disabled={working}
                  onClick={() =>
                    void send({
                      action: "revoke_invitation",
                      invitationId: invitation.id,
                    })
                  }
                >
                  Revoke
                </button>
              ) : (
                <button
                  className="linkButton"
                  disabled={working}
                  onClick={() =>
                    void send({
                      action: "resend_invitation",
                      invitationId: invitation.id,
                    })
                  }
                >
                  Resend
                </button>
              )}
            </div>
          ))}
        </article>
      )}

      <article className="panel listPanel">
        <div className="panelHead">
          <div>
            <span className="kicker">CLIENT PORTAL</span>
            <h2>Portal logins</h2>
          </div>
        </div>
        <p className="coverageIntro">
          A client sees nothing until their login is connected to their file.
          Until then their portal says so and asks them to contact you.
        </p>
        {portalAccounts.length === 0 ? (
          <p className="boardEmpty">
            No client logins yet. Create one under Add staff member with the
            Client / Student level, or invite them.
          </p>
        ) : (
          portalAccounts.map((person) => {
            const linked = clientLinks.find(
              (link) => link.profile_id === person.id,
            );
            return (
              <div className="functionalRow" key={person.id}>
                <GraduationCap size={18} />
                <div>
                  <strong>{person.display_name}</strong>
                  <span>{person.email}</span>
                  <small className={linked ? "" : "unlinkedHint"}>
                    {linked
                      ? `Connected to ${
                          clients.find((c) => c.id === linked.client_id)
                            ?.name ?? "a client record"
                        }`
                      : "Not connected to a client record yet"}
                  </small>
                </div>
                <select
                  aria-label={`Client record for ${person.display_name}`}
                  value={linked?.client_id ?? ""}
                  disabled={working}
                  onChange={(event) => {
                    if (!event.target.value) return;
                    void send({
                      action: "link_client_account",
                      profileId: person.id,
                      clientId: event.target.value,
                      endpoint: "operations",
                    });
                  }}
                >
                  <option value="">Connect to a client…</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
                {linked && (
                  <button
                    className="linkButton"
                    disabled={working}
                    onClick={() => {
                      if (
                        confirm(
                          `Disconnect ${person.display_name} from their client record? They can be reconnected at any time.`,
                        )
                      )
                        void send({
                          action: "unlink_client_account",
                          profileId: person.id,
                          endpoint: "operations",
                        });
                    }}
                  >
                    Disconnect
                  </button>
                )}
              </div>
            );
          })
        )}
      </article>

      <MergeClientsPanel />

      <article className="panel listPanel">
        <div className="panelHead">
          <div>
            <span className="kicker">MASTERS</span>
            <h2>Branches</h2>
          </div>
          {isOwner && (
            <button
              className="primaryButton"
              onClick={() => setAddingBranch(!addingBranch)}
            >
              <Plus size={16} />
              {addingBranch ? "Close" : "Add branch"}
            </button>
          )}
        </div>
        {isOwner && addingBranch && (
          <form
            className="stackedForm"
            onSubmit={async (event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const result = await send({
                action: "create_branch",
                name: data.get("name"),
                code: data.get("code"),
                countryCode: data.get("countryCode"),
              });
              if (result) setAddingBranch(false);
            }}
          >
            <label>
              Branch name *<input name="name" required />
            </label>
            <label>
              Code *
              <input name="code" required maxLength={8} placeholder="MEL" />
            </label>
            <label>
              Country *
              <input
                name="countryCode"
                required
                maxLength={2}
                placeholder="AU"
              />
            </label>
            <div className="formActions">
              <button className="primaryButton" disabled={working}>
                <Check size={15} />
                Add branch
              </button>
              <button
                type="button"
                className="ghostButton"
                onClick={() => setAddingBranch(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
        {adminBranches.length === 0 ? (
          <p className="boardEmpty">No branches yet.</p>
        ) : (
          adminBranches.map((branch) => (
            <div className="functionalRow" key={branch.id}>
              <Building2 size={18} />
              <div>
                <strong>
                  {branch.name} ({branch.code})
                </strong>
                <span>
                  {branch.country_code} ·{" "}
                  {profiles.filter((p) => p.branch_id === branch.id).length}{" "}
                  staff
                </span>
              </div>
              <Status value={branch.active ? "Active" : "Closed"} />
              <button
                className="linkButton"
                disabled={working}
                onClick={() =>
                  void send({
                    action: "update_branch",
                    branchId: branch.id,
                    active: !branch.active,
                  })
                }
              >
                {branch.active ? "Close" : "Reopen"}
              </button>
            </div>
          ))
        )}
      </article>

      <article className="panel permissionPanel">
        <div className="panelHead">
          <div>
            <span className="kicker">PERMISSION MAP</span>
            <h2>What each account can access</h2>
          </div>
          <Status value="Enforced by Supabase RLS" />
        </div>
        <div className="permissionTable">
          <div className="permissionHead">
            <span>Function</span>
            <b>Super Admin</b>
            <b>Admin</b>
            <b>Staff</b>
            <b>Client</b>
          </div>
          {permissionRows.map((row) => (
            <div className="permissionLine" key={row[0]}>
              <span>{row[0]}</span>
              {row.slice(1).map((value, i) => (
                <b key={i} className={value ? "allowed" : "denied"}>
                  {String(value) === "view" ? (
                    "View"
                  ) : value ? (
                    <Check size={15} />
                  ) : (
                    "—"
                  )}
                </b>
              ))}
            </div>
          ))}
        </div>
        {roles.length > 0 && (
          <div className="customRoles">
            <span className="kicker">CUSTOM STAFF ROLES</span>
            {roles.map((r) => (
              <div className="functionalRow" key={r.id}>
                <UserCog size={18} />
                <div>
                  <strong>{r.name}</strong>
                  <span>{r.scope} · inherits Staff permissions</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </article>
    </section>
  );
}

function CaseDrawer({
  item,
  close,
  edit,
  remove,
  moveStage,
  refresh,
  canModify,
  lifecycleReady,
  schemaWarning,
  storageConnected,
  onCaseAction,
}: {
  item: CaseRecord | null;
  close: () => void;
  edit: (x: CaseRecord) => void;
  remove: (id: string) => void;
  moveStage: (
    record: CaseRecord,
    stage: LifecycleStage,
    reason: string,
  ) => Promise<void>;
  refresh: () => Promise<void>;
  canModify: boolean;
  lifecycleReady: boolean;
  schemaWarning: string;
  storageConnected: boolean;
  onCaseAction: (caseId: string, kind?: "document" | "visaChecklist" | "invoice" | "message") => void;
}) {
  return item ? (
    <CaseDrawerBody
      item={item}
      close={close}
      edit={edit}
      remove={remove}
      moveStage={moveStage}
      refresh={refresh}
      canModify={canModify}
      lifecycleReady={lifecycleReady}
      schemaWarning={schemaWarning}
      storageConnected={storageConnected}
      onCaseAction={onCaseAction}
    />
  ) : null;
}

type CaseTab =
  | "overview"
  | "client"
  | "family"
  | "history"
  | "applications"
  | "visa"
  | "documents"
  | "communication"
  | "timeline"
  | "finance";

const caseTabs: [CaseTab, string][] = [
  ["overview", "Case home"],
  ["applications", "Applications"],
  ["visa", "Visa matter"],
  ["documents", "Documents"],
  ["communication", "Messages"],
  ["client", "Client details"],
  ["family", "Family"],
  ["history", "Background"],
  ["finance", "Finance"],
  ["timeline", "Activity & notes"],
];

const caseTabDescriptions: Record<CaseTab, string> = {
  overview: "Priorities, branch-wide access, deadlines and the complete case workflow.",
  applications: "Institution applications, offers, enrolment and COE progress.",
  visa: "Visa preparation, lodgement, checks and decision details.",
  documents: "Outstanding requests, received files and the document checklist.",
  communication: "The shared client conversation, including imported Gmail messages.",
  client: "Personal, contact, passport, consent and study-preference details.",
  family: "Dependants and family members connected to this client.",
  history: "Education, employment, English tests and previous visa history.",
  finance: "Invoices and payments recorded against this case.",
  timeline: "File notes and a complete, time-ordered audit trail.",
};

type CaseFile = {
  case: Record<string, unknown>;
  client: Record<string, unknown> | null;
  applications: Record<string, unknown>[];
  visaMatter: Record<string, unknown> | null;
  dependants: Record<string, unknown>[];
  documents: Record<string, unknown>[];
  tasks: Record<string, unknown>[];
  notes: CaseNote[];
  invoices: Record<string, unknown>[];
  communications: { id: string; channel?: string; sender: string; recipients: string[]; direction: string; body: string; sentAt: string; status: string; subject: string }[];
  intake: {
    education: Record<string, unknown>[];
    employment: Record<string, unknown>[];
    tests: Record<string, unknown>[];
    preferences: Record<string, unknown> | null;
    visaHistory: Record<string, unknown>[];
    declarations: Record<string, unknown>[];
  };
  timeline: {
    id: string;
    at: string;
    kind: string;
    title: string;
    detail: string | null;
    actorId: string | null;
    actorName: string;
  }[];
};

// What a client may be billed for. Anything else in the finance module -- a
// commission claim against a partner or an institution -- is internal.
const CLIENT_INVOICE_TYPES = [
  "professional_fee",
  "service_fee",
  "tuition",
  "application_fee",
  "visa_fee",
  "disbursement",
];

const APPLICATION_STATUS_OPTIONS = [
  "draft",
  "submitted",
  "offer_received",
  "offer_accepted",
  "coe_received",
  "deferred",
  "withdrawn",
  "rejected",
];
const CHECK_STATUS_OPTIONS = [
  "not_started",
  "requested",
  "in_progress",
  "completed",
  "not_required",
];
const humanise = (value: unknown) =>
  String(value ?? "")
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());
// Every value passed in here is either a plain `date` column (already the
// right calendar date, wherever it's read from) or a UTC timestamptz string,
// which orgDate converts to the organisation's timezone -- reading the two
// through the same call is safe because Melbourne is always ahead of UTC, so
// the conversion never rolls a date-only value back to the previous day.
const day = (value: unknown) => orgDate(value);
const text = (value: unknown) => (value == null ? "" : String(value));

function Field({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="factField">
      <small>{label}</small>
      <b>{text(value) || "—"}</b>
    </div>
  );
}

function FactList({
  title,
  rows,
  empty,
  className,
}: {
  title: string;
  rows: [string, unknown][];
  empty?: string;
  className?: string;
}) {
  const filled = rows.filter(([, value]) => text(value));
  return (
    <section className={`caseWorkPanel${className ? ` ${className}` : ""}`}>
      <span className="kicker">{title.toUpperCase()}</span>
      {filled.length === 0 ? (
        <p className="caseWorkEmpty">{empty ?? "Nothing recorded yet."}</p>
      ) : (
        <div className="factGrid">
          {filled.map(([label, value]) => (
            <Field key={label} label={label} value={value} />
          ))}
        </div>
      )}
    </section>
  );
}

function CaseDrawerBody({
  item,
  close,
  edit,
  remove,
  moveStage,
  refresh,
  canModify,
  lifecycleReady,
  schemaWarning,
  storageConnected,
  onCaseAction,
}: {
  item: CaseRecord;
  close: () => void;
  edit: (x: CaseRecord) => void;
  remove: (id: string) => void;
  moveStage: (
    record: CaseRecord,
    stage: LifecycleStage,
    reason: string,
  ) => Promise<void>;
  refresh: () => Promise<void>;
  canModify: boolean;
  lifecycleReady: boolean;
  schemaWarning: string;
  storageConnected: boolean;
  onCaseAction: (caseId: string, kind?: "document" | "visaChecklist" | "invoice" | "message") => void;
}) {
  const [tab, setTab] = useState<CaseTab>("overview");
  // Switching straight from one case to another, without closing the drawer,
  // kept the previous case's active tab -- one that may not exist on the new
  // case, since a migration case has no Applications tab. Reset it during
  // render when the case itself changes, the pattern React recommends for
  // adjusting state from a prop rather than doing it in an effect.
  const [tabResetFor, setTabResetFor] = useState(item.dbId);
  if (item.dbId !== tabResetFor) {
    setTabResetFor(item.dbId);
    setTab("overview");
  }
  const [reason, setReason] = useState("");
  const [moving, setMoving] = useState<LifecycleStage | "">("");
  // The visa stage cannot be entered without an expiry date. It is asked for
  // beside the action that needs it rather than on another screen.
  const [expiry, setExpiry] = useState(item.visaExpiry || "");
  const [recordedExpiry, setRecordedExpiry] = useState(item.visaExpiry || "");
  const [savingExpiry, setSavingExpiry] = useState(false);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [file, setFile] = useState<CaseFile | null>(null);
  const [newItem, setNewItem] = useState("");
  const [newNote, setNewNote] = useState("");
  const [working, setWorking] = useState(false);
  const [syncingMail, setSyncingMail] = useState(false);
  const [caseError, setCaseError] = useState("");
  const [sendingPortalAccess, setSendingPortalAccess] = useState(false);
  const [portalAccessResult, setPortalAccessResult] = useState<{
    message: string;
    setupLink?: string;
  } | null>(null);
  const caseId = item.dbId;
  const stage = item.lifecycleStage;
  const moves = allowedStageMoves(stage);
  const needsExpiry = !recordedExpiry;
  const direct = item.serviceType === "direct_visa";
  // A migration matter has no institution applications -- that tab describes
  // a Study Abroad case. Its own matter lives on the Visa matter tab. Finance
  // is scoped the same way row-level security scopes it: visible on a case
  // this account may actually change, not one it can merely see for cover.
  const availableTabs = (
    direct ? caseTabs.filter(([key]) => key !== "applications") : caseTabs
  ).filter(([key]) => key !== "finance" || canModify);
  // Nine tabs do not fit a phone. The four that carry the day's work stay in
  // view -- with the visa matter taking the place of applications on a
  // migration file -- and the rest move behind one control.
  const compact = useCompactScreen();
  const primaryTabs: CaseTab[] = direct
    ? ["overview", "visa", "documents", "communication"]
    : ["overview", "applications", "documents", "communication"];
  const shownTabs = compact
    ? availableTabs.filter(([key]) => primaryTabs.includes(key) || key === tab)
    : availableTabs;
  const moreTabs = compact
    ? availableTabs.filter(([key]) => !shownTabs.some(([shown]) => shown === key))
    : [];
  const needsExpiryFor = (next: LifecycleStage) =>
    needsExpiry && (next === "visa" || next === "completed");

  // Reads the whole case file. Kept free of state updates so the mount effect
  // can discard a response that arrives after the drawer has closed.
  const fetchCaseFile = async (id: string) => {
    const [fileResponse, checklistResponse] = await Promise.all([
      fetch(`/api/crm/casefile?caseId=${id}`, { cache: "no-store" }),
      fetch(`/api/crm/operations?view=checklist&caseId=${id}`, {
        cache: "no-store",
      }),
    ]);
    const fileResult = await fileResponse.json();
    const checklistResult = await checklistResponse.json();
    if (!fileResponse.ok)
      throw new Error(fileResult.error || "The case file could not be loaded.");
    return {
      file: fileResult as CaseFile,
      checklist: checklistResponse.ok
        ? ((checklistResult.data ?? []) as ChecklistItem[])
        : [],
    };
  };

  useEffect(() => {
    if (!caseId) return;
    let cancelled = false;
    void (async () => {
      try {
        const loaded = await fetchCaseFile(caseId);
        if (cancelled) return;
        setFile(loaded.file);
        setChecklist(loaded.checklist);
        setCaseError("");
      } catch (reason_) {
        if (!cancelled)
          setCaseError(
            reason_ instanceof Error
              ? reason_.message
              : "The case file could not be loaded.",
          );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [caseId]);

  const reload = async () => {
    if (!caseId) return;
    try {
      const loaded = await fetchCaseFile(caseId);
      setFile(loaded.file);
      setChecklist(loaded.checklist);
      setCaseError("");
    } catch (reason_) {
      setCaseError(
        reason_ instanceof Error ? reason_.message : "That did not reload.",
      );
    }
  };

  // Posts to an endpoint and refreshes the file, reporting the reason on failure.
  const send = async (url: string, body: Record<string, unknown>) => {
    setWorking(true);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "That did not save.");
      setCaseError("");
      await reload();
      // Status, deadlines and intake changes made inside a case must also be
      // visible on the dashboard and module lists immediately.
      await refresh();
      window.localStorage.setItem(
        "maximus.workspaceRefresh",
        window.localStorage.getItem("maximus.workspaceRefresh") === "1" ? "0" : "1",
      );
      return true;
    } catch (reason_) {
      setCaseError(
        reason_ instanceof Error ? reason_.message : "That did not save.",
      );
      return false;
    } finally {
      setWorking(false);
    }
  };
  const operation = (body: Record<string, unknown>) =>
    send("/api/crm/operations", body);
  const casefile = (body: Record<string, unknown>) =>
    send("/api/crm/casefile", body);
  const intake = (body: Record<string, unknown>) =>
    send("/api/crm/intake", body);

  const syncCaseMail = async () => {
    if (!caseId) return;
    setSyncingMail(true);
    try {
      const response = await fetch("/api/crm/mailbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync_case", caseId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Gmail could not be synchronised.");
      setCaseError(result.imported ? `${result.imported} Gmail message${result.imported === 1 ? "" : "s"} added to this conversation.` : "Gmail is up to date for this person.");
      await reload();
    } catch (reason_) {
      setCaseError(reason_ instanceof Error ? reason_.message : "Gmail could not be synchronised.");
    } finally {
      setSyncingMail(false);
    }
  };

  const run = async (next: LifecycleStage) => {
    setMoving(next);
    try {
      await moveStage(item, next, reason);
    } finally {
      setMoving("");
    }
  };

  const saveExpiry = async () => {
    setSavingExpiry(true);
    try {
      const response = await fetch("/api/crm/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_visa_expiry",
          caseId,
          visaExpiry: expiry,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "The date could not be saved.");
      setRecordedExpiry(expiry);
      setCaseError("");
      await refresh();
    } catch (reason_) {
      setCaseError(
        reason_ instanceof Error
          ? reason_.message
          : "The date could not be saved.",
      );
    } finally {
      setSavingExpiry(false);
    }
  };

  const client = file?.client ?? {};
  const clientId = String(item.clientId ?? "");
  const visa = file?.visaMatter ?? null;
  const activeTabLabel =
    availableTabs.find(([key]) => key === tab)?.[1] ?? "Case home";
  const outstandingDocuments = checklist.filter(
    (entry) => entry.status !== "completed" && entry.status !== "waived",
  ).length;
  const nextWork =
    outstandingDocuments > 0
      ? `${outstandingDocuments} document${outstandingDocuments === 1 ? "" : "s"} still required`
      : stage === "enquiry"
        ? "Complete the client details and convert this enquiry"
        : stage === "student"
          ? direct
            ? "Prepare the visa matter and confirm the document plan"
            : "Create or update the first institution application"
          : stage === "application"
            ? "Review application progress and prepare the visa stage"
            : stage === "visa"
              ? needsExpiry
                ? "Record the visa expiry date before progressing"
                : "Monitor the visa decision and record every update"
              : stage === "deferred"
                ? "Review the deferment and resume the case when ready"
                : "Review the completed file and its final records";
  const tabCount = (key: CaseTab) => {
    if (key === "applications") return file?.applications.length ?? 0;
    if (key === "family") return file?.dependants.length ?? 0;
    if (key === "documents") return outstandingDocuments;
    if (key === "communication") return file?.communications.length ?? 0;
    if (key === "finance") return file?.invoices.length ?? 0;
    return 0;
  };
  const navGroups: { label: string; tabs: CaseTab[] }[] = [
    {
      label: "Daily work",
      tabs: direct
        ? ["overview", "visa", "documents", "communication"]
        : ["overview", "applications", "visa", "documents", "communication"],
    },
    { label: "Client profile", tabs: ["client", "family", "history"] },
    { label: "Records", tabs: ["finance", "timeline"] },
  ];
  const latestNote = file?.notes[0] ?? null;
  const openCaseTasks = (file?.tasks ?? [])
    .filter((task) => String(task.status ?? "open") !== "completed")
    .slice(0, 3);
  const recentActivity = (file?.timeline ?? []).slice(0, 5);

  return (
    <div className="drawerBackdrop" onClick={close}>
      <aside className="caseDrawer wide" onClick={(e) => e.stopPropagation()}>
        <div className="drawerHead">
          <div>
            <span>{item.id}</span>
            <h2>{item.name}</h2>
            <p>
              {item.matterType || item.type} ·{" "}
              {item.serviceType === "direct_visa"
                ? "Migration"
                : "Study abroad"}
              {item.target ? ` · ${item.target}` : ""}
            </p>
          </div>
          <button
            className="iconButton"
            onClick={close}
            aria-label="Close case"
            title="Close case"
          >
            <X size={20} />
          </button>
        </div>

        <div className="caseWorkspaceLayout">
          <nav className="caseTabs" role="tablist" aria-label="Case sections">
            {compact ? (
              <>
                {shownTabs.map(([key, label]) => (
                  <button
                    key={key}
                    role="tab"
                    aria-selected={tab === key}
                    className={tab === key ? "active" : ""}
                    onClick={() => setTab(key)}
                  >
                    {label}
                    {tabCount(key) > 0 ? <b>{tabCount(key)}</b> : null}
                  </button>
                ))}
                {moreTabs.length > 0 && (
                  <select
                    className="caseTabsMore"
                    aria-label="More case sections"
                    title="More case sections"
                    value=""
                    onChange={(e) => {
                      if (e.target.value) setTab(e.target.value as CaseTab);
                    }}
                  >
                    <option value="">More…</option>
                    {moreTabs.map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}{tabCount(key) > 0 ? ` (${tabCount(key)})` : ""}
                      </option>
                    ))}
                  </select>
                )}
              </>
            ) : (
              navGroups.map((group) => {
                const tabs = group.tabs
                  .map((key) => availableTabs.find(([candidate]) => candidate === key))
                  .filter(Boolean) as [CaseTab, string][];
                if (tabs.length === 0) return null;
                return (
                  <div className="caseNavGroup" key={group.label}>
                    <span>{group.label}</span>
                    {tabs.map(([key, label]) => (
                      <button
                        key={key}
                        role="tab"
                        aria-selected={tab === key}
                        className={tab === key ? "active" : ""}
                        onClick={() => setTab(key)}
                      >
                        <span>{label}</span>
                        {tabCount(key) > 0 ? <b>{tabCount(key)}</b> : null}
                      </button>
                    ))}
                  </div>
                );
              })
            )}
          </nav>

          <main className="caseWorkspaceContent">
            <header className="caseSectionHead">
              <div>
                <span className="kicker">CASE WORKSPACE</span>
                <h2>{activeTabLabel}</h2>
                <p>{caseTabDescriptions[tab]}</p>
              </div>
              <div className="caseQuickActions">
                <button className="ghostButton" onClick={() => setTab("communication")}>
                  <Mail size={14} /> Message
                </button>
                <button className="ghostButton" onClick={() => setTab("documents")}>
                  <FileCheck2 size={14} /> Documents
                </button>
                <button className="ghostButton" onClick={() => edit(item)} disabled={!canModify}>
                  <Pencil size={14} /> Edit case
                </button>
              </div>
            </header>

            {caseError && <p className="caseWorkError">{caseError}</p>}

        {tab === "overview" && (
          <div className="caseHome">
            <section className="casePriorityBar">
              <div>
                <span className="kicker">NEXT PRIORITY</span>
                <h3>{nextWork}</h3>
                <p>
                  {stageLabelFor(stage, direct)} · shared with all staff in {item.branch || "this branch"}
                  {item.due ? ` · due ${item.due}` : " · no deadline set"}
                </p>
              </div>
              <button
                className="primaryButton"
                onClick={() =>
                  setTab(
                    outstandingDocuments > 0
                      ? "documents"
                      : direct
                        ? "visa"
                        : stage === "visa"
                          ? "visa"
                          : "applications",
                  )
                }
              >
                Open work area <ArrowRight size={15} />
              </button>
            </section>
            <div className="drawerHealth caseAtGlance">
              <div>
                <small>Stage</small>
                <strong>{stageLabelFor(stage, direct)}</strong>
              </div>
              <div>
                <small>Progress</small>
                <strong>{item.progress}%</strong>
              </div>
              <div>
                <small>Branch access</small>
                <strong>{item.branch || "Current branch"}</strong>
              </div>
              <div>
                <small>Visa expiry</small>
                <strong className={item.visaExpiry ? "" : "missingValue"}>
                  {item.visaExpiry || "Missing"}
                </strong>
              </div>
              <div>
                <small>Next deadline</small>
                <strong>{item.due || "Not set"}</strong>
              </div>
            </div>
            <FactList
              title="Case"
              className="caseFactsPanel"
              rows={[
                ["Matter type", item.matterType || "Not set"],
                [
                  "Service stream",
                  item.serviceType === "direct_visa"
                    ? "Migration"
                    : "Study abroad",
                ],
                ["Target", item.target],
                ["Branch", item.branch],
                ["Visa expiry", item.visaExpiry],
                ["Opened", day(item.createdAt)],
                ["Completed", item.completedAt],
                ["Reopened", item.reopenedAt],
              ]}
            />
            <section className="caseWorkPanel caseAuditPanel">
              <div className="caseWorkPanelHead">
                <div>
                  <span className="kicker">ACTIVITY &amp; AUDIT</span>
                  <h3>Every action records the staff member</h3>
                </div>
              </div>
              <p className="caseWorkEmpty">
                Everyone in {item.branch || "the branch"} can work on this case.
                Each change is time-stamped against the staff member who made it.
              </p>
              <form
                className="caseQuickNote"
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (!newNote.trim()) return;
                  if (
                    await operation({
                      action: "case_note",
                      caseId,
                      body: newNote.trim(),
                    })
                  )
                    setNewNote("");
                }}
              >
                <input
                  value={newNote}
                  onChange={(event) => setNewNote(event.target.value)}
                  placeholder="Add a note for everyone in this branch"
                  aria-label="Add a shared case note"
                />
                <button className="primaryButton" disabled={working || !newNote.trim()}>
                  Save note
                </button>
              </form>
              {latestNote && (
                <div className="caseLastNote">
                  <span>LAST NOTE</span>
                  <p>{latestNote.body}</p>
                  <small>{orgDateTime(latestNote.created_at)} · {item.branch}</small>
                </div>
              )}
              {openCaseTasks.length > 0 && (
                <div className="caseTaskSummary">
                  <strong>{openCaseTasks.length} open case task{openCaseTasks.length === 1 ? "" : "s"}</strong>
                  {openCaseTasks.map((task) => (
                    <div key={String(task.id)}>
                      <span>{String(task.title || "Case task")}</span>
                      <small>
                        {task.due_at ? `Due ${orgDate(task.due_at)}` : "No deadline"}
                        {task.priority ? ` · ${humanise(task.priority)} priority` : ""}
                      </small>
                    </div>
                  ))}
                </div>
              )}
              <ol className="caseAuditList">
                {recentActivity.map((entry) => (
                  <li key={entry.id}>
                    <span aria-hidden="true">
                      {entry.actorName
                        .split(" ")
                        .slice(0, 2)
                        .map((part) => part[0])
                        .join("")
                        .toUpperCase() || "S"}
                    </span>
                    <div>
                      <strong>{humanise(entry.title)}</strong>
                      <small>
                        {entry.actorName} · {orgDateTime(entry.at)} · {item.branch}
                      </small>
                    </div>
                  </li>
                ))}
              </ol>
              <button className="ghostButton" onClick={() => setTab("timeline")}>
                View complete audit trail
              </button>
            </section>
            <section className="lifecyclePanel">
              <span className="kicker">CASE PIPELINE</span>
              <ol className="lifecycleTrack">
                {LIFECYCLE_STAGES.map((step) => (
                  <li
                    key={step}
                    className={`${stageChipState(step, stage)}${
                      step === "deferred" ? " parked" : ""
                    }`}
                  >
                    <span>{stageLabelFor(step, direct)}</span>
                  </li>
                ))}
              </ol>
              {!lifecycleReady && (
                <p className="schemaNotice">
                  <AlertTriangle size={14} />
                  {schemaWarning}
                </p>
              )}
              {needsExpiry && (
                <div className="lifecycleBlocker">
                  <p>
                    <AlertTriangle size={14} />
                    The visa stage is worked against the client&apos;s current
                    visa expiry, so it has to be recorded before this case can
                    move to visa or be completed.
                  </p>
                  <div className="lifecycleBlockerRow">
                    <label htmlFor="lifecycleVisaExpiry">
                      Visa expiry date
                    </label>
                    <input
                      id="lifecycleVisaExpiry"
                      name="lifecycleVisaExpiry"
                      type="date"
                      value={expiry}
                      onChange={(e) => setExpiry(e.target.value)}
                    />
                    <button
                      type="button"
                      className="ghostButton"
                      disabled={savingExpiry || !expiry}
                      onClick={() => void saveExpiry()}
                    >
                      {savingExpiry ? "Saving…" : "Record expiry"}
                    </button>
                  </div>
                </div>
              )}
              <label className="lifecycleReason">
                Reason (optional)
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={
                    stage === "visa"
                      ? "e.g. Visa approved"
                      : stage === "deferred"
                        ? "e.g. Enrolled for the July intake"
                        : "e.g. Documents received"
                  }
                />
              </label>
              <div className="lifecycleActions">
                {moves.map((next) => (
                  <button
                    key={next}
                    type="button"
                    className={
                      next === "completed" ? "primaryButton" : "ghostButton"
                    }
                    disabled={
                      moving !== "" ||
                      !lifecycleReady ||
                      needsExpiryFor(next) ||
                      !canModify
                    }
                    title={
                      !canModify
                        ? "You do not have access to modify this branch record."
                        : needsExpiryFor(next)
                          ? "Record the visa expiry date above first"
                          : undefined
                    }
                    onClick={() => void run(next)}
                  >
                    {next === "completed" ? (
                      <>
                        <Check size={15} />
                        Mark visa approved &amp; complete
                      </>
                    ) : next === "deferred" ? (
                      <>
                        <Clock3 size={15} />
                        Defer this case
                      </>
                    ) : stage === "completed" ? (
                      <>
                        <RefreshCw size={15} />
                        Reopen in {stageLabelFor(next, direct).toLowerCase()}
                      </>
                    ) : stage === "deferred" ? (
                      <>
                        <RefreshCw size={15} />
                        Resume in {stageLabelFor(next, direct).toLowerCase()}
                      </>
                    ) : (
                      <>
                        <ArrowRight size={15} />
                        Move to {stageLabelFor(next, direct).toLowerCase()}
                      </>
                    )}
                  </button>
                ))}
              </div>
              {stage === "student" && canModify && (
                <div className="handoverPanel">
                  <button
                    type="button"
                    className="ghostButton"
                    disabled={sendingPortalAccess}
                    onClick={async () => {
                      setSendingPortalAccess(true);
                      setPortalAccessResult(null);
                      try {
                        const response = await fetch("/api/crm/workspace", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            action: "send_portal_access",
                            clientId: item.clientId,
                          }),
                        });
                        const result = await response.json().catch(() => ({}));
                        setPortalAccessResult({
                          message: response.ok
                            ? result.message || "Portal access was sent."
                            : result.error || "Portal access could not be sent.",
                          setupLink: response.ok ? result.setupLink : undefined,
                        });
                      } catch {
                        setPortalAccessResult({
                          message: "Portal access could not be sent.",
                        });
                      } finally {
                        setSendingPortalAccess(false);
                      }
                    }}
                  >
                    <Send size={14} />
                    {sendingPortalAccess ? "Sending…" : "Send portal access"}
                  </button>
                  {portalAccessResult && (
                    <>
                      <strong>{portalAccessResult.message}</strong>
                      {portalAccessResult.setupLink && (
                        <>
                          <code>{portalAccessResult.setupLink}</code>
                          <small>
                            This link is shown once and is not stored anywhere
                            you can read it again.
                          </small>
                        </>
                      )}
                    </>
                  )}
                </div>
              )}
            </section>
          </div>
        )}

        {tab === "client" && (
          <>
            <FactList
              title="Personal"
              rows={[
                ["Preferred name", client.preferred_name],
                ["Email", client.email],
                ["Mobile", client.mobile],
                ["Alternate mobile", (client.custom_fields as Record<string, unknown> | null)?.alternatePhone],
                ["Date of birth", day(client.date_of_birth)],
                ["Nationality", client.nationality],
                ["Country of birth", client.country_of_birth],
                ["Current country", client.current_country],
                ["Gender", client.gender],
                ["Marital status", humanise(client.marital_status)],
                ["Preferred language", client.preferred_language],
                ["CRM reference", client.crm_id],
                ["Source", client.source],
              ]}
            />
            <FactList
              title="Passport and consent"
              rows={[
                ["Passport country", client.passport_country],
                ["Passport number", client.passport_masked],
                ["Passport issue", (client.custom_fields as Record<string, unknown> | null)?.passportIssue],
                ["Passport expiry", day(client.passport_expiry)],
                [
                  "Privacy consent",
                  client.privacy_consent_at ? orgDate(client.privacy_consent_at) : "",
                ],
                ["Marketing consent", client.marketing_consent ? "Yes" : "No"],
              ]}
            />
            <FactList
              title="Address and intake declarations"
              rows={[
                ["Street", (client.address as Record<string, unknown> | null)?.line1],
                ["City", (client.address as Record<string, unknown> | null)?.city],
                ["State / province", (client.address as Record<string, unknown> | null)?.state],
                ["Postcode", (client.address as Record<string, unknown> | null)?.postcode],
                ["Visited another country", (client.custom_fields as Record<string, unknown> | null)?.visitedOtherCountry],
                ["Travel country", (client.custom_fields as Record<string, unknown> | null)?.travelCountry],
                ["Travel date", (client.custom_fields as Record<string, unknown> | null)?.travelDate],
                ["Travel purpose", (client.custom_fields as Record<string, unknown> | null)?.travelPurpose],
                ["Visa refusal", (client.custom_fields as Record<string, unknown> | null)?.hasVisaRefusal],
                ["Refusal details", (client.custom_fields as Record<string, unknown> | null)?.refusalDetails],
                ["History gap", [(client.custom_fields as Record<string, unknown> | null)?.gapFrom, (client.custom_fields as Record<string, unknown> | null)?.gapTo].filter(Boolean).join(" to ")],
                ["Gap reason", (client.custom_fields as Record<string, unknown> | null)?.gapReason],
              ]}
              empty="No address, travel, refusal or gap information recorded."
            />
            {file?.intake.preferences && (
              <FactList
                title="Study preferences"
                rows={[
                  [
                    "Destinations",
                    (
                      file.intake.preferences.destination_countries as string[]
                    )?.join(", "),
                  ],
                  [
                    "Levels",
                    (file.intake.preferences.study_levels as string[])?.join(
                      ", ",
                    ),
                  ],
                  [
                    "Fields",
                    (file.intake.preferences.fields_of_study as string[])?.join(
                      ", ",
                    ),
                  ],
                  ["Budget", file.intake.preferences.annual_budget],
                  ["Funding", file.intake.preferences.funding_source],
                ]}
              />
            )}
          </>
        )}

        {tab === "family" && (
          <FamilyTab
            dependants={file?.dependants ?? []}
            clientId={String(item.clientId ?? "")}
            working={working}
            onSave={casefile}
          />
        )}

        {tab === "history" && (
          <>
            <HistorySection
              title="Education"
              rows={file?.intake.education ?? []}
              columns={[
                ["Institution", "institution"],
                ["Qualification", "qualification"],
                ["From", "started_on"],
                ["To", "completed_on"],
                ["Result", "result"],
              ]}
              fields={[
                ["institution", "Institution", "text", true],
                ["qualification", "Qualification", "text", true],
                ["fieldOfStudy", "Field of study", "text", false],
                ["countryCode", "Country", "text", false],
                ["startedOn", "Started", "date", false],
                ["completedOn", "Completed", "date", false],
                ["result", "Result", "text", false],
              ]}
              action="education"
              clientId={clientId}
              working={working}
              onSave={intake}
            />
            <HistorySection
              title="Employment"
              rows={file?.intake.employment ?? []}
              columns={[
                ["Employer", "employer"],
                ["Role", "job_title"],
                ["From", "started_on"],
                ["To", "ended_on"],
                ["Hours", "hours_per_week"],
              ]}
              fields={[
                ["employer", "Employer", "text", true],
                ["jobTitle", "Job title", "text", true],
                ["countryCode", "Country", "text", false],
                ["startedOn", "Started", "date", false],
                ["endedOn", "Ended", "date", false],
                ["hoursPerWeek", "Hours per week", "number", false],
                ["duties", "Duties", "text", false],
              ]}
              action="employment"
              clientId={clientId}
              working={working}
              onSave={intake}
            />
            <HistorySection
              title="English tests"
              rows={file?.intake.tests ?? []}
              columns={[
                ["Test", "test_type"],
                ["Date", "test_date"],
                ["Overall", "overall"],
                ["Expires", "expires_on"],
              ]}
              fields={[
                ["testType", "Test type", "text", true],
                ["testDate", "Test date", "date", false],
                ["overall", "Overall", "number", false],
                ["listening", "Listening", "number", false],
                ["reading", "Reading", "number", false],
                ["writing", "Writing", "number", false],
                ["speaking", "Speaking", "number", false],
                ["referenceNumber", "Reference", "text", false],
                ["expiresOn", "Expires", "date", false],
              ]}
              action="english_test"
              clientId={clientId}
              working={working}
              onSave={intake}
            />
            <HistorySection
              title="Visa history"
              rows={file?.intake.visaHistory ?? []}
              columns={[
                ["Country", "country_code"],
                ["Visa", "visa_type"],
                ["Status", "status"],
                ["Granted", "granted_on"],
                ["Expires", "expires_on"],
              ]}
              fields={[
                ["countryCode", "Country", "text", true],
                ["visaType", "Visa type", "text", true],
                ["status", "Status", "text", true],
                ["appliedOn", "Applied", "date", false],
                ["grantedOn", "Granted", "date", false],
                ["expiresOn", "Expires", "date", false],
                ["refusalReason", "Refusal reason", "text", false],
              ]}
              action="visa_history"
              clientId={clientId}
              working={working}
              onSave={intake}
            />
          </>
        )}

        {tab === "applications" && (
          <ApplicationsTab
            applications={file?.applications ?? []}
            caseId={caseId ?? ""}
            working={working}
            onSave={casefile}
          />
        )}

        {tab === "visa" && (
          <VisaMatterTab
            matter={visa}
            caseId={caseId ?? ""}
            working={working}
            onSave={casefile}
          />
        )}

        {tab === "documents" && (
          <>
            <section className="caseWorkPanel">
              <div className="caseWorkPanelHead">
                <span className="kicker">DOCUMENT CHECKLIST</span>
                <div className="caseWorkPanelActions">
                  <button
                    type="button"
                    className="ghostButton"
                    onClick={() => onCaseAction(caseId ?? "", "visaChecklist")}
                  >
                    <FileCheck2 size={14} />
                    Document checklist
                  </button>
                  <button
                    type="button"
                    className="ghostButton"
                    onClick={() => onCaseAction(caseId ?? "", "document")}
                  >
                    <Plus size={14} />
                    Request document
                  </button>
                </div>
              </div>
              {checklist.length === 0 ? (
                <p className="caseWorkEmpty">
                  Nothing on the checklist yet. Add the documents this case
                  needs.
                </p>
              ) : (
                <ul className="checklist">
                  {checklist.map((entry) => {
                    const settled =
                      entry.status === "completed" || entry.status === "waived";
                    return (
                      <li key={entry.id} className={settled ? "settled" : ""}>
                        <span className="checklistInfo">
                          <b>{entry.title}</b>
                          <small>
                            {entry.required ? "Required" : "Optional"}
                            {entry.due_at ? ` · due ${day(entry.due_at)}` : ""}
                            {settled ? ` · ${entry.status}` : ""}
                          </small>
                        </span>
                        {!settled && (
                          <span className="checklistActions">
                            <button
                              type="button"
                              className="ghostButton"
                              disabled={working}
                              onClick={() =>
                                void operation({
                                  action: "complete_checklist_item",
                                  id: entry.id,
                                })
                              }
                            >
                              <Check size={14} />
                              Received
                            </button>
                            <button
                              type="button"
                              className="ghostButton"
                              disabled={working}
                              onClick={() =>
                                void operation({
                                  action: "complete_checklist_item",
                                  id: entry.id,
                                  waived: true,
                                })
                              }
                            >
                              Waive
                            </button>
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              <form
                className="inlineAdd"
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (!newItem.trim()) return;
                  if (
                    await operation({
                      action: "checklist_item",
                      caseId,
                      title: newItem.trim(),
                    })
                  )
                    setNewItem("");
                }}
              >
                <input
                  value={newItem}
                  onChange={(event) => setNewItem(event.target.value)}
                  placeholder="Add a required document"
                  aria-label="Add a checklist item"
                />
                <button
                  className="ghostButton"
                  disabled={working || !newItem.trim()}
                >
                  <Plus size={14} />
                  Add
                </button>
              </form>
            </section>
            <DocumentsPanel
              documents={file?.documents ?? []}
              storageConnected={storageConnected}
              onChanged={reload}
            />
          </>
        )}

        {tab === "communication" && (
          <section className="caseWorkPanel">
            <div className="caseWorkPanelHead">
              <div>
                <span className="kicker">SHARED CLIENT CONVERSATION</span>
                <h3>Email and messages</h3>
              </div>
              <div className="caseWorkPanelActions">
                <button className="ghostButton" disabled={syncingMail} onClick={() => void syncCaseMail()}>
                  <RefreshCw size={14} className={syncingMail ? "spin" : ""} />
                  {syncingMail ? "Checking Gmail…" : "Receive from Gmail"}
                </button>
                <button className="primaryButton" onClick={() => onCaseAction(caseId ?? "", "message")}>
                  <Plus size={14} /> New message
                </button>
              </div>
            </div>
            {(file?.communications ?? []).length === 0 ? (
              <p className="caseWorkEmpty">No communication is linked to this case yet.</p>
            ) : (
              <div className="communicationFeed">
                {(file?.communications ?? []).map((message) => (
                  <article key={message.id}>
                    <div><strong>{message.subject}</strong><Status value={message.status || message.direction} /></div>
                    <small>{message.sender} · {orgDateTime(message.sentAt)}</small>
                    <p>{message.body || "No preview available."}</p>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {tab === "timeline" && (
          <section className="caseWorkPanel">
            <span className="kicker">FILE NOTE AND ACTIVITY</span>
            <p className="caseWorkEmpty">
              Every note, stage change and recorded action, newest first. Each
              entry identifies the staff member who performed it.
            </p>
            <form
              className="inlineAdd"
              onSubmit={async (event) => {
                event.preventDefault();
                if (!newNote.trim()) return;
                if (
                  await operation({
                    action: "case_note",
                    caseId,
                    body: newNote.trim(),
                  })
                )
                  setNewNote("");
              }}
            >
              <input
                value={newNote}
                onChange={(event) => setNewNote(event.target.value)}
                placeholder="Record a call, advice given or an instruction received"
                aria-label="Add a file note"
              />
              <button
                className="ghostButton"
                disabled={working || !newNote.trim()}
              >
                <Plus size={14} />
                Record
              </button>
            </form>
            {file && file.timeline.length === 0 ? (
              <p className="caseWorkEmpty">Nothing recorded yet.</p>
            ) : (
              <ol className="timeline">
                {(file?.timeline ?? []).map((entry) => (
                  <li key={entry.id} className={`kind-${entry.kind}`}>
                    <div>
                      <b>{humanise(entry.title)}</b>
                      {entry.detail && <p>{entry.detail}</p>}
                      <small>
                        {entry.actorName} · {orgDateTime(entry.at)} · {item.branch}
                        {entry.kind === "private_note" ? " · private" : ""}
                      </small>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}

        {tab === "finance" && (
          <>
            {canModify && (
              <div className="caseWorkPanelHead">
                <span />
                <div className="caseWorkPanelActions">
                  <button
                    type="button"
                    className="ghostButton"
                    onClick={() => onCaseAction(caseId ?? "", "invoice")}
                  >
                    <Plus size={14} />
                    Create invoice
                  </button>
                </div>
              </div>
            )}
            <CaseInvoices
              invoices={file?.invoices ?? []}
              documents={file?.documents ?? []}
              caseId={caseId ?? ""}
              storageConnected={storageConnected}
              onChanged={reload}
            />
          </>
        )}

        <div className="drawerFooter">
          <button
            className="ghostButton"
            onClick={() => edit(item)}
            disabled={!canModify}
            title={
              canModify
                ? undefined
                : "You do not have access to modify this branch record."
            }
          >
            <Pencil size={15} />
            Edit
          </button>
          <button
            className="ghostButton dangerButton"
            onClick={() => remove(item.id)}
          >
            <Trash2 size={15} />
            {canModify ? "Archive" : "Request archive"}
          </button>
        </div>
          </main>
        </div>
      </aside>
    </div>
  );
}

/**
 * A history table with its own add form, so what the long intake form used to
 * ask for is captured here instead, as proper records.
 */
function HistorySection({
  title,
  rows,
  columns,
  fields,
  action,
  clientId,
  working,
  onSave,
}: {
  title: string;
  rows: Record<string, unknown>[];
  columns: [string, string][];
  fields: [string, string, string, boolean][];
  action: string;
  clientId: string;
  working: boolean;
  onSave: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <section className="caseWorkPanel">
      <span className="kicker">{title.toUpperCase()}</span>
      {rows.length === 0 ? (
        <p className="caseWorkEmpty">Nothing recorded yet.</p>
      ) : (
        <div className="recordTableWrap">
          <table className="recordTable">
            <thead>
              <tr>
                {columns.map(([label]) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={String(row.id ?? index)}>
                  {columns.map(([label, key]) => (
                    <td key={label}>{humanise(row[key]) || "—"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {adding ? (
        <form
          className="stackedForm"
          onSubmit={async (event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const body: Record<string, unknown> = { action, clientId };
            for (const [name, , kind] of fields) {
              const raw = data.get(name);
              if (raw === null || raw === "") continue;
              body[name] = kind === "number" ? Number(raw) : raw;
            }
            if (await onSave(body)) setAdding(false);
          }}
        >
          {fields.map(([name, label, kind, requiredField]) => (
            <label key={name}>
              {label}
              {requiredField ? " *" : ""}
              <input
                name={name}
                type={kind === "number" ? "number" : kind}
                step={kind === "number" ? "any" : undefined}
                required={requiredField}
              />
            </label>
          ))}
          <div className="formActions">
            <button className="primaryButton" disabled={working}>
              <Plus size={15} />
              Add
            </button>
            <button
              type="button"
              className="ghostButton"
              onClick={() => setAdding(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button className="ghostButton" onClick={() => setAdding(true)}>
          <Plus size={15} />
          Add {title.toLowerCase().replace(/s$/, "")}
        </button>
      )}
    </section>
  );
}

function CaseInvoices({
  invoices,
  documents,
  caseId,
  storageConnected,
  onChanged,
}: {
  invoices: Record<string, unknown>[];
  documents: Record<string, unknown>[];
  caseId: string;
  storageConnected: boolean;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const pdfFor = (invoiceId: string) =>
    documents.find((document) => {
      const metadata = (document.metadata as Record<string, unknown> | null) ?? {};
      return metadata.source === "invoice_pdf" && String(metadata.invoice_id) === invoiceId;
    });

  const storePdf = async (invoice: Record<string, unknown>, chosen: File) => {
    const invoiceId = String(invoice.id ?? "");
    if (chosen.type !== "application/pdf" && !chosen.name.toLowerCase().endsWith(".pdf")) {
      setError("Invoice attachments must be PDF files.");
      return;
    }
    setBusy(invoiceId);
    setError("");
    try {
      let documentId = String(pdfFor(invoiceId)?.id ?? "");
      if (!documentId) {
        const prepared = await fetch("/api/crm/casefile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "invoice_pdf_prepare", invoiceId, caseId }),
        });
        const preparedResult = await prepared.json().catch(() => ({}));
        if (!prepared.ok)
          throw new Error(preparedResult.error || "The invoice PDF slot could not be prepared.");
        documentId = String(preparedResult.documentId || "");
      }
      const upload = new FormData();
      upload.append("documentId", documentId);
      upload.append("file", chosen);
      const response = await fetch("/api/crm/documents", { method: "POST", body: upload });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "The invoice PDF could not be stored.");
      await onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The invoice PDF could not be stored.");
    } finally {
      setBusy("");
    }
  };

  return (
    <section className="caseWorkPanel">
      <span className="kicker">INVOICES</span>
      {invoices.length === 0 ? (
        <p className="caseWorkEmpty">No invoices raised for this case.</p>
      ) : (
        <div className="recordTableWrap">
          <table className="recordTable caseInvoiceTable">
            <thead>
              <tr>
                <th>Invoice</th><th>Type</th><th>Total</th><th>Paid</th><th>State</th><th>Due</th><th>PDF</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => {
                const invoiceId = String(invoice.id ?? "");
                const pdf = pdfFor(invoiceId);
                const stored = Boolean(pdf?.drive_file_id);
                return (
                  <tr key={invoiceId}>
                    <td>{humanise(invoice.invoice_number) || "—"}</td>
                    <td>{humanise(invoice.invoice_type)}</td>
                    <td>{String(invoice.currency || "AUD")} {Number(invoice.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td>{Number(invoice.paid || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td><Status value={String(invoice.state || "issued")} /></td>
                    <td>{day(invoice.due_on) || "Not set"}</td>
                    <td>
                      <div className="invoicePdfActions">
                        {stored ? (
                          <a className="ghostButton" href={`/api/crm/documents?documentId=${String(pdf?.id)}`}>
                            <Download size={13} /> View PDF
                          </a>
                        ) : null}
                        <label className={`ghostButton${!storageConnected ? " disabled" : ""}`}>
                          <Cloud size={13} />
                          {busy === invoiceId ? "Storing…" : stored ? "Replace" : "Add PDF"}
                          <input
                            type="file"
                            accept="application/pdf,.pdf"
                            disabled={!storageConnected || busy === invoiceId}
                            onChange={(event) => {
                              const chosen = event.target.files?.[0];
                              if (chosen) void storePdf(invoice, chosen);
                              event.currentTarget.value = "";
                            }}
                          />
                        </label>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {error ? <p className="caseWorkError">{error}</p> : null}
    </section>
  );
}

function DocumentsPanel({
  documents,
  storageConnected,
  onChanged,
}: {
  documents: Record<string, unknown>[];
  storageConnected: boolean;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const store = async (documentId: string, chosen: File) => {
    setBusy(documentId);
    setError("");
    try {
      const body = new FormData();
      body.append("documentId", documentId);
      body.append("file", chosen);
      const response = await fetch("/api/crm/documents", {
        method: "POST",
        body,
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "The file was not stored.");
      await onChanged();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "The file was not stored.",
      );
    } finally {
      setBusy("");
    }
  };

  return (
    <section className="caseWorkPanel">
      <span className="kicker">DOCUMENTS</span>
      {!storageConnected && (
        <p className="schemaNotice">
          <AlertTriangle size={14} />
          The Shared Drive is not connected, so files cannot be stored yet. Set
          the Google service account and Shared Drive ID to enable it.
        </p>
      )}
      {documents.length === 0 ? (
        <p className="caseWorkEmpty">
          No documents requested for this case yet. Request one, then attach the
          file when it arrives.
        </p>
      ) : (
        <ul className="documentList">
          {documents.map((row) => {
            const id = String(row.id);
            const stored = Boolean(row.drive_file_id);
            const size = Number(row.size_bytes ?? 0);
            return (
              <li key={id}>
                <div className="docIcon">
                  <FileText size={17} />
                </div>
                <div className="documentMeta">
                  <b>{text(row.display_name)}</b>
                  <small>
                    {humanise(row.document_type)} · {humanise(row.state)}
                    {stored && size ? ` · ${(size / 1024).toFixed(0)} KB` : ""}
                  </small>
                </div>
                {stored ? (
                  <a
                    className="ghostButton"
                    href={`/api/crm/documents?documentId=${id}`}
                  >
                    <Download size={14} />
                    Download
                  </a>
                ) : (
                  <label
                    className={`ghostButton fileButton${
                      storageConnected ? "" : " disabled"
                    }`}
                  >
                    <Cloud size={14} />
                    {busy === id ? "Storing…" : "Attach file"}
                    <input
                      type="file"
                      disabled={!storageConnected || busy === id}
                      onChange={(event) => {
                        const chosen = event.target.files?.[0];
                        event.target.value = "";
                        if (chosen) void store(id, chosen);
                      }}
                    />
                  </label>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {error && <p className="caseWorkError">{error}</p>}
    </section>
  );
}

/** Records why a migration file record was withdrawn, rather than deleting it. */
function ArchiveForm({
  title,
  outcomes,
  working,
  onCancel,
  onConfirm,
}: {
  title: string;
  outcomes: string[];
  working: boolean;
  onCancel: () => void;
  onConfirm: (outcome: string, reason: string) => Promise<void>;
}) {
  return (
    <form
      className="stackedForm"
      onSubmit={async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        await onConfirm(
          String(data.get("outcome") ?? "withdrawn"),
          String(data.get("reason") ?? ""),
        );
      }}
    >
      <p className="caseWorkEmpty wideNote">
        {title}. Nothing is deleted: the record stays on the file with the
        reason, the date and who did it.
      </p>
      <label>
        Outcome
        <select name="outcome" defaultValue={outcomes[0]}>
          {outcomes.map((option) => (
            <option key={option} value={option}>
              {humanise(option)}
            </option>
          ))}
        </select>
      </label>
      <label className="wide">
        Reason *<input name="reason" required />
      </label>
      <div className="formActions">
        <button className="primaryButton" disabled={working}>
          <Check size={15} />
          Confirm
        </button>
        <button type="button" className="ghostButton" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function CourseApplicationFields() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CourseFinderCourse[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [institution, setInstitution] = useState("");
  const [course, setCourse] = useState("");
  const [campus, setCampus] = useState("");
  const [intake, setIntake] = useState("");
  const [selectedSource, setSelectedSource] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      if (query.trim().length < 2) {
        setResults([]);
        setSearching(false);
        return;
      }
      setSearching(true);
      try {
        const params = new URLSearchParams({ q: query.trim(), limit: "8", page: "1" });
        const response = await fetch(`/api/crm/course-finder?${params}`, { cache: "no-store", signal: controller.signal });
        const result = await response.json();
        if (response.ok) setResults(result.courses || []);
      } catch (reason) {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query]);

  const choose = (item: CourseFinderCourse) => {
    setInstitution(cleanCatalogueText(item.institution_name, ""));
    setCourse(cleanCatalogueText(item.name, ""));
    setCampus(cleanCatalogueText(item.campus || item.institution_city, ""));
    setIntake(cleanCatalogueText(item.intake_months, ""));
    setSelectedSource(item.catalogue_verified_at || item.source_updated_at || "");
    setQuery(`${cleanCatalogueText(item.institution_name, "")} · ${cleanCatalogueText(item.name, "")}`);
    setOpen(false);
  };

  return (
    <>
      <div className="courseApplicationPicker wide">
        <label htmlFor="application-course-search">Find a course in the catalogue</label>
        <div className="institutionPickerControl">
          <Search size={16} />
          <input id="application-course-search" value={query} onFocus={() => setOpen(true)} onChange={(event) => { setQuery(event.target.value); setOpen(true); }} placeholder="Search institution, course, campus or code…" autoComplete="off" />
          {searching && <RefreshCw className="spin" size={15} />}
        </div>
        {open && query.trim().length >= 2 && (
          <div className="courseApplicationOptions">
            {results.map((item) => (
              <button type="button" key={item.id} onClick={() => choose(item)}>
                <strong>{cleanCatalogueText(item.name)}</strong>
                <span>{cleanCatalogueText(item.institution_name)} · {cleanCatalogueText(item.country)} · {cleanCatalogueText(item.campus || item.institution_city, "Campus to confirm")}</span>
                <small>{[catalogueLevelLabel(item.level), item.intake_months, item.tuition_fee ? `${item.currency} ${Number(item.tuition_fee).toLocaleString()}` : null].filter(Boolean).join(" · ")}</small>
              </button>
            ))}
            {!searching && results.length === 0 && <p>No catalogue result. Broaden the search or enter the confirmed details below.</p>}
          </div>
        )}
        {selectedSource && <small className="catalogueSelectionSource"><Check size={13} /> Catalogue fields filled automatically · source checked {new Date(selectedSource).toLocaleDateString()}</small>}
      </div>
      <label>
        Institution *<input name="institution" required value={institution} onChange={(event) => setInstitution(event.target.value)} />
      </label>
      <label>
        Course *<input name="course" required value={course} onChange={(event) => setCourse(event.target.value)} />
      </label>
      <label>
        Campus<input name="campus" value={campus} onChange={(event) => setCampus(event.target.value)} />
      </label>
      <label>
        Intake<input name="intake" value={intake} onChange={(event) => setIntake(event.target.value)} placeholder="e.g. February 2027" />
      </label>
    </>
  );
}

function ApplicationsTab({
  applications,
  caseId,
  working,
  onSave,
}: {
  applications: Record<string, unknown>[];
  caseId: string;
  working: boolean;
  onSave: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [adding, setAdding] = useState(false);
  const [archiving, setArchiving] = useState("");
  return (
    <section className="caseWorkPanel">
      <span className="kicker">EDUCATION APPLICATIONS</span>
      <p className="caseWorkEmpty">
        A student can hold several applications at once. Each carries its own
        institution, course, intake and status.
      </p>
      {applications.length > 0 && (
        <div className="recordTableWrap">
          <table className="recordTable">
            <thead>
              <tr>
                <th>Institution</th>
                <th>Course</th>
                <th>Intake</th>
                <th>Reference</th>
                <th>Partner / associate</th>
                <th>Status</th>
                <th>Deadline</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {applications.map((row) => (
                <tr key={String(row.id)}>
                  <td>{text(row.institution)}</td>
                  <td>{text(row.course)}</td>
                  <td>{text(row.intake) || "—"}</td>
                  <td>{text(row.application_reference) || "—"}</td>
                  <td>{[
                    text((row.details as Record<string, unknown> | null)?.partner),
                    text((row.details as Record<string, unknown> | null)?.associate),
                  ].filter(Boolean).join(" · ") || "—"}</td>
                  <td>
                    <select
                      value={text(row.status)}
                      disabled={working}
                      onChange={(event) =>
                        void onSave({
                          action: "application_update",
                          id: row.id,
                          status: event.target.value,
                        })
                      }
                    >
                      {APPLICATION_STATUS_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {humanise(option)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{day(row.deadline_at) || "—"}</td>
                  <td>
                    <button
                      className="ghostButton"
                      disabled={working}
                      onClick={() => setArchiving(String(row.id))}
                    >
                      Withdraw
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {archiving && (
        <ArchiveForm
          title="Withdraw this application"
          outcomes={["withdrawn", "rejected", "deferred", "removed_in_error"]}
          working={working}
          onCancel={() => setArchiving("")}
          onConfirm={async (outcome, reason) => {
            const ok = await onSave({
              action: "application_archive",
              id: archiving,
              outcome,
              reason,
            });
            if (ok) setArchiving("");
          }}
        />
      )}
      {adding ? (
        <form
          className="stackedForm"
          onSubmit={async (event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const ok = await onSave({
              action: "application_create",
              caseId,
              institution: data.get("institution"),
              course: data.get("course"),
              campus: data.get("campus"),
              intake: data.get("intake"),
              reference: data.get("reference"),
              status: data.get("status"),
              deadline: data.get("deadline"),
              submittedOn: data.get("submittedOn"),
              offerOn: data.get("offerOn"),
              coeOn: data.get("coeOn"),
              associate: data.get("associate"),
              partner: data.get("partner"),
              notes: data.get("notes"),
            });
            if (ok) setAdding(false);
          }}
        >
          <CourseApplicationFields />
          <label>
            Application reference
            <input name="reference" />
          </label>
          <label>
            Status
            <select name="status" defaultValue="draft">
              {APPLICATION_STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {humanise(option)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Deadline
            <input name="deadline" type="date" />
          </label>
          <label>
            Submitted date
            <input name="submittedOn" type="date" />
          </label>
          <label>
            Offer received date
            <input name="offerOn" type="date" />
          </label>
          <label>
            CoE received date
            <input name="coeOn" type="date" />
          </label>
          <label>
            Associate / sub-agent
            <input name="associate" />
          </label>
          <label>
            Institution partner
            <input name="partner" />
          </label>
          <label className="wide">
            Application notes
            <input name="notes" />
          </label>
          <div className="formActions">
            <button className="primaryButton" disabled={working}>
              <Plus size={15} />
              Add application
            </button>
            <button
              type="button"
              className="ghostButton"
              onClick={() => setAdding(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button className="ghostButton" onClick={() => setAdding(true)}>
          <Plus size={15} />
          Add application
        </button>
      )}
    </section>
  );
}

function VisaMatterTab({
  matter,
  caseId,
  working,
  onSave,
}: {
  matter: Record<string, unknown> | null;
  caseId: string;
  working: boolean;
  onSave: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const value = matter ?? {};
  return (
    <section className="caseWorkPanel">
      <span className="kicker">VISA MATTER</span>
      <form
        className="stackedForm"
        onSubmit={async (event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          await onSave({
            action: "visa_matter_save",
            caseId,
            destinationCountry: data.get("destinationCountry"),
            subclass: data.get("subclass"),
            stream: data.get("stream"),
            status: data.get("status"),
            marn: data.get("marn"),
            lodgementReference: data.get("lodgementReference"),
            trn: data.get("trn"),
            bridgingVisa: data.get("bridgingVisa"),
            bridgingVisaGrantedOn: data.get("bridgingVisaGrantedOn"),
            currentVisaExpiry: data.get("currentVisaExpiry"),
            healthExamination: data.get("healthExamination"),
            biometrics: data.get("biometrics"),
            policeClearance: data.get("policeClearance"),
            skillsAssessment: data.get("skillsAssessment"),
            informationRequestedAt: data.get("informationRequestedAt"),
            informationDueAt: data.get("informationDueAt"),
            informationProvidedAt: data.get("informationProvidedAt"),
            lodgedAt: data.get("lodgedAt"),
            decisionAt: data.get("decisionAt"),
            outcome: data.get("outcome"),
            refusalReason: data.get("refusalReason"),
            conditions: String(data.get("conditions") ?? "")
              .split(",")
              .map((entry) => entry.trim())
              .filter(Boolean),
          });
        }}
      >
        <label>
          Destination country *
          <input
            name="destinationCountry"
            required
            defaultValue={text(value.destination_country) || "AU"}
          />
        </label>
        <label>
          Subclass
          <input
            name="subclass"
            placeholder="e.g. 500"
            defaultValue={text(value.visa_subclass)}
          />
        </label>
        <label>
          Stream
          <input name="stream" defaultValue={text(value.visa_stream)} />
        </label>
        <label>
          Status
          <input
            name="status"
            defaultValue={text(value.status) || "assessment"}
          />
        </label>
        <label>
          Responsible agent (MARN)
          <input
            name="marn"
            defaultValue={text(value.responsible_agent_marn)}
          />
        </label>
        <label>
          Lodgement reference
          <input
            name="lodgementReference"
            defaultValue={text(value.lodgement_reference)}
          />
        </label>
        <label>
          TRN
          <input name="trn" defaultValue={text(value.trn)} />
        </label>
        <label>
          Current visa expiry
          <input
            name="currentVisaExpiry"
            type="date"
            defaultValue={day(value.current_visa_expiry)}
          />
        </label>
        <label>
          Bridging visa
          <input name="bridgingVisa" defaultValue={text(value.bridging_visa)} />
        </label>
        <label>
          Bridging visa granted
          <input
            name="bridgingVisaGrantedOn"
            type="date"
            defaultValue={day(value.bridging_visa_granted_on)}
          />
        </label>
        {(
          [
            [
              "healthExamination",
              "Health examination",
              "health_examination_status",
            ],
            ["biometrics", "Biometrics", "biometrics_status"],
            ["policeClearance", "Police clearance", "police_clearance_status"],
            [
              "skillsAssessment",
              "Skills assessment",
              "skills_assessment_status",
            ],
          ] as [string, string, string][]
        ).map(([name, label, key]) => (
          <label key={name}>
            {label}
            <select
              name={name}
              defaultValue={text(value[key]) || "not_started"}
            >
              {CHECK_STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {humanise(option)}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label>
          Lodged
          <input
            name="lodgedAt"
            type="date"
            defaultValue={day(value.lodged_at)}
          />
        </label>
        <label>
          Further information requested (s56)
          <input
            name="informationRequestedAt"
            type="date"
            defaultValue={day(value.information_requested_at)}
          />
        </label>
        <label>
          Response due
          <input
            name="informationDueAt"
            type="date"
            defaultValue={day(value.information_due_at)}
          />
        </label>
        <label>
          Response provided
          <input
            name="informationProvidedAt"
            type="date"
            defaultValue={day(value.information_provided_at)}
          />
        </label>
        <label>
          Decision
          <input
            name="decisionAt"
            type="date"
            defaultValue={day(value.decision_at)}
          />
        </label>
        <label>
          Outcome
          <input name="outcome" defaultValue={text(value.outcome)} />
        </label>
        <label className="wide">
          Refusal reason
          <input
            name="refusalReason"
            defaultValue={text(value.refusal_reason)}
          />
        </label>
        <label className="wide">
          Visa conditions (comma separated)
          <input
            name="conditions"
            defaultValue={(value.visa_conditions as string[])?.join(", ") ?? ""}
            placeholder="e.g. 8105, 8202, 8501"
          />
        </label>
        <div className="formActions">
          <button className="primaryButton" disabled={working}>
            <Check size={15} />
            Save visa matter
          </button>
        </div>
      </form>
    </section>
  );
}

function FamilyTab({
  dependants,
  clientId,
  working,
  onSave,
}: {
  dependants: Record<string, unknown>[];
  clientId: string;
  working: boolean;
  onSave: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [adding, setAdding] = useState(false);
  const [archiving, setArchiving] = useState("");
  return (
    <section className="caseWorkPanel">
      <span className="kicker">FAMILY AND DEPENDANTS</span>
      <p className="caseWorkEmpty">
        Add a spouse, partner, children or other dependants. There is no limit,
        and each is a record of its own rather than a note on the client.
      </p>
      {dependants.length > 0 && (
        <div className="recordTableWrap">
          <table className="recordTable">
            <thead>
              <tr>
                <th>Relationship</th>
                <th>Name</th>
                <th>Date of birth</th>
                <th>Passport</th>
                <th>Included</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {dependants.map((row) => (
                <tr key={String(row.id)}>
                  <td>{humanise(row.relationship)}</td>
                  <td>{text(row.full_name)}</td>
                  <td>{day(row.date_of_birth) || "—"}</td>
                  {/* Only the masked form is ever sent to the browser. */}
                  <td>{text(row.passport_masked) || "—"}</td>
                  <td>{row.included_in_application ? "Yes" : "No"}</td>
                  <td>
                    <button
                      className="ghostButton"
                      disabled={working}
                      onClick={() => setArchiving(String(row.id))}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {archiving && (
        <ArchiveForm
          title="Remove this dependant from the file"
          outcomes={["withdrawn", "removed_in_error"]}
          working={working}
          onCancel={() => setArchiving("")}
          onConfirm={async (_outcome, reason) => {
            const ok = await onSave({
              action: "dependant_archive",
              id: archiving,
              reason,
            });
            if (ok) setArchiving("");
          }}
        />
      )}
      {adding ? (
        <form
          className="stackedForm"
          onSubmit={async (event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const ok = await onSave({
              action: "dependant_create",
              clientId,
              relationship: data.get("relationship"),
              fullName: data.get("fullName"),
              dateOfBirth: data.get("dateOfBirth"),
              passportNumber: data.get("passportNumber"),
              passportExpiry: data.get("passportExpiry"),
              nationality: data.get("nationality"),
              visaStatus: data.get("visaStatus"),
              included: data.get("included") === "on",
            });
            if (ok) setAdding(false);
          }}
        >
          <label>
            Relationship *
            <select name="relationship" defaultValue="spouse">
              {["spouse", "partner", "child", "parent", "sibling", "other"].map(
                (option) => (
                  <option key={option} value={option}>
                    {humanise(option)}
                  </option>
                ),
              )}
            </select>
          </label>
          <label>
            Full name *<input name="fullName" required />
          </label>
          <label>
            Date of birth
            <input name="dateOfBirth" type="date" />
          </label>
          <label>
            Nationality
            <input name="nationality" />
          </label>
          <label>
            Passport number
            <input name="passportNumber" autoComplete="off" />
            <small className="fieldHint">
              Encrypted before it is stored. Only a masked form is displayed.
            </small>
          </label>
          <label>
            Passport expiry
            <input name="passportExpiry" type="date" />
          </label>
          <label>
            Current visa status
            <input name="visaStatus" />
          </label>
          <label className="checkboxLabel">
            <input name="included" type="checkbox" />
            Included in this application
          </label>
          <div className="formActions">
            <button className="primaryButton" disabled={working}>
              <Plus size={15} />
              Add dependant
            </button>
            <button
              type="button"
              className="ghostButton"
              onClick={() => setAdding(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button className="ghostButton" onClick={() => setAdding(true)}>
          <Plus size={15} />
          Add dependant
        </button>
      )}
    </section>
  );
}

function RecordModal({
  type,
  close,
  submit,
  cases,
  editing,
  branches,
  staff,
  saving,
  error,
  duplicates,
  onOpenExisting,
  onAddCase,
  onDifferentPerson,
  serviceMode,
  role,
  documents,
  checklistTemplates,
  presetCaseId,
}: {
  type: ModalType;
  close: () => void;
  submit: (e: FormEvent<HTMLFormElement>) => void;
  cases: CaseRecord[];
  editing: CaseRecord | null;
  branches: BranchRecord[];
  staff: StaffRecord[];
  saving: boolean;
  error: string;
  duplicates: DuplicateMatch[] | null;
  onOpenExisting: (clientId: string) => void;
  serviceMode: ServiceMode;
  onAddCase: (clientId: string) => void;
  onDifferentPerson: () => void;
  role: AppRole;
  documents: DocumentRecord[];
  checklistTemplates: ChecklistTemplateRecord[];
  presetCaseId?: string;
}) {
  // Requesting a document from within the case it belongs to arrives with
  // the case already decided -- the case/client pickers below are only for
  // when a case was not already the thing on screen.
  const presetCase = presetCaseId
    ? cases.find((c) => (c.dbId || c.id) === presetCaseId)
    : undefined;
  const activeChecklistTemplates = checklistTemplates.filter((t) => t.active);
  // Uncontrolled radios left the Matter type select showing whatever it
  // defaulted to at mount: switching workspace here did nothing to it, so a
  // migration matter type stayed selected after switching to Study Abroad.
  // Controlled state keeps them in step; editing an existing case leaves the
  // matter type as recorded rather than resetting it on every stream toggle.
  // Declared ahead of the type guard below so hook order never depends on it.
  const [workspace, setWorkspace] = useState<"Study Abroad" | "Direct Visa">(
    editing
      ? editing.serviceType === "direct_visa" ? "Direct Visa" : "Study Abroad"
      : serviceMode === "direct_visa" ? "Direct Visa" : "Study Abroad",
  );
  const [matterType, setMatterType] = useState(
    editing?.matterType ||
      (workspace === "Direct Visa" ? "Migration enquiry" : "Education enquiry"),
  );
  const [checklistCaseId, setChecklistCaseId] = useState("");
  const [checklistSelection, setChecklistSelection] = useState<Set<string>>(new Set());
  const switchWorkspace = (next: "Study Abroad" | "Direct Visa") => {
    setWorkspace(next);
    if (!editing)
      setMatterType(next === "Direct Visa" ? "Migration enquiry" : "Education enquiry");
  };
  // The modal never unmounts between openings -- it just stops rendering --
  // so workspace/matterType state from the last time it was open would
  // otherwise leak into the next: editing one case after another, or
  // reopening "Create record" from a different workspace tab. Reset during
  // render when what the modal is open for changes, the pattern used
  // elsewhere in this file for the same shape of problem.
  const openKey = `${type ?? ""}:${editing?.id ?? ""}:${serviceMode}:${presetCaseId ?? ""}`;
  const [openFor, setOpenFor] = useState(openKey);
  if (openKey !== openFor) {
    setOpenFor(openKey);
    setChecklistCaseId(presetCaseId || "");
    setChecklistSelection(
      presetCaseId
        ? new Set(
            documents
              .filter(
                (document) =>
                  document.caseId === presetCaseId &&
                  document.checklistKey &&
                  document.status !== "archived",
              )
              .map((document) => String(document.checklistKey)),
          )
        : new Set(),
    );
    const nextWorkspace: "Study Abroad" | "Direct Visa" = editing
      ? editing.serviceType === "direct_visa" ? "Direct Visa" : "Study Abroad"
      : serviceMode === "direct_visa" ? "Direct Visa" : "Study Abroad";
    setWorkspace(nextWorkspace);
    setMatterType(
      editing?.matterType ||
        (nextWorkspace === "Direct Visa" ? "Migration enquiry" : "Education enquiry"),
    );
  }
  if (!type) return null;
  const isClientAppointment = role === "client" && type === "appointment";
  const isClientMessage = role === "client" && type === "message";
  const clientCase = cases[0];
  const titles: Record<Exclude<ModalType, null>, string> = {
    case: editing ? "Edit record" : "Create record",
    task: "Create task",
    appointment: isClientAppointment
      ? "Request an appointment"
      : "Schedule appointment",
    document: "Request document",
    visaChecklist: "Document checklist",
    message: isClientMessage ? "Message your case team" : "Send case message",
    invoice: "Create invoice",
    template: "Create template",
    workflow: "Status configuration",
  };
  return (
    <div className="modalBackdrop" onClick={close}>
      <form
        className={`recordModal ${type === "case" ? "intakeModal" : ""}`}
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <div>
            <span>
              {type === "case"
                ? "MAXIMUS COMPLETE INFORMATION CAPTURE"
                : isClientAppointment || isClientMessage
                  ? "MY MAXIMUS PORTAL"
                : "SECURE CRM RECORD"}
            </span>
            <h2>{titles[type]}</h2>
          </div>
          <button
            type="button"
            className="iconButton"
            onClick={close}
            aria-label="Close form"
            title="Close form"
          >
            <X size={20} />
          </button>
        </header>
        {duplicates && duplicates.length > 0 && (
          <section className="duplicateGate">
            <h3>
              <AlertTriangle size={16} />
              This looks like somebody you already have
            </h3>
            <p>
              Nothing has been created yet. Two files for one person split their
              documents, invoices and history, so choose what this is.
            </p>
            {duplicates.map((match) => (
              <div className="duplicateMatch" key={match.id}>
                <div>
                  <strong>{match.name || "Unnamed client"}</strong>
                  <small>
                    {[
                      match.reference,
                      match.email,
                      match.phone,
                      match.passport ? `Passport ${match.passport}` : "",
                      match.dateOfBirth ? `Born ${match.dateOfBirth}` : "",
                      `${match.caseCount} case${match.caseCount === 1 ? "" : "s"}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                  <small className="duplicateReason">
                    Matched on {match.reasons.join(", ")}
                  </small>
                </div>
                <div className="duplicateActions">
                  <button
                    type="button"
                    className="ghostButton"
                    onClick={() => onOpenExisting(match.id)}
                  >
                    Open existing client
                  </button>
                  <button
                    type="button"
                    className="primaryButton"
                    disabled={saving}
                    onClick={() => onAddCase(match.id)}
                  >
                    Add another case to this client
                  </button>
                </div>
              </div>
            ))}
            <button
              type="button"
              className="ghostButton duplicateContinue"
              disabled={saving}
              onClick={onDifferentPerson}
            >
              This is a genuinely different person — create the record
            </button>
          </section>
        )}
        <div className="formGrid">
          {type === "case" && (
            <div className="legacyIntake full">
              <section className="intakeMode">
                <span className="intakeModeLabel">Service stream</span>
                <label>
                  <input
                    type="radio"
                    name="workspace"
                    value="Study Abroad"
                    checked={workspace === "Study Abroad"}
                    onChange={() => switchWorkspace("Study Abroad")}
                  />
                  Study Abroad
                </label>
                <label>
                  <input
                    type="radio"
                    name="workspace"
                    value="Direct Visa"
                    checked={workspace === "Direct Visa"}
                    onChange={() => switchWorkspace("Direct Visa")}
                  />
                  Direct Visa
                </label>
              </section>
              <p className="modalNotice">
                <Check size={14} />
                {editing
                  ? "Update the case contact and workflow information here. Structured history remains available in the case workspace."
                  : "Capture the complete applicant picture now. Optional sections can be skipped and completed later without losing the case."}
              </p>
              <div className="intakeFields">
                <label>
                  Full name *
                  <input name="name" required defaultValue={editing?.name} />
                </label>
                <label>
                  Email *
                  <input
                    name="email"
                    type="email"
                    required
                    defaultValue={editing?.email}
                  />
                  {editing ? (
                    <small>All future messages for this case use this address automatically.</small>
                  ) : null}
                </label>
                <label>
                  Mobile *
                  <input
                    name="phone"
                    required
                    defaultValue={editing?.phone}
                    placeholder="+61 412 345 678"
                  />
                </label>
                <label>
                  Date of birth
                  <input name="dob" type="date" />
                </label>
                <label>
                  Nationality
                  <input name="nationality" />
                </label>
                <label>
                  Matter type *
                  <select
                    name="matterType"
                    required
                    value={matterType}
                    onChange={(e) => setMatterType(e.target.value)}
                  >
                    {(workspace === "Direct Visa"
                      ? DIRECT_VISA_MATTER_TYPES
                      : STUDY_MATTER_TYPES
                    ).map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Visa expiry date *
                  <input
                    name="visaExpiry"
                    type="date"
                    required
                    defaultValue={editing?.visaExpiry}
                  />
                </label>
                <label>
                  Branch
                  <select
                    name="branchId"
                    defaultValue={editing?.branchId ?? ""}
                  >
                    <option value="">Your own branch</option>
                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                        {branch.code ? ` (${branch.code})` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                {editing?.ownerId ? (
                  <input type="hidden" name="ownerId" value={editing.ownerId} />
                ) : null}
                <label>
                  Course or visa target
                  <input
                    name="target"
                    defaultValue={editing?.target}
                    placeholder="e.g. Master of IT, Monash"
                  />
                </label>
                <label>
                  CRM status
                  <select
                    name="stage"
                    defaultValue={editing?.stage || "New Inquiry"}
                  >
                    <option>New Inquiry</option>
                    <option>Potential</option>
                    <option>Follow Up</option>
                    <option>Waiting for Documents</option>
                    <option>Documents Received</option>
                    <option>Confirmed</option>
                    <option>Prospect</option>
                    <option>Looking for Employer</option>
                    <option>Not Responding</option>
                    <option>Processed</option>
                    <option>Cancelled</option>
                    <option>Not Interested</option>
                  </select>
                </label>
                <label>
                  Next follow-up
                  <input name="due" type="date" defaultValue={editing?.due} />
                </label>
                {!editing && <label>Follow-up time<input name="followUpTime" type="time" /></label>}
                {!editing && <label className="wide">Follow-up remarks<input name="followUpRemarks" placeholder="What must happen at the next contact" /></label>}
                {!editing && <label>First appointment date<input name="appointmentDate" type="date" /></label>}
                {!editing && <label>First appointment time<input name="appointmentTime" type="time" /></label>}
                {!editing && <label className="wide">Appointment remarks<input name="appointmentRemarks" placeholder="Purpose, preparation or location" /></label>}
                <label>
                  Source
                  <select name="source">
                    <option value="">Select source</option>
                    <option>Walk in</option>
                    <option>Referral</option>
                    <option>Website</option>
                    <option>Social media</option>
                    <option>Facebook</option>
                    <option>WhatsApp</option>
                    <option>Email marketing</option>
                    <option>Phone enquiry</option>
                    <option>Education expo</option>
                    <option>Agent</option>
                    <option>Existing client</option>
                  </select>
                </label>
                <label>
                  Campaign / referral source
                  <input name="campaign" defaultValue={editing?.campaign} placeholder="e.g. August seminar or partner name" />
                </label>
                <label>
                  Lead score
                  <input name="leadScore" type="number" min="0" max="100" defaultValue={editing?.leadScore || ""} placeholder="Calculated automatically if blank" />
                </label>
                <label className="wide">
                  Lost / cancelled reason
                  <input name="lostReason" defaultValue={editing?.lostReason} placeholder="Required operational context when an enquiry is lost" />
                </label>
                <label className="wide">
                  Remarks
                  <input
                    name="remarks"
                    placeholder="Anything worth noting now"
                  />
                </label>
              </div>
              {!editing && (
                <div className="completeIntakeSections">
                  <details open>
                    <summary>Personal, contact and passport details</summary>
                    <div className="intakeFields">
                      <label>Alternate mobile<input name="alternatePhone" placeholder="+61 412 345 678" /></label>
                      <label>Gender<select name="gender" defaultValue=""><option value="">Select gender</option><option>Male</option><option>Female</option><option>Other</option><option>Prefer not to say</option></select></label>
                      <label>Marital status<select name="maritalStatus" defaultValue=""><option value="">Select status</option><option>Single</option><option>Married</option><option>Divorced</option><option>Widowed</option><option>Separated</option></select></label>
                      <label>Country of birth<input name="countryOfBirth" /></label>
                      <label>Current country<input name="currentCountry" /></label>
                      <label>Preferred language<input name="preferredLanguage" /></label>
                      <label className="wide">Residential address<input name="addressLine" placeholder="Street address" /></label>
                      <label>City<input name="city" /></label>
                      <label>State / province<input name="state" /></label>
                      <label>Postcode<input name="postcode" /></label>
                      <label>Passport number<input name="passportNumber" autoComplete="off" /></label>
                      <label>Passport country<input name="passportCountry" /></label>
                      <label>Passport issue date<input name="passportIssue" type="date" /></label>
                      <label>Passport expiry date<input name="passportExpiry" type="date" /></label>
                    </div>
                  </details>

                  <details open>
                    <summary>{workspace === "Direct Visa" ? "Migration history and declarations" : "Study preferences and proposed application"}</summary>
                    {workspace === "Study Abroad" ? (
                      <div className="intakeFields">
                        <label>Destination country<select name="destinationCountry" defaultValue=""><option value="">Select country</option>{DESTINATION_COUNTRIES.map((country) => <option key={country}>{country}</option>)}</select></label>
                        <label>Study level<select name="studyLevel" defaultValue=""><option value="">Select level</option><option>Certificate III</option><option>Certificate IV</option><option>Diploma</option><option>Advanced Diploma</option><option>Bachelor Degree</option><option>Graduate Certificate</option><option>Graduate Diploma</option><option>Master Degree</option><option>Master by Research</option><option>PhD</option></select></label>
                        <label>Preferred institution<input name="preferredInstitution" /></label>
                        <label>Preferred course<input name="preferredCourse" /></label>
                        <label>Target intake<input name="intake" placeholder="e.g. February 2027" /></label>
                        <label>Proposed course start<input name="proposedCourseStart" type="date" /></label>
                        <label>Proposed course end<input name="proposedCourseEnd" type="date" /></label>
                        <label>Second destination choice<select name="secondaryDestination" defaultValue=""><option value="">No second choice</option>{DESTINATION_COUNTRIES.map((country) => <option key={country}>{country}</option>)}</select></label>
                        <label>Annual budget<input name="annualBudget" type="number" min="0" step="0.01" /></label>
                        <label>Funding source<input name="fundingSource" /></label>
                        <label>Application institution<input name="applicationInstitution" /></label>
                        <label>Application course<input name="applicationCourse" /></label>
                        <label>Campus<input name="applicationCampus" /></label>
                        <label>Application reference<input name="applicationReference" /></label>
                        <label>Application status<select name="applicationStatus" defaultValue="draft">{APPLICATION_STATUS_OPTIONS.map((option) => <option key={option} value={option}>{humanise(option)}</option>)}</select></label>
                        <label>Application deadline<input name="applicationDeadline" type="date" /></label>
                        <label>Associate / sub-agent<input name="associate" /></label>
                        <label>Institution partner<input name="partner" /></label>
                        <label className="checkboxLabel"><input name="accommodationRequired" type="checkbox" />Accommodation required</label>
                        <label className="checkboxLabel"><input name="scholarshipRequired" type="checkbox" />Scholarship required</label>
                      </div>
                    ) : (
                      <div className="intakeFields">
                        <label>Destination country<select name="migrationDestination" defaultValue="Australia"><option>Australia</option>{DESTINATION_COUNTRIES.filter((country) => country !== "Australia").map((country) => <option key={country}>{country}</option>)}</select></label>
                        <label>Current visa status<input name="currentVisaStatus" /></label>
                        <label>Visited another country?<select name="visitedOtherCountry" defaultValue=""><option value="">Select</option><option value="yes">Yes</option><option value="no">No</option></select></label>
                        <label>Country visited<input name="travelCountry" /></label>
                        <label>Date visited<input name="travelDate" type="date" /></label>
                        <label>Purpose of travel<input name="travelPurpose" /></label>
                        <label>Previous visa country<input name="previousVisaCountry" /></label>
                        <label>Previous visa type<input name="previousVisaType" /></label>
                        <label>Previous visa outcome<select name="previousVisaOutcome" defaultValue=""><option value="">Select outcome</option><option>Approved</option><option>Rejected</option><option>Withdrawn</option><option>Pending</option></select></label>
                        <label>Previous application date<input name="previousVisaApplied" type="date" /></label>
                        <label>Any visa refusal?<select name="hasVisaRefusal" defaultValue=""><option value="">Select</option><option value="yes">Yes</option><option value="no">No</option></select></label>
                        <label className="wide">Refusal details<input name="refusalDetails" /></label>
                        <label>Gap from<input name="gapFrom" type="date" /></label>
                        <label>Gap to<input name="gapTo" type="date" /></label>
                        <label className="wide">Study / work gap reason<input name="gapReason" /></label>
                      </div>
                    )}
                  </details>

                  <details>
                    <summary>Education, English test and employment</summary>
                    <div className="intakeFields">
                      <label>Highest qualification<input name="qualification" /></label>
                      <label>Institution / board<input name="educationInstitution" /></label>
                      <label>Field / stream<input name="fieldOfStudy" /></label>
                      <label>Country<input name="educationCountry" /></label>
                      <label>Started<input name="educationStart" type="date" /></label>
                      <label>Completed<input name="educationEnd" type="date" /></label>
                      <label>Result / grade<input name="educationResult" /></label>
                      <label>Backlogs / failed subjects<input name="educationBacklogs" type="number" min="0" /></label>
                      <label>English test<select name="testType" defaultValue=""><option value="">No test recorded</option><option>IELTS</option><option>PTE</option><option>TOEFL</option><option>Duolingo</option><option>CELPIP</option><option>OET</option></select></label>
                      <label>Test date<input name="testDate" type="date" /></label>
                      <label>Overall<input name="testOverall" type="number" step="0.01" /></label>
                      <label>Listening<input name="testListening" type="number" step="0.01" /></label>
                      <label>Reading<input name="testReading" type="number" step="0.01" /></label>
                      <label>Writing<input name="testWriting" type="number" step="0.01" /></label>
                      <label>Speaking<input name="testSpeaking" type="number" step="0.01" /></label>
                      <label>Aptitude test<select name="aptitudeTestType" defaultValue=""><option value="">No aptitude test</option><option>GRE</option><option>GMAT</option><option>SAT</option><option>Other</option></select></label>
                      <label>Test date<input name="aptitudeTestDate" type="date" /></label>
                      <label>Overall score<input name="aptitudeOverall" type="number" step="0.01" /></label>
                      <label>Quantitative<input name="aptitudeQuantitative" type="number" step="0.01" /></label>
                      <label>Analytical<input name="aptitudeAnalytical" type="number" step="0.01" /></label>
                      <label>Verbal<input name="aptitudeVerbal" type="number" step="0.01" /></label>
                      <label>Employer<input name="employer" /></label>
                      <label>Position<input name="jobTitle" /></label>
                      <label>Employment country<input name="employmentCountry" /></label>
                      <label>Employment start<input name="employmentStart" type="date" /></label>
                      <label>Employment end<input name="employmentEnd" type="date" /></label>
                      <label>Hours per week<input name="hoursPerWeek" type="number" step="0.5" min="0" /></label>
                      <label className="wide">Main duties<input name="duties" /></label>
                    </div>
                  </details>

                  <details>
                    <summary>Spouse, partner and child</summary>
                    <div className="intakeFields">
                      <label>Spouse / partner full name<input name="spouseFullName" /></label>
                      <label>Date of birth<input name="spouseDob" type="date" /></label>
                      <label>Email<input name="spouseEmail" type="email" /></label>
                      <label>Mobile<input name="spousePhone" /></label>
                      <label>Nationality<input name="spouseNationality" /></label>
                      <label>Passport number<input name="spousePassport" autoComplete="off" /></label>
                      <label>Passport issue date<input name="spousePassportIssue" type="date" /></label>
                      <label>Passport expiry<input name="spousePassportExpiry" type="date" /></label>
                      <label>Visa status<input name="spouseVisaStatus" /></label>
                      <label>Visa expiry<input name="spouseVisaExpiry" type="date" /></label>
                      <label>Marriage date<input name="marriageDate" type="date" /></label>
                      <label>Marriage type<input name="marriageType" placeholder="Arranged, civil or other" /></label>
                      <label>Marriage registration<select name="marriageRegistered" defaultValue=""><option value="">Select</option><option value="yes">Registered</option><option value="no">Not registered</option></select></label>
                      <label className="checkboxLabel"><input name="spouseIncluded" type="checkbox" />Included in this application</label>
                      <label>Child full name<input name="childFullName" /></label>
                      <label>Child date of birth<input name="childDob" type="date" /></label>
                      <label>Child nationality<input name="childNationality" /></label>
                      <label className="checkboxLabel"><input name="childIncluded" type="checkbox" />Child included in this application</label>
                    </div>
                    <small>Additional family members can be added as individual records in the case workspace.</small>
                  </details>
                </div>
              )}
            </div>
          )}
          {type === "task" && (
            <>
              <label className="full">
                Task title
                <input name="title" required />
              </label>
              <label>
                Case
                <select name="caseId">
                  <option value="">General</option>
                  {cases.map((c) => (
                    <option key={c.id} value={c.dbId || c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Due date
                <input name="due" type="date" />
              </label>
              <label>
                Priority
                <select name="priority">
                  <option>Normal</option>
                  <option>Attention</option>
                  <option>Critical</option>
                </select>
              </label>
            </>
          )}
          {type === "appointment" && (
            <>
              <label className="full">
                {isClientAppointment
                  ? "What would you like to discuss?"
                  : "Title"}
                <input name="title" required />
              </label>
              {isClientAppointment && cases.length === 1 ? (
                <label>
                  Case
                  <input value={`${clientCase.name} · ${clientCase.id}`} disabled />
                  <input
                    type="hidden"
                    name="caseId"
                    value={clientCase.dbId || clientCase.id}
                  />
                </label>
              ) : (
                <label>
                  {isClientAppointment ? "Case" : "Linked case"}
                  <select name="caseId" required={isClientAppointment}>
                    <option value="">
                      {isClientAppointment
                        ? "Select your case"
                        : "Internal appointment"}
                    </option>
                    {cases.map((c) => (
                      <option key={c.id} value={c.dbId || c.id}>
                        {isClientAppointment ? `${c.name} · ${c.id}` : c.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                {isClientAppointment ? "Preferred date" : "Date"}
                <input name="date" type="date" required />
              </label>
              <label>
                {isClientAppointment ? "Preferred time" : "Time"}
                <input name="time" type="time" required />
              </label>
              <label>
                {isClientAppointment ? "Appointment reason" : "Type"}
                <select name="appointmentType">
                  <option>Counselling</option>
                  <option>Document review</option>
                  <option>Visa consultation</option>
                  {isClientAppointment ? (
                    <>
                      <option>Application update</option>
                      <option>Other</option>
                    </>
                  ) : (
                    <option>Internal meeting</option>
                  )}
                </select>
              </label>
              {isClientAppointment && !clientCase ? (
                <p className="formError full" role="alert">
                  Your login is not linked to a case yet. Please contact your
                  Maximus case team before requesting an appointment.
                </p>
              ) : null}
            </>
          )}
          {type === "document" && (
            <>
              <label>
                Document title
                <input name="title" required />
              </label>
              {presetCase ? (
                <label>
                  Client
                  <input value={presetCase.name} disabled />
                  <input type="hidden" name="clientId" value={presetCase.clientId || ""} />
                  <input type="hidden" name="caseId" value={presetCase.dbId || presetCase.id} />
                </label>
              ) : (
                <label>
                  Client
                  <select name="clientId" required>
                    <option value="">Select client</option>
                    {cases.map((c) => (
                      <option key={c.id} value={c.clientId}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                Folder
                <input name="folder" placeholder="e.g. Identity documents" />
              </label>
              <label className="wide">
                Note for the client
                <input
                  name="documentNote"
                  placeholder="e.g. Certified colour copy of the passport bio page"
                />
              </label>
              <p className="modalNotice">
                <AlertTriangle size={14} />
                This records a request for the document and tracks whether it
                has arrived. File storage is not connected yet, so nothing is
                uploaded here — attach the file in the shared drive and mark the
                request received.
              </p>
            </>
          )}
          {type === "visaChecklist" && (
            <>
              {presetCase ? (
                <label className="full">
                  Case
                  <input value={`${presetCase.name} · ${presetCase.id}`} disabled />
                  <input type="hidden" name="caseId" value={checklistCaseId} />
                </label>
              ) : (
                <label className="full">
                  Case
                  <select
                    name="caseId"
                    required
                    value={checklistCaseId}
                    onChange={(event) => {
                      const caseId = event.target.value;
                      setChecklistCaseId(caseId);
                      setChecklistSelection(
                        new Set(
                          documents
                            .filter(
                              (document) =>
                                document.caseId === caseId &&
                                document.checklistKey &&
                                document.status !== "archived",
                            )
                            .map((document) => String(document.checklistKey)),
                        ),
                      );
                    }}
                  >
                    <option value="">Select a case</option>
                    {cases.map((c) => (
                      <option key={c.id} value={c.dbId || c.id}>
                        {c.name} · {c.id}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                Due date for requested items
                <input name="due" type="date" />
              </label>
              <label className="full">
                Instructions for the client
                <textarea name="documentNote" placeholder="Add certification, translation or file-quality instructions that apply to this request." />
              </label>
              <p className="modalNotice full">
                <FileCheck2 size={14} />
                Tick only documents relevant to this matter. Ticked items appear in the client portal; unticked, unfulfilled checklist requests are withdrawn. Uploaded and verified records are never deleted.
              </p>
              {activeChecklistTemplates.length === 0 && (
                <p className="caseWorkEmpty full">
                  No checklist items are set up yet. Add some on the Statuses
                  &amp; document checklists screen first.
                </p>
              )}
              <div className="visaChecklist full">
                {[...new Set(activeChecklistTemplates.map((item) => item.category))].map((category) => (
                  <fieldset key={category}>
                    <legend>{category}</legend>
                    {activeChecklistTemplates.filter((item) => item.category === category).map((item) => (
                      <label className="checklistChoice" key={item.key}>
                        <input
                          name={`visaDoc_${item.key}`}
                          type="checkbox"
                          checked={checklistSelection.has(item.key)}
                          onChange={(event) => {
                            const next = new Set(checklistSelection);
                            if (event.target.checked) next.add(item.key);
                            else next.delete(item.key);
                            setChecklistSelection(next);
                          }}
                        />
                        <span><strong>{item.title}</strong><small>{item.guidance}</small></span>
                      </label>
                    ))}
                  </fieldset>
                ))}
              </div>
            </>
          )}
          {type === "message" && (
            <>
              {!isClientMessage ? (
                <label>
                  Channel
                  <select name="channel" defaultValue="email">
                    <option value="email">Email</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="sms">SMS</option>
                  </select>
                </label>
              ) : null}
              {isClientMessage ? (
                <label>
                  To
                  <input value="Your Maximus case team" disabled />
                </label>
              ) : presetCase ? (
                <label>
                  Client
                  <input value={presetCase.name} disabled />
                  <input type="hidden" name="caseId" value={presetCase.dbId || presetCase.id} />
                </label>
              ) : null}
              {!isClientMessage && !presetCase ? (
                <label>
                  Case
                  <select name="caseId" required defaultValue="">
                    <option value="">Select case</option>
                    {cases.map((c) => (
                      <option key={c.id} value={c.dbId || c.id}>{c.name} · {c.id}</option>
                    ))}
                  </select>
                </label>
              ) : null}
              {!isClientMessage ? (
                <p className="modalNotice full">
                  <Mail size={14} />
                  The recipient is taken automatically from this client&apos;s case profile—email for Email and mobile for WhatsApp. Edit the case profile if either changes.
                </p>
              ) : null}
              {isClientMessage && cases.length === 1 ? (
                <label>
                  Case
                  <input value={`${clientCase.name} · ${clientCase.id}`} disabled />
                  <input
                    type="hidden"
                    name="caseId"
                    value={clientCase.dbId || clientCase.id}
                  />
                </label>
              ) : isClientMessage ? (
                <label>
                  {isClientMessage ? "Case" : "Linked case"}
                  <select
                    name="caseId"
                    required={isClientMessage}
                    defaultValue={presetCase?.dbId || presetCase?.id || ""}
                  >
                    <option value="">
                      {isClientMessage ? "Select your case" : "None"}
                    </option>
                    {cases.map((c) => (
                      <option key={c.id} value={c.dbId || c.id}>
                        {isClientMessage ? `${c.name} · ${c.id}` : c.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="full">
                Subject
                <input name="subject" required />
              </label>
              <label className="full">
                Message
                <textarea name="body" required />
              </label>
              {isClientMessage && !clientCase ? (
                <p className="formError full" role="alert">
                  Your login is not linked to a case yet. Please contact Maximus
                  directly so the case team can connect your portal.
                </p>
              ) : null}
            </>
          )}
          {type === "invoice" && (
            <>
              {presetCase ? (
                <label>
                  Case
                  <input value={`${presetCase.name} · ${presetCase.id}`} disabled />
                  <input type="hidden" name="caseId" value={presetCase.dbId || presetCase.id} />
                </label>
              ) : (
                <label>
                  Case
                  <select name="caseId" required>
                    <option value="">Select case</option>
                    {cases.map((c) => (
                      <option key={c.id} value={c.dbId || c.id}>
                        {c.name} · {c.id}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                Invoice type
                <select name="invoiceType" defaultValue="professional_fee">
                  <option value="professional_fee">Professional fee</option>
                  <option value="service_fee">Service fee</option>
                  <option value="tuition">Tuition</option>
                  <option value="application_fee">Application fee</option>
                  <option value="visa_fee">Visa fee</option>
                  <option value="disbursement">Disbursement</option>
                </select>
              </label>
              <label>
                Currency
                <select name="currency" defaultValue="AUD">
                  {['AUD', 'USD', 'NZD', 'GBP', 'EUR', 'CAD', 'INR', 'LKR'].map((currency) => (
                    <option key={currency}>{currency}</option>
                  ))}
                </select>
              </label>
              <label>
                Subtotal
                <input
                  name="subtotal"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                />
              </label>
              <label>
                Tax / GST
                <input name="tax" type="number" min="0" step="0.01" defaultValue="0" required />
              </label>
              <label>
                Due date
                <input name="due" type="date" />
              </label>
              <label className="full">
                Invoice PDF
                <input name="invoicePdf" type="file" accept="application/pdf,.pdf" />
                <small>The PDF is stored in this client&apos;s Google Drive Accounts and Receipts folder.</small>
              </label>
            </>
          )}
          {type === "template" && (
            <>
              <label>
                Name
                <input name="name" required />
              </label>
              <label>
                Type
                <select name="templateType">
                  <option>Email</option>
                  <option>Internal note</option>
                  <option>Document request</option>
                  <option>Checklist</option>
                </select>
              </label>
              <label className="full">
                Content
                <textarea name="content" required />
              </label>
            </>
          )}
          {type === "workflow" && (
            <>
              <label>
                Name
                <input name="name" required />
              </label>
              <label className="full">
                Stages
                <input name="stages" required />
              </label>
            </>
          )}
        </div>
        {error ? (
          <p className="formError" role="alert">
            {error}
          </p>
        ) : null}
        <footer>
          <button type="button" className="ghostButton" onClick={close}>
            Cancel
          </button>
          <button
            type="submit"
            className="primaryButton"
            disabled={
              saving ||
              ((isClientAppointment || isClientMessage) && !clientCase)
            }
          >
            <Check size={15} />
            {saving
              ? isClientAppointment
                ? "Sending request…"
                : isClientMessage
                  ? "Sending message…"
                  : type === "message"
                    ? "Sending message…"
                    : type === "invoice"
                      ? "Saving invoice…"
                      : "Saving securely…"
              : isClientAppointment
                ? "Send appointment request"
                : isClientMessage
                  ? "Send message"
                  : type === "message"
                    ? "Send message"
                    : type === "invoice"
                      ? "Create invoice"
                      : "Save complete record"}
          </button>
        </footer>
      </form>
    </div>
  );
}

export default function Home() {
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [active, setActive] = useState<ModuleKey>("dashboard"),
    [menuOpen, setMenuOpen] = useState(false),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [modal, setModal] = useState<ModalType>(null),
    [presetCaseId, setPresetCaseId] = useState(""),
    [selected, setSelected] = useState<CaseRecord | null>(null),
    [caseWindowId, setCaseWindowId] = useState(""),
    [editing, setEditing] = useState<CaseRecord | null>(null),
    [toast, setToast] = useState(""),
    [formError, setFormError] = useState(""),
    [saving, setSaving] = useState(false),
    [quickOpen, setQuickOpen] = useState(false),
    // Set when an intake looks like somebody already on file. The record is
    // held back until the person entering it says which of the three cases
    // this is.
    [duplicates, setDuplicates] = useState<DuplicateMatch[] | null>(null),
    [pendingIntake, setPendingIntake] = useState<Record<
      string,
      unknown
    > | null>(null),
    [notifications, setNotifications] = useState(false),
    [alerts, setAlerts] = useState<
      {
        id: string;
        title: string;
        body: string | null;
        read_at: string | null;
      }[]
    >([]);
  const [cases, setCases] = useState<CaseRecord[]>([]),
    [tasks, setTasks] = useState<TaskRecord[]>([]),
    [appointments, setAppointments] = useState<AppointmentRecord[]>([]),
    [documents, setDocuments] = useState<DocumentRecord[]>([]),
    [messages, setMessages] = useState<MessageRecord[]>([]),
    [campaigns, setCampaigns] = useState<CampaignRecord[]>([]),
    [invoices, setInvoices] = useState<InvoiceRecord[]>([]),
    [commissionClaims, setCommissionClaims] = useState<CommissionClaimRecord[]>([]),
    [journeyHistory, setJourneyHistory] = useState<JourneyMilestone[]>([]),
    [declarations, setDeclarations] = useState<ClientDeclaration[]>([]),
    [templates, setTemplates] = useState<TemplateRecord[]>([]),
    [workflows, setWorkflows] = useState<WorkflowRecord[]>([]),
    [checklistTemplates, setChecklistTemplates] = useState<ChecklistTemplateRecord[]>([]),
    [emailTemplates, setEmailTemplates] = useState<EmailTemplateRecord[]>([]),
    [audits, setAudits] = useState<AuditRecord[]>([]),
    [applicationRows, setApplicationRows] = useState<ApplicationRow[]>([]),
    [visaMatterRows, setVisaMatterRows] = useState<VisaMatterRow[]>([]),
    [roles, setRoles] = useState<{ id: string; name: string; scope: string }[]>(
      [],
    ),
    [staff, setStaff] = useState<StaffRecord[]>([]),
    [branches, setBranches] = useState<BranchRecord[]>([]),
    [schemaWarning, setSchemaWarning] = useState<string>(""),
    [truncated, setTruncated] = useState<string[]>([]),
    [storageConnected, setStorageConnected] = useState(false);
  // The module a role lands on is chosen once per sign-in. The workspace loads
  // in two steps -- the session first, then the records -- and the navigation is
  // already usable between them, so re-applying the default on the second step
  // would throw away a screen the person had already opened.
  const landedAs = useRef<AppRole | null>(null);
  const landOn = (nextRole: AppRole) => {
    if (landedAs.current === nextRole) return;
    landedAs.current = nextRole;
    setActive(roleConfig[nextRole].modules[0]);
  };
  const [identity, setIdentity] = useState<LiveIdentity | null>(null),
    [sessionReady, setSessionReady] = useState(false),
    [serviceMode, setServiceMode] = useStored<ServiceMode>(
      "maximus.serviceMode",
      "study",
    );
  const role = identity?.role || "staff",
    signedIn = Boolean(identity),
    // Every internal case-team member can complete finance work for a case
    // they are allowed to work on. Branch-wide commissions, masters and staff
    // redistribution remain management functions.
    canManageBranch = role === "super_admin" || role === "admin",
    canManageCaseFinance = role !== "client";
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(t);
  }, [toast]);
  const say = (text: string) => setToast(text);
  // Real notifications, including the ones raised when a case is reassigned.
  const loadAlerts = async (nextRole: AppRole) => {
    if (nextRole === "client") return;
    try {
      const response = await fetch("/api/crm/operations?view=notifications", {
        cache: "no-store",
      });
      const result = await response.json();
      setAlerts(response.ok ? (result.data ?? []) : []);
    } catch {
      setAlerts([]);
    }
  };
  const markAlertRead = async (id: string) => {
    setAlerts((current) =>
      current.map((alert) =>
        alert.id === id
          ? { ...alert, read_at: new Date().toISOString() }
          : alert,
      ),
    );
    await fetch("/api/crm/operations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "read_notification", id }),
    }).catch(() => undefined);
  };
  // The document-request checklist is masters data now (editable on the
  // Statuses & document checklists screen), not a fixed list in the code.
  // Loaded once alongside the workspace and re-loaded after any edit so the
  // request modal never offers something that was just retired.
  const loadChecklistTemplates = async () => {
    try {
      const response = await fetch("/api/crm/document-checklist-templates", {
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) return;
      setChecklistTemplates(
        ((result.templates || []) as Record<string, unknown>[]).map((row) => ({
          key: String(row.id),
          category: String(row.category),
          title: String(row.title),
          guidance: row.guidance ? String(row.guidance) : "",
          active: row.active !== false,
        })),
      );
    } catch {
      // A checklist that fails to load leaves the request modal showing
      // nothing rather than the workspace itself failing to load.
    }
  };
  // The wording behind the three emails the CRM sends a client on its own,
  // editable on the Templates screen. Loaded once alongside the workspace,
  // same shape as the document checklist.
  const loadEmailTemplates = async () => {
    try {
      const response = await fetch("/api/crm/email-templates", {
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) return;
      setEmailTemplates(
        ((result.templates || []) as Record<string, unknown>[]).map((row) => ({
          id: String(row.id),
          kind: String(row.kind),
          subject: String(row.subject),
          body: String(row.body),
        })),
      );
    } catch {
      // Editable wording that fails to load leaves the Templates screen
      // showing nothing rather than the workspace itself failing to load.
    }
  };
  const loadWorkspace = async () => {
    let authenticatedIdentity: LiveIdentity | null = null;
    try {
      const sessionResponse = await fetch("/api/auth/session", {
        cache: "no-store",
      });
      const sessionResult = await sessionResponse.json();
      if (!sessionResponse.ok || !sessionResult.authenticated)
        throw new Error(sessionResult.error || "Sign in is required.");
      authenticatedIdentity = sessionResult.identity as LiveIdentity;
      setIdentity(authenticatedIdentity);
      landOn(authenticatedIdentity.role);

      const response = await fetch("/api/crm/workspace", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error || "Your workspace data could not be loaded.",
        );
      setIdentity(result.identity);
      setCases(result.cases || []);
      setTasks(result.tasks || []);
      setAppointments(result.appointments || []);
      setDocuments(result.documents || []);
      setMessages(result.messages || []);
      setCampaigns(result.campaigns || []);
      setInvoices(result.invoices || []);
      setCommissionClaims(result.commissionClaims || []);
      setJourneyHistory(result.journeyHistory || []);
      setDeclarations(result.declarations || []);
      setTemplates(result.templates || []);
      setWorkflows(result.workflows || []);
      setAudits(result.audits || []);
      setApplicationRows((result.applications || []) as ApplicationRow[]);
      setVisaMatterRows((result.visaMatters || []) as VisaMatterRow[]);
      setRoles(result.roles || []);
      setStaff(
        ((result.profiles || []) as StaffRecord[]).filter(
          (person) => person.active && person.level !== "student",
        ),
      );
      setSchemaWarning(
        typeof result.schemaWarning === "string" ? result.schemaWarning : "",
      );
      setTruncated(Array.isArray(result.truncated) ? result.truncated : []);
      setStorageConnected(result.capabilities?.documentStorage === true);
      setBranches((result.branches || []) as BranchRecord[]);
      landOn(result.identity.role as AppRole);
      void loadAlerts(result.identity.role as AppRole);
      if (result.identity.role !== "client") {
        void loadChecklistTemplates();
        void loadEmailTemplates();
      }
    } catch (reason) {
      if (!authenticatedIdentity) setIdentity(null);
      else
        say(
          reason instanceof Error
            ? reason.message
            : "Your workspace data could not be loaded.",
        );
    } finally {
      setSessionReady(true);
    }
  };
  const loadWorkspaceRef = useRef(loadWorkspace);
  loadWorkspaceRef.current = loadWorkspace;
  useEffect(() => {
    const timer = window.setTimeout(() => void loadWorkspaceRef.current(), 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    const receiveWorkspaceUpdate = (event: StorageEvent) => {
      if (event.key === "maximus.workspaceRefresh") void loadWorkspace();
    };
    window.addEventListener("storage", receiveWorkspaceUpdate);
    return () => window.removeEventListener("storage", receiveWorkspaceUpdate);
  });
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape" && query) {
        setQuery("");
        searchRef.current?.blur();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [query]);
  useEffect(() => {
    const timer = window.setTimeout(
      () => setCaseWindowId(new URL(window.location.href).searchParams.get("case") ?? ""),
      0,
    );
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!caseWindowId) return;
    const record = cases.find((entry) => entry.dbId === caseWindowId);
    // Keeps a case window showing the freshest record rather than only ever
    // selecting once: without this, a stage move (which clears the selection
    // so the drawer can rebuild against reloaded data) never picks the new
    // record back up, and the pipeline is left showing the stage it just left.
    if (!record || record === selected) return;
    const timer = window.setTimeout(() => setSelected(record), 0);
    return () => window.clearTimeout(timer);
  }, [caseWindowId, cases, selected]);
  const openCaseWorkspace = useCallback((record: CaseRecord) => {
    if (!record.dbId) return;
    const target = new URL(window.location.href);
    target.search = "";
    target.searchParams.set("case", record.dbId);
    window.open(target.toString(), `maximus-case-${record.dbId}`, "noopener,noreferrer");
  }, []);
  const searched = useMemo(
    () =>
      cases.filter((c) =>
        (c.name + c.id + c.email + c.type + c.target)
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [cases, query],
  );
  const open = (x: ModalType) => {
    setEditing(null);
    setFormError("");
    setModal(x);
    setQuickOpen(false);
  };
  const generateIntakeLink = async () => {
    setQuickOpen(false);
    try {
      const response = await fetch("/api/crm/intake-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceType: serviceMode === "study" ? "study_abroad" : "direct_visa" }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "The secure intake link could not be created.");
      window.prompt("Secure enquiry link (valid for 30 days). Copy and send it to the prospective client:", result.url);
      say("Secure enquiry link created and recorded");
    } catch (reason) {
      say(reason instanceof Error ? reason.message : "The secure intake link could not be created.");
    }
  };
  // Opening a document request or an invoice from within the case it
  // belongs to, rather than picking that same case back out of every case
  // in the organisation from a separate screen.
  const openForCase = (caseId: string, kind: "document" | "visaChecklist" | "invoice" | "message" = "document") => {
    setPresetCaseId(caseId);
    open(kind);
  };
  // Sends a completed form to the workspace and refreshes what is on screen.
  const submitRecord = async (
    kind: Exclude<ModalType, null>,
    payload: Record<string, unknown>,
    attachment?: File,
  ) => {
    setSaving(true);
    try {
      const response = await fetch("/api/crm/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(result.error || "The record could not be saved.");

      if (kind === "message" && role !== "client") {
        const sent = await fetch("/api/crm/mailbox", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "send_message", messageId: result.messageId }),
        });
        const sentResult = await sent.json().catch(() => ({}));
        if (!sent.ok) {
          setModal(null);
          setPresetCaseId("");
          await loadWorkspace();
          throw new Error(sentResult.error || "The message was saved but Gmail could not send it.");
        }
      }

      if (kind === "invoice" && attachment) {
        if (!result.documentId) {
          setModal(null);
          setPresetCaseId("");
          await loadWorkspace();
          throw new Error("The invoice was created but its PDF storage record is unavailable.");
        }
        const upload = new FormData();
        upload.append("documentId", String(result.documentId));
        upload.append("file", attachment);
        const stored = await fetch("/api/crm/documents", { method: "POST", body: upload });
        const storedResult = await stored.json().catch(() => ({}));
        if (!stored.ok) {
          setModal(null);
          setPresetCaseId("");
          await loadWorkspace();
          throw new Error(storedResult.error || "The invoice was created but its PDF could not be stored.");
        }
      }

      setModal(null);
      setEditing(null);
      setDuplicates(null);
      setPendingIntake(null);
      setPresetCaseId("");
      await loadWorkspace();
      say(
        role === "client" && kind === "appointment"
          ? "Appointment request sent to your case team"
          : role === "client" && kind === "message"
            ? "Message sent to your case team"
            : kind === "message"
              ? "Message sent and added to the shared case conversation"
              : kind === "invoice"
                ? attachment
                  ? "Invoice created and PDF stored in the client Drive folder"
                  : "Invoice created with a Drive PDF slot ready"
                : `${kind[0].toUpperCase() + kind.slice(1)} saved`,
      );
      return true;
    } catch (reason) {
      const message =
        reason instanceof Error
          ? reason.message
          : "The record could not be saved.";
      setFormError(message);
      say(message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Asks the database whether this person is already on file. A check that
  // cannot run does not silently pass: that is the answer that creates the
  // duplicate.
  const findDuplicates = async (payload: Record<string, unknown>) => {
    const response = await fetch("/api/crm/duplicates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: payload.name,
        email: payload.email,
        phone: payload.phone,
        dateOfBirth: payload.dob,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(result.error || "The duplicate check could not be run.");
    return (result.matches ?? []) as DuplicateMatch[];
  };

  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!modal || saving) return;
    setSaving(true);
    setFormError("");
    const f = new FormData(e.currentTarget),
      payload = Object.fromEntries(
        Array.from(f.entries()).filter(
          ([, value]) => typeof value === "string",
        ),
      ) as Record<string, unknown>;
    const invoicePdfValue = modal === "invoice" ? f.get("invoicePdf") : null;
    const invoicePdf =
      invoicePdfValue instanceof File && invoicePdfValue.size > 0
        ? invoicePdfValue
        : undefined;
    if (
      invoicePdf &&
      invoicePdf.type !== "application/pdf" &&
      !invoicePdf.name.toLowerCase().endsWith(".pdf")
    ) {
      setFormError("Invoice attachments must be PDF files.");
      setSaving(false);
      return;
    }
    payload.action = modal;
    // The portal asks; staff confirm. The workspace accepts only the actions
    // built for a client account.
    if (role === "client" && modal === "appointment")
      payload.action = "appointment_request";
    if (modal === "case" && editing?.dbId && editing.clientId) {
      payload.action = "update_case";
      payload.caseId = editing.dbId;
      payload.clientId = editing.clientId;
    }
    if (modal === "message") {
      const linked = cases.find((c) => (c.dbId || c.id) === payload.caseId);
      payload.clientId = linked?.clientId || null;
    }
    // A new client, not an edit and not a portal account: look for them first.
    if (modal === "case" && !editing && role !== "client") {
      try {
        const found = await findDuplicates(payload);
        if (found.length) {
          setPendingIntake(payload);
          setDuplicates(found);
          setSaving(false);
          return;
        }
      } catch (reason) {
        const message =
          reason instanceof Error
            ? reason.message
            : "The duplicate check could not be run.";
        setFormError(message);
        setSaving(false);
        return;
      }
    }
    await submitRecord(modal, payload, invoicePdf);
  };

  // The three honest answers to "this looks like somebody you already have".
  const openExistingClient = (clientId: string) => {
    const existing = cases.find((c) => c.clientId === clientId);
    setModal(null);
    setEditing(null);
    setDuplicates(null);
    setPendingIntake(null);
    if (existing) openCaseWorkspace(existing);
    else say("That client has no case on file yet.");
  };
  const addCaseToExistingClient = async (clientId: string) => {
    if (!pendingIntake) return;
    await submitRecord("case", {
      ...pendingIntake,
      existingClientId: clientId,
    });
  };
  const createAsNewPerson = async () => {
    if (!pendingIntake) return;
    await submitRecord("case", pendingIntake);
  };
  const editCase = (c: CaseRecord) => {
      setSelected(null);
      setEditing(c);
      setModal("case");
    },
    removeCase = (id: string) => {
      const record = cases.find((item) => item.id === id);
      if (!record?.dbId)
        return say("The selected case could not be identified.");
      // A case officer asks; a manager decides. The prompt says which of the
      // two is about to happen.
      const asking = role === "staff";
      const prompt = asking
        ? "Ask a manager to archive this case? They will be notified and the request goes on the case history."
        : "Archive this case? Its history will be preserved.";
      if (confirm(prompt)) {
        setSelected(null);
        void mutateRemote("case", "archive", record.dbId);
      }
    },
    exportData = () => {
      // Case work is shared throughout the branch. Exports therefore follow
      // the same visible branch boundary and remain fully auditable.
      const mine = cases;
      const ids = new Set(mine.map((c) => c.dbId || c.id));
      const scope =
        role === "staff"
          ? "branch"
          : role === "admin"
            ? "branch"
            : "organisation";
      void fetch("/api/crm/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "record_export",
          scope,
          count: mine.length,
        }),
      }).catch(() => undefined);
      const blob = new Blob(
          [
            JSON.stringify(
              {
                exportedBy: identity?.email ?? "",
                scope,
                cases: mine,
                tasks: tasks.filter((t) => !t.caseId || ids.has(t.caseId)),
                appointments,
                documents,
                messages: messages.filter(
                  (m) => !m.caseId || ids.has(m.caseId),
                ),
                // Commission claims and partner invoices are management
                // finance; a case officer's export carries neither.
                invoices:
                  role === "staff"
                    ? invoices.filter((i) =>
                        mine.some((c) => c.name === i.client),
                      )
                    : invoices,
                templates,
                workflows,
                roles: role === "staff" ? [] : roles,
                audits: role === "staff" ? [] : audits,
              },
              null,
              2,
            ),
          ],
          { type: "application/json" },
        ),
        url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = "maximus-crm-export.json";
      a.click();
      URL.revokeObjectURL(url);
      say(
        role === "staff"
          ? `Exported ${mine.length} branch cases. The export is on the audit trail.`
          : "Live data exported. The export is on the audit trail.",
      );
    };
  const moveCaseStage = async (
    record: CaseRecord,
    stage: LifecycleStage,
    reason: string,
  ) => {
    if (!record.dbId) {
      say("This case could not be identified.");
      return;
    }
    try {
      const response = await fetch("/api/crm/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "lifecycle",
          caseId: record.dbId,
          stage,
          reason: reason.trim() || null,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "The case could not be moved.");
      setSelected(null);
      await loadWorkspace();
      const movedDirect = record.serviceType === "direct_visa";
      // Direct Visa's nav has no screen of its own for the student or
      // application stages: "Clients" is where the student stage lives, and
      // "Visa Applications" covers both the application and visa stages, so a
      // migration case moved into either lands there rather than on a Study
      // Abroad screen it has no way to reach.
      setActive(
        !movedDirect
          ? stageModule[stage]
          : stage === "student"
            ? "direct_visas"
            : stage === "application"
              ? "visas"
              : stageModule[stage],
      );
      say(
        stage === "completed"
          ? `${record.name} marked as completed`
          : stage === "deferred"
            ? `${record.name} deferred`
            : record.lifecycleStage === "completed"
              ? `${record.name} reopened in ${stageLabelFor(stage, movedDirect).toLowerCase()}`
              : record.lifecycleStage === "deferred"
                ? `${record.name} resumed in ${stageLabelFor(stage, movedDirect).toLowerCase()}`
                : `${record.name} moved to ${stageLabelFor(stage, movedDirect).toLowerCase()}`,
      );
    } catch (reason_) {
      say(
        reason_ instanceof Error
          ? reason_.message
          : "The case could not be moved.",
      );
    }
  };
  async function mutateRemote(
    resource: string,
    operation: string,
    id: string,
    extra: Record<string, unknown> = {},
  ) {
    try {
      const response = await fetch("/api/crm/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "mutate",
          resource,
          operation,
          id,
          ...extra,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "The update was rejected.");
      await loadWorkspace();
      // Some actions are a request rather than the thing itself, and the
      // person needs to know which happened.
      say(
        typeof result.message === "string"
          ? result.message
          : "Live record updated",
      );
    } catch (reason) {
      await loadWorkspace();
      say(
        reason instanceof Error
          ? reason.message
          : "The update could not be saved.",
      );
    }
  }
  async function bulkMutateRemote(
    resource: string,
    operation: string,
    ids: string[],
    extra: Record<string, unknown> = {},
  ) {
    if (!ids.length) return;
    try {
      const response = await fetch("/api/crm/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "bulk_mutate",
          resource,
          operation,
          ids,
          ...extra,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "The bulk update was rejected.");
      await loadWorkspace();
      const succeeded = Number(result.succeeded ?? ids.length);
      const failed = Number(result.failed ?? 0);
      const requested = Number(result.requested ?? 0);
      say(
        (requested > 0
          ? `${requested} archive request${requested === 1 ? "" : "s"} sent to management`
          : `${succeeded} record${succeeded === 1 ? "" : "s"} updated`) +
          (failed ? `; ${failed} could not be changed.` : "."),
      );
    } catch (reason) {
      await loadWorkspace();
      say(reason instanceof Error ? reason.message : "The bulk update could not be saved.");
    }
  }
  const bulkMoveCases = async (
    records: CaseRecord[],
    stage: LifecycleStage,
  ) => {
    const ids = records.map((record) => record.dbId).filter(Boolean) as string[];
    if (!ids.length) return say("None of the selected cases could be identified.");
    try {
      const response = await fetch("/api/crm/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "bulk_lifecycle", caseIds: ids, stage }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The cases could not be moved.");
      await loadWorkspace();
      const succeeded = Number(result.succeeded ?? ids.length);
      const failed = Number(result.failed ?? 0);
      say(`${succeeded} case${succeeded === 1 ? "" : "s"} moved to ${stageLabels[stage].toLowerCase()}` + (failed ? `; ${failed} could not be moved.` : "."));
    } catch (reason) {
      await loadWorkspace();
      say(reason instanceof Error ? reason.message : "The cases could not be moved.");
    }
  };
  const bulkArchiveCases = async (records: CaseRecord[]) => {
    const ids = records.map((record) => record.dbId).filter(Boolean) as string[];
    await bulkMutateRemote("case", "archive", ids);
  };
  async function postOperation(
    action: string,
    extra: Record<string, unknown> = {},
  ) {
    try {
      const response = await fetch("/api/crm/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "The update was rejected.");
      await loadWorkspace();
      say("Live record updated");
    } catch (reason) {
      await loadWorkspace();
      say(
        reason instanceof Error
          ? reason.message
          : "The update could not be saved.",
      );
    }
  }
  const syncTasks = (next: TaskRecord[]) => {
    const removed = tasks.find(
      (item) => !next.some((candidate) => candidate.id === item.id),
    );
    const changed = next.find(
      (item) =>
        tasks.find((previous) => previous.id === item.id)?.completed !==
        item.completed,
    );
    setTasks(next);
    if (removed) void mutateRemote("task", "delete", removed.id);
    else if (changed)
      void mutateRemote("task", "toggle", changed.id, {
        completed: changed.completed,
      });
  };
  const syncAppointments = (next: AppointmentRecord[]) => {
    const removed = appointments.find(
      (item) => !next.some((candidate) => candidate.id === item.id),
    );
    setAppointments(next);
    if (removed) void mutateRemote("appointment", "delete", removed.id);
  };
  const syncDocuments = (next: DocumentRecord[]) => {
    const removed = documents.find(
      (item) => !next.some((candidate) => candidate.id === item.id),
    );
    setDocuments(next);
    if (removed) void mutateRemote("document", "delete", removed.id);
  };
  const syncMessages = (next: MessageRecord[]) => {
    const removed = messages.find(
      (item) => !next.some((candidate) => candidate.id === item.id),
    );
    const changed = next.find(
      (item) =>
        messages.find((previous) => previous.id === item.id)?.status !==
        item.status,
    );
    setMessages(next);
    if (removed) void mutateRemote("message", "delete", removed.id);
    else if (changed)
      void mutateRemote("message", "toggle", changed.id, {
        completed: changed.status !== "Draft",
      });
  };
  const syncInvoices = (next: InvoiceRecord[]) => {
    const removed = invoices.find(
      (item) => !next.some((candidate) => candidate.id === item.id),
    );
    const changed = next.find(
      (item) =>
        invoices.find((previous) => previous.id === item.id)?.status !==
        item.status,
    );
    setInvoices(next);
    if (removed) void mutateRemote("invoice", "delete", removed.id);
    else if (changed)
      void mutateRemote("invoice", "toggle", changed.id, {
        completed: changed.status === "Paid",
        amount: changed.amount,
      });
  };
  const syncWorkflows = (next: WorkflowRecord[]) => {
    const changed = next.find(
      (item) =>
        workflows.find((previous) => previous.id === item.id)?.active !==
        item.active,
    );
    setWorkflows(next);
    if (changed)
      void mutateRemote("workflow", "toggle", changed.id, {
        active: changed.active,
      });
  };
  const syncTemplates = (next: TemplateRecord[]) => {
    const removed = templates.find(
      (item) => !next.some((candidate) => candidate.id === item.id),
    );
    setTemplates(next);
    if (removed) void mutateRemote("template", "delete", removed.id);
  };
  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setIdentity(null);
    // The next person to sign in gets their own landing screen.
    landedAs.current = null;
    setCases([]);
    setTasks([]);
    setAppointments([]);
    setDocuments([]);
    setMessages([]);
    setInvoices([]);
    setTemplates([]);
    setWorkflows([]);
    setApplicationRows([]);
    setVisaMatterRows([]);
    setAudits([]);
    setStaff([]);
    setBranches([]);
    setSchemaWarning("");
    setAlerts([]);
    setStorageConnected(false);
  };
  const changePassword = async () => {
    const password = window.prompt("Enter a new password (at least 12 characters with a letter and number):");
    if (!password) return;
    const confirmation = window.prompt("Enter the new password again:");
    if (password !== confirmation) {
      window.alert("The passwords do not match.");
      return;
    }
    const response = await fetch("/api/auth/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const result = await response.json().catch(() => ({}));
    window.alert(response.ok ? "Your password has been changed." : result.error || "The password could not be changed.");
  };
  if (!sessionReady)
    return (
      <main className="sessionLoading">
        <div className="brandMark">M</div>
        <strong>Opening Maximus CRM…</strong>
        <span>Checking your secure account and workspace</span>
      </main>
    );
  if (!signedIn) return <LiveLogin onLogin={loadWorkspace} />;
  // The service stream is a recorded field. Matching on the matter label put a
  // "Student visa 500" case into the migration list.
  const education = cases.filter((c) => c.serviceType !== "direct_visa"),
    visa = cases.filter((c) => c.serviceType === "direct_visa");
  const unreadAlerts = alerts.filter((alert) => !alert.read_at);
  const unreadMessages = messages.filter((message) =>
    ["unread", "received", "inbound"].includes(message.status.toLowerCase()),
  );
  // The portal is titled from its own labels: the staff ones name commissions,
  // partner claims and internal drafts, none of which is a client's business.
  // Every client on file once, for connecting a portal login to their record.
  const clientDirectory = Array.from(
    new Map(
      cases
        .filter((c) => c.clientId)
        .map((c) => [
          String(c.clientId),
          { id: String(c.clientId), name: c.name },
        ]),
    ).values(),
  ).sort((a, b) => a.name.localeCompare(b.name));

  // Every staff member can work on branch client finance. Commission claims
  // remain management-only because they are organisation counterparties, not
  // student case operations.
  const visibleInvoices =
    role === "staff"
      ? invoices.filter(
          (invoice) =>
            CLIENT_INVOICE_TYPES.includes(invoice.type) &&
            cases.some((c) => c.name === invoice.client),
        )
      : invoices;
  const screenMeta =
    (role === "client" ? clientMeta[active] : undefined) ?? meta[active];
  let content: React.ReactNode;
  if (role === "client")
    content =
      active === "portal" ? (
        <PortalView cases={cases} journeyHistory={journeyHistory} declarations={declarations} />
      ) : active === "courseFinder" ? (
        <CourseFinderView canManage={false} />
      ) : (
        <ClientModuleView
          module={active}
          client={cases[0]}
          appointments={appointments}
          documents={documents}
          messages={messages}
          invoices={invoices}
          openModal={open}
          storageConnected={storageConnected}
        />
      );
  else if (active === "dashboard")
    content = (
      <WorkspaceDashboard
        cases={cases}
        tasks={tasks}
        appointments={appointments}
        documents={documents}
        openModal={open}
        setActive={setActive}
        onOpenCase={openCaseWorkspace}
        serviceMode={serviceMode}
        role={role}
      />
    );
  else if (active === "work")
    content = (
      <TasksView
        tasks={tasks}
        cases={cases}
        setTasks={syncTasks}
        openModal={open}
        onBulkAction={bulkMutateRemote}
      />
    );
  else if (active === "calendar")
    content = (
      <CalendarView
        items={appointments}
        openModal={open}
        setItems={syncAppointments}
        setActive={setActive}
        onBulkAction={bulkMutateRemote}
        onRespond={(appointment, status) => {
          const note = window.prompt(
            status === "scheduled"
              ? "Confirmation note for the client (optional)"
              : "Reason or alternative time for the client",
            appointment.responseNote || "",
          );
          if (note === null) return;
          void postOperation("appointment_response", {
            appointmentId: appointment.id,
            status,
            date: appointment.date,
            time: appointment.time,
            note,
          });
        }}
      />
    );
  else if (active === "documents")
    content = (
      <DocumentsView
        items={documents}
        setItems={syncDocuments}
        storageConnected={storageConnected}
        onBulkAction={bulkMutateRemote}
      />
    );
  else if (active === "communications")
    content = (
      <MessagesView
        items={messages}
        campaigns={campaigns}
        cases={cases}
        openModal={open}
        setItems={syncMessages}
        // This screen is only ever reached by staff -- the client portal has
        // its own communications screen elsewhere in this render.
        canSend={true}
        onBulkAction={bulkMutateRemote}
        onCampaignChange={loadWorkspace}
        onClose={() => setActive("dashboard")}
      />
    );
  else if (active === "courseFinder")
    content = <CourseFinderView canManage={role !== "staff"} />;
  else if (active === "finance")
    content = (
      <>
        <FinanceView
          items={visibleInvoices}
          openModal={open}
          setItems={syncInvoices}
          canManage={canManageCaseFinance}
          onRefund={(invoice) => {
            if (
              confirm(
                `Refund $${invoice.paid.toLocaleString()} to ${invoice.client}? This is recorded against the invoice and cannot be undone here.`,
              )
            )
              void postOperation("record_refund", {
                invoiceId: invoice.id,
                amount: invoice.paid,
              });
          }}
          onPayment={(invoice) => {
            const amount = window.prompt(
              `Payment received for ${invoice.invoiceNumber}. Outstanding ${invoice.currency} ${invoice.balance.toFixed(2)}`,
              invoice.balance.toFixed(2),
            );
            if (amount === null) return;
            const parsed = Number(amount);
            if (!Number.isFinite(parsed) || parsed <= 0 || parsed > invoice.balance) {
              say("Enter a payment no greater than the outstanding balance.");
              return;
            }
            const reference = window.prompt("Payment reference (bank reference, receipt ID or transaction ID)", "") ?? "";
            void postOperation("record_payment", { invoiceId: invoice.id, amount: parsed, currency: invoice.currency, reference });
          }}
          onReminder={(invoice) => {
            if (confirm(`Queue an overdue reminder for ${invoice.invoiceNumber}? It will use the current email in the case profile.`))
              void postOperation("queue_overdue_reminder", { invoiceId: invoice.id, reminderType: "manual" });
          }}
          onCreditNote={(invoice) => {
            const remaining = invoice.balance;
            const amount = window.prompt(
              `How much of ${invoice.client}'s $${remaining.toLocaleString()} balance should be forgiven?`,
              String(remaining),
            );
            if (amount === null) return;
            const parsed = Number(amount);
            if (!Number.isFinite(parsed) || parsed <= 0) {
              say("Enter an amount greater than zero.");
              return;
            }
            const reason = window.prompt("Reason for the credit note (optional)?") ?? "";
            void mutateRemote("invoice", "credit", invoice.id, {
              amount: parsed,
              reason: reason || undefined,
            });
          }}
          onBulkAction={bulkMutateRemote}
        />
        <CommissionClaimsPanel
          items={commissionClaims}
          cases={cases}
          canManage={canManageBranch}
          onCreate={(data) =>
            void postOperation("create_commission_claim", {
              counterpartyType: data.counterpartyType,
              partnerName: data.partnerName,
              institution: data.institution,
              counterpartyEmail: data.counterpartyEmail,
              netAmount: data.netAmount,
              taxRate: data.taxRate,
              currency: data.currency,
              dueOn: data.dueOn,
              caseIds: data.caseIds,
            })
          }
          onMarkReceived={(claim) => {
            const receivedAmount = window.prompt(
              `Amount received from ${claim.partnerName}? Pending ${claim.currency} ${claim.pendingAmount.toFixed(2)}`,
              String(claim.pendingAmount),
            );
            if (receivedAmount === null) return;
            const parsed = Number(receivedAmount);
            if (!Number.isFinite(parsed) || parsed <= 0 || parsed > claim.pendingAmount) {
              say("Enter an amount no greater than the pending commission.");
              return;
            }
            const reference = window.prompt("Payment reference (optional)", "") ?? "";
            void postOperation("record_commission_received", {
              claimId: claim.id,
              receivedAmount: parsed,
              reference,
            });
          }}
          onSendInvoice={(claim) => {
            const recipient = window.prompt("Send commission invoice to", claim.counterpartyEmail);
            if (recipient) void postOperation("send_commission_invoice", { claimId: claim.id, recipient });
          }}
          onSendReceipt={(claim) => {
            const recipient = window.prompt("Send latest commission receipt to", claim.counterpartyEmail);
            if (recipient) void postOperation("send_commission_receipt", { claimId: claim.id, recipient });
          }}
        />
      </>
    );
  else if (active === "templates")
    content = (
      <TemplatesWorkspace items={templates} checklistTemplates={checklistTemplates}
        emailTemplates={emailTemplates} openModal={open} setItems={syncTemplates}
        canManage={canManageBranch} reloadChecklist={loadChecklistTemplates}
        reloadEmails={loadEmailTemplates} onBulkAction={bulkMutateRemote} />
    );
  else if (active === "workflows")
    content = (
      <WorkflowView
        items={workflows}
        openModal={open}
        setItems={syncWorkflows}
        canManage={canManageBranch}
        onBulkAction={bulkMutateRemote}
      />
    );
  else if (active === "reports")
    content = (
      <ReportsView
        exportData={exportData}
        canSeeFinance={canManageCaseFinance}
        serviceMode={serviceMode}
      />
    );
  else if (active === "ai")
    content = <AIAssistantView cases={cases} say={say} />;
  else if (active === "compliance")
    content = (
      <article className="panel listPanel">
        <div className="panelHead">
          <div>
            <span className="kicker">SECURE AUDIT TRAIL</span>
            <h2>Recorded actions</h2>
          </div>
          <button className="ghostButton" onClick={exportData}>
            <Download size={15} />
            Export
          </button>
        </div>
        {audits.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="No audit activity"
            copy="Create or update a record and the protected audit trail will appear here."
            action="Create case"
            onAction={() => open("case")}
          />
        ) : (
          audits.map((a) => (
            <div className="functionalRow" key={a.id}>
              <div className="docIcon">
                <ShieldCheck size={16} />
              </div>
              <div>
                <strong>{a.text}</strong>
                <span>{orgDateTime(a.at)}</span>
              </div>
            </div>
          ))
        )}
      </article>
    );
  else if (active === "administration")
    content = (
      <>
        <AdminView
          roles={roles}
          isOwner={role === "super_admin"}
          currentProfileId={identity?.profileId ?? ""}
          clients={clientDirectory}
        />
        <ReadinessPanel />
        <FeatureCoverage />
      </>
    );
  else if (active === "integrations") content = <GoogleWorkspaceView />;
  else {
    // Opens the case an application or visa matter belongs to.
    const openCase = (id: string) => {
      const found = cases.find((c) => c.dbId === id);
      if (found) openCaseWorkspace(found);
      else say("That case is not in your workspace.");
    };
    // The pipeline stage a case sits at is shared by both service streams, but
    // the screens that show it are not: the Study Abroad "Applications" list
    // and the Direct Visa "Clients" list must never show each other's cases,
    // whatever stage each happens to share. Every stage-based list here is
    // filtered by the workspace currently open, not only by stage.
    const direct = serviceMode === "direct_visa";
    const inStream = (c: CaseRecord) =>
      (c.serviceType === "direct_visa") === direct;
    const atStage = (stage: LifecycleStage) =>
      cases.filter((c) => c.lifecycleStage === stage && inStream(c));
    const list =
      active === "enquiries"
        ? atStage("enquiry")
        : active === "students"
          ? // Students is the enduring Study Abroad directory, not a
            // temporary pipeline bucket. A converted student must remain
            // findable here after applications are submitted or the case
            // reaches the visa stage.
            cases.filter(
              (c) => inStream(c) && c.lifecycleStage !== "enquiry",
            )
          : active === "applications"
            ? atStage("application")
            : active === "visas"
              ? // Study Abroad splits "application" and "visa" into two
                // screens because its own nav has both. The migration
                // journey has no separate applications screen -- "Visa
                // Applications" is where a case lands the moment it leaves
                // Clients, and the visa stage represents it once lodged, so
                // both stages belong on this one list for Direct Visa.
                direct
                ? cases.filter(
                    (c) =>
                      inStream(c) &&
                      (c.lifecycleStage === "application" ||
                        c.lifecycleStage === "visa"),
                  )
                : atStage("visa")
              : active === "direct_visas"
                ? // Clients is the enduring Direct Visa directory. Keep a
                  // person visible here throughout application, lodgement,
                  // deferral and completion; the other screens are focused
                  // operational views of the same case, not replacements for
                  // the client record.
                  cases.filter(
                    (c) => inStream(c) && c.lifecycleStage !== "enquiry",
                  )
                : active === "case_complete"
                  ? atStage("completed")
                  : active === "defer"
                    ? // Two things an agency calls a deferral: the case itself
                      // parked at the deferred stage, and a case still being
                      // worked whose application moved to a later intake.
                      cases.filter(
                        (c) =>
                          inStream(c) &&
                          (c.lifecycleStage === "deferred" ||
                            c.deferredApplications > 0),
                      )
                    : direct
                      ? visa
                      : education;
    const caseList = (
      <CaseWorkspace
        title={
          active === "applications"
            ? "Cases at the application stage"
            : active === "visas"
              ? direct
                ? "Cases at the application or visa stage"
                : "Cases at the visa stage"
              : active === "direct_visas"
                ? "Client directory"
                : active === "students"
                  ? "Student directory"
                : meta[active][0]
        }
        module={active}
        cases={list}
        filter={filter}
        setFilter={setFilter}
        openModal={open}
        onSelect={openCaseWorkspace}
        onBulkStage={bulkMoveCases}
        onBulkArchive={bulkArchiveCases}
        onAddNote={async (record, note) => {
          if (!record.dbId) return say("This case could not be identified.");
          await postOperation("case_note", {
            caseId: record.dbId,
            body: note,
            visibility: "case_team",
          });
        }}
        onMoveStage={moveCaseStage}
      />
    );
    // These two screens lead with the records themselves. The case list stays
    // underneath, because a case can sit at the stage before anything has been
    // lodged and must not disappear from view.
    content =
      active === "applications" ? (
        <>
          <ApplicationsBoard
            rows={applicationRows.filter((row) =>
              cases.some((c) => c.dbId === row.caseId && inStream(c)),
            )}
            onOpen={openCase}
          />
          {caseList}
        </>
      ) : active === "visas" ? (
        <>
          <VisaMattersBoard
            rows={visaMatterRows.filter((row) =>
              cases.some((c) => c.dbId === row.caseId && inStream(c)),
            )}
            onOpen={openCase}
          />
          {caseList}
        </>
      ) : (
        caseList
      );
  }
  return (
    <div className={`appShell mode-${serviceMode}${caseWindowId ? " caseWindow" : ""}${active === "communications" && role !== "client" ? " gmailMode" : ""}`}>
      {schemaWarning && (
        <div className="schemaBanner" role="status">
          <AlertTriangle size={15} />
          <span>{schemaWarning}</span>
        </div>
      )}
      {truncated.length > 0 && (
        <div className="truncationBanner" role="status">
          <AlertTriangle size={15} />
          <span>
            Showing only the most recent records for {truncated.join(", ")} --
            there may be more. Narrow a filter or ask an administrator if you
            need to see further back.
          </span>
        </div>
      )}
      <Sidebar
        active={active}
        setActive={setActive}
        open={menuOpen}
        setOpen={setMenuOpen}
        role={role}
        serviceMode={serviceMode}
      />
      <main className="mainArea">
        <header className={`topbar ${role === "client" ? "clientOnly" : ""} ${role !== "client" && active !== "dashboard" ? "moduleFocused" : ""}`}>
          <div className="topbarPrimary">
            <button
              className="menuButton"
              onClick={() => setMenuOpen(true)}
              aria-label="Open case navigation"
              title="Open case navigation"
            >
              <Menu size={21} />
            </button>
            {role !== "client" ? (
              <div className="searchWrap">
                <Search size={18} />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={`Search ${serviceMode === "study" ? "students and applications" : "clients and visa matters"}…`}
                />
                <kbd>
                  <Command size={12} />K
                </kbd>
                {query.length > 1 && (
                  <div className="searchResults">
                    {searched.length ? (
                      searched.slice(0, 7).map((c) => (
                        <button
                          key={c.id}
                          onClick={() => {
                            openCaseWorkspace(c);
                            setQuery("");
                          }}
                        >
                          <div className="avatar small">
                            {c.name.slice(0, 2).toUpperCase()}
                          </div>
                          <span>
                            <b>{c.name}</b>
                            <small>
                              {c.id} · {c.type}
                            </small>
                          </span>
                          <ArrowRight size={15} />
                        </button>
                      ))
                    ) : (
                      <div className="searchEmpty">No matching records</div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="clientTopLabel">
                <ShieldCheck size={17} />
                <span>Private client account</span>
              </div>
            )}
            {role !== "client" ? (
              <div className="serviceAndFinder">
                <ProfileServiceSwitch
                  serviceMode={serviceMode}
                  setServiceMode={setServiceMode}
                  setActive={setActive}
                />
                {serviceMode === "study" ? (
                  <button
                    className={`courseFinderSwitchButton ${active === "courseFinder" ? "active" : ""}`}
                    onClick={() => setActive("courseFinder")}
                    aria-label="Open Course Finder"
                    title="Open Course Finder"
                  >
                    <School size={17} />
                    <span>Course Finder</span>
                  </button>
                ) : null}
              </div>
            ) : null}
            <div className="topActions">
              {role !== "client" ? (
                <button
                  className={`messageShortcut ${active === "communications" ? "active" : ""}`}
                  onClick={() => setActive("communications")}
                  aria-label="Open Messages"
                  title="Open Messages"
                >
                  <Mail size={17} />
                  <span>Messages</span>
                  {unreadMessages.length > 0 ? <b>{unreadMessages.length}</b> : null}
                </button>
              ) : null}
              <div className="signedAccount">
                <div className="avatar small">{roleConfig[role].initials}</div>
                <span>
                  <b>{identity?.displayName || roleConfig[role].label}</b>
                  <small>{identity?.email}</small>
                </span>
                <button
                  className="iconButton"
                  onClick={() => void changePassword()}
                  aria-label="Change password"
                  title="Change password"
                >
                  <LockKeyhole size={17} />
                </button>
                <button
                  className="iconButton"
                  onClick={() => void signOut()}
                  aria-label="Sign out"
                  title="Sign out"
                >
                  <LogOut size={17} />
                </button>
              </div>
              <div className="popoverWrap">
                <button
                  className="iconButton alert"
                  onClick={() => setNotifications(!notifications)}
                  aria-label="Notifications"
                  title="Notifications"
                >
                  <Bell size={19} />
                  {(unreadAlerts.length > 0 ||
                    tasks.some((t) => !t.completed)) && <i />}
                </button>
                {notifications && (
                  <div className="smallPopover notificationPopover">
                    <strong>Notifications</strong>
                    {role === "client" ? (
                      <span>Only your linked updates are shown</span>
                    ) : unreadAlerts.length === 0 ? (
                      <span>
                        Nothing new · {tasks.filter((t) => !t.completed).length}{" "}
                        open tasks
                      </span>
                    ) : (
                      <ul className="alertList">
                        {unreadAlerts.slice(0, 6).map((alert) => (
                          <li key={alert.id}>
                            <button
                              onClick={() => void markAlertRead(alert.id)}
                            >
                              <span>
                                <b>{alert.title}</b>
                                {alert.body ? (
                                  <small>{alert.body}</small>
                                ) : null}
                              </span>
                              <Check size={14} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {role !== "client" ? (
                      <button
                        onClick={() => {
                          setActive("work");
                          setNotifications(false);
                        }}
                      >
                        View tasks
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
              {role !== "client" ? (
                <div className="popoverWrap">
                  <button
                    className="quickButton"
                    onClick={() => setQuickOpen(!quickOpen)}
                    aria-label="Quick create"
                    title="Quick create"
                  >
                    <Plus size={17} />
                    <span>Quick create</span>
                    <ChevronDown size={15} />
                  </button>
                  {quickOpen && (
                    <div className="quickMenu">
                      {[
                        [
                          "case",
                          serviceMode === "study"
                            ? "Enquiry / Student"
                            : "Enquiry / Client",
                          BriefcaseBusiness,
                        ],
                        ["task", "Task", Check],
                        ["appointment", "Appointment", CalendarDays],
                        ["message", "Message draft", Mail],
                      ].map(([k, l, Icon]) => (
                        <button
                          key={String(k)}
                          onClick={() => open(k as ModalType)}
                        >
                          <Icon size={16} />
                          {String(l)}
                        </button>
                      ))}
                      <button onClick={() => void generateIntakeLink()}>
                        <Link2 size={16} /> Generate enquiry link
                      </button>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
          {role !== "client" ? (
            <div className="topbarSecondary">
              <DailyTopNav active={active} setActive={setActive} />
            </div>
          ) : null}
        </header>
        <div className="content">
          <div className="pageTitle">
            <div>
              <span>
                {role !== "client"
                  ? serviceMode === "study"
                    ? "Study Abroad"
                    : "Direct Visa"
                  : screenMeta[1]}
              </span>
              <h1>
                {active === "dashboard"
                  ? `Good afternoon, ${(identity?.displayName || roleConfig[role].label).split(" ")[0]}`
                  : screenMeta[0]}
              </h1>
              <p>{active === "dashboard" ? "Here is the work that needs your attention today." : screenMeta[2]}</p>
            </div>
            {role !== "client" && (["dashboard", "enquiries", "students", "applications", "visas", "direct_visas", "defer", "case_complete", "reports", "compliance", "documents", "finance"] as ModuleKey[]).includes(active) ? (
              <div className="titleActions">
                {(["reports", "compliance", "documents", "finance"] as ModuleKey[]).includes(active) && <button className="ghostButton" onClick={exportData}><Download size={16} />Export</button>}
                {(["dashboard", "enquiries", "students", "applications", "visas", "direct_visas", "defer", "case_complete"] as ModuleKey[]).includes(active) && <button className="primaryButton" onClick={() => open("case")}><Plus size={16} />{serviceMode === "study" ? "New enquiry" : "New client"}</button>}
              </div>
            ) : null}
          </div>
          {content}
        </div>
      </main>
      {role !== "client" ? (
        <CaseDrawer
          key={selected
            ? [
                ...documents
                  .filter((document) => document.caseId === selected.dbId)
                  .map((document) => `${document.id}:${document.status}`),
                ...messages
                  .filter((message) => message.caseId === selected.dbId)
                  .map((message) => `${message.id}:${message.status}`),
              ].sort().join("|") || selected.dbId
            : "closed"}
          moveStage={moveCaseStage}
          refresh={loadWorkspace}
          lifecycleReady={!schemaWarning}
          schemaWarning={schemaWarning}
          storageConnected={storageConnected}
          canModify={true}
          item={selected}
          close={() => {
            if (caseWindowId) window.close();
            else setSelected(null);
          }}
          edit={editCase}
          remove={removeCase}
          onCaseAction={openForCase}
        />
      ) : null}
      <RecordModal
        type={modal}
        close={() => {
          setModal(null);
          setEditing(null);
          setFormError("");
          setDuplicates(null);
          setPendingIntake(null);
          setPresetCaseId("");
        }}
        submit={save}
        duplicates={duplicates}
        onOpenExisting={openExistingClient}
        onAddCase={(id) => void addCaseToExistingClient(id)}
        onDifferentPerson={() => void createAsNewPerson()}
        serviceMode={serviceMode}
        presetCaseId={presetCaseId}
        cases={cases}
        editing={editing}
        branches={branches}
        staff={staff}
        role={role}
        documents={documents}
        checklistTemplates={checklistTemplates}
        saving={saving}
        error={formError}
      />
      {toast && (
        <div className="toast">
          <Check size={16} />
          {toast}
        </div>
      )}
    </div>
  );
}
