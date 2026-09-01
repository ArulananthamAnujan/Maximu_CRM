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
  await page
    .locator(".listPanel")
    .getByRole("button", { name: "Add new" })
    .click();
  await expect(page.locator(".recordModal")).toBeVisible();
}

/**
 * Creates an enquiry and leaves it in the Enquiries list. Tests that need a
 * case make their own: the database is shared across the run, so a case one
 * test moves down the pipeline is not where the next test left it.
 */
async function createEnquiry(
  page: Page,
  name: string,
  email: string,
  visaExpiry = "2028-09-30",
) {
  await openEnquiryForm(page);
  const modal = page.locator(".recordModal");
  await modal.locator('input[name="name"]').fill(name);
  await modal.locator('input[name="email"]').fill(email);
  await modal
    .locator('input[name="phone"]')
    .fill("+6140000" + (Date.now() % 10000));
  await modal.locator('input[name="visaExpiry"]').fill(visaExpiry);
  await modal.locator('select[name="matterType"]').selectOption("Student visa");
  await modal
    .getByRole("button", { name: /save|create/i })
    .first()
    .click();
  await expect(modal).toHaveCount(0, { timeout: 25_000 });
  await openEnquiries(page);
}

/** The list row for a client, which is the whole clickable row, not the text. */
function caseRow(page: Page, name: string) {
  return page.locator(".richRow").filter({ hasText: name }).first();
}

/**
 * Clicking a case row opens it in its own browser window (so an officer can
 * work several cases side by side), not inline on the board it was opened
 * from. Returns that window and its drawer.
 */
async function openCaseDrawer(page: Page, name: string) {
  const row = caseRow(page, name);
  await expect(row).toBeVisible({ timeout: 25_000 });
  const [popup] = await Promise.all([
    page.waitForEvent("popup"),
    row.click(),
  ]);
  await popup.waitForLoadState();
  const drawer = popup.locator(".caseDrawer");
  await expect(drawer).toBeVisible({ timeout: 25_000 });
  return { popup, drawer };
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
  await modal.locator('select[name="matterType"]').selectOption("Student visa");
  await modal
    .getByRole("button", { name: /save|create/i })
    .first()
    .click();
  await expect(modal).toHaveCount(0, { timeout: 25_000 });

  await openEnquiries(page);
  const { drawer } = await openCaseDrawer(page, "Browser Created Client");
  for (const tab of [
    "Case home",
    "Client details",
    "Family",
    "Background",
    "Applications",
    "Visa matter",
    "Documents",
    "Messages",
    "Activity & notes",
    "Finance",
  ])
    await expect(drawer.getByRole("tab", { name: tab })).toBeVisible();

  // Each tab shows its own content rather than one static panel.
  await drawer.getByRole("tab", { name: "Applications" }).click();
  await expect(
    drawer.getByRole("button", { name: /add application/i }),
  ).toBeVisible();
  await drawer.getByRole("tab", { name: "Activity & notes" }).click();
  await expect(drawer.getByPlaceholder(/record a call/i)).toBeVisible();
});

test("the pipeline control moves a case to the next stage", async ({
  page,
}) => {
  await signIn(page, OFFICER);
  await openEnquiries(page);
  const { drawer } = await openCaseDrawer(page, "Priya Sharma");
  await expect(drawer.locator(".lifecycleTrack li.current")).toHaveText(
    /enquiry/i,
  );
  await drawer.getByRole("button", { name: /move to student/i }).click();
  await expect(drawer.locator(".lifecycleTrack li.current")).toHaveText(
    /student/i,
    { timeout: 25_000 },
  );
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
  await expect(
    page.getByRole("heading", { name: /what falls due next/i }),
  ).toBeVisible({ timeout: 25_000 });
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
  await expect(page.getByRole("button", { name: /quick create/i })).toHaveCount(
    0,
  );
});

