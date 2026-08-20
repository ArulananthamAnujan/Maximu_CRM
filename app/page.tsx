"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
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
  Gauge,
  GraduationCap,
  Inbox,
  LayoutDashboard,
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
  target: string;
  stage: string;
  owner: string;
  branch: string;
  due: string;
  health: "healthy" | "attention" | "critical";
  progress: number;
  status: "active" | "waiting" | "completed";
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
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="emptyState">
      <div>
        <Icon size={25} />
      </div>
      <h3>{title}</h3>
      <p>{copy}</p>
      <button className="primaryButton" onClick={onAction}>
        <Plus size={15} />
        {action}
      </button>
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

function TopModuleNav({
  active,
  setActive,
  role,
}: {
  active: ModuleKey;
  setActive: (x: ModuleKey) => void;
  role: AppRole;
}) {
  const allowed = roleConfig[role].modules,
    groups = [
      {
        label: "Operations",
        icon: BriefcaseBusiness,
        items: [
          ["finance", "Accounts", CircleDollarSign],
          ["reports", "Reports", BarChart3],
          ["documents", "File Manager", FolderOpen],
        ],
      },
      {
        label: "Communication",
        icon: Mail,
        items: [
          ["communications", "Email & WhatsApp", Mail],
          ["templates", "Campaigns & Templates", FileCheck2],
        ],
      },
      {
        label: "Management",
        icon: Settings,
        items: [
          ["administration", "Master's", Settings],
          ["integrations", "Integrations", Workflow],
          ["compliance", "Activity & Compliance", LockKeyhole],
        ],
      },
    ] as const;
  return (
    <nav className="topModuleNav" aria-label="Business tools">
      {groups.map((group) => {
        const visible = group.items.filter(([key]) =>
          allowed.includes(key as ModuleKey),
        );
        if (!visible.length) return null;
        const activeGroup = visible.some(([key]) => key === active);
        const Icon = group.icon;
        return (
          <details key={group.label} className={activeGroup ? "active" : ""}>
            <summary>
              <Icon size={17} />
              <span>{group.label}</span>
              <ChevronDown size={15} />
            </summary>
            <div className="topNavMenu">
              {visible.map(([key, label, ItemIcon]) => (
                <button
                  key={key}
                  className={active === key ? "active" : ""}
                  onClick={(e) => {
                    setActive(key as ModuleKey);
                    const details = e.currentTarget.closest(
                      "details",
                    ) as HTMLDetailsElement | null;
                    if (details) details.open = false;
                  }}
                >
                  <ItemIcon size={17} />
                  <span>{label}</span>
                  {active === key ? (
                    <Check size={15} />
                  ) : (
                    <ArrowRight size={15} />
                  )}
                </button>
              ))}
            </div>
          </details>
        );
      })}
    </nav>
  );
}

