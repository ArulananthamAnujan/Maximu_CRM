import { expect, test, type Page } from "@playwright/test";

/**
 * These drive a real browser against the built Worker, so they cover what the
 * API tests cannot: that the controls exist, the forms validate, the modal
 * submits, the case file opens and its tabs show what they claim to.
 *
 * Selectors prefer the form field's name or an accessible role, because those
 * are the parts a person actually depends on.
 */

const OWNER = "owner@maximus.test";
const OFFICER = "officer@maximus.test";
const CLIENT = "student@maximus.test";

async function signIn(page: Page, email: string) {
  await page.goto("/");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill("irrelevant");
  await page.getByRole("button", { name: /sign in securely/i }).click();
  await expect(page.locator(".appShell")).toBeVisible({ timeout: 25_000 });
}

/** Opens the Enquiries list and waits for it to be the screen on show. */
async function openEnquiries(page: Page) {
  await page.getByRole("button", { name: /^Enquiries$/ }).click();
  await expect(page.locator(".listPanel")).toBeVisible({ timeout: 25_000 });
}

/** Opens the enquiry form the way someone works: from the Enquiries list. */
async function openEnquiryForm(page: Page) {
  await openEnquiries(page);
  await page.locator(".listPanel").getByRole("button", { name: "Add new" }).click();
  await expect(page.locator(".recordModal")).toBeVisible();
}

/** The list row for a client, which is the whole clickable row, not the text. */
function caseRow(page: Page, name: string) {
  return page.locator(".richRow").filter({ hasText: name }).first();
}

test("the sign-in page renders its form", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator('input[name="email"]')).toBeVisible();
  await expect(page.locator('input[name="password"]')).toBeVisible();
  await expect(
    page.getByRole("button", { name: /sign in securely/i }),
  ).toBeVisible();
});

test("an unknown account is refused and stays on the sign-in page", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator('input[name="email"]').fill("nobody@maximus.test");
  await page.locator('input[name="password"]').fill("wrong");
  await page.getByRole("button", { name: /sign in securely/i }).click();
  await expect(page.locator(".loginError")).toBeVisible({ timeout: 25_000 });
  await expect(page.locator(".appShell")).toHaveCount(0);
});

test("an owner signs in and reaches the workspace", async ({ page }) => {
  await signIn(page, OWNER);
  await expect(page.getByRole("button", { name: /^Reports$/ })).toBeVisible();
});

test("the enquiry form will not submit without the required fields", async ({
  page,
}) => {
  await signIn(page, OFFICER);
  await openEnquiryForm(page);
  const modal = page.locator(".recordModal");
  await modal.locator('input[name="name"]').fill("E2E Incomplete");
  await modal.locator('input[name="phone"]').fill("+61400000111");
  await modal
    .getByRole("button", { name: /save|create/i })
    .first()
    .click();
  // The modal stays open and the browser marks the empty required field.
  await expect(modal).toBeVisible();
  await expect(modal.locator('input[name="email"]')).toHaveJSProperty(
    "validity.valueMissing",
    true,
  );
});

test("an enquiry is created and opens as a case file with its tabs", async ({
  page,
}) => {
  await signIn(page, OFFICER);
  await openEnquiryForm(page);
  const modal = page.locator(".recordModal");
  await modal.locator('input[name="name"]').fill("Browser Created Client");
  await modal.locator('input[name="email"]').fill("browser@example.test");
  await modal.locator('input[name="phone"]').fill("+61400000222");
  await modal.locator('input[name="visaExpiry"]').fill("2028-03-31");
  await modal
    .locator('select[name="matterType"]')
    .selectOption("Student visa");
  await modal
    .getByRole("button", { name: /save|create/i })
    .first()
    .click();
  await expect(modal).toHaveCount(0, { timeout: 25_000 });

  await openEnquiries(page);
  const row = caseRow(page, "Browser Created Client");
  await expect(row).toBeVisible({ timeout: 25_000 });
  await row.click();

  const drawer = page.locator(".caseDrawer");
  await expect(drawer).toBeVisible();
  for (const tab of [
    "Overview",
    "Client",
    "Family",
    "History",
    "Applications",
    "Visa matter",
    "Documents",
    "Timeline",
    "Finance",
  ])
    await expect(drawer.getByRole("tab", { name: tab })).toBeVisible();

  // Each tab shows its own content rather than one static panel.
  await drawer.getByRole("tab", { name: "Applications" }).click();
  await expect(
    drawer.getByRole("button", { name: /add application/i }),
  ).toBeVisible();
  await drawer.getByRole("tab", { name: "Timeline" }).click();
  await expect(drawer.getByPlaceholder(/record a call/i)).toBeVisible();
});

test("the pipeline control moves a case to the next stage", async ({ page }) => {
  await signIn(page, OFFICER);
  await openEnquiries(page);
  const row = caseRow(page, "Priya Sharma");
  await expect(row).toBeVisible({ timeout: 25_000 });
  await row.click();

  const drawer = page.locator(".caseDrawer");
  await expect(drawer).toBeVisible();
  await expect(drawer.locator(".lifecycleTrack li.current")).toHaveText(
    /enquiry/i,
  );
  await drawer.getByRole("button", { name: /move to student/i }).click();
  await expect(drawer).toHaveCount(0, { timeout: 25_000 });

  // It has left Enquiries and arrived in Students.
  await page.getByRole("button", { name: /^Students$/ }).click();
  await expect(caseRow(page, "Priya Sharma")).toBeVisible({ timeout: 25_000 });
});

test("a case officer is given no way into Accounts", async ({ page }) => {
  await signIn(page, OFFICER);
  // Invoicing is manager work, so the module is absent rather than empty.
  await expect(page.getByRole("button", { name: /^Accounts$/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Reports$/ })).toHaveCount(0);
});

test("a manager is offered invoice creation", async ({ page }) => {
  await signIn(page, OWNER);
  await page.getByRole("button", { name: /^Accounts$/ }).click();
  await expect(page.getByRole("button", { name: /new invoice/i })).toBeVisible({
    timeout: 25_000,
  });
});

// The workspace loads in two steps and the navigation works between them. It
// used to snap back to the landing screen when the second step finished, losing
// whatever had been opened in the meantime.
test("a screen opened straight after sign-in is not thrown away", async ({
  page,
}) => {
  await signIn(page, OWNER);
  await page.getByRole("button", { name: /^Reports$/ }).click();
  await expect(page.getByRole("heading", { name: /what falls due next/i }))
    .toBeVisible({ timeout: 25_000 });
  // Still there once every record has arrived.
  await page.waitForTimeout(3_000);
  await expect(
    page.getByRole("heading", { name: /what falls due next/i }),
  ).toBeVisible();
});

test("reporting renders the figures an agency acts on", async ({ page }) => {
  await signIn(page, OWNER);
  await page.getByRole("button", { name: /^Reports$/ }).click();
  await expect(page.getByText(/what falls due next/i)).toBeVisible({
    timeout: 25_000,
  });
  await expect(page.getByText(/enquiry conversion/i)).toBeVisible();
  await expect(page.getByText(/visa grant rate/i)).toBeVisible();
  await expect(
    page.getByText(/requests for further information overdue/i),
  ).toBeVisible();
});

test("the portal shows a client their own view and no staff tools", async ({
  page,
}) => {
  await signIn(page, CLIENT);
  await expect(
    page.getByRole("button", { name: /staff & masters/i }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Reports$/ })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /quick create/i }),
  ).toHaveCount(0);
});

test("the layout does not overflow on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, OFFICER);
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