test("client appointment requests use portal wording and their own case", async ({
  page,
}) => {
  await signIn(page, CLIENT);
  await page.getByRole("button", { name: "Appointments", exact: true }).click();
  await page.getByRole("button", { name: /request appointment/i }).click();
  const modal = page.locator(".recordModal");
  await expect(
    modal.getByRole("heading", { name: "Request an appointment" }),
  ).toBeVisible();
  await expect(modal.getByText("Internal appointment")).toHaveCount(0);
  await expect(modal.getByText("Internal meeting")).toHaveCount(0);
  await expect(
    modal.getByRole("button", { name: "Send appointment request" }),
  ).toBeVisible();
  await expect(modal.locator('input[name="caseId"]')).toHaveValue(/.+/);
});

test("client messages go only to their Maximus case team", async ({ page }) => {
  await signIn(page, CLIENT);
  await page.getByRole("button", { name: "Messages", exact: true }).click();
  await page.getByRole("button", { name: /new message/i }).click();
  const modal = page.locator(".recordModal");
  await expect(
    modal.getByRole("heading", { name: "Message your case team" }),
  ).toBeVisible();
  await expect(modal.locator('input[name="to"]')).toHaveCount(0);
  await expect(modal.getByLabel("To")).toHaveValue("Your Maximus case team");
  await expect(modal.locator('input[name="caseId"]')).toHaveValue(/.+/);
  await expect(
    modal.getByRole("button", { name: "Send message" }),
  ).toBeVisible();
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

/* ------------------------------------------------------------------ *
 * Every role, checked on its own. Admin working well says nothing
 * about what a case officer or a client can reach.
 * ------------------------------------------------------------------ */

const MANAGER = "manager@maximus.test";

/** The navigation entries this account is actually offered. */
async function navEntries(page: Page) {
  return page
    .locator(".appShell nav button, .appShell aside button")
    .allInnerTexts();
}

test("a case officer is given no way into Accounts", async ({ page }) => {
  await signIn(page, OFFICER);
  // Invoicing and reporting are manager work, so the modules are absent
  // rather than present and empty.
  for (const absent of [
    /^Accounts$/,
    /^Reports$/,
    /staff & masters/i,
    /activity & compliance/i,
  ])
    await expect(page.getByRole("button", { name: absent })).toHaveCount(0);
  // What they do get.
  await expect(page.getByRole("button", { name: /^Enquiries$/ })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "File Manager", exact: true }),
  ).toBeVisible();
});

test("a branch manager gets the operations tools but not the organisation", async ({
  page,
}) => {
  await signIn(page, MANAGER);
  await expect(page.getByRole("button", { name: /^Accounts$/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Reports$/ })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /staff & masters/i }),
  ).toBeVisible();
  // Integrations is the organisation-wide screen, and belongs to the owner.
  await expect(
    page.getByRole("button", { name: /^Integrations$/ }),
  ).toHaveCount(0);
});

test("an owner gets the organisation screens as well", async ({ page }) => {
  await signIn(page, OWNER);
  await expect(
    page.getByRole("button", { name: /^Integrations$/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /staff & masters/i }),
  ).toBeVisible();
});

test("a client is offered none of the staff navigation", async ({ page }) => {
  await signIn(page, CLIENT);
  const entries = (await navEntries(page)).join(" | ").toLowerCase();
  for (const forbidden of [
    "enquiries",
    "students",
    "accounts",
    "reports",
    "staff & masters",
    "integrations",
    "activity & compliance",
    "templates",
  ])
    expect(entries).not.toContain(forbidden);
  await expect(page.getByRole("button", { name: /^Journey$/ })).toBeVisible();
});

/* ------------------------------------------------------------------ *
 * Deferral, now a stage of the pipeline rather than a guess from text.
 * ------------------------------------------------------------------ */

