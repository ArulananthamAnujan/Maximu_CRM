import {
  appendRefreshCookies,
  LiveAccessError,
  liveSession,
} from "@/server/supabase-session";
import { SupabaseError, supabaseRequest } from "@/server/supabase";

export const dynamic = "force-dynamic";
type Row = Record<string, unknown>;

/**
 * The numbers an agency is actually run on: how enquiries convert, how
 * applications and visas are progressing, what is about to fall due, and where
 * the money and the workload sit.
 *
 * Row-level security scopes every read, so a branch manager's report covers
 * their branch and an owner's covers the organisation without this code
 * filtering by branch itself.
 */
export async function GET(request: Request) {
  try {
    const session = await liveSession(request);
    if (session.identity.role === "client")
      throw new LiveAccessError(403, "Reporting is available to staff only.");
    const token = session.accessToken;

    const [cases, applications, visas, tasks, documents, invoices, profiles, branches] =
      await Promise.all([
        rest("cases?select=id,branch_id,owner_id,service_type,matter_type,lifecycle_stage,health,opened_at,closed_at,due_at,visa_expiry_on&limit=5000", token),
        rest("education_applications?select=id,case_id,status,submitted_at,offer_received_at,coe_received_at,deadline_at,archived_at&limit=5000", token),
        rest("visa_matters?select=id,case_id,status,outcome,lodged_at,decision_at,information_due_at,information_provided_at,current_visa_expiry&limit=5000", token),
        rest("tasks?select=id,status,due_at,assigned_to&limit=5000", token),
        rest("documents?select=id,state,created_at,case_id&limit=5000", token),
        rest("invoices?select=id,state,total,paid,currency,due_on&limit=5000", token),
        rest("profiles?select=id,display_name,branch_id,level,active&active=eq.true&limit=500", token),
        rest("branches?select=id,name,code&limit=200", token),
      ]);

    const now = Date.now();
    const days = (value: unknown): number | null => {
      if (typeof value !== "string" || !value) return null;
      const at = Date.parse(value);
      return Number.isNaN(at) ? null : Math.round((at - now) / 86_400_000);
    };
    const within = (value: unknown, upper: number, lower = 0) => {
      const remaining = days(value);
      return remaining !== null && remaining >= lower && remaining <= upper;
    };
    const overdue = (value: unknown) => {
      const remaining = days(value);
      return remaining !== null && remaining < 0;
    };
    const rate = (part: number, whole: number) =>
      whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;

    const liveApplications = applications.filter((row) => !row.archived_at);
    const openCases = cases.filter((row) => row.lifecycle_stage !== "completed");

    // A case still sitting at "enquiry" has not converted yet.
    const converted = cases.filter((row) => row.lifecycle_stage !== "enquiry").length;
    const submitted = liveApplications.filter((row) => row.submitted_at).length;
    const deferred = liveApplications.filter((row) => row.status === "deferred").length;
    const offers = liveApplications.filter((row) => row.offer_received_at).length;
    const coes = liveApplications.filter((row) => row.coe_received_at).length;
    const lodged = visas.filter((row) => row.lodged_at).length;
    const granted = visas.filter((row) => /grant|approv/i.test(String(row.outcome ?? ""))).length;
    const refused = visas.filter((row) => /refus|reject|decline/i.test(String(row.outcome ?? ""))).length;

    const displayName = new Map(
      profiles.map((row) => [String(row.id), String(row.display_name ?? "")]),
    );
    const branchLabel = new Map(
      branches.map((row) => [String(row.id), String(row.name ?? "")]),
    );

    const report = {
      pipeline: {
        total: cases.length,
        open: openCases.length,
        byStage: tally(cases, "lifecycle_stage"),
        byStream: tally(cases, "service_type"),
        byMatter: tally(cases, "matter_type"),
        byHealth: tally(openCases, "health"),
      },
      conversion: {
        enquiries: cases.length,
        converted,
        conversionRate: rate(converted, cases.length),
        applicationsSubmitted: submitted,
        offers,
        offerRate: rate(offers, submitted),
        coes,
        coeRate: rate(coes, offers),
        deferred,
        deferralRate: rate(deferred, submitted),
      },
      visas: {
        matters: visas.length,
        lodged,
        granted,
        refused,
        grantRate: rate(granted, granted + refused),
        awaitingDecision: visas.filter((row) => row.lodged_at && !row.decision_at).length,
      },
      deadlines: {
        // A s56 request for further information ends the application if it is
        // not answered, so it leads the list.
        informationRequests: visas
          .filter((row) => row.information_due_at && !row.information_provided_at)
          .map((row) => ({
            caseId: row.case_id,
            dueAt: row.information_due_at,
            daysRemaining: days(row.information_due_at),
          }))
          .sort((a, b) => (a.daysRemaining ?? 0) - (b.daysRemaining ?? 0))
          .slice(0, 50),
        informationOverdue: visas.filter(
          (row) =>
            row.information_due_at &&
            !row.information_provided_at &&
            overdue(row.information_due_at),
        ).length,
        visaExpiry: {
          in30: cases.filter((row) => within(row.visa_expiry_on, 30)).length,
          in60: cases.filter((row) => within(row.visa_expiry_on, 60, 31)).length,
          in90: cases.filter((row) => within(row.visa_expiry_on, 90, 61)).length,
          expired: cases.filter(
            (row) => row.lifecycle_stage !== "completed" && overdue(row.visa_expiry_on),
          ).length,
        },
        applicationDeadlines: liveApplications.filter((row) => within(row.deadline_at, 30)).length,
        overdueTasks: tasks.filter((row) => row.status !== "completed" && overdue(row.due_at)).length,
        documentsOutstanding: documents.filter((row) => row.state === "requested").length,
        casesPastDue: openCases.filter((row) => overdue(row.due_at)).length,
      },
      workload: profiles
        .filter((row) => row.level !== "student")
        .map((row) => {
          const id = String(row.id);
          const owned = openCases.filter((item) => String(item.owner_id) === id);
          return {
            staffId: id,
            name: displayName.get(id) ?? "",
            branch: branchLabel.get(String(row.branch_id)) ?? "",
            openCases: owned.length,
            needingAttention: owned.filter((item) => item.health !== "healthy").length,
            openTasks: tasks.filter(
              (task) => String(task.assigned_to) === id && task.status !== "completed",
            ).length,
            overdueTasks: tasks.filter(
              (task) =>
                String(task.assigned_to) === id &&
                task.status !== "completed" &&
                overdue(task.due_at),
            ).length,
          };
        })
        .sort((a, b) => b.openCases - a.openCases),
      branches: branches.map((row) => {
        const id = String(row.id);
        const branchCases = cases.filter((item) => String(item.branch_id) === id);
        return {
          branchId: id,
          name: String(row.name ?? ""),
          cases: branchCases.length,
          open: branchCases.filter((item) => item.lifecycle_stage !== "completed").length,
          completed: branchCases.filter((item) => item.lifecycle_stage === "completed").length,
        };
      }),
      finance: {
        invoiced: sum(invoices, "total"),
        collected: sum(invoices, "paid"),
        outstanding:
          Math.round((sum(invoices, "total") - sum(invoices, "paid")) * 100) / 100,
        overdueInvoices: invoices.filter(
          (row) => row.state !== "paid" && row.state !== "void" && overdue(row.due_on),
        ).length,
        byState: tally(invoices, "state"),
      },
      generatedAt: new Date().toISOString(),
    };

    return appendRefreshCookies(
      Response.json({ ok: true, report }),
      session.refreshed,
      request,
    );
  } catch (error) {
    return apiError(error);
  }
}

function tally(rows: Row[], key: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const value = row[key];
    const label = value == null || value === "" ? "unset" : String(value);
    counts[label] = (counts[label] ?? 0) + 1;
  }
  return counts;
}
function sum(rows: Row[], key: string): number {
  return (
    Math.round(rows.reduce((total, row) => total + Number(row[key] ?? 0), 0) * 100) / 100
  );
}
async function rest(query: string, token: string): Promise<Row[]> {
  try {
    return await supabaseRequest<Row[]>(`/rest/v1/${query}`, { method: "GET" }, token);
  } catch (error) {
    // One unavailable dataset should narrow the report, not remove it.
    console.error(`Report dataset unavailable: ${query.split("?")[0]}`, error);
    return [];
  }
}
function apiError(error: unknown): Response {
  if (error instanceof LiveAccessError)
    return Response.json({ ok: false, error: error.message }, { status: error.status });
  if (error instanceof SupabaseError)
    return Response.json({ ok: false, error: "The report could not be built." }, { status: 503 });
  console.error(error);
  return Response.json({ ok: false, error: "The report could not be built." }, { status: 500 });
}
