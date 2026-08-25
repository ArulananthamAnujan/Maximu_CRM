"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { orgDate, orgDateTime } from "@/lib/timezone";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bell,
  BookOpen,
  BrainCircuit,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Command,
  Download,
  FileCheck2,
  FileText,
  Filter,
  FolderOpen,
  GraduationCap,
  LockKeyhole,
  LogOut,
  Mail,
  Menu,
  MoreHorizontal,
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
} from "lucide-react";
import { VISA_DOCUMENT_TEMPLATES } from "@/lib/visa-document-checklist";

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
  to: string;
  subject: string;
  body: string;
  caseId: string;
  status: string;
  createdAt: string | null;
  sentAt: string | null;
};
type InvoiceRecord = {
  id: string;
  client: string;
  amount: number;
  paid: number;
  credited: number;
  balance: number;
  type: string;
  issued: string;
  due: string;
  status: string;
};
type CommissionClaimRecord = {
  id: string;
  partnerName: string;
  institution: string;
  currency: string;
  expectedAmount: number;
  receivedAmount: number;
  status: string;
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
    ],
  },
  {
    label: "Advising",
    items: [["courseFinder", "Course Finder", School]],
  },
] as const;

const directVisaNavGroups = [
  {
    label: "Migration journey",
    items: [
      ["enquiries", "Enquiries", Users],
      ["direct_visas", "Clients", UserCog],
      ["visas", "Visa Applications", ShieldCheck],
      ["case_complete", "Case Complete", FileCheck2],
    ],
  },
] as const;