test("Defer is on the case pipeline and a case can be parked there", async ({
  page,
}) => {
  await signIn(page, OFFICER);
  await createEnquiry(page, "Parked Student", "parked.student@example.test");
  const { drawer } = await openCaseDrawer(page, "Parked Student");
  await expect(drawer.locator(".lifecycleTrack li")).toContainText([
    /enquiry/i,
    /student/i,
    /application/i,
    /visa/i,
    /deferred/i,
    /completed/i,
  ]);

  await drawer.getByRole("button", { name: /defer this case/i }).click();
  await expect(drawer.locator(".lifecycleTrack li.current")).toHaveText(
    /deferred/i,
    { timeout: 25_000 },
  );

  // And it resumes into whichever stage the work restarts at.
  await expect(
    drawer.getByRole("button", { name: /resume in student/i }),
  ).toBeVisible();
});

test("the visa expiry is asked for beside the move that needs it", async ({
  page,
}) => {
  await signIn(page, OFFICER);
  await openEnquiryForm(page);
  const modal = page.locator(".recordModal");
  await modal.locator('input[name="name"]').fill("Needs An Expiry");
  await modal.locator('input[name="email"]').fill("needs.expiry@example.test");
  await modal.locator('input[name="phone"]').fill("+61400000333");
  await modal.locator('input[name="visaExpiry"]').fill("2028-02-29");
  await modal.locator('select[name="matterType"]').selectOption("Student visa");
  await modal
    .getByRole("button", { name: /save|create/i })
    .first()
    .click();
  await expect(modal).toHaveCount(0, { timeout: 25_000 });

  await openEnquiries(page);
  const { drawer } = await openCaseDrawer(page, "Needs An Expiry");
  // This one has an expiry, so the requirement is not in the way.
  await expect(drawer.locator(".lifecycleBlocker")).toHaveCount(0);
  await expect(
    drawer.getByRole("button", { name: /move to visa/i }),
  ).toBeEnabled();
});

/* ------------------------------------------------------------------ *
 * Applications and visa matters as records.
 * ------------------------------------------------------------------ */

test("the Applications screen lists applications, not just cases", async ({
  page,
}) => {
  await signIn(page, OFFICER);
  await page.getByRole("button", { name: /^Applications$/ }).click();
  const board = page.locator(".boardTable").first();
  await expect(board).toBeVisible({ timeout: 25_000 });
  for (const column of [
    "Institution",
    "Course",
    "Intake",
    "Status",
    "Deadline",
  ])
    await expect(
      board.getByRole("columnheader", { name: column, exact: true }),
    ).toBeVisible();
  await expect(board.locator("tbody tr").first()).toBeVisible();
  // The cases at that stage are still reachable underneath.
  await expect(page.getByText(/cases at the application stage/i)).toBeVisible();
});

test("the Visa screen carries the columns an agent works from", async ({
  page,
}) => {
  await signIn(page, OFFICER);
  await page.getByRole("button", { name: /^Visa$/ }).click();
  const board = page.locator(".boardTable").first();
  await expect(board).toBeVisible({ timeout: 25_000 });
  for (const column of [
    "Subclass",
    "Destination",
    "Current visa",
    "Expiry",
    "Lodged",
    "TRN",
    "Agent",
    "MARN",
    "Status",
    "s56 due",
    "Outcome",
  ])
    await expect(
      board.getByRole("columnheader", { name: column, exact: true }),
    ).toBeVisible();
});

/* ------------------------------------------------------------------ *
 * Duplicate protection.
 * ------------------------------------------------------------------ */

test("entering somebody already on file is stopped and offers a choice", async ({
  page,
}) => {
  await signIn(page, OFFICER);
  await openEnquiryForm(page);
  const modal = page.locator(".recordModal");
  // Priya Sharma is seeded with this address.
  await modal.locator('input[name="name"]').fill("Priya Sharma");
  await modal.locator('input[name="email"]').fill("priya@example.test");
  await modal.locator('input[name="phone"]').fill("+61400999888");
  await modal.locator('input[name="visaExpiry"]').fill("2028-06-30");
  await modal.locator('select[name="matterType"]').selectOption("Student visa");
  await modal
    .getByRole("button", { name: /save|create/i })
    .first()
    .click();

  const gate = page.locator(".duplicateGate");
  await expect(gate).toBeVisible({ timeout: 25_000 });
  await expect(gate).toContainText(/matched on/i);
  await expect(
    gate.getByRole("button", { name: /open existing client/i }),
  ).toBeVisible();
  await expect(
    gate.getByRole("button", { name: /add another case to this client/i }),
  ).toBeVisible();
  await expect(
    gate.getByRole("button", { name: /genuinely different person/i }),
  ).toBeVisible();

  // Nothing has been created while the question is open.
  await expect(page.locator(".recordModal")).toBeVisible();

  await gate
    .getByRole("button", { name: /add another case to this client/i })
    .click();
  await expect(page.locator(".recordModal")).toHaveCount(0, {
    timeout: 25_000,
  });
});