function Dashboard({
  cases,
  tasks,
  documents,
  openModal,
  setActive,
}: {
  cases: CaseRecord[];
  tasks: TaskRecord[];
  documents: DocumentRecord[];
  openModal: (x: ModalType) => void;
  setActive: (x: ModuleKey) => void;
}) {
  const attention = cases.filter((c) => c.health !== "healthy").length,
    waiting = cases.filter((c) => c.status === "waiting").length,
    completed = cases.filter((c) => c.status === "completed").length;
  return (
    <>
      <section className="welcomeHero">
        <div className="welcomeCopy">
          <span>WELCOME TO YOUR WORKSPACE</span>
          <h2>
            Build better journeys,
            <br />
            one client at a time.
          </h2>
          <p>
            Start by creating your first enquiry, student or migration matter.
            No demonstration records have been added.
          </p>
          <div className="welcomeActions">
            <button className="heroPrimary" onClick={() => openModal("case")}>
              <Plus size={16} />
              Create first case
            </button>
            <button className="heroSecondary" onClick={() => openModal("task")}>
              <Check size={16} />
              Add a task
            </button>
          </div>
        </div>
        <div className="journeyVisual">
          <i className="sunDot" />
          <i className="orbit one" />
          <i className="orbit two" />
          <div className="journeyCard">
            <div className="journeyIcon">
              <GraduationCap size={25} />
            </div>
            <span>ACTIVE JOURNEYS</span>
            <strong>
              {cases.filter((c) => c.status !== "completed").length}
            </strong>
            <small>Created in this workspace</small>
          </div>
          <div className="journeyStep stepOne">
            <b>01</b>
            <span>Discover</span>
          </div>
          <div className="journeyStep stepTwo">
            <b>02</b>
            <span>Apply</span>
          </div>
          <div className="journeyStep stepThree">
            <b>03</b>
            <span>Arrive</span>
          </div>
        </div>
      </section>
      <section className="journeyFlow">
        <header>
          <span className="kicker">ONE CLEAR JOURNEY</span>
          <strong>Every case follows a visible path</strong>
        </header>
        <div>
          <article className="active">
            <b>01</b>
            <span>Enquiry</span>
            <small>Capture and qualify</small>
          </article>
          <ArrowRight size={17} />
          <article>
            <b>02</b>
            <span>Counselling</span>
            <small>Goals and eligibility</small>
          </article>
          <ArrowRight size={17} />
          <article>
            <b>03</b>
            <span>Documents</span>
            <small>Request and verify</small>
          </article>
          <ArrowRight size={17} />
          <article>
            <b>04</b>
            <span>Apply / Lodge</span>
            <small>Education or visa</small>
          </article>
          <ArrowRight size={17} />
          <article>
            <b>05</b>
            <span>Outcome</span>
            <small>Offer, grant or next step</small>
          </article>
        </div>
      </section>
      <section className="signalGrid">
        <article className="signal coral">
          <div>
            <span>Open cases</span>
            <strong>
              {cases.filter((c) => c.status !== "completed").length}
            </strong>
            <small>{cases.length} total records</small>
          </div>
          <div className="signalIcon">
            <BriefcaseBusiness size={22} />
          </div>
        </article>
        <article className="signal sunshine">
          <div>
            <span>Need attention</span>
            <strong>{attention}</strong>
            <small>Based on case health</small>
          </div>
          <div className="signalIcon amber">
            <AlertTriangle size={22} />
          </div>
        </article>
        <article className="signal ocean">
          <div>
            <span>Waiting</span>
            <strong>{waiting}</strong>
            <small>Client or third-party action</small>
          </div>
          <div className="signalIcon blue">
            <Clock3 size={22} />
          </div>
        </article>
        <article className="signal mint">
          <div>
            <span>Completed</span>
            <strong>{completed}</strong>
            <small>Closed journeys</small>
          </div>
          <div className="signalIcon green">
            <Gauge size={22} />
          </div>
        </article>
      </section>
      <section className="dashboardGrid">
        <article className="panel pipelinePanel">
          <div className="panelHead">
            <div>
              <span className="kicker">LIVE WORKSPACE</span>
              <h2>Recent cases</h2>
            </div>
            <button
              className="ghostButton"
              onClick={() => setActive("students")}
            >
              View all <ArrowRight size={15} />
            </button>
          </div>
          {cases.length === 0 ? (
            <EmptyState
              icon={BriefcaseBusiness}
              title="No cases yet"
              copy="Create your first record to begin tracking the client journey."
              action="Create case"
              onAction={() => openModal("case")}
            />
          ) : (
            <div className="caseTable">
              {cases.slice(0, 5).map((c) => (
                <button
                  className="caseRow compactRecord"
                  key={c.id}
                  onClick={() =>
                    setActive(
                      c.type.toLowerCase().includes("visa")
                        ? "visas"
                        : "students",
                    )
                  }
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
                <span>Open document centre</span>
              </div>
              <ArrowRight size={15} />
            </button>
          </article>
        </aside>
      </section>
    </>
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
    workspaceCases = cases.filter((c) =>
      direct
        ? /visa|migration|skill|eoi/i.test(c.type)
        : !/migration|skill|eoi/i.test(c.type),
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
            Add document
          </button>
        </div>
        {items.length === 0 ? (
          <EmptyState
            icon={FolderOpen}
            title="No documents indexed"
            copy="Add file metadata now. Google Drive upload can replace this adapter later."
            action="Add document"
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
}: {
  items: InvoiceRecord[];
  openModal: (x: ModalType) => void;
  setItems: (x: InvoiceRecord[]) => void;
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
          <button
            className="primaryButton"
            onClick={() => openModal("invoice")}
          >
            <Plus size={16} />
            New invoice
          </button>
        </div>
        {items.length === 0 ? (
          <EmptyState
            icon={CircleDollarSign}
            title="No invoices"
            copy="Create an invoice to start tracking fees and payments."
            action="Create invoice"
            onAction={() => openModal("invoice")}
          />
        ) : (
          items.map((i) => (
            <div className="functionalRow" key={i.id}>
              <div>
                <strong>{i.client}</strong>
                <span>Due {i.due || "not set"}</span>
              </div>
              <b>${i.amount.toLocaleString()}</b>
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
}: {
  items: TemplateRecord[];
  openModal: (x: ModalType) => void;
  setItems: (x: TemplateRecord[]) => void;
}) {
  return (
    <article className="panel listPanel">
      <div className="panelHead">
        <div>
          <span className="kicker">APPROVED CONTENT</span>
          <h2>Templates</h2>
        </div>
        <button className="primaryButton" onClick={() => openModal("template")}>
          <Plus size={16} />
          New template
        </button>
      </div>
      {items.length === 0 ? (
        <EmptyState
          icon={FileCheck2}
          title="No templates"
          copy="Create reusable emails, notes and document requests."
          action="Create template"
          onAction={() => openModal("template")}
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
            <button
              className="iconButton"
              onClick={() => setItems(items.filter((x) => x.id !== t.id))}
              aria-label="Delete template"
            >
              <Trash2 size={16} />
            </button>
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
}: {
  items: WorkflowRecord[];
  openModal: (x: ModalType) => void;
  setItems: (x: WorkflowRecord[]) => void;
}) {
  void items;
  void openModal;
  void setItems;
  const sections = [
    ["Main status", "High, Medium and Low priority"],
    ["Enquiry status", "15 configured statuses"],
    ["Student status", "22 configured statuses"],
    ["Application status", "Country and institution-specific statuses"],
    ["Visa status", "Country and visa-specific statuses"],
    ["Document checklists", "Application checklist and Visa checklist"],
  ];
  return (
    <article className="panel listPanel">
      <div className="panelHead">
        <div>
          <span className="kicker">EXISTING CRM CONFIGURATION</span>
          <h2>Statuses and document checklists</h2>
        </div>
        <Status value="Source: current CRM" />
      </div>
      <p className="coverageIntro">
        These are the existing Maximus configuration families. This build will
        import their records from Supabase rather than inventing a replacement
        workflow.
      </p>
      {sections.map(([name, detail]) => (
        <div className="functionalRow" key={name}>
          <div className="workflowIcon">
            <Workflow size={17} />
          </div>
          <div>
            <strong>{name}</strong>
            <span>{detail}</span>
          </div>
          <Status value="Configurable" />
        </div>
      ))}
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
  messages,
  invoices,
  openModal,
}: {
  module: ModuleKey;
  client: CaseRecord | undefined;
  appointments: AppointmentRecord[];
  documents: DocumentRecord[];
  messages: MessageRecord[];
  invoices: InvoiceRecord[];
  openModal: (x: ModalType) => void;
}) {
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
            <h2>Documents shared with Maximus</h2>
          </div>
          <button
            className="primaryButton"
            onClick={() => openModal("document")}
          >
            <Plus size={16} />
            Upload document
          </button>
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
            </div>
          ))
        ) : (
          <p className="restrictedEmpty">
            No documents are linked to this client account.
          </p>
        )}
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
function ReportsView({
  cases,
  invoices,
  exportData,
  openModal,
}: {
  cases: CaseRecord[];
  invoices: InvoiceRecord[];
  exportData: () => void;
  openModal: (x: ModalType) => void;
}) {
  const completed = cases.filter((c) => c.status === "completed").length;
  return (
    <>
      <div className="miniStats">
        <article>
          <span>Total records</span>
          <strong>{cases.length}</strong>
          <small>All case types</small>
        </article>
        <article>
          <span>Completion rate</span>
          <strong>
            {cases.length ? Math.round((completed / cases.length) * 100) : 0}%
          </strong>
          <small>Calculated locally</small>
        </article>
        <article>
          <span>Revenue tracked</span>
          <strong>
            ${invoices.reduce((s, x) => s + x.amount, 0).toLocaleString()}
          </strong>
          <small>From invoices</small>
        </article>
      </div>
      <article className="panel listPanel">
        <div className="panelHead">
          <div>
            <span className="kicker">DATA EXPORT</span>
            <h2>Reporting</h2>
          </div>
          <button className="primaryButton" onClick={exportData}>
            <Download size={16} />
            Export JSON
          </button>
        </div>
        {cases.length === 0 ? (
          <EmptyState
            icon={BarChart3}
            title="No reporting data"
            copy="Reports will populate automatically as you create records."
            action="Create case"
            onAction={() => openModal("case")}
          />
        ) : (
          <div className="reportEmpty">
            <BarChart3 size={28} />
            <p>
              Reports are calculated from {cases.length} case records and{" "}
              {invoices.length} invoice records.
            </p>
          </div>
        )}
      </article>
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
}: {
  item: CaseRecord | null;
  close: () => void;
  edit: (x: CaseRecord) => void;
  remove: (id: string) => void;
}) {
  if (!item) return null;
  return (
    <div className="drawerBackdrop" onClick={close}>
      <aside className="caseDrawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawerHead">
          <div>
            <span>{item.id}</span>
            <h2>{item.name}</h2>
            <p>
              {item.type} · {item.target || "No target"}
            </p>
          </div>
          <button
            className="iconButton"
            onClick={close}
            aria-label="Close case"
          >
            <X size={20} />
          </button>
        </div>
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
        <section>
          <span className="kicker">CONTACT</span>
          <h3>{item.email || "No email"}</h3>
          <p>{item.phone || "No phone"}</p>
        </section>
        <section>
          <span className="kicker">CURRENT STAGE</span>
          <h3>{item.stage}</h3>
          <p>
            Owner: {item.owner || "Unassigned"} · Branch:{" "}
            {item.branch || "Not set"}
          </p>
        </section>
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
            Delete
          </button>
        </div>
      </aside>
    </div>
  );
}

function RecordModal({
  type,
  close,
  submit,
  cases,
  editing,
}: {
  type: ModalType;
  close: () => void;
  submit: (e: FormEvent<HTMLFormElement>) => void;
  cases: CaseRecord[];
  editing: CaseRecord | null;
}) {
  if (!type) return null;
  const titles: Record<Exclude<ModalType, null>, string> = {
    case: editing ? "Edit record" : "Create record",
    task: "Create task",
    appointment: "Schedule appointment",
    document: "Add document",
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
                <label>
                  <input
                    type="radio"
                    name="workspace"
                    value="Study Abroad"
                    defaultChecked
                  />
                  Study Abroad
                </label>
                <label>
                  <input type="radio" name="workspace" value="Direct Visa" />
                  Direct Visa
                </label>
              </section>
              <details open>
                <summary>1. Personal details</summary>
                <div className="intakeFields">
                  <label>
                    Full name *
                    <input name="name" required defaultValue={editing?.name} />
                  </label>
                  <label>
                    Email
                    <input
                      name="email"
                      type="email"
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
                    Alternate number
                    <input name="alternateNo" />
                  </label>
                  <label>
                    Date of birth
                    <input name="dob" type="date" />
                  </label>
                  <label>
                    Gender
                    <select name="gender">
                      <option value="">Select gender</option>
                      <option>Male</option>
                      <option>Female</option>
                      <option>Other</option>
                    </select>
                  </label>
                  <label>
                    Marital status
                    <select name="maritalStatus">
                      <option value="">Select status</option>
                      <option>Single</option>
                      <option>Married</option>
                      <option>Divorced</option>
                      <option>Widowed</option>
                    </select>
                  </label>
                  <label>
                    Nationality
                    <input name="nationality" />
                  </label>
                  <label className="wide">
                    Address
                    <input name="address" />
                  </label>
                </div>
              </details>
              <details>
                <summary>2. Spouse and children</summary>
                <div className="intakeFields">
                  <label>
                    Spouse name
                    <input name="spouseName" />
                  </label>
                  <label>
                    Spouse mobile
                    <input name="spouseMobile" />
                  </label>
                  <label>
                    Spouse email
                    <input name="spouseEmail" type="email" />
                  </label>
                  <label>
                    Spouse visa type
                    <input name="spouseVisaType" />
                  </label>
                  <label>
                    Spouse visa expiry
                    <input name="spouseVisaExpiry" type="date" />
                  </label>
                  <label>
                    Marriage date
                    <input name="marriageDate" type="date" />
                  </label>
                  <label>
                    Marriage type
                    <input name="marriageType" />
                  </label>
                  <label>
                    Marriage registered?
                    <select name="marriageRegistered">
                      <option value="">Select</option>
                      <option>Yes</option>
                      <option>No</option>
                    </select>
                  </label>
                  <label>
                    Spouse passport
                    <input name="spousePassport" />
                  </label>
                  <label>
                    Spouse date of birth
                    <input name="spouseDob" type="date" />
                  </label>
                  <label>
                    Child name
                    <input name="childName" />
                  </label>
                  <label>
                    Child date of birth
                    <input name="childDob" type="date" />
                  </label>
                </div>
              </details>
              <details>
                <summary>3. Study preference and case classification</summary>
                <div className="intakeFields">
                  <label>
                    Service
                    <select
                      name="type"
                      defaultValue={editing?.type || "Education enquiry"}
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
                    Interested country
                    <input name="country" />
                  </label>
                  <label>
                    University / college
                    <input name="university" />
                  </label>
                  <label>
                    Course
                    <input name="target" defaultValue={editing?.target} />
                  </label>
                  <label>
                    Intake
                    <input name="intake" />
                  </label>
                  <label>
                    Course start date
                    <input name="courseStart" type="date" />
                  </label>
                  <label>
                    Course end date
                    <input name="courseEnd" type="date" />
                  </label>
                  <label>
                    Apply level
                    <select name="applyLevel">
                      <option value="">Select level</option>
                      <option>Undergraduate</option>
                      <option>Postgraduate</option>
                      <option>Diploma</option>
                      <option>PhD</option>
                      <option>Certificate III</option>
                      <option>Certificate IV</option>
                      <option>Advanced Diploma</option>
                      <option>Associate Degree</option>
                      <option>Bachelor Degree</option>
                      <option>Master Degree</option>
                      <option>Graduate Diploma</option>
                      <option>Graduate Certificate</option>
                      <option>Master by Research</option>
                    </select>
                  </label>
                  <label>
                    Source
                    <select name="source">
                      <option value="">Select source</option>
                      <option>Facebook</option>
                      <option>Walk-In</option>
                      <option>WhatsApp</option>
                      <option>Email Marketing</option>
                      <option>Word of Mouth</option>
                      <option>Excel Import</option>
                      <option>Facebook Lead</option>
                      <option>Phone Enquiry</option>
                      <option>Enquiry Form</option>
                    </select>
                  </label>
                  <label>
                    Priority
                    <select name="mainStatus">
                      <option>High</option>
                      <option>Medium</option>
                      <option>Low</option>
                    </select>
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
                      <option>Course Selection Pending</option>
                      <option>University Selection Pending</option>
                      <option>Admission Application Sent</option>
                      <option>Offer Received</option>
                      <option>Payment Received</option>
                      <option>CoE Request Sent</option>
                      <option>CoE Received</option>
                      <option>Visa Application Process</option>
                      <option>Visa Granted</option>
                      <option>Visa Refused</option>
                      <option>File Closed</option>
                      <option>Not Interested</option>
                    </select>
                  </label>
                  <label>
                    Visa expiry date
                    <input name="visaExpiry" type="date" />
                  </label>
                </div>
              </details>
              <details>
                <summary>4. Academic history and proficiency tests</summary>
                <div className="intakeFields">
                  <label>
                    Highest qualification
                    <select name="highestQualification">
                      <option value="">Select qualification</option>
                      <option>Year 10 / SSC / O-Level</option>
                      <option>Year 12 / HSC / A-Level</option>
                      <option>Certificate III</option>
                      <option>Certificate IV</option>
                      <option>Diploma</option>
                      <option>Advanced Diploma</option>
                      <option>Bachelor Degree</option>
                      <option>Graduate Diploma</option>
                      <option>Master Degree</option>
                      <option>PhD</option>
                    </select>
                  </label>
                  <label>
                    Subjects / stream
                    <input name="subjects" />
                  </label>
                  <label>
                    College / board
                    <input name="college" />
                  </label>
                  <label>
                    Percentage / grade
                    <input name="grade" />
                  </label>
                  <label>
                    Backlogs
                    <input name="backlogs" />
                  </label>
                  <label>
                    Year passed
                    <input name="yearPassed" />
                  </label>
                  <label>
                    Test type
                    <select name="testType">
                      <option value="">Select test</option>
                      <option>IELTS</option>
                      <option>PTE</option>
                      <option>TOEFL</option>
                      <option>CELPIP</option>
                      <option>GRE</option>
                      <option>GMAT</option>
                      <option>SAT</option>
                      <option>TOPIK</option>
                      <option>JLPT</option>
                      <option>Other</option>
                    </select>
                  </label>
                  <label>
                    Listening
                    <input name="testListening" />
                  </label>
                  <label>
                    Reading
                    <input name="testReading" />
                  </label>
                  <label>
                    Writing
                    <input name="testWriting" />
                  </label>
                  <label>
                    Speaking
                    <input name="testSpeaking" />
                  </label>
                  <label>
                    Overall
                    <input name="testOverall" />
                  </label>
                </div>
              </details>
              <details>
                <summary>5. Passport, work experience and assignment</summary>
                <div className="intakeFields">
                  <label>
                    Passport number
                    <input name="passport" />
                  </label>
                  <label>
                    Date of issue
                    <input name="passportIssue" type="date" />
                  </label>
                  <label>
                    Date of expiry
                    <input name="passportExpiry" type="date" />
                  </label>
                  <label>
                    Company name
                    <input name="company" />
                  </label>
                  <label>
                    Position
                    <input name="position" />
                  </label>
                  <label>
                    Total experience
                    <input name="experience" />
                  </label>
                  <label>
                    Branch
                    <input name="branch" defaultValue={editing?.branch} />
                  </label>
                  <label>
                    Assigned staff
                    <input name="owner" defaultValue={editing?.owner} />
                  </label>
                  <label>
                    Partner / sub-agent
                    <input name="partner" />
                  </label>
                  <label>
                    Due date
                    <input name="due" type="date" defaultValue={editing?.due} />
                  </label>
                  <label>
                    Health
                    <select
                      name="health"
                      defaultValue={editing?.health || "healthy"}
                    >
                      <option value="healthy">Healthy</option>
                      <option value="attention">Attention</option>
                      <option value="critical">Critical</option>
                    </select>
                  </label>
                  <label>
                    Progress
                    <input
                      name="progress"
                      type="number"
                      min="0"
                      max="100"
                      defaultValue={editing?.progress || 0}
                    />
                  </label>
                  <input type="hidden" name="status" value="active" />
                </div>
              </details>
              <details>
                <summary>6. Follow-up, appointment and remarks</summary>
                <div className="intakeFields">
                  <label>
                    Follow-up date
                    <input name="followUpDate" type="date" />
                  </label>
                  <label>
                    Follow-up time
                    <input name="followUpTime" type="time" />
                  </label>
                  <label className="wide">
                    Follow-up remarks
                    <textarea name="followUpRemarks" />
                  </label>
                  <label>
                    Appointment date
                    <input name="appointmentDate" type="date" />
                  </label>
                  <label>
                    Appointment time
                    <input name="appointmentTime" type="time" />
                  </label>
                  <label className="wide">
                    Appointment remarks
                    <textarea name="appointmentRemarks" />
                  </label>
                  <label className="wide">
                    Case remarks
                    <textarea name="remarks" />
                  </label>
                </div>
              </details>
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
              <label>
                File
                <input name="file" type="file" />
              </label>
              <label>
                Status
                <select name="documentStatus">
                  <option>Pending review</option>
                  <option>Verified</option>
                  <option>Client action</option>
                </select>
              </label>
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
        <footer>
          <button type="button" className="ghostButton" onClick={close}>
            Cancel
          </button>
          <button type="submit" className="primaryButton">
            <Check size={15} />
            Save complete record
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
    [quickOpen, setQuickOpen] = useState(false),
    [notifications, setNotifications] = useState(false);
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
    );
  const [identity, setIdentity] = useState<LiveIdentity | null>(null),
    [sessionReady, setSessionReady] = useState(false),
    [serviceMode, setServiceMode] = useStored<ServiceMode>(
      "maximus.serviceMode",
      "study",
    );
  const role = identity?.role || "staff",
    signedIn = Boolean(identity);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(t);
  }, [toast]);
  const say = (text: string) => setToast(text);
  const loadWorkspace = async () => {
    try {
      const response = await fetch("/api/crm/workspace", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Sign in is required.");
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
      setActive(roleConfig[result.identity.role as AppRole].modules[0]);
    } catch {
      setIdentity(null);
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
    setModal(x);
    setQuickOpen(false);
  };
  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!modal) return;
    const f = new FormData(e.currentTarget),
      payload = Object.fromEntries(
        Array.from(f.entries()).filter(
          ([, value]) => typeof value === "string",
        ),
      ) as Record<string, unknown>;
    payload.action = modal;
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
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "The record could not be saved.");
      setModal(null);
      setEditing(null);
      await loadWorkspace();
      say(`${modal[0].toUpperCase() + modal.slice(1)} saved to Supabase`);
    } catch (reason) {
      say(
        reason instanceof Error
          ? reason.message
          : "The record could not be saved.",
      );
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
  const education = cases.filter(
      (c) =>
        !c.type.toLowerCase().includes("visa") &&
        !c.type.toLowerCase().includes("migration"),
    ),
    visa = cases.filter(
      (c) =>
        c.type.toLowerCase().includes("visa") ||
        c.type.toLowerCase().includes("migration"),
    );
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
      <FinanceView items={invoices} openModal={open} setItems={syncInvoices} />
    );
  else if (active === "templates")
    content = (
      <TemplatesView
        items={templates}
        openModal={open}
        setItems={syncTemplates}
      />
    );
  else if (active === "workflows")
    content = (
      <WorkflowView
        items={workflows}
        openModal={open}
        setItems={setWorkflows}
      />
    );
  else if (active === "reports")
    content = (
      <ReportsView
        cases={serviceMode === "study" ? education : visa}
        invoices={invoices}
        exportData={exportData}
        openModal={open}
      />
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
        <FeatureCoverage />
      </>
    );
  else if (active === "integrations") content = <GoogleWorkspaceView />;
  else {
    const list =
      serviceMode === "direct_visa"
        ? visa
        : active === "visas"
          ? visa
          : active === "students"
            ? education
            : active === "defer"
              ? education.filter((c) => /defer/i.test(c.stage))
              : active === "case_complete"
                ? visa.filter((c) => c.status === "completed")
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
                  {tasks.some((t) => !t.completed) && <i />}
                </button>
                {notifications && (
                  <div className="smallPopover">
                    <strong>Notifications</strong>
                    <span>
                      {role === "client"
                        ? "Only your linked updates are shown"
                        : `${tasks.filter((t) => !t.completed).length} open tasks`}
                    </span>
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
        }}
        submit={save}
        cases={cases}
        editing={editing}
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
