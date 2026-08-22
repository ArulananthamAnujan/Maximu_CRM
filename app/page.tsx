"use client";

import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
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
  Settings,
  ShieldCheck,
  Trash2,
  UserCog,
  Users,
  Workflow,
  X,
  CalendarCheck2,
  Cloud,
  Copy,
  Link2,
  MailCheck,
  RefreshCw,
  Sparkles,
  Video,
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
  | "completed";
type ServiceMode = "study" | "direct_visa";
type ModalType =
  | "case"
  | "task"
  | "appointment"
  | "document"
  | "message"
  | "invoice"
  | "template"
  | "workflow"
  | "role"
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
  completedAt: string;
  reopenedAt: string;
  createdAt: string;
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
};
type MessageRecord = {
  id: string;
  to: string;
  subject: string;
  body: string;
  caseId: string;
  status: string;
  createdAt: string;
};
type InvoiceRecord = {
  id: string;
  client: string;
  amount: number;
  due: string;
  status: string;
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
      ["communications", "Email & WhatsApp", Mail],
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
      ["communications", "Email & WhatsApp", Mail],
      ["templates", "Campaigns & Templates", FileCheck2],
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
  "completed",
];
const ACTIVE_STAGES = LIFECYCLE_STAGES.filter((stage) => stage !== "completed");
const stageLabels: Record<LifecycleStage, string> = {
  enquiry: "Enquiry",
  student: "Student",
  application: "Application",
  visa: "Visa",
  completed: "Completed",
};
const stageModule: Record<LifecycleStage, ModuleKey> = {
  enquiry: "enquiries",
  student: "students",
  application: "applications",
  visa: "visas",
  completed: "case_complete",
};
function allowedStageMoves(from: LifecycleStage): LifecycleStage[] {
  if (from === "completed") return [...ACTIVE_STAGES];
  const moves: LifecycleStage[] = ACTIVE_STAGES.filter(
    (stage) => stage !== from,
  );
  if (from === "visa") moves.push("completed");
  return moves;
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
    "Deferred students",
    "Study Abroad",
    "Track deferrals, revised intakes and institution follow-up.",
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
    "Email & WhatsApp",
    "Communication",
    "Case-linked email, templates, campaigns and WhatsApp communication.",
  ],
  templates: [
    "Campaigns & templates",
    "Automation",
    "Manage email, SMS and WhatsApp templates and campaigns.",
  ],
  finance: [
    "Accounts",
    "Invoices & commissions",
    "Client invoices, partner claims and institution commission invoices.",
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
    "Master's",
    "Organisation settings",
    "Staff, roles, branches, partners, institutions, courses and integrations.",
  ],
  integrations: [
    "Integrations",
    "Connected services",
    "Manage Google Workspace, WhatsApp, email and external service connections.",
  ],
};

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
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword(value => !value)}
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
              onClick={() =>
                setError(
                  "Google Workspace sign-in will activate after the Maximus OAuth client is connected.",
                )
              }
            >
              <div className="googleG">G</div>
              <span>
                <b>Continue with Google Workspace</b>
                <small>Connection pending</small>
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
      >
        <GraduationCap size={16} />
        <span>Study Abroad</span>
      </button>
      <button
        className={serviceMode === "direct_visa" ? "active" : ""}
        onClick={() => switchMode("direct_visa")}
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
      direct ? c.serviceType === "direct_visa" : c.serviceType !== "direct_visa",
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
  cases,
  filter,
  setFilter,
  openModal,
  onSelect,
}: {
  title: string;
  cases: CaseRecord[];
  filter: string;
  setFilter: (x: string) => void;
  openModal: (x: ModalType) => void;
  onSelect: (x: CaseRecord) => void;
}) {
  const shown =
    filter === "all" ? cases : cases.filter((c) => c.status === filter);
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
      {shown.length === 0 ? (
        <EmptyState
          icon={Users}
          title={`No ${title.toLowerCase()} found`}
          copy="Use Add new to create a secure record in the shared Maximus workspace."
          action="Add record"
          onAction={() => openModal("case")}
        />
      ) : (
        <div className="richTable">
          <div className="richHeader">
            <span>Client</span>
            <span>Matter</span>
            <span>Stage</span>
            <span>Owner</span>
            <span>Health</span>
            <span>Due</span>
          </div>
          {shown.map((c) => (
            <button className="richRow" key={c.id} onClick={() => onSelect(c)}>
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
          ))}
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
                {cases.find((c) => c.id === t.caseId)?.name || "General task"} ·
                Due {t.due || "not set"}
              </span>
            </div>
            <Status value={t.priority} />
            <button
              className="iconButton"
              onClick={() => setTasks(tasks.filter((x) => x.id !== t.id))}
              aria-label="Delete task"
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
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    today = calendarNow.getDay();
  return (
    <section className="calendarWorkspace">
      <article className="calendarConnectBar">
        <div className="googleG">G</div>
        <div>
          <span>GOOGLE CALENDAR</span>
          <strong>
            Staff calendar connection is ready for administrator setup
          </strong>
          <small>
            Once authorised, CRM appointments will appear beside each staff
            member&apos;s Maximus calendar.
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
      </article>
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
  openModal,
  setItems,
}: {
  items: DocumentRecord[];
  openModal: (x: ModalType) => void;
  setItems: (x: DocumentRecord[]) => void;
}) {
  return (
    <section className="moduleGrid">
      <article className="panel widePanel">
        <div className="panelHead">
          <div>
            <span className="kicker">LOCAL DOCUMENT INDEX</span>
            <h2>Documents</h2>
          </div>
          <button
            className="primaryButton"
            onClick={() => openModal("document")}
          >
            <Plus size={16} />
            Request document
          </button>
        </div>
        {items.length === 0 ? (
          <EmptyState
            icon={FolderOpen}
            title="No documents requested"
            copy="Request the documents this case needs and track whether they have arrived. File storage is not connected yet."
            action="Request document"
            onAction={() => openModal("document")}
          />
        ) : (
          items.map((d) => (
            <div className="functionalRow" key={d.id}>
              <div className="docIcon">
                <FileText size={18} />
              </div>
              <div>
                <strong>{d.title}</strong>
                <span>
                  {d.client || "No client"} · {d.folder || "Unfiled"} ·{" "}
                  {d.fileName}
                </span>
              </div>
              <Status value={d.status} />
              <button
                className="iconButton"
                onClick={() => setItems(items.filter((x) => x.id !== d.id))}
                aria-label="Remove document"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))
        )}
      </article>
      <aside className="panel drivePanel">
        <FolderOpen size={27} />
        <h2>Google Drive not connected</h2>
        <p>
          Document requests and metadata are stored in Supabase. Connect Google
          Workspace to upload and organise the actual files in Drive.
        </p>
        <button
          className="ghostButton full"
          onClick={() =>
            alert(
              "Open Integrations to complete the Google Workspace administrator setup.",
            )
          }
        >
          Connection instructions
        </button>
      </aside>
    </section>
  );
}
function MessagesView({
  items,
  openModal,
  setItems,
}: {
  items: MessageRecord[];
  openModal: (x: ModalType) => void;
  setItems: (x: MessageRecord[]) => void;
}) {
  return (
    <article className="panel listPanel">
      <div className="panelHead">
        <div>
          <span className="kicker">LOCAL OUTBOX</span>
          <h2>Messages & drafts</h2>
        </div>
        <button className="primaryButton" onClick={() => openModal("message")}>
          <Plus size={16} />
          Compose
        </button>
      </div>
      {items.length === 0 ? (
        <EmptyState
          icon={Mail}
          title="No messages"
          copy="Compose and save case-linked drafts before Gmail is connected."
          action="Compose message"
          onAction={() => openModal("message")}
        />
      ) : (
        items.map((m) => (
          <div className="functionalRow" key={m.id}>
            <div className="docIcon">
              <Mail size={17} />
            </div>
            <div>
              <strong>{m.subject}</strong>
              <span>
                To {m.to} · {new Date(m.createdAt).toLocaleString()}
              </span>
            </div>
            <Status value={m.status} />
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
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))
      )}
    </article>
  );
}
function FinanceView({
  items,
  openModal,
  setItems,
  canManage,
}: {
  items: InvoiceRecord[];
  openModal: (x: ModalType) => void;
  setItems: (x: InvoiceRecord[]) => void;
  // Invoices are writable only by manager level and above, so a case officer
  // sees the ledger without controls the database would refuse.
  canManage: boolean;
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
                  <button
                    className="iconButton"
                    onClick={() => setItems(items.filter((x) => x.id !== i.id))}
                    aria-label="Delete invoice"
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
                {t.type} · Updated {new Date(t.updatedAt).toLocaleDateString()}
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

function PortalView({ cases }: { cases: CaseRecord[] }) {
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
          linked to the signed-in Supabase account. No demonstration data has
          been added.
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
      const response = await fetch("/api/crm/documents", { method: "POST", body });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The file was not sent.");
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
        <h2>No linked client record</h2>
        <p>
          Supabase will resolve the signed-in account through client_user_links
          before returning any data.
        </p>
      </article>
    );
  if (module === "documents") {
    const own = documents.filter((x) => x.client === client.name);
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
                <span>{new Date(m.createdAt).toLocaleString()}</span>
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
  const own = invoices.filter((x) => x.client === client.name);
  return (
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
              <strong>${i.amount.toLocaleString()}</strong>
              <span>Due {i.due || "not set"}</span>
            </div>
            <Status value={i.status} />
          </div>
        ))
      ) : (
        <p className="restrictedEmpty">
          No invoices are linked to your account.
        </p>
      )}
    </article>
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
    informationRequests: { caseId: string; dueAt: string; daysRemaining: number | null }[];
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
      {shown === "calm" ? (
        <Check size={16} />
      ) : (
        <AlertTriangle size={16} />
      )}
      <div>
        <b>{label}</b>
        <small>{settled ? "Nothing outstanding" : detail}</small>
      </div>
      <strong>{count}</strong>
    </div>
  );
}