/* ------------------------------------------------------------------ *
 * Housekeeping the reviewer found: hidden archives, real dates, real
 * integration status, named buttons, a drawer that fits a phone.
 * ------------------------------------------------------------------ */

test("no screen shows Invalid Date", async ({ page }) => {
  await signIn(page, OWNER);
  for (const screen of ["Messages", "File Manager", "Accounts", "Calendar"]) {
    await page
      .getByRole("button", { name: screen, exact: true })
      .first()
      .click();
    await expect(page.locator("body")).not.toContainText("Invalid Date");
  }
});

test("integration status is read from the server, not asserted", async ({
  page,
}) => {
  await signIn(page, OWNER);
  await page.getByRole("button", { name: /^Integrations$/ }).click();
  await expect(page.getByText(/integration status/i)).toBeVisible({
    timeout: 25_000,
  });
  // The Drive stub answers the probe, so it reports as connected here.
  await expect(page.locator(".integrationState.connected").first()).toBeVisible(
    {
      timeout: 25_000,
    },
  );
  // And what is absent is named as absent rather than as unconfigured.
  await expect(
    page.locator(".integrationState.not_built").first(),
  ).toBeVisible();
  await expect(page.getByText(/gmail sending/i)).toBeVisible();
});

/** Buttons a person can see but a screen reader would announce as nothing. */
async function unnamedButtons(page: Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("button"))
      .filter((button) => button.getClientRects().length > 0)
      .filter(
        (button) =>
          !(
            button.getAttribute("aria-label")?.trim() ||
            button.getAttribute("title")?.trim() ||
            (button as HTMLElement).innerText.trim()
          ),
      )
      .map((button) => button.outerHTML.slice(0, 120)),
  );
}

const NAMED_SCREENS = [
  "Enquiries",
  "Applications",
  "Visa",
  "Defer",
  "Accounts",
  "Reports",
  "File Manager",
  "Messages",
];

test("every button a person can press has a name", async ({ page }) => {
  await signIn(page, OWNER);
  for (const screen of NAMED_SCREENS) {
    await page.getByRole("button", { name: screen, exact: true }).click();
    expect(await unnamedButtons(page), `unnamed buttons on ${screen}`).toEqual(
      [],
    );
  }
});

// A label hidden by a media query leaves the button with no accessible name at
// all, which is how the service switch and the daily navigation lost theirs.
test("every button still has a name on a phone", async ({ page }) => {
  await signIn(page, OWNER);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const screen of NAMED_SCREENS) {
    await page.getByRole("button", { name: "Open case navigation" }).click();
    await page.getByRole("button", { name: screen, exact: true }).click();
    expect(
      await unnamedButtons(page),
      `unnamed buttons on ${screen} at 390px`,
    ).toEqual([]);
  }
});

test("the case drawer keeps four tabs on a phone and the rest under More", async ({
  page,
}) => {
  await signIn(page, OFFICER);
  await createEnquiry(page, "Phone Sized", "phone.sized@example.test");
  await page.setViewportSize({ width: 390, height: 844 });
  // On a phone the navigation is off-canvas until it is asked for.
  await page.getByRole("button", { name: "Open case navigation" }).click();
  await openEnquiries(page);
  const { popup, drawer } = await openCaseDrawer(page, "Phone Sized");
  // The case's own window starts at a desktop size; resize it the same way.
  await popup.setViewportSize({ width: 390, height: 844 });
  await expect(drawer.getByRole("tab")).toHaveCount(4);
  for (const tab of ["Case home", "Applications", "Documents", "Messages"])
    await expect(drawer.getByRole("tab", { name: tab })).toBeVisible();
  // The rest are one control away, and selecting one shows it.
  const more = drawer.getByLabel("More case sections");
  await expect(more).toBeVisible();
  await more.selectOption("timeline");
  await expect(drawer.getByRole("tab", { name: "Activity & notes" })).toBeVisible();
  await expect(drawer.getByPlaceholder(/record a call/i)).toBeVisible();
});

