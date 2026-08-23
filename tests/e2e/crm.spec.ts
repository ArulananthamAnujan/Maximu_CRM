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

test("the pipeline control moves a case to the next stage", async ({
  page,
}) => {
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
  const row = caseRow(page, "Parked Student");
  await expect(row).toBeVisible({ timeout: 25_000 });
  await row.click();

  const drawer = page.locator(".caseDrawer");
  await expect(drawer.locator(".lifecycleTrack li")).toContainText([
    /enquiry/i,
    /student/i,
    /application/i,
    /visa/i,
    /deferred/i,
    /completed/i,
  ]);

  await drawer.getByRole("button", { name: /defer this case/i }).click();
  await expect(drawer).toHaveCount(0, { timeout: 25_000 });

  await page.getByRole("button", { name: /^Defer$/ }).click();
  await expect(caseRow(page, "Parked Student")).toBeVisible({
    timeout: 25_000,
  });

  // And it resumes into whichever stage the work restarts at.
  await caseRow(page, "Parked Student").click();
  await expect(page.locator(".lifecycleTrack li.current")).toHaveText(
    /deferred/i,
  );
  await expect(
    page.getByRole("button", { name: /resume in student/i }),
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
  await caseRow(page, "Needs An Expiry").click();
  const drawer = page.locator(".caseDrawer");
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
  await caseRow(page, "Phone Sized").click();
  const drawer = page.locator(".caseDrawer");
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("tab")).toHaveCount(4);
  for (const tab of ["Overview", "Applications", "Documents", "Finance"])
    await expect(drawer.getByRole("tab", { name: tab })).toBeVisible();
  // The rest are one control away, and selecting one shows it.
  const more = drawer.getByLabel("More case sections");
  await expect(more).toBeVisible();
  await more.selectOption("timeline");
  await expect(drawer.getByRole("tab", { name: "Timeline" })).toBeVisible();
  await expect(drawer.getByPlaceholder(/record a call/i)).toBeVisible();
});
