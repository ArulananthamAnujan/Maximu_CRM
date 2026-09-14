import { expect, test, type Page } from "@playwright/test";

async function crm(page: Page, role = "staff", records: Record<string, unknown>[] = []) {
  let signedIn = false;
  const identity = { profileId: "11111111-1111-4111-8111-111111111111", organisationId: "22222222-2222-4222-8222-222222222222",
    branchId: "33333333-3333-4333-8333-333333333333", displayName: "Test Staff", email: "staff@example.test", sourceLevel: role === "client" ? "student" : "staff", role };
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    const fulfill = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/api/auth/login") { signedIn = true; return fulfill({ ok: true, next: "/api/auth/gmail/start?workspace=1&auto=1" }); }
    if (path === "/api/auth/logout") { signedIn = false; return fulfill({ ok: true }); }
    if (path === "/api/auth/session") return fulfill({ authenticated: signedIn, identity: signedIn ? identity : undefined }, signedIn ? 200 : 401);
    if (!signedIn) return fulfill({ error: "Sign in is required." }, 401);
    if (path === "/api/crm/workspace") return fulfill({ identity, cases: [], tasks: [], appointments: [], documents: [], messages: [], invoices: [], branches: [], profiles: [], roles: [], templates: [], workflows: [], audits: [], capabilities: {} });
    if (path === "/api/crm/enquiries") return fulfill({ records, count: records.length, offset: 0, limit: 50, filters: { branches: [], destinations: [], owners: [] } });
    if (path === "/api/crm/workspace-connection") return fulfill({ email: identity.email, gmail: true, calendar: true, drive: true, ai: false, oauthConfigured: true });
    return fulfill({ records: [], notifications: [], templates: [], items: [] });
  });
  await page.goto("/");
  await page.locator('input[name="email"]').fill(identity.email);
  await page.locator('input[name="password"]').fill("example-password-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible();
}

test("password login opens the bundled CRM without redirecting it to Gmail", async ({ page }) => {
  await crm(page);
  await expect(page).toHaveURL("http://127.0.0.1:4173/");
  await expect(page.getByRole("heading", { name: /Good afternoon/ })).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Mobile navigation" });
  await nav.getByRole("button", { name: "Cases", exact: true }).click();
  await expect(nav.getByRole("button", { name: "Cases" })).toHaveAttribute("aria-current", "page");
  await page.evaluate(() => window.dispatchEvent(new Event("maximus:back")));
  await expect(nav.getByRole("button", { name: "Home", exact: true })).toHaveAttribute("aria-current", "page");
  await page.screenshot({ path: "test-results/mobile-dashboard.png", fullPage: true });
  await nav.getByRole("button", { name: "More", exact: true }).click();
  await page.locator(".mobileMenuAccount").getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
});

test("client accounts get their own mobile navigation", async ({ page }) => {
  await crm(page, "client");
  const nav = page.getByRole("navigation", { name: "Mobile navigation" });
  await expect(nav.getByRole("button", { name: "My account" })).toBeVisible();
  await expect(nav.getByRole("button", { name: "Cases", exact: true })).toHaveCount(0);
});

test("offline and permission failures are visible and dismissible", async ({ page }) => {
  await crm(page);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("maximus:network", { detail: false })));
  await expect(page.getByText("You’re offline", { exact: true })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("maximus:mobile-error", { detail: "Camera permission was declined." })));
  await expect(page.getByRole("alert").filter({ hasText: "Camera permission" })).toBeVisible();
  await page.getByRole("button", { name: "Dismiss", exact: true }).click();
  await expect(page.getByText("Camera permission was declined.")).toHaveCount(0);
});

test("phone login remains within the viewport", async ({ page }) => {
  await page.route("**/api/**", route => route.fulfill({ status: 401, contentType: "application/json", body: '{"authenticated":false}' }));
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
  await page.screenshot({ path: "test-results/mobile-login.png", fullPage: true });
});

test("case records keep notes and actions readable on a phone", async ({ page }) => {
  await crm(page, "staff", [{ dbId: "44444444-4444-4444-8444-444444444444", id: "M-TEST-001", name: "Sample Student",
    email: "student@example.test", phone: "+61 400 000 000", type: "Study Abroad", serviceType: "study_abroad", matterType: "Student visa",
    target: "Master of Information Technology", stage: "Enquiry", owner: "Test Staff", ownerId: "11111111-1111-4111-8111-111111111111",
    branch: "Melbourne", due: "", health: "healthy", progress: 10, status: "active", lifecycleStage: "enquiry", visaExpiry: "",
    deferredApplications: 0, completedAt: "", reopenedAt: "", createdAt: "2026-09-01", destinationCountry: "Australia", intake: "2027",
    source: "Website", campaign: "", priority: "normal", passportMasked: "", partner: "", documentSummary: "Documents requested",
    deferReason: "", leadScore: 50, lostReason: "", applicationStatus: "", visaCategory: "", latestNote: "Follow up about the course shortlist.",
    latestNoteAt: "2026-09-14", latestNoteAuthor: "Test Staff" }]);
  await page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("button", { name: "Cases", exact: true }).click();
  await expect(page.getByText("Sample Student", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Show filters" })).toBeVisible();
  await expect(page.getByText("Follow up about the course shortlist.", { exact: true })).toBeVisible();
  const cards = page.locator('.journeyDataRow');
  expect((await cards.boundingBox())!.width).toBeLessThanOrEqual(390);
  await page.getByText("Follow up about the course shortlist.", { exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByText("Follow up about the course shortlist.", { exact: true })).toBeInViewport();
  await page.screenshot({ path: "test-results/mobile-cases.png", fullPage: true });
});