/* ------------------------------------------------------------------ *
 * Adding somebody to the team, which the screen never used to do.
 * ------------------------------------------------------------------ */

test("the staff screen shows the team rather than role artwork", async ({
  page,
}) => {
  await signIn(page, OWNER);
  await page.getByRole("button", { name: /staff & masters/i }).click();
  await expect(page.getByText(/staff accounts/i)).toBeVisible({
    timeout: 25_000,
  });
  const table = page.locator(".boardTable").first();
  await expect(table).toBeVisible();
  for (const column of ["Name", "Email", "Level", "Branch", "Status"])
    await expect(
      table.getByRole("columnheader", { name: column, exact: true }),
    ).toBeVisible();
  // The people who are actually in the database.
  await expect(table).toContainText("owner@maximus.test");
  await expect(table).toContainText("officer@maximus.test");
});

test("an owner creates a staff account and is given the password to hand over", async ({
  page,
}) => {
  await signIn(page, OWNER);
  await page.getByRole("button", { name: /staff & masters/i }).click();
  await page.getByRole("button", { name: /add staff member/i }).click();

  const form = page.locator(".stackedForm");
  await form.locator('input[name="displayName"]').fill("Browser Made Officer");
  await form
    .locator('input[name="email"]')
    .fill("browser.officer@maximus.test");
  await form.locator('select[name="level"]').selectOption("staff");
  await form.locator('input[name="department"]').fill("Admissions");
  await form.getByRole("button", { name: /create staff account/i }).click();

  const handover = page.locator(".handoverPanel");
  await expect(handover).toBeVisible({ timeout: 25_000 });
  await expect(handover.locator("code")).not.toBeEmpty();
  await expect(page.locator(".boardTable").first()).toContainText(
    "browser.officer@maximus.test",
  );
});

test("a branch manager is not offered administrator levels", async ({
  page,
}) => {
  await signIn(page, MANAGER);
  await page.getByRole("button", { name: /staff & masters/i }).click();
  await page.getByRole("button", { name: /add staff member/i }).click();
  const levels = await page
    .locator('.stackedForm select[name="level"] option')
    .allInnerTexts();
  expect(levels.join(" | ").toLowerCase()).not.toContain("super admin");
  expect(levels.join(" | ").toLowerCase()).not.toContain("branch manager");
  expect(levels.join(" | ").toLowerCase()).toContain("staff");
});

test("a staff account can be deactivated and brought back", async ({
  page,
}) => {
  await signIn(page, OWNER);
  await page.getByRole("button", { name: /staff & masters/i }).click();
  // The status filter defaults to Active, which would hide this row the
  // moment it is deactivated -- widen it first so the row stays visible
  // through both halves of the test.
  await page.getByLabel("Status").selectOption("all");
  const row = page
    .locator(".boardTable tbody tr")
    .filter({ hasText: "colombo@maximus.test" })
    .first();
  await expect(row).toBeVisible({ timeout: 25_000 });
  await row.getByRole("button", { name: /deactivate/i }).click();
  await expect(row).toContainText("Deactivated", { timeout: 25_000 });
  await row.getByRole("button", { name: /reactivate/i }).click();
  await expect(row).toContainText("Active", { timeout: 25_000 });
});