function ReportsView({
  exportData,
  canSeeFinance,
}: {
  exportData: () => void;
  canSeeFinance: boolean;
}) {
  const [report, setReport] = useState<AgencyReport | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/crm/reports", { cache: "no-store" });
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
  }, []);

  if (error)
    return (
      <article className="panel listPanel">
        <p className="caseWorkError">{error}</p>
      </article>
    );
  if (!report)
    return (
      <article className="panel listPanel">
        <p className="coverageIntro">Building the report…</p>
      </article>
    );

  const { pipeline, conversion, visas, deadlines, workload, branches, finance } =
    report;
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
            <span className="kicker">EDUCATION PIPELINE</span>
            <h2>Enquiry to confirmation of enrolment</h2>
          </div>
        </div>
        <ol className="funnel">
          {(
            [
              ["Enquiries", conversion.enquiries, ""],
              [
                "Converted",
                conversion.converted,
                `${conversion.conversionRate}% of enquiries`,
              ],
              ["Applications submitted", conversion.applicationsSubmitted, ""],
              ["Offers received", conversion.offers, `${conversion.offerRate}% of submitted`],
              ["CoEs received", conversion.coes, `${conversion.coeRate}% of offers`],
            ] as [string, number, string][]
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
        {new Date(report.generatedAt).toLocaleString()}.
      </p>
    </>
  );
}