const clientNavGroups = [
  {
    label: "My journey",
    items: [
      ["portal", "Journey", GraduationCap],
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
    scope: "Assigned branches, staff and operational records",
    initials: "AD",
    modules: [
      "dashboard",
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
    scope: "Assigned branch and assigned client records",
    initials: "ST",
    modules: [
      "dashboard",
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
    ],
  },
  client: {
    label: "Client / Student",
    legacy: "Student login",
    scope: "Only the linked personal journey and documents",
    initials: "CL",
    modules: ["portal", "calendar", "documents", "communications", "finance"],
  },
};

const permissionRows = [
  ["Organisation, branches and integrations", true, false, false, false],
  ["Staff invitations, activation and roles", true, true, false, false],
  ["All organisation cases", true, false, false, false],
  ["Assigned branch cases", true, true, false, false],
  ["Assigned client cases", true, true, true, false],
  ["Own journey and next steps", false, false, false, true],
  ["Documents", true, true, true, true],
  ["Gmail and internal communication", true, true, true, true],
  ["Finance and commissions", true, true, "view", true],
  ["Reports, audit and login activity", true, true, false, false],
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
    "Partners, statuses, document checklists, visa types, commissions, courses and institutions",
    "Next working screen",
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
    "Case-linked message drafts. Sending is not connected yet.",
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
            Simple. Connected. Easy to follow.
          </div>
          <span>MAXIMUS EDUCATION & MIGRATION</span>
          <h1>One secure login for every Maximus journey.</h1>
          <p>
            Staff, administrators and clients enter through the same doorway.
            Supabase verifies the account and the CRM automatically applies its
            real role and record access.
          </p>
          <div className="loginBenefits">
            <div>
              <Check size={18} />
              <span>
                <b>Live records</b>
                <small>Cases and tasks saved centrally</small>
              </span>
            </div>
            <div>
              <CalendarCheck2 size={18} />
              <span>
                <b>Connected work</b>
                <small>Deadlines and appointments together</small>
              </span>
            </div>
            <div>
              <ShieldCheck size={18} />
              <span>
                <b>Protected roles</b>
                <small>Database-enforced access for every account</small>
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
                <b>Staff</b>
                <small>Team and administrators</small>
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
                ? "Sign in to your workspace"
                : "Open your Maximus journey"}
            </h2>
            <p>
              Your role is detected from your authorised CRM profile after
              sign-in.
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
            {busy ? "Signing in…" : "Sign in securely"}
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
                <b>Continue with Google Workspace</b>
                <small>Sign in with your Google account</small>
              </span>
              <ChevronDown size={17} />
            </button>
          ) : null}
          <footer>
            <LockKeyhole size={16} />
            Credentials are verified securely by Supabase.
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
          className="brandMark"
          onClick={() => {
            setActive(role === "client" ? "portal" : "dashboard");
            setOpen(false);
          }}
          aria-label={role === "client" ? "Open my journey" : "Open dashboard"}
          title={role === "client" ? "Open my journey" : "Open dashboard"}
        >
          M
        </button>
        <div>
          <strong>MAXIMUS</strong>
          <span>Education & Migration</span>
        </div>
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
          <div className="navGroup" key={g.label}>
            <p>{g.label}</p>
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
        {config.modules.includes("administration") ? (
          <button
            className="iconButton"
            onClick={() => setActive("administration")}
            aria-label="Open settings"
            title="Open settings"
          >
            <MoreHorizontal size={18} />
          </button>
        ) : null}
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
  documents,
  openModal,
  setActive,
  serviceMode,
}: {
  cases: CaseRecord[];
  tasks: TaskRecord[];
  documents: DocumentRecord[];
  openModal: (x: ModalType) => void;
  setActive: (x: ModuleKey) => void;
  serviceMode: ServiceMode;
}) {
  const direct = serviceMode === "direct_visa",
    // Classify by the recorded service stream, never by the matter label: a
    // "Student visa" matter belongs to study abroad, not migration.
    workspaceCases = cases.filter((c) =>
      direct
        ? c.serviceType === "direct_visa"
        : c.serviceType !== "direct_visa",
    ),
    attention = workspaceCases.filter((c) => c.health !== "healthy").length,
    waiting = workspaceCases.filter((c) => c.status === "waiting").length,
    completed = workspaceCases.filter((c) => c.status === "completed").length,
    steps = direct
      ? [
          ["01", "Enquiry", "Capture and qualify"],
          ["02", "Client", "Convert and assign"],
          ["03", "Visa Application", "Prepare and lodge"],
          ["04", "Case Complete", "Record the outcome"],
        ]
      : [
          ["01", "Enquiry", "Capture and qualify"],
          ["02", "Student", "Convert and counsel"],
          ["03", "Application", "Offer and CoE"],
          ["04", "Visa", "Lodge and decide"],
          ["05", "Defer", "Move the intake"],
        ],
    openList = direct ? "direct_visas" : "students";
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
                ? "Every visa matter, clearly managed."
                : "Every student journey, beautifully organised."}
            </h2>
            <p>
              {direct
                ? "Move from enquiry to client, visa application and case completion in one focused migration workspace."
                : "Move from first enquiry to student, application, visa and defer management without losing the next action."}
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
              <b>Workspace ready</b>
            </div>
          </div>
        </div>
      </section>
      <section className="modeJourney">
        <div className="sectionIntro">
          <div>
            <span className="kicker">THE MAXIMUS PROCESS</span>
            <h2>{direct ? "Direct Visa workflow" : "Study Abroad workflow"}</h2>
          </div>
          <p>
            The service switch changes the complete navigation, terminology and
            reporting context.
          </p>
        </div>
        <div className="journeyTrack">
          {steps.map(([number, label, copy], index) => (
            <article key={label} className={index === 0 ? "active" : ""}>
              <b>{number}</b>
              <div>
                <strong>{label}</strong>
                <small>{copy}</small>
              </div>
              {index < steps.length - 1 ? <ArrowRight size={16} /> : null}
            </article>
          ))}
        </div>
      </section>
      <section className="signalGrid">
        <article className="signal ocean">
          <div>
            <span>{direct ? "Active clients" : "Active students"}</span>
            <strong>
              {workspaceCases.filter((c) => c.status !== "completed").length}
            </strong>
            <small>{workspaceCases.length} total records</small>
          </div>
          <div className="signalIcon blue">
            {direct ? <ShieldCheck size={22} /> : <GraduationCap size={22} />}
          </div>
        </article>
        <article className="signal sunshine">
          <div>
            <span>Need attention</span>
            <strong>{attention}</strong>
            <small>Health or deadline risk</small>
          </div>
          <div className="signalIcon amber">
            <AlertTriangle size={22} />
          </div>
        </article>
        <article className="signal coral">
          <div>
            <span>Waiting</span>
            <strong>{waiting}</strong>
            <small>Client or third-party action</small>
          </div>
          <div className="signalIcon">
            <Clock3 size={22} />
          </div>
        </article>
        <article className="signal mint">
          <div>
            <span>{direct ? "Case complete" : "Completed"}</span>
            <strong>{completed}</strong>
            <small>Finalised outcomes</small>
          </div>
          <div className="signalIcon green">
            <Check size={22} />
          </div>
        </article>
      </section>
      <section className="dashboardGrid">
        <article className="panel pipelinePanel">
          <div className="panelHead">
            <div>
              <span className="kicker">LIVE WORKSPACE</span>
              <h2>Recent {direct ? "client matters" : "student journeys"}</h2>
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
            <div className="caseTable">
              {workspaceCases.slice(0, 5).map((c) => (
                <button
                  className="caseRow compactRecord"
                  key={c.id}
                  onClick={() => setActive(openList)}
                >
                  <span className="clientCell">
                    <b>{c.name}</b>
                    <small>
                      {c.id} · {c.type}
                    </small>
                  </span>
                  <span>
                    <b>{c.stage}</b>
                    <small>{c.target || "No target added"}</small>
                  </span>
                  <span>
                    <Status value={c.health} />
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
  staff,
  canBulkAssign,
  onBulkAssign,
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
  staff: StaffRecord[];
  canBulkAssign: boolean;
  onBulkAssign: (records: CaseRecord[], ownerId: string) => Promise<void>;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [assigning, setAssigning] = useState(false);
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
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

  const shown =
    filter === "all" ? cases : cases.filter((c) => c.status === filter);
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
          filters: { filter },
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
            onClick={() => setFilter(filter === "all" ? "active" : "all")}
          >
            <Filter size={15} />
            Filter
          </button>
          <button className="primaryButton" onClick={() => openModal("case")}>
            <Plus size={16} />
            Add new
          </button>
        </div>
      </div>
      <div className="savedViewsBar">
        {savedViews.map((view) => (
            <span className="savedViewChip" key={view.id}>
              <button
                type="button"
                onClick={() => setFilter(String(view.filters?.filter ?? "all"))}
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
          {canBulkAssign && selectedIds.size > 0 && (
            <div className="bulkActionBar">
              <span>{selectedIds.size} selected</span>
              <select
                aria-label="Assign selected cases to"
                disabled={assigning}
                defaultValue=""
                onChange={async (event) => {
                  const ownerId = event.target.value;
                  if (!ownerId) return;
                  setAssigning(true);
                  await onBulkAssign(selectedRecords, ownerId);
                  setAssigning(false);
                  setSelectedIds(new Set());
                  event.target.value = "";
                }}
              >
                <option value="">Assign to…</option>
                {staff
                  .filter((person) => person.active && person.level !== "student")
                  .map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.display_name}
                    </option>
                  ))}
              </select>
              <button className="linkButton" onClick={() => setSelectedIds(new Set())}>
                Clear
              </button>
            </div>
          )}
          <div className="richTable">
            <div className="richHeaderWrap">
              {canBulkAssign && (
                <span className="rowCheckboxCell">
                  <input
                    type="checkbox"
                    aria-label="Select all shown cases"
                    checked={selectedIds.size > 0 && selectedIds.size === shown.length}
                    onChange={toggleAll}
                  />
                </span>
              )}
              <div className="richHeader">
                <span>Client</span>
                <span>Matter</span>
                <span>Stage</span>
                <span>Owner</span>
                <span>Health</span>
                <span>Due</span>
              </div>
            </div>
            {shown.map((c) => (
              <div className="richRowWrap" key={c.id}>
                {canBulkAssign && (
                  <span className="rowCheckboxCell">
                    <input
                      type="checkbox"
                      aria-label={`Select ${c.name}`}
                      checked={selectedIds.has(c.id)}
                      onChange={() => toggleOne(c.id)}
                    />
                  </span>
                )}
                <button className="richRow" onClick={() => onSelect(c)}>
                  <span className="clientCell">
                    <b>{c.name}</b>
                    <small>
                      {c.id} · {c.branch || "No branch"}
                    </small>
                  </span>
                  <span>
                    <b>{c.type}</b>
                    <small>{c.target || "No target"}</small>
                  </span>
                  <span className="progressCell">
                    <b>{c.stage}</b>
                    <div>
                      <i style={{ width: `${c.progress}%` }} />
                    </div>
                    <small>{c.progress}% complete</small>
                  </span>
                  <span>
                    <b>{c.owner || "Unassigned"}</b>
                  </span>
                  <span>
                    <Status value={c.health} />
                  </span>
                  <span>
                    <b>{c.due || "Not set"}</b>
                  </span>
                </button>
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
  const archivedCount = rows.filter((row) => row.archived).length;
  const shown = showArchived ? rows : rows.filter((row) => !row.archived);
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
      {shown.length === 0 ? (
        <BoardEmpty what="applications" />
      ) : (
        <div className="recordTableWrap">
          <table className="recordTable boardTable">
            <thead>
              <tr>
                <th scope="col">Student</th>
                <th scope="col">Institution</th>
                <th scope="col">Course</th>
                <th scope="col">Campus</th>
                <th scope="col">Intake</th>
                <th scope="col">Reference</th>
                <th scope="col">Status</th>
                <th scope="col">Submitted</th>
                <th scope="col">Offer</th>
                <th scope="col">CoE</th>
                <th scope="col">Deadline</th>
                <th scope="col">Owner</th>
                <th scope="col">Case</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={row.id} className={row.archived ? "archivedRow" : ""}>
                  <td>{row.client || "—"}</td>
                  <td>{row.institution || "—"}</td>
                  <td>{row.course || "—"}</td>
                  <td>{row.campus || "—"}</td>
                  <td>{row.intake || "—"}</td>
                  <td>{row.reference || "—"}</td>
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
                  <td>{row.owner || "Unassigned"}</td>
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
  return (
    <article className="panel listPanel">
      <div className="panelHead">
        <div>
          <span className="kicker">EVERY VISA MATTER</span>
          <h2>Visa matters</h2>
        </div>
      </div>
      {rows.length === 0 ? (
        <BoardEmpty what="visa matters" />
      ) : (
        <div className="recordTableWrap">
          <table className="recordTable boardTable">
            <thead>
              <tr>
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
              {rows.map((row) => (
                <tr key={row.id}>
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
      )}
    </article>
  );
}

function TasksView({
  tasks,
  cases,
  setTasks,
  openModal,
}: {
  tasks: TaskRecord[];
  cases: CaseRecord[];
  setTasks: (x: TaskRecord[]) => void;
  openModal: (x: ModalType) => void;
}) {
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
      {tasks.length === 0 ? (
        <EmptyState
          icon={Check}
          title="No tasks"
          copy="Create tasks and link them to a case."
          action="Create task"
          onAction={() => openModal("task")}
        />
      ) : (
        tasks.map((t) => (
          <div className="functionalRow" key={t.id}>
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
        ))
      )}
    </article>
  );
}
function CalendarView({
  items,
  openModal,
  setItems,
  setActive,
}: {
  items: AppointmentRecord[];
  openModal: (x: ModalType) => void;
  setItems: (x: AppointmentRecord[]) => void;
  setActive: (x: ModuleKey) => void;
}) {
  const [calendarNow] = useState(() => new Date());
  const [connection, setConnection] = useState<MailboxStatus | null>(null);
  const [connectionError, setConnectionError] = useState("");
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    today = calendarNow.getDay();

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
                {items
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
                {!items.some(
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
          {items.length === 0 ? (
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
            items.slice(0, 6).map((a) => (
              <div className="agendaItem" key={a.id}>
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
                <button
                  className="iconButton"
                  onClick={() => setItems(items.filter((x) => x.id !== a.id))}
                  aria-label="Delete appointment"
                  title="Delete appointment"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))
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
}: {
  items: DocumentRecord[];
  setItems: (x: DocumentRecord[]) => void;
  storageConnected: boolean;
}) {
  // An archived document is kept for the retention period but is not part of
  // the working file, so it is out of the way until it is asked for.
  const [showArchived, setShowArchived] = useState(false);
  const archivedCount = items.filter((d) => d.status === "archived").length;
  const shown = showArchived
    ? items
    : items.filter((d) => d.status !== "archived");
  // Every file, grouped by the client it belongs to -- an archive to browse
  // and download from, not where a request gets started. Requesting a
  // document happens from that client's own case now, so it is never out of
  // step with which case it was actually asked for on.
  const byClient = new Map<string, DocumentRecord[]>();
  for (const d of shown) {
    const key = d.client || "No client";
    byClient.set(key, [...(byClient.get(key) ?? []), d]);
  }
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
          [...byClient.entries()].map(([client, docs]) => (
            <div className="documentClientGroup" key={client}>
              <h3 className="documentClientGroupHead">{client}</h3>
              {docs.map((d) => (
                <div className="functionalRow" key={d.id}>
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
          ))
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
  openModal,
  setItems,
  canSend,
}: {
  items: MessageRecord[];
  openModal: (x: ModalType) => void;
  setItems: (x: MessageRecord[]) => void;
  // A client's own portal login can raise a message to their case team, but
  // only staff ever dispatch mail as the agency.
  canSend: boolean;
}) {
  // A discarded draft is kept for the record but is not part of the outbox.
  const [showDiscarded, setShowDiscarded] = useState(false);
  const [mailbox, setMailbox] = useState<MailboxStatus | null>(null);
  const [mailboxError, setMailboxError] = useState("");
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

  const sendNow = async (messageId: string) => {
    setSendingId(messageId);
    setMailboxError("");
    try {
      const response = await fetch("/api/crm/mailbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send_message", messageId }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(result.error || "The message could not be sent.");
      setSentIds((prev) => new Set(prev).add(messageId));
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
  const shown = showDiscarded ? items : items.filter((m) => !discarded(m));
  return (
    <article className="panel listPanel">
      <div className="panelHead">
        <div>
          <span className="kicker">CASE MESSAGES</span>
          <h2>Drafts</h2>
        </div>
        <div className="panelHeadActions">
          {discardedCount > 0 && (
            <button
              className="ghostButton"
              onClick={() => setShowDiscarded(!showDiscarded)}
            >
              {showDiscarded
                ? "Hide discarded"
                : `Show ${discardedCount} discarded`}
            </button>
          )}
          <button
            className="primaryButton"
            onClick={() => openModal("message")}
          >
            <Plus size={16} />
            Compose
          </button>
        </div>
      </div>
      {canSend && mailbox?.oauthConfigured ? (
        <p className="modalNotice">
          {mailbox.connected ? (
            <>
              <Check size={14} />
              Sending as <b>{mailbox.email}</b>.{" "}
              <button className="ghostButton" onClick={() => void disconnectMailbox()}>
                Disconnect
              </button>
            </>
          ) : (
            <>
              <Link2 size={14} />
              Drafts are recorded against the case. Connect your Gmail account to
              send one directly from here.{" "}
              <button
                className="ghostButton"
                onClick={() => {
                  window.location.href = "/api/auth/gmail/start";
                }}
              >
                <Link2 size={14} />
                Connect Gmail
              </button>
            </>
          )}
        </p>
      ) : (
        <p className="modalNotice">
          <AlertTriangle size={14} />
          Drafts are recorded against the case.{" "}
          {canSend
            ? "Gmail sending is not set up on this deployment yet -- send it from your own mailbox and mark the draft ready."
            : "Your case team sends the reply -- nothing is dispatched from here."}
        </p>
      )}
      {mailboxError && <p className="caseWorkError">{mailboxError}</p>}
      {shown.length === 0 ? (
        <EmptyState
          icon={Mail}
          title={discardedCount > 0 ? "Nothing in the outbox" : "No messages"}
          copy="Compose and save case-linked drafts. Sending is done from your own mailbox."
          action="Compose message"
          onAction={() => openModal("message")}
        />
      ) : (
        shown.map((m) => {
          const sent = sentIds.has(m.id) || m.status.toLowerCase() === "sent";
          return (
            <div className="functionalRow" key={m.id}>
              <div className="docIcon">
                <Mail size={17} />
              </div>
              <div>
                <strong>{m.subject}</strong>
                <span>
                  To {m.to} · {messageWhen(m)}
                </span>
              </div>
              <Status value={sent ? "Sent" : m.status} />
              {sent ? null : (
                <>
                  {canSend && mailbox?.connected && (
                    <button
                      className="ghostButton"
                      onClick={() => void sendNow(m.id)}
                      disabled={sendingId === m.id}
                    >
                      <Send size={14} />
                      {sendingId === m.id ? "Sending…" : "Send now"}
                    </button>
                  )}
                  <button
                    className="ghostButton"
                    onClick={() =>
                      setItems(
                        items.map((x) =>
                          x.id === m.id
                            ? {
                                ...x,
                                status: x.status === "Draft" ? "Ready" : "Draft",
                              }
                            : x,
                        ),
                      )
                    }
                  >
                    {m.status === "Draft" ? "Mark ready" : "Return to draft"}
                  </button>
                  <button
                    className="iconButton"
                    onClick={() => setItems(items.filter((x) => x.id !== m.id))}
                    aria-label="Delete message"
                    title="Delete message"
                  >
                    <Trash2 size={16} />
                  </button>
                </>
              )}
            </div>
          );
        })
      )}
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
}: {
  items: InvoiceRecord[];
  openModal: (x: ModalType) => void;
  setItems: (x: InvoiceRecord[]) => void;
  // Invoices are writable only by manager level and above, so a case officer
  // sees the ledger without controls the database would refuse.
  canManage: boolean;
  onRefund: (invoice: InvoiceRecord) => void;
  onCreditNote: (invoice: InvoiceRecord) => void;
}) {
  const total = items.reduce((s, x) => s + x.amount, 0);
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
        {items.length === 0 ? (
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
          items.map((i) => (
            <div className="functionalRow" key={i.id}>
              <div>
                <strong>{i.client}</strong>
                <span>Due {i.due || "not set"}</span>
              </div>
              <b>${i.amount.toLocaleString()}</b>
              {canManage ? (
                <>
                  <button
                    className="ghostButton"
                    onClick={() =>
                      setItems(
                        items.map((x) =>
                          x.id === i.id
                            ? {
                                ...x,
                                status: x.status === "Paid" ? "Unpaid" : "Paid",
                              }
                            : x,
                        ),
                      )
                    }
                  >
                    {i.status === "Paid" ? "Mark unpaid" : "Record payment"}
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
          ))
        )}
      </article>
    </>
  );
}
/** Commissions an institution or partner owes the agency -- a table that
 * existed with no way in or out of it: raised nowhere, received nowhere. */
function CommissionClaimsPanel({
  items,
  canManage,
  onCreate,
  onMarkReceived,
}: {
  items: CommissionClaimRecord[];
  canManage: boolean;
  onCreate: (data: { partnerName: string; institution: string; expectedAmount: number; dueOn: string }) => void;
  onMarkReceived: (claim: CommissionClaimRecord) => void;
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
              partnerName: String(data.get("partnerName") || ""),
              institution: String(data.get("institution") || ""),
              expectedAmount: Number(data.get("expectedAmount") || 0),
              dueOn: String(data.get("dueOn") || ""),
            });
            setAdding(false);
          }}
        >
          <label>
            Partner *<input name="partnerName" required />
          </label>
          <label>
            Institution
            <input name="institution" />
          </label>
          <label>
            Expected amount *
            <input name="expectedAmount" type="number" min="0.01" step="0.01" required />
          </label>
          <label>
            Due
            <input name="dueOn" type="date" />
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
              <strong>{claim.partnerName}</strong>
              <span>
                {claim.institution || "No institution set"}
                {claim.dueOn ? ` · Due ${claim.dueOn}` : ""}
              </span>
            </div>
            <b>
              ${claim.receivedAmount.toLocaleString()} / $
              {claim.expectedAmount.toLocaleString()}
            </b>
            {claim.status === "received" ? (
              <Status value="Received" />
            ) : (
              <button
                className="ghostButton"
                onClick={() => onMarkReceived(claim)}
              >
                Mark received
              </button>
            )}
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
}: {
  items: TemplateRecord[];
  openModal: (x: ModalType) => void;
  setItems: (x: TemplateRecord[]) => void;
  // Approved templates are writable only by manager level and above.
  canManage: boolean;
}) {
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
        items.map((t) => (
          <div className="functionalRow" key={t.id}>
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
        ))
      )}
    </article>
  );
}
function WorkflowView({
  items,
  openModal,
  setItems,
  canManage,
}: {
  items: WorkflowRecord[];
  openModal: (x: ModalType) => void;
  setItems: (x: WorkflowRecord[]) => void;
  canManage: boolean;
}) {
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
        items.map((w) => (
          <div className="functionalRow" key={w.id}>
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
        ))
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
    const own = documents.filter(
      (x) => x.client === client.name && x.clientVisible !== false && x.status !== "archived",
    );
    return (
      <article className="panel listPanel">
        <div className="panelHead">
          <div>
            <span className="kicker">MY FILES</span>
            <h2>Documents Maximus has asked for</h2>
          </div>
        </div>
        {own.length ? (
          own.map((d) => (
            <div className="functionalRow" key={d.id}>
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
          ))
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
    const own = appointments.filter((x) => x.client === client.name);
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
        {own.length ? (
          own.map((a) => (
            <div className="functionalRow" key={a.id}>
              <CalendarDays size={18} />
              <div>
                <strong>{a.title}</strong>
                <span>
                  {a.date} · {a.time}
                </span>
              </div>
              <Status value={a.type} />
            </div>
          ))
        ) : (
          <p className="restrictedEmpty">No appointments are scheduled.</p>
        )}
      </article>
    );
  }
  if (module === "communications") {
    const own = messages.filter((x) => x.caseId === client.id);
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
        {own.length ? (
          own.map((m) => (
            <div className="functionalRow" key={m.id}>
              <Mail size={18} />
              <div>
                <strong>{m.subject}</strong>
                <span>{messageWhen(m)}</span>
              </div>
              <Status value={m.status} />
            </div>
          ))
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
  const own = invoices.filter(
    (x) => x.client === client.name && CLIENT_INVOICE_TYPES.includes(x.type),
  );
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
        {own.length ? (
          own.map((i) => (
            <div className="functionalRow" key={i.id}>
              <CircleDollarSign size={18} />
              <div>
                <strong>{money(i.amount)}</strong>
                <span>
                  {i.issued ? `Issued ${i.issued} · ` : ""}Due{" "}
                  {i.due || "not set"} · Paid {money(i.paid)} · Balance{" "}
                  {money(i.balance)}
                </span>
              </div>
              <Status value={i.status} />
            </div>
          ))
        ) : (
          <p className="restrictedEmpty">
            You have not been invoiced for anything yet.
          </p>
        )}
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

type InstitutionRecord = {
  id: string;
  name: string;
  country: string;
  city: string | null;
  website: string | null;
  notes: string | null;
  active: boolean;
};
type CourseFinderCourse = {
  id: string;
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
};

/**
 * Institutions and the courses they offer -- reference data for advising a
 * client, not tied to any one case. "Course or visa target" on a case has
 * always been free text; this is the canonical list it was never backed by.
 */
function CourseFinderView({ canManage }: { canManage: boolean }) {
  const [institutions, setInstitutions] = useState<InstitutionRecord[]>([]);
  const [courses, setCourses] = useState<CourseFinderCourse[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [addingInstitution, setAddingInstitution] = useState(false);
  const [addingCourseFor, setAddingCourseFor] = useState<string | null>(null);

  const load = async () => {
    try {
      const response = await fetch("/api/crm/course-finder", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Course Finder could not be loaded.");
      setInstitutions(result.institutions || []);
      setCourses(result.courses || []);
      setError("");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Course Finder could not be loaded.",
      );
    } finally {
      setLoaded(true);
    }
  };
  // Kept free of state updates so a component gone by the time the request
  // returns does not set state on it, the pattern used elsewhere in this file
  // for a fetch that runs once on mount.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!cancelled) await load();
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const send = async (body: Record<string, unknown>) => {
    const response = await fetch("/api/crm/course-finder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(result.error || "That could not be saved.");
      return false;
    }
    await load();
    return true;
  };

  if (!loaded)
    return (
      <article className="panel listPanel" aria-busy="true">
        <p className="reportProgress">Loading Course Finder…</p>
      </article>
    );
  if (error && institutions.length === 0)
    return (
      <article className="panel listPanel">
        <p className="caseWorkError">{error}</p>
      </article>
    );

  const needle = query.trim().toLowerCase();
  const coursesByInstitution = new Map<string, CourseFinderCourse[]>();
  for (const course of courses) {
    const key = course.institution_id;
    coursesByInstitution.set(key, [...(coursesByInstitution.get(key) ?? []), course]);
  }
  const visibleInstitutions = institutions.filter((inst) => {
    if (!needle) return true;
    if (inst.name.toLowerCase().includes(needle)) return true;
    return (coursesByInstitution.get(inst.id) ?? []).some((c) =>
      c.name.toLowerCase().includes(needle),
    );
  });

  return (
    <article className="panel listPanel">
      <div className="panelHead">
        <div>
          <span className="kicker">ADVISING</span>
          <h2>Institutions and courses</h2>
        </div>
        {canManage && (
          <button className="primaryButton" onClick={() => setAddingInstitution(!addingInstitution)}>
            <Plus size={16} />
            {addingInstitution ? "Close" : "Add institution"}
          </button>
        )}
      </div>
      <label className="searchField">
        Search institutions and courses
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. Monash, Master of IT"
        />
      </label>
      {error && <p className="caseWorkError">{error}</p>}
      {addingInstitution && (
        <form
          className="stackedForm"
          onSubmit={async (event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const ok = await send({
              action: "create_institution",
              name: data.get("name"),
              country: data.get("country"),
              city: data.get("city"),
              website: data.get("website"),
            });
            if (ok) setAddingInstitution(false);
          }}
        >
          <label>
            Institution name *<input name="name" required />
          </label>
          <label>
            Country *<input name="country" required />
          </label>
          <label>
            City
            <input name="city" />
          </label>
          <label>
            Website
            <input name="website" type="url" placeholder="https://" />
          </label>
          <div className="formActions">
            <button className="primaryButton">
              <Check size={15} />
              Add institution
            </button>
          </div>
        </form>
      )}
      {visibleInstitutions.length === 0 ? (
        <EmptyState
          icon={School}
          title="No institutions yet"
          copy={
            canManage
              ? "Add an institution to start building the course list."
              : "A manager has not added any institutions yet."
          }
          action={canManage ? "Add institution" : undefined}
          onAction={canManage ? () => setAddingInstitution(true) : undefined}
        />
      ) : (
        visibleInstitutions.map((inst) => (
          <div className="institutionBlock" key={inst.id}>
            <div className="functionalRow">
              <div>
                <strong>{inst.name}</strong>
                <span>
                  {[inst.city, inst.country].filter(Boolean).join(", ")}
                  {inst.website ? ` · ${inst.website}` : ""}
                </span>
              </div>
              {canManage && (
                <button
                  className="ghostButton"
                  onClick={() =>
                    setAddingCourseFor(addingCourseFor === inst.id ? null : inst.id)
                  }
                >
                  {addingCourseFor === inst.id ? "Close" : "Add course"}
                </button>
              )}
            </div>
            {addingCourseFor === inst.id && (
              <form
                className="stackedForm"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  const ok = await send({
                    action: "create_course",
                    institutionId: inst.id,
                    name: data.get("name"),
                    level: data.get("level"),
                    fieldOfStudy: data.get("fieldOfStudy"),
                    durationMonths: data.get("durationMonths"),
                    tuitionFee: data.get("tuitionFee"),
                    currency: data.get("currency"),
                    intakeMonths: data.get("intakeMonths"),
                  });
                  if (ok) setAddingCourseFor(null);
                }}
              >
                <label>
                  Course name *<input name="name" required />
                </label>
                <label>
                  Level
                  <input name="level" placeholder="e.g. Master's" />
                </label>
                <label>
                  Field of study
                  <input name="fieldOfStudy" />
                </label>
                <label>
                  Duration (months)
                  <input name="durationMonths" type="number" min="1" />
                </label>
                <label>
                  Tuition fee
                  <input name="tuitionFee" type="number" min="0" step="0.01" />
                </label>
                <label>
                  Currency
                  <input name="currency" defaultValue="AUD" />
                </label>
                <label>
                  Intake months
                  <input name="intakeMonths" placeholder="e.g. Feb, Jul" />
                </label>
                <div className="formActions">
                  <button className="primaryButton">
                    <Check size={15} />
                    Add course
                  </button>
                </div>
              </form>
            )}
            {(coursesByInstitution.get(inst.id) ?? [])
              .filter(
                (c) => !needle || c.name.toLowerCase().includes(needle) || inst.name.toLowerCase().includes(needle),
              )
              .map((course) => (
                <div className="functionalRow courseRow" key={course.id}>
                  <div>
                    <strong>{course.name}</strong>
                    <span>
                      {[course.level, course.field_of_study, course.intake_months]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </div>
                  <small>
                    {course.duration_months ? `${course.duration_months} mo` : ""}
                    {course.tuition_fee
                      ? ` · ${course.currency} ${course.tuition_fee.toLocaleString()}`
                      : ""}
                  </small>
                </div>
              ))}
          </div>
        ))
      )}
    </article>
  );
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
  ["staff", "Staff — the cases assigned to them"],
  ["partner", "Partner — external agent, assigned cases only"],
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addingBranch, setAddingBranch] = useState(false);
  const [handover, setHandover] = useState<{
    message: string;
    password?: string;
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
    };
  };
  const apply = (result: {
    profiles: AdminProfile[];
    invitations: AdminInvitation[];
    branches: AdminBranch[];
    clientLinks: { profile_id: string; client_id: string }[];
  }) => {
    setProfiles(result.profiles ?? []);
    setInvitations(result.invitations ?? []);
    setAdminBranches(result.branches ?? []);
    setClientLinks(result.clientLinks ?? []);
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
      return result as { message?: string; temporaryPassword?: string };
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

  return (
    <section className="adminStack">
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

        {handover && (
          <div className="handoverPanel">
            <strong>{handover.message}</strong>
            {handover.password && (
              <>
                <code>{handover.password}</code>
                <small>
                  This is shown once and is not stored anywhere you can read it
                  again. If it is lost, reset the password in Supabase.
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
                  password: result.temporaryPassword,
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
        ) : profiles.length === 0 ? (
          <p className="boardEmpty">Nobody is on the team yet.</p>
        ) : (
          <div className="recordTableWrap">
            <table className="recordTable boardTable">
              <thead>
                <tr>
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
                {profiles.map((person) => (
                  <tr
                    key={person.id}
                    className={person.active ? "" : "archivedRow"}
                  >
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
                        <button
                          className="linkButton"
                          disabled={working}
                          onClick={() =>
                            void send({
                              action: "update_profile",
                              profileId: person.id,
                              active: !person.active,
                            })
                          }
                        >
                          {person.active ? "Deactivate" : "Reactivate"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="coverageIntro">
          Deactivating somebody keeps their history and stops them signing in.
          Accounts are not deleted, because the case record has to say who did
          what for seven years.
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
                  {value === "view" ? (
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
  assign,
  refresh,
  staff,
  canAssign,
  canModify,
  lifecycleReady,
  schemaWarning,
  storageConnected,
  onRequestDocument,
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
  assign: (record: CaseRecord, ownerId: string) => Promise<void>;
  refresh: () => Promise<void>;
  staff: StaffRecord[];
  canAssign: boolean;
  canModify: boolean;
  lifecycleReady: boolean;
  schemaWarning: string;
  storageConnected: boolean;
  onRequestDocument: (caseId: string, kind?: "document" | "visaChecklist") => void;
}) {
  return item ? (
    <CaseDrawerBody
      item={item}
      close={close}
      edit={edit}
      remove={remove}
      moveStage={moveStage}
      assign={assign}
      refresh={refresh}
      staff={staff}
      canAssign={canAssign}
      canModify={canModify}
      lifecycleReady={lifecycleReady}
      schemaWarning={schemaWarning}
      storageConnected={storageConnected}
      onRequestDocument={onRequestDocument}
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
  | "timeline"
  | "finance";

const caseTabs: [CaseTab, string][] = [
  ["overview", "Overview"],
  ["client", "Client"],
  ["family", "Family"],
  ["history", "History"],
  ["applications", "Applications"],
  ["visa", "Visa matter"],
  ["documents", "Documents"],
  ["timeline", "Timeline"],
  ["finance", "Finance"],
];

type CaseFile = {
  case: Record<string, unknown>;
  client: Record<string, unknown> | null;
  applications: Record<string, unknown>[];
  visaMatter: Record<string, unknown> | null;
  dependants: Record<string, unknown>[];
  documents: Record<string, unknown>[];
  notes: CaseNote[];
  invoices: Record<string, unknown>[];
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
}: {
  title: string;
  rows: [string, unknown][];
  empty?: string;
}) {
  const filled = rows.filter(([, value]) => text(value));
  return (
    <section className="caseWorkPanel">
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
  assign,
  refresh,
  staff,
  canAssign,
  canModify,
  lifecycleReady,
  schemaWarning,
  storageConnected,
  onRequestDocument,
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
  assign: (record: CaseRecord, ownerId: string) => Promise<void>;
  refresh: () => Promise<void>;
  staff: StaffRecord[];
  canAssign: boolean;
  canModify: boolean;
  lifecycleReady: boolean;
  schemaWarning: string;
  storageConnected: boolean;
  onRequestDocument: (caseId: string, kind?: "document" | "visaChecklist") => void;
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
  const [owner, setOwner] = useState(item.ownerId);
  const [assigning, setAssigning] = useState(false);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [file, setFile] = useState<CaseFile | null>(null);
  const [newItem, setNewItem] = useState("");
  const [newNote, setNewNote] = useState("");
  const [working, setWorking] = useState(false);
  const [caseError, setCaseError] = useState("");
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
    ? ["overview", "visa", "documents", "finance"]
    : ["overview", "applications", "documents", "finance"];
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

        <nav className="caseTabs" role="tablist">
          {shownTabs.map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              className={tab === key ? "active" : ""}
              onClick={() => setTab(key)}
            >
              {label}
              {key === "applications" && file?.applications.length
                ? ` (${file.applications.length})`
                : ""}
              {key === "family" && file?.dependants.length
                ? ` (${file.dependants.length})`
                : ""}
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
                  {label}
                </option>
              ))}
            </select>
          )}
        </nav>

        {caseError && <p className="caseWorkError">{caseError}</p>}

        {tab === "overview" && (
          <>
            <div className="drawerHealth">
              <div>
                <small>Health</small>
                <Status value={item.health} />
              </div>
              <div>
                <small>Progress</small>
                <strong>{item.progress}%</strong>
              </div>
              <div>
                <small>Due</small>
                <strong>{item.due || "Not set"}</strong>
              </div>
            </div>
            <FactList
              title="Case"
              rows={[
                ["Matter type", item.matterType || "Not set"],
                [
                  "Service stream",
                  item.serviceType === "direct_visa"
                    ? "Migration"
                    : "Study abroad",
                ],
                ["Target", item.target],
                ["Owner", item.owner || "Unassigned"],
                ["Branch", item.branch],
                ["Visa expiry", item.visaExpiry],
                ["Opened", day(item.createdAt)],
                ["Completed", item.completedAt],
                ["Reopened", item.reopenedAt],
              ]}
            />
            {canAssign && (
              <section className="assignPanel">
                <span className="kicker">CASE OWNER</span>
                <h3>{item.owner || "Unassigned"}</h3>
                <p className="assignHint">
                  Reassign this case to another member of the team. They are
                  notified and it moves into their queue.
                </p>
                <div className="assignRow">
                  <select
                    value={owner}
                    onChange={(e) => setOwner(e.target.value)}
                    aria-label="Assign case to"
                  >
                    <option value="">Select a staff member</option>
                    {staff.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.display_name}
                        {person.id === item.ownerId ? " (current owner)" : ""}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="primaryButton"
                    disabled={assigning || !owner || owner === item.ownerId}
                    onClick={async () => {
                      setAssigning(true);
                      try {
                        await assign(item, owner);
                      } finally {
                        setAssigning(false);
                      }
                    }}
                  >
                    <UserCog size={15} />
                    {assigning ? "Assigning…" : "Assign"}
                  </button>
                </div>
              </section>
            )}
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
                        ? "This case is assigned to somebody else. Ask a manager to reassign it to you."
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
            </section>
          </>
        )}

        {tab === "client" && (
          <>
            <FactList
              title="Personal"
              rows={[
                ["Preferred name", client.preferred_name],
                ["Email", client.email],
                ["Mobile", client.mobile],
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
                ["Passport expiry", day(client.passport_expiry)],
                [
                  "Privacy consent",
                  client.privacy_consent_at ? orgDate(client.privacy_consent_at) : "",
                ],
                ["Marketing consent", client.marketing_consent ? "Yes" : "No"],
              ]}
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
                  {(item.serviceType === "direct_visa" ||
                    item.lifecycleStage === "visa") && (
                    <button
                      type="button"
                      className="ghostButton"
                      onClick={() => onRequestDocument(caseId ?? "", "visaChecklist")}
                    >
                      <FileCheck2 size={14} />
                      Visa checklist
                    </button>
                  )}
                  <button
                    type="button"
                    className="ghostButton"
                    onClick={() => onRequestDocument(caseId ?? "", "document")}
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

        {tab === "timeline" && (
          <section className="caseWorkPanel">
            <span className="kicker">FILE NOTE AND ACTIVITY</span>
            <p className="caseWorkEmpty">
              Every note, stage change and recorded action, newest first. Write
              up oral advice and client instructions here as they happen.
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
                        {orgDateTime(entry.at)}
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
          <RecordTable
            title="Invoices"
            rows={file?.invoices ?? []}
            columns={[
              ["Invoice", "invoice_number"],
              ["Type", "invoice_type"],
              ["Total", "total"],
              ["Paid", "paid"],
              ["State", "state"],
              ["Due", "due_on"],
            ]}
            empty="No invoices raised for this case."
          />
        )}

        <div className="drawerFooter">
          <button
            className="ghostButton"
            onClick={() => edit(item)}
            disabled={!canModify}
            title={
              canModify
                ? undefined
                : "This case is assigned to somebody else. Ask a manager to reassign it to you."
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
            {canAssign ? "Archive" : "Request archive"}
          </button>
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

function RecordTable({
  title,
  rows,
  columns,
  empty,
}: {
  title: string;
  rows: Record<string, unknown>[];
  columns: [string, string][];
  empty?: string;
}) {
  return (
    <section className="caseWorkPanel">
      <span className="kicker">{title.toUpperCase()}</span>
      {rows.length === 0 ? (
        <p className="caseWorkEmpty">{empty ?? "Nothing recorded yet."}</p>
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
            });
            if (ok) setAdding(false);
          }}
        >
          <label>
            Institution *<input name="institution" required />
          </label>
          <label>
            Course *<input name="course" required />
          </label>
          <label>
            Campus
            <input name="campus" />
          </label>
          <label>
            Intake
            <input name="intake" placeholder="e.g. February 2027" />
          </label>
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
  presetCaseId?: string;
}) {
  // Requesting a document from within the case it belongs to arrives with
  // the case already decided -- the case/client pickers below are only for
  // when a case was not already the thing on screen.
  const presetCase = presetCaseId
    ? cases.find((c) => (c.dbId || c.id) === presetCaseId)
    : undefined;
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
  const titles: Record<Exclude<ModalType, null>, string> = {
    case: editing ? "Edit record" : "Create record",
    task: "Create task",
    appointment: "Schedule appointment",
    document: "Request document",
    visaChecklist: "Visa document checklist",
    message: "Compose draft",
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
                <AlertTriangle size={14} />
                This opens the file. Academic history, tests, employment,
                passport details and family are recorded in the case file
                afterwards, where they are stored as proper records rather than
                loose fields.
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
                    <option>Education enquiry</option>
                    <option>Migration enquiry</option>
                    <option>Student admission</option>
                    <option>Student visa</option>
                    <option>407 Training Visa</option>
                    <option>408 Temporary work activity</option>
                    <option>482 Work Visa</option>
                    <option>485 Visa</option>
                    <option>494 Regional Work Visa</option>
                    <option>500 Student Dependent</option>
                    <option>600 Visitor Visa</option>
                    <option>Partner visa 820/801</option>
                    <option>Partner visa 309/100</option>
                    <option>Protection Visa 866</option>
                    <option>Skill assessment program</option>
                    <option>EOI lodgement</option>
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
                {role === "staff" ? (
                  // A new case can only be created for oneself when staff --
                  // the database accepts nothing else -- and reassigning an
                  // existing one belongs to the dedicated, admin-gated
                  // reassignment control on the case, not this form. Editing
                  // still has to carry the case's current owner along rather
                  // than silently reset it to whoever is editing.
                  editing?.ownerId ? (
                    <input type="hidden" name="ownerId" value={editing.ownerId} />
                  ) : null
                ) : (
                  <label>
                    Assigned staff
                    <select name="ownerId" defaultValue={editing?.ownerId ?? ""}>
                      <option value="">You</option>
                      {staff.map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.display_name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
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
                    <option>Not Interested</option>
                  </select>
                </label>
                <label>
                  Next follow-up
                  <input name="due" type="date" defaultValue={editing?.due} />
                </label>
                <label>
                  Source
                  <select name="source">
                    <option value="">Select source</option>
                    <option>Walk in</option>
                    <option>Referral</option>
                    <option>Website</option>
                    <option>Social media</option>
                    <option>Agent</option>
                    <option>Existing client</option>
                  </select>
                </label>
                <label className="wide">
                  Remarks
                  <input
                    name="remarks"
                    placeholder="Anything worth noting now"
                  />
                </label>
              </div>
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
                Title
                <input name="title" required />
              </label>
              <label>
                Linked case
                <select name="caseId">
                  <option value="">Internal appointment</option>
                  {cases.map((c) => (
                    <option key={c.id} value={c.dbId || c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Date
                <input name="date" type="date" required />
              </label>
              <label>
                Time
                <input name="time" type="time" required />
              </label>
              <label>
                Type
                <select name="appointmentType">
                  <option>Counselling</option>
                  <option>Document review</option>
                  <option>Visa consultation</option>
                  <option>Internal meeting</option>
                </select>
              </label>
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
                  Visa case
                  <input value={`${presetCase.name} · ${presetCase.id}`} disabled />
                  <input type="hidden" name="caseId" value={checklistCaseId} />
                </label>
              ) : (
                <label className="full">
                  Visa case
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
                    <option value="">Select a visa case</option>
                    {cases
                      .filter((c) => c.serviceType === "direct_visa" || c.lifecycleStage === "visa")
                      .map((c) => (
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
              <div className="visaChecklist full">
                {[...new Set(VISA_DOCUMENT_TEMPLATES.map((item) => item.category))].map((category) => (
                  <fieldset key={category}>
                    <legend>{category}</legend>
                    {VISA_DOCUMENT_TEMPLATES.filter((item) => item.category === category).map((item) => (
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
              <label>
                To
                <input name="to" type="email" required />
              </label>
              <label>
                Linked case
                <select name="caseId">
                  <option value="">None</option>
                  {cases.map((c) => (
                    <option key={c.id} value={c.dbId || c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="full">
                Subject
                <input name="subject" required />
              </label>
              <label className="full">
                Message
                <textarea name="body" required />
              </label>
            </>
          )}
          {type === "invoice" && (
            <>
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
              <label>
                Amount
                <input
                  name="amount"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                />
              </label>
              <label>
                Due date
                <input name="due" type="date" />
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
          <button type="submit" className="primaryButton" disabled={saving}>
            <Check size={15} />
            {saving ? "Saving securely…" : "Save complete record"}
          </button>
        </footer>
      </form>
    </div>
  );
}

export default function Home() {
  const [active, setActive] = useState<ModuleKey>("dashboard"),
    [menuOpen, setMenuOpen] = useState(false),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [modal, setModal] = useState<ModalType>(null),
    [presetCaseId, setPresetCaseId] = useState(""),
    [selected, setSelected] = useState<CaseRecord | null>(null),
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
    [invoices, setInvoices] = useState<InvoiceRecord[]>([]),
    [commissionClaims, setCommissionClaims] = useState<CommissionClaimRecord[]>([]),
    [journeyHistory, setJourneyHistory] = useState<JourneyMilestone[]>([]),
    [declarations, setDeclarations] = useState<ClientDeclaration[]>([]),
    [templates, setTemplates] = useState<TemplateRecord[]>([]),
    [workflows, setWorkflows] = useState<WorkflowRecord[]>([]),
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
    // Invoices, templates and workflows are writable only by manager level and
    // above; the database enforces the same rule.
    canManageFinance = role === "super_admin" || role === "admin";
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
  useEffect(() => {
    const timer = window.setTimeout(() => void loadWorkspace(), 0);
    return () => window.clearTimeout(timer);
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
  // Requesting a document from within the case it belongs to, rather than
  // picking that same case back out of every case in the organisation from
  // the File Manager screen.
  const openDocumentRequest = (caseId: string, kind: "document" | "visaChecklist" = "document") => {
    setPresetCaseId(caseId);
    open(kind);
  };
  // Sends a completed form to the workspace and refreshes what is on screen.
  const submitRecord = async (
    kind: Exclude<ModalType, null>,
    payload: Record<string, unknown>,
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
      setModal(null);
      setEditing(null);
      setDuplicates(null);
      setPendingIntake(null);
      setPresetCaseId("");
      await loadWorkspace();
      say(`${kind[0].toUpperCase() + kind.slice(1)} saved to Supabase`);
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
    await submitRecord(modal, payload);
  };

  // The three honest answers to "this looks like somebody you already have".
  const openExistingClient = (clientId: string) => {
    const existing = cases.find((c) => c.clientId === clientId);
    setModal(null);
    setEditing(null);
    setDuplicates(null);
    setPendingIntake(null);
    if (existing) setSelected(existing);
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
      // A case officer exports the cases assigned to them, not everything they
      // can see for cover. Visibility is the real boundary -- what is on screen
      // is on screen -- but a one-click dump of a colleague's clients is not
      // something the CRM should hand out, and every export is recorded.
      const mine =
        role === "staff"
          ? cases.filter((c) => c.ownerId === identity?.profileId)
          : cases;
      const ids = new Set(mine.map((c) => c.dbId || c.id));
      const scope =
        role === "staff"
          ? "own cases"
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
          ? `Exported ${mine.length} of your cases. The export is on the audit trail.`
          : "Live data exported. The export is on the audit trail.",
      );
    };
  const assignCase = async (record: CaseRecord, ownerId: string) => {
    if (!record.dbId) {
      say("This case could not be identified.");
      return;
    }
    try {
      const response = await fetch("/api/crm/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "assign",
          caseId: record.dbId,
          ownerId,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "The case could not be reassigned.");
      setSelected(null);
      await loadWorkspace();
      const owner = staff.find((person) => person.id === ownerId);
      say(`${record.id} assigned to ${owner?.display_name || "the new owner"}`);
    } catch (reason) {
      say(
        reason instanceof Error
          ? reason.message
          : "The case could not be reassigned.",
      );
    }
  };
  const bulkAssignCases = async (records: CaseRecord[], ownerId: string) => {
    const caseIds = records.map((record) => record.dbId).filter(Boolean) as string[];
    if (caseIds.length === 0) {
      say("None of the selected cases could be identified.");
      return;
    }
    try {
      const response = await fetch("/api/crm/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "bulk_assign", caseIds, ownerId }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "The cases could not be reassigned.");
      await loadWorkspace();
      const owner = staff.find((person) => person.id === ownerId);
      const failed = Number(result.failed ?? 0);
      say(
        `${result.succeeded ?? caseIds.length} case${(result.succeeded ?? caseIds.length) === 1 ? "" : "s"} assigned to ${owner?.display_name || "the new owner"}` +
          (failed > 0 ? ` (${failed} could not be reassigned).` : "."),
      );
    } catch (reason) {
      say(
        reason instanceof Error
          ? reason.message
          : "The cases could not be reassigned.",
      );
    }
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

  // A case officer's ledger is the fees for the clients they are accountable
  // for. Commission claims against partners and institutions are management
  // finance and are not part of it.
  const visibleInvoices =
    role === "staff"
      ? invoices.filter(
          (invoice) =>
            CLIENT_INVOICE_TYPES.includes(invoice.type) &&
            cases.some(
              (c) =>
                c.name === invoice.client && c.ownerId === identity?.profileId,
            ),
        )
      : invoices;
  const screenMeta =
    (role === "client" ? clientMeta[active] : undefined) ?? meta[active];
  let content: React.ReactNode;
  if (role === "client")
    content =
      active === "portal" ? (
        <PortalView cases={cases} journeyHistory={journeyHistory} declarations={declarations} />
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
        documents={documents}
        openModal={open}
        setActive={setActive}
        serviceMode={serviceMode}
      />
    );
  else if (active === "work")
    content = (
      <TasksView
        tasks={tasks}
        cases={cases}
        setTasks={syncTasks}
        openModal={open}
      />
    );
  else if (active === "calendar")
    content = (
      <CalendarView
        items={appointments}
        openModal={open}
        setItems={syncAppointments}
        setActive={setActive}
      />
    );
  else if (active === "documents")
    content = (
      <DocumentsView
        items={documents}
        setItems={syncDocuments}
        storageConnected={storageConnected}
      />
    );
  else if (active === "communications")
    content = (
      <MessagesView
        items={messages}
        openModal={open}
        setItems={syncMessages}
        // This screen is only ever reached by staff -- the client portal has
        // its own communications screen elsewhere in this render.
        canSend={true}
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
          canManage={canManageFinance}
          onRefund={(invoice) => {
            if (
              confirm(
                `Refund $${invoice.paid.toLocaleString()} to ${invoice.client}? This is recorded against the invoice and cannot be undone here.`,
              )
            )
              void mutateRemote("invoice", "refund", invoice.id, {
                amount: invoice.paid,
              });
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
        />
        <CommissionClaimsPanel
          items={commissionClaims}
          canManage={canManageFinance}
          onCreate={(data) =>
            void postOperation("create_commission_claim", {
              partnerName: data.partnerName,
              institution: data.institution,
              expectedAmount: data.expectedAmount,
              dueOn: data.dueOn,
            })
          }
          onMarkReceived={(claim) => {
            const receivedAmount = window.prompt(
              `Amount received from ${claim.partnerName}?`,
              String(claim.expectedAmount),
            );
            if (receivedAmount === null) return;
            const parsed = Number(receivedAmount);
            if (!Number.isFinite(parsed) || parsed <= 0) {
              say("Enter an amount greater than zero.");
              return;
            }
            void postOperation("record_commission_received", {
              claimId: claim.id,
              receivedAmount: parsed,
            });
          }}
        />
      </>
    );
  else if (active === "templates")
    content = (
      <TemplatesView
        items={templates}
        openModal={open}
        setItems={syncTemplates}
        canManage={canManageFinance}
      />
    );
  else if (active === "workflows")
    content = (
      <WorkflowView
        items={workflows}
        openModal={open}
        setItems={syncWorkflows}
        canManage={canManageFinance}
      />
    );
  else if (active === "reports")
    content = (
      <ReportsView
        exportData={exportData}
        canSeeFinance={canManageFinance}
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
      if (found) setSelected(found);
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
          ? atStage("student")
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
                ? // "Clients" is Direct Visa's name for the stage Study Abroad
                  // calls "Students" -- the same lifecycle stage, not the visa
                  // stage a migration matter reaches later.
                  atStage("student")
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
                ? "Cases at the client stage"
                : meta[active][0]
        }
        module={active}
        cases={list}
        filter={filter}
        setFilter={setFilter}
        openModal={open}
        onSelect={setSelected}
        staff={staff}
        canBulkAssign={canManageFinance}
        onBulkAssign={bulkAssignCases}
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
      ) : active === "visas" || active === "direct_visas" ? (
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
    <div className={`appShell mode-${serviceMode}`}>
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
        <header className={`topbar ${role === "client" ? "clientOnly" : ""}`}>
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
                            setSelected(c);
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
              <ProfileServiceSwitch
                serviceMode={serviceMode}
                setServiceMode={setServiceMode}
                setActive={setActive}
              />
            ) : null}
            <div className="topActions">
              <div className="signedAccount">
                <div className="avatar small">{roleConfig[role].initials}</div>
                <span>
                  <b>{identity?.displayName || roleConfig[role].label}</b>
                  <small>{identity?.email}</small>
                </span>
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
          <div className="accessBanner">
            <ShieldCheck size={16} />
            <span>
              <b>{roleConfig[role].label} account</b> · {roleConfig[role].scope}
            </span>
            <small>
              {role !== "client"
                ? serviceMode === "study"
                  ? "Study Abroad workspace"
                  : "Direct Visa workspace"
                : "Private journey"}
            </small>
          </div>
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
                  ? serviceMode === "study"
                    ? "Study Abroad dashboard"
                    : "Direct Visa dashboard"
                  : screenMeta[0]}
              </h1>
              <p>{screenMeta[2]}</p>
            </div>
            {role !== "client" ? (
              <div className="titleActions">
                <button className="ghostButton" onClick={exportData}>
                  <Download size={16} />
                  Export
                </button>
                <button className="primaryButton" onClick={() => open("case")}>
                  <Plus size={16} />
                  {serviceMode === "study" ? "New enquiry" : "New client"}
                </button>
              </div>
            ) : null}
          </div>
          {content}
        </div>
      </main>
      {role !== "client" ? (
        <CaseDrawer
          moveStage={moveCaseStage}
          assign={assignCase}
          refresh={loadWorkspace}
          staff={staff}
          lifecycleReady={!schemaWarning}
          schemaWarning={schemaWarning}
          storageConnected={storageConnected}
          canAssign={role === "super_admin" || role === "admin"}
          canModify={
            role !== "staff" || selected?.ownerId === identity?.profileId
          }
          item={selected}
          close={() => setSelected(null)}
          edit={editCase}
          remove={removeCase}
          onRequestDocument={openDocumentRequest}
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