test("a branch can be added from the masters screen", async ({ page }) => {
  await signIn(page, OWNER);
  await page.getByRole("button", { name: /staff & masters/i }).click();
  await page.getByRole("button", { name: /add branch/i }).click();
  const form = page.locator(".stackedForm");
  await form.locator('input[name="name"]').fill("Kandy");
  await form.locator('input[name="code"]').fill("KAN");
  await form.locator('input[name="countryCode"]').fill("LK");
  await form.getByRole("button", { name: /^Add branch$/ }).click();
  await expect(page.getByText("Kandy (KAN)")).toBeVisible({ timeout: 25_000 });
});

/* ------------------------------------------------------------------ *
 * What each role may actually do, not only what they can see.
 * ------------------------------------------------------------------ */

const COLLEAGUE = "second.officer@maximus.test";

test("a case officer sees a colleague's case but cannot change it", async ({
  page,
}) => {
  await signIn(page, COLLEAGUE);
  await openEnquiries(page);
  // Visible, because cover and handover depend on it.
  const { drawer } = await openCaseDrawer(page, "Priya Sharma");
  // The database would refuse a write here regardless, but the controls
  // themselves say so up front rather than letting somebody click into a
  // rejection: disabled, with the same explanation the database would give.
  const moveButton = drawer.getByRole("button", { name: /move to student/i });
  await expect(moveButton).toBeDisabled();
  await expect(moveButton).toHaveAttribute(
    "title",
    /assigned to somebody else/i,
  );
  const editButton = drawer.getByRole("button", { name: /^edit$/i });
  await expect(editButton).toBeDisabled();
  // Finance is not merely empty on a case that isn't theirs -- the tab itself
  // is not offered.
  await expect(drawer.getByRole("tab", { name: /finance/i })).toHaveCount(0);
  // Archiving is still offered, but as the request it actually is.
  await expect(
    drawer.getByRole("button", { name: /request archive/i }),
  ).toBeVisible();
});

test("a case officer's ledger holds no commission invoices", async ({
  page,
}) => {
  await signIn(page, OFFICER);
  // Accounts is manager-only, so a case officer has no ledger screen at all.
  await expect(page.getByRole("button", { name: /^Accounts$/ })).toHaveCount(0);
  const body = await page.locator("body").innerText();
  expect(body.toLowerCase()).not.toContain("commission");
});

test("the client portal never uses internal finance language", async ({
  page,
}) => {
  await signIn(page, CLIENT);
  for (const screen of ["Invoices", "Messages", "Documents", "Journey"]) {
    await page.getByRole("button", { name: screen, exact: true }).click();
    const body = (await page.locator("body").innerText()).toLowerCase();
    for (const forbidden of [
      "commission",
      "partner claim",
      "drafts",
      "client_user_links",
      "supabase",
    ])
      expect(
        body,
        `${forbidden} on the client's ${screen} screen`,
      ).not.toContain(forbidden);
  }
});

test("the client invoices screen shows paid and outstanding", async ({
  page,
}) => {
  await signIn(page, CLIENT);
  await page.getByRole("button", { name: "Invoices", exact: true }).click();
  await expect(page.getByText(/^Invoiced$/)).toBeVisible({ timeout: 25_000 });
  await expect(page.getByText(/^Paid$/)).toBeVisible();
  await expect(page.getByText(/^Outstanding$/)).toBeVisible();
});

test("an administrator can connect a portal login to a client file", async ({
  page,
}) => {
  await signIn(page, OWNER);
  await page.getByRole("button", { name: /staff & masters/i }).click();
  await expect(page.getByText(/portal logins/i)).toBeVisible({
    timeout: 25_000,
  });
  const link = page.getByLabel(/client record for/i).first();
  await expect(link).toBeVisible();
  const options = await link.locator("option").allInnerTexts();
  expect(options.join(" | ")).toContain("Priya Sharma");
});

test("integration status names the production settings still to do", async ({
  page,
}) => {
  await signIn(page, OWNER);
  await page.getByRole("button", { name: /^Integrations$/ }).click();
  await expect(page.getByText(/passport encryption/i)).toBeVisible({
    timeout: 25_000,
  });
  await expect(page.getByText(/record retention/i)).toBeVisible();
  await expect(page.getByText(/creating staff logins/i)).toBeVisible();
});