function GoogleWorkspaceView() {
  const [settings, setSettings] = useStored("maximus.googleWorkspace", {
      domain: "maximuseducation.com.au",
      calendarSync: true,
      gmailSync: true,
      driveSync: true,
      configured: false,
    }),
    [editing, setEditing] = useState(false),
    [copied, setCopied] = useState(false);
  const save = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      domain = String(f.get("domain") || "")
        .trim()
        .replace(/^@/, "");
    setSettings({ ...settings, domain, configured: true });
    setEditing(false);
  };
  const copyRedirect = async () => {
    await navigator.clipboard.writeText(
      "https://maximus-crm-next.anujan2721.chatgpt.site/api/auth/google/callback",
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  const services = [
    [
      "Identity",
      UserCog,
      "Staff sign in with their Maximus email",
      "Google OAuth + Supabase Auth",
    ],
    [
      "Gmail",
      MailCheck,
      "Send and track case-linked staff email",
      "gmail.send and gmail.readonly",
    ],
    [
      "Calendar",
      CalendarCheck2,
      "Show meetings, deadlines and staff availability",
      "calendar.events",
    ],
    [
      "Drive",
      FolderOpen,
      "Create student folders and organised subfolders",
      "drive.file",
    ],
  ] as const;
  return (
    <section className="workspaceHub">
      <article className="googleHero">
        <div>
          <div className="googleHeroLabel">
            <div className="googleG">G</div>
            <span>GOOGLE WORKSPACE FOR MAXIMUS</span>
          </div>
          <h2>One identity. One calendar. Every case connected.</h2>
          <p>
            Staff will sign in with their company Google account, work from
            their own Gmail and Calendar, and keep every client action visible
            inside the CRM.
          </p>
          <div className="welcomeActions">
            <button
              className="heroPrimary"
              onClick={() => setEditing(!editing)}
            >
              <Settings size={16} />
              {editing ? "Close setup" : "Start administrator setup"}
            </button>
            <button className="heroSecondary" onClick={copyRedirect}>
              <Copy size={15} />
              {copied ? "Redirect URI copied" : "Copy redirect URI"}
            </button>
          </div>
        </div>
        <div className="connectionOrb">
          <Cloud size={31} />
          <strong>Foundation ready</strong>
          <span>Credentials required</span>
          <small>Restricted to @{settings.domain}</small>
        </div>
      </article>
      {editing ? (
        <form className="panel workspaceSetupForm" onSubmit={save}>
          <div className="panelHead">
            <div>
              <span className="kicker">STEP 1 OF 2</span>
              <h2>Workspace configuration</h2>
            </div>
            <Status value={settings.configured ? "Saved" : "Draft"} />
          </div>
          <div className="setupFields">
            <label>
              Allowed Google Workspace domain
              <input name="domain" defaultValue={settings.domain} required />
            </label>
            <label>
              Login policy
              <select name="policy" defaultValue="domain">
                <option value="domain">Only approved Maximus domain</option>
                <option value="invited">Invited staff only</option>
              </select>
            </label>
          </div>
          <div className="permissionChecks">
            <label>
              <input type="checkbox" defaultChecked={settings.gmailSync} />
              Gmail case communication
            </label>
            <label>
              <input type="checkbox" defaultChecked={settings.calendarSync} />
              Calendar event sync
            </label>
            <label>
              <input type="checkbox" defaultChecked={settings.driveSync} />
              Drive folder management
            </label>
          </div>
          <footer>
            <p>
              Saving prepares the CRM policy. Real Google sign-in begins after
              the OAuth Client ID, secret and Supabase publishable key are
              securely added.
            </p>
            <button className="primaryButton" type="submit">
              <Check size={15} />
              Save Workspace policy
            </button>
          </footer>
        </form>
      ) : null}
      <section className="workspaceServiceGrid">
        {services.map(([name, Icon, copy, scope], index) => (
          <article className="panel workspaceService" key={name}>
            <div className={`serviceGlyph s${index}`}>
              <Icon size={21} />
            </div>
            <span>{name}</span>
            <h3>{copy}</h3>
            <small>{scope}</small>
            <div>
              <Status
                value={index === 0 ? "OAuth pending" : "Awaiting connection"}
              />
            </div>
          </article>
        ))}
      </section>
      <section className="workspaceOpsGrid">
        <article className="panel setupChecklist">
          <div className="panelHead">
            <div>
              <span className="kicker">PRODUCTION CONNECTION</span>
              <h2>Administrator checklist</h2>
            </div>
            <span className="progressPill">1 / 4 prepared</span>
          </div>
          {[
            [
              true,
              "Workspace domain policy",
              "Restricted to the Maximus company domain",
            ],
            [
              false,
              "Google OAuth credentials",
              "Client ID and secret from Google Cloud",
            ],
            [
              false,
              "Supabase Google provider",
              "Enable Google sign-in and callback URL",
            ],
            [
              false,
              "Admin consent",
              "Approve Gmail, Calendar and Drive scopes",
            ],
          ].map(([done, title, copy], index) => (
            <div className="checkLine" key={String(title)}>
              <i className={done ? "done" : ""}>
                {done ? <Check size={14} /> : index + 1}
              </i>
              <div>
                <strong>{title}</strong>
                <span>{copy}</span>
              </div>
              <Status value={done ? "Prepared" : "Required"} />
            </div>
          ))}
        </article>
        <aside className="panel trackingPreview">
          <div className="panelHead">
            <div>
              <span className="kicker">CONNECTED WORKFLOW</span>
              <h2>What staff will see</h2>
            </div>
            <RefreshCw size={18} />
          </div>
          <div className="trackingFlow">
            <div>
              <MailCheck size={17} />
              <span>
                <b>Email sent</b>
                <small>Recorded on the client timeline</small>
              </span>
            </div>
            <div>
              <Video size={17} />
              <span>
                <b>Meeting booked</b>
                <small>Staff and CRM calendars updated</small>
              </span>
            </div>
            <div>
              <FolderOpen size={17} />
              <span>
                <b>Document received</b>
                <small>Filed under the student&apos;s Drive folder</small>
              </span>
            </div>
            <div>
              <Bell size={17} />
              <span>
                <b>Follow-up due</b>
                <small>CRM reminder created automatically</small>
              </span>
            </div>
          </div>
        </aside>
      </section>
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

function AdminView({
  openModal,
  clearData,
  setActive,
  roles,
}: {
  openModal: (x: ModalType) => void;
  clearData: () => void;
  setActive: (x: ModuleKey) => void;
  roles: { id: string; name: string; scope: string }[];
}) {
  return (
    <section className="adminStack">
      <article className="panel roleHero">
        <div>
          <span className="kicker">LEGACY-COMPATIBLE ACCESS</span>
          <h2>Four protected account experiences</h2>
          <p>
            The former Employee account is represented as Staff. Client /
            Student is a separate login and no longer appears as a normal Admin
            navigation module.
          </p>
        </div>
        <button
          className="heroPrimary"
          onClick={() =>
            alert(
              "Client access is shown automatically when a linked client account signs in.",
            )
          }
        >
          <Eye size={16} />
          How client access works
        </button>
      </article>
      <article className="panel listPanel">
        <div className="panelHead">
          <div>
            <span className="kicker">SYSTEM ROLES</span>
            <h2>Roles and data scope</h2>
          </div>
          <button className="primaryButton" onClick={() => openModal("role")}>
            <Plus size={16} />
            Create staff role
          </button>
        </div>
        <div className="systemRoleGrid">
          {(
            Object.entries(roleConfig) as [
              AppRole,
              (typeof roleConfig)[AppRole],
            ][]
          ).map(([key, r]) => (
            <button key={key} onClick={() => alert(`${r.label}: ${r.scope}`)}>
              <div className={`roleGlyph ${key}`}>{r.initials}</div>
              <strong>{r.label}</strong>
              <small>Earlier portal: {r.legacy}</small>
              <span>{r.scope}</span>
              <b>
                View permission scope <ArrowRight size={14} />
              </b>
            </button>
          ))}
        </div>
        {roles.length ? (
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
        ) : null}
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
      </article>
      <section className="adminLayout">
        <article className="panel listPanel">
          <div className="settingsCards">
            <button onClick={() => openModal("role")}>
              <ShieldCheck size={20} />
              <strong>Roles & permissions</strong>
              <span>Add specialised staff roles</span>
            </button>
            <button
              onClick={() =>
                alert(
                  "Supabase project created. Schema and secure role policies are being deployed.",
                )
              }
            >
              <Building2 size={20} />
              <strong>Supabase backend</strong>
              <span>Project ready in Sydney</span>
            </button>
            <button onClick={() => setActive("documents")}>
              <FolderOpen size={20} />
              <strong>Google Workspace</strong>
              <span>Prepare Drive and Gmail</span>
            </button>
            <button className="dangerSetting" onClick={clearData}>
              <Trash2 size={20} />
              <strong>Data retention controls</strong>
              <span>Archive records through authorised workflows</span>
            </button>
          </div>
        </article>
        <aside className="panel integrationCard">
          <span className="kicker">CLIENT PORTAL SEPARATION</span>
          <h2>Corrected</h2>
          <p>
            Admin and Staff no longer see the Client portal in normal
            navigation. A linked client account automatically opens the
            restricted personal journey experience.
          </p>
          <button
            className="ghostButton full"
            onClick={() =>
              alert(
                "Create or link a student profile in Supabase, then sign in with that account.",
              )
            }
          >
            View client access instructions
          </button>
        </aside>
      </section>
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
  staff,
  canAssign,
  lifecycleReady,
  schemaWarning,
  storageConnected,
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
  staff: StaffRecord[];
  canAssign: boolean;
  lifecycleReady: boolean;
  schemaWarning: string;
  storageConnected: boolean;
}) {
  return item ? (
    <CaseDrawerBody
      item={item}
      close={close}
      edit={edit}
      remove={remove}
      moveStage={moveStage}
      assign={assign}
      staff={staff}
      canAssign={canAssign}
      lifecycleReady={lifecycleReady}
      schemaWarning={schemaWarning}
      storageConnected={storageConnected}
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
const day = (value: unknown) =>
  typeof value === "string" && value ? value.slice(0, 10) : "";
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
  staff,
  canAssign,
  lifecycleReady,
  schemaWarning,
  storageConnected,
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
  staff: StaffRecord[];
  canAssign: boolean;
  lifecycleReady: boolean;
  schemaWarning: string;
  storageConnected: boolean;
}) {
  const [tab, setTab] = useState<CaseTab>("overview");
  const [reason, setReason] = useState("");
  const [moving, setMoving] = useState<LifecycleStage | "">("");
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
              {item.serviceType === "direct_visa" ? "Migration" : "Study abroad"}
              {item.target ? ` · ${item.target}` : ""}
            </p>
          </div>
          <button className="iconButton" onClick={close} aria-label="Close case">
            <X size={20} />
          </button>
        </div>

        <nav className="caseTabs" role="tablist">
          {caseTabs.map(([key, label]) => (
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
                    className={
                      step === stage
                        ? "current"
                        : LIFECYCLE_STAGES.indexOf(step) <
                            LIFECYCLE_STAGES.indexOf(stage)
                          ? "done"
                          : ""
                    }
                  >
                    <span>{stageLabels[step]}</span>
                  </li>
                ))}
              </ol>
              {!lifecycleReady && (
                <p className="schemaNotice">
                  <AlertTriangle size={14} />
                  {schemaWarning}
                </p>
              )}
              <label className="lifecycleReason">
                Reason (optional)
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={
                    stage === "visa"
                      ? "e.g. Visa approved"
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
                    disabled={moving !== "" || !lifecycleReady}
                    onClick={() => void run(next)}
                  >
                    {next === "completed" ? (
                      <>
                        <Check size={15} />
                        Mark visa approved &amp; complete
                      </>
                    ) : stage === "completed" ? (
                      <>
                        <RefreshCw size={15} />
                        Reopen in {stageLabels[next].toLowerCase()}
                      </>
                    ) : (
                      <>
                        <ArrowRight size={15} />
                        Move to {stageLabels[next].toLowerCase()}
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
                  client.privacy_consent_at
                    ? new Date(String(client.privacy_consent_at)).toLocaleDateString()
                    : "",
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
                    (file.intake.preferences.destination_countries as string[])?.join(", "),
                  ],
                  [
                    "Levels",
                    (file.intake.preferences.study_levels as string[])?.join(", "),
                  ],
                  [
                    "Fields",
                    (file.intake.preferences.fields_of_study as string[])?.join(", "),
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
              <span className="kicker">DOCUMENT CHECKLIST</span>
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
                        <span>
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
                        {new Date(entry.at).toLocaleString()}
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
          <button className="ghostButton" onClick={() => edit(item)}>
            <Pencil size={15} />
            Edit
          </button>
          <button
            className="ghostButton dangerButton"
            onClick={() => remove(item.id)}
          >
            <Trash2 size={15} />
            Archive
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
      if (!response.ok) throw new Error(result.error || "The file was not stored.");
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
                    {stored && size
                      ? ` · ${(size / 1024).toFixed(0)} KB`
                      : ""}
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
          <input name="status" defaultValue={text(value.status) || "assessment"} />
        </label>
        <label>
          Responsible agent (MARN)
          <input name="marn" defaultValue={text(value.responsible_agent_marn)} />
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
            ["healthExamination", "Health examination", "health_examination_status"],
            ["biometrics", "Biometrics", "biometrics_status"],
            ["policeClearance", "Police clearance", "police_clearance_status"],
            ["skillsAssessment", "Skills assessment", "skills_assessment_status"],
          ] as [string, string, string][]
        ).map(([name, label, key]) => (
          <label key={name}>
            {label}
            <select name={name} defaultValue={text(value[key]) || "not_started"}>
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
          <input name="lodgedAt" type="date" defaultValue={day(value.lodged_at)} />
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
          <input name="refusalReason" defaultValue={text(value.refusal_reason)} />
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
}) {
  if (!type) return null;
  const titles: Record<Exclude<ModalType, null>, string> = {
    case: editing ? "Edit record" : "Create record",
    task: "Create task",
    appointment: "Schedule appointment",
    document: "Request document",
    message: "Compose draft",
    invoice: "Create invoice",
    template: "Create template",
    workflow: "Status configuration",
    role: "Create role",
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
          >
            <X size={20} />
          </button>
        </header>
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
                    defaultChecked={editing?.serviceType !== "direct_visa"}
                  />
                  Study Abroad
                </label>
                <label>
                  <input
                    type="radio"
                    name="workspace"
                    value="Direct Visa"
                    defaultChecked={editing?.serviceType === "direct_visa"}
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
                    defaultValue={editing?.matterType || "Education enquiry"}
                  >
                    <option>Education enquiry</option>
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
                  <select name="branchId" defaultValue={editing?.branchId ?? ""}>
                    <option value="">Your own branch</option>
                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                        {branch.code ? ` (${branch.code})` : ""}
                      </option>
                    ))}
                  </select>
                </label>
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
                  <input name="remarks" placeholder="Anything worth noting now" />
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
          {type === "role" && (
            <>
              <label>
                Role name
                <input name="name" required />
              </label>
              <label>
                Data scope
                <select name="scope">
                  <option>Organisation</option>
                  <option>Assigned branches</option>
                  <option>Assigned cases</option>
                </select>
              </label>
            </>
          )}
        </div>
        {error ? <p className="formError" role="alert">{error}</p> : null}
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
    [selected, setSelected] = useState<CaseRecord | null>(null),
    [editing, setEditing] = useState<CaseRecord | null>(null),
    [toast, setToast] = useState(""),
    [formError, setFormError] = useState(""),
    [saving, setSaving] = useState(false),
    [quickOpen, setQuickOpen] = useState(false),
    [notifications, setNotifications] = useState(false),
    [alerts, setAlerts] = useState<
      { id: string; title: string; body: string | null; read_at: string | null }[]
    >([]);
  const [cases, setCases] = useState<CaseRecord[]>([]),
    [tasks, setTasks] = useState<TaskRecord[]>([]),
    [appointments, setAppointments] = useState<AppointmentRecord[]>([]),
    [documents, setDocuments] = useState<DocumentRecord[]>([]),
    [messages, setMessages] = useState<MessageRecord[]>([]),
    [invoices, setInvoices] = useState<InvoiceRecord[]>([]),
    [templates, setTemplates] = useState<TemplateRecord[]>([]),
    [workflows, setWorkflows] = useState<WorkflowRecord[]>([]),
    [audits, setAudits] = useState<AuditRecord[]>([]),
    [roles, setRoles] = useState<{ id: string; name: string; scope: string }[]>(
      [],
    ),
    [staff, setStaff] = useState<StaffRecord[]>([]),
    [branches, setBranches] = useState<BranchRecord[]>([]),
    [schemaWarning, setSchemaWarning] = useState<string>(""),
    [storageConnected, setStorageConnected] = useState(false);
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
      setActive(roleConfig[authenticatedIdentity.role].modules[0]);

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
      setTemplates(result.templates || []);
      setWorkflows(result.workflows || []);
      setAudits(result.audits || []);
      setRoles(result.roles || []);
      setStaff(
        ((result.profiles || []) as StaffRecord[]).filter(
          (person) => person.active && person.level !== "student",
        ),
      );
      setSchemaWarning(
        typeof result.schemaWarning === "string" ? result.schemaWarning : "",
      );
      setStorageConnected(result.capabilities?.documentStorage === true);
      setBranches((result.branches || []) as BranchRecord[]);
      setActive(roleConfig[result.identity.role as AppRole].modules[0]);
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
      await loadWorkspace();
      say(`${modal[0].toUpperCase() + modal.slice(1)} saved to Supabase`);
    } catch (reason) {
      const message = reason instanceof Error
        ? reason.message
        : "The record could not be saved.";
      setFormError(message);
      say(message);
    } finally {
      setSaving(false);
    }
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
      if (confirm("Archive this case? Its history will be preserved.")) {
        setSelected(null);
        void mutateRemote("case", "archive", record.dbId);
      }
    },
    clearData = () =>
      say(
        "Live CRM records cannot be cleared from a browser. Use authorised archive actions.",
      ),
    exportData = () => {
      const blob = new Blob(
          [
            JSON.stringify(
              {
                cases,
                tasks,
                appointments,
                documents,
                messages,
                invoices,
                templates,
                workflows,
                roles,
                audits,
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
      say("Live data exported");
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
      setActive(stageModule[stage]);
      say(
        stage === "completed"
          ? `${record.name} marked as completed`
          : record.lifecycleStage === "completed"
            ? `${record.name} reopened in ${stageLabels[stage].toLowerCase()}`
            : `${record.name} moved to ${stageLabels[stage].toLowerCase()}`,
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
    setCases([]);
    setTasks([]);
    setAppointments([]);
    setDocuments([]);
    setMessages([]);
    setInvoices([]);
    setTemplates([]);
    setWorkflows([]);
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
  let content: React.ReactNode;
  if (role === "client")
    content =
      active === "portal" ? (
        <PortalView cases={cases} />
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
        openModal={open}
        setItems={syncDocuments}
      />
    );
  else if (active === "communications")
    content = (
      <MessagesView items={messages} openModal={open} setItems={syncMessages} />
    );
  else if (active === "finance")
    content = (
      <FinanceView
        items={invoices}
        openModal={open}
        setItems={syncInvoices}
        canManage={canManageFinance}
      />
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
      <ReportsView exportData={exportData} canSeeFinance={canManageFinance} />
    );
  else if (active === "ai")
    content = (
      <article className="panel listPanel">
        <EmptyState
          icon={BrainCircuit}
          title="AI provider not connected"
          copy="The AI screen is intentionally inactive until you choose a provider and add secure server-side credentials."
          action="Open administration"
          onAction={() => setActive("administration")}
        />
      </article>
    );
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
                <span>{new Date(a.at).toLocaleString()}</span>
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
          openModal={open}
          clearData={clearData}
          setActive={setActive}
          roles={roles}
        />
        <ReadinessPanel />
        <FeatureCoverage />
      </>
    );
  else if (active === "integrations") content = <GoogleWorkspaceView />;
  else {
    // Each pipeline module shows the cases actually sitting at that stage, so
    // moving a case between stages moves it between these lists.
    const atStage = (stage: LifecycleStage) =>
      cases.filter((c) => c.lifecycleStage === stage);
    const list =
      active === "enquiries"
        ? atStage("enquiry")
        : active === "students"
          ? atStage("student")
          : active === "applications"
            ? atStage("application")
            : active === "visas"
              ? atStage("visa")
              : active === "direct_visas"
                ? atStage("visa").filter((c) => visa.includes(c))
                : active === "case_complete"
                  ? atStage("completed")
                  : active === "defer"
                    ? cases.filter((c) => /defer/i.test(c.stage))
                    : serviceMode === "direct_visa"
                      ? visa
                      : education;
    content = (
      <CaseWorkspace
        title={meta[active][0]}
        cases={list}
        filter={filter}
        setFilter={setFilter}
        openModal={open}
        onSelect={setSelected}
      />
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
                >
                  <LogOut size={17} />
                </button>
              </div>
              <div className="popoverWrap">
                <button
                  className="iconButton alert"
                  onClick={() => setNotifications(!notifications)}
                  aria-label="Notifications"
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
                        Nothing new ·{" "}
                        {tasks.filter((t) => !t.completed).length} open tasks
                      </span>
                    ) : (
                      <ul className="alertList">
                        {unreadAlerts.slice(0, 6).map((alert) => (
                          <li key={alert.id}>
                            <button onClick={() => void markAlertRead(alert.id)}>
                              <span>
                                <b>{alert.title}</b>
                                {alert.body ? <small>{alert.body}</small> : null}
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
                  : meta[active][1]}
              </span>
              <h1>
                {active === "dashboard"
                  ? serviceMode === "study"
                    ? "Study Abroad dashboard"
                    : "Direct Visa dashboard"
                  : meta[active][0]}
              </h1>
              <p>{meta[active][2]}</p>
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
          staff={staff}
          lifecycleReady={!schemaWarning}
          schemaWarning={schemaWarning}
          storageConnected={storageConnected}
          canAssign={role === "super_admin" || role === "admin"}
          item={selected}
          close={() => setSelected(null)}
          edit={editCase}
          remove={removeCase}
        />
      ) : null}
      <RecordModal
        type={modal}
        close={() => {
          setModal(null);
          setEditing(null);
          setFormError("");
        }}
        submit={save}
        cases={cases}
        editing={editing}
        branches={branches}
        staff={staff}
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
