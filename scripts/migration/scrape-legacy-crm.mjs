/**
 * Generic authenticated-crawl exporter for a legacy CRM you have real login
 * credentials for, run entirely on YOUR OWN machine against YOUR OWN data --
 * this repo's sandbox has no network access to reach it.
 *
 * It does not know anything about the old CRM's page structure. Instead it:
 *   1. Logs in with the credentials you provide.
 *   2. Starting from START_URL, follows every same-origin link it finds,
 *      breadth-first, up to MAX_PAGES.
 *   3. On every page, pulls out every <table>, every <dl> (definition list)
 *      and every label/input pair it can find, plus the raw visible text,
 *      and writes one JSON file per page.
 *   4. Downloads anything that looks like an attached file (pdf, doc, image,
 *      etc.) it finds a link to, into files/, and records what it downloaded.
 *
 * That gets you *something* usable on the very first run without me having
 * to guess the old CRM's exact markup. Once you've run it once, send me a
 * couple of the JSON files it produced (a student list page and a student
 * detail page) and I will write you a second, precise pass that maps the
 * exact fields into this CRM's import format instead of raw dumps.
 *
 * Usage:
 *   npx playwright install chromium   # once, if not already installed
 *   LEGACY_BASE_URL=https://staff.maximuseducation.com.au \
 *   LEGACY_LOGIN_URL=https://staff.maximuseducation.com.au/login \
 *   LEGACY_USERNAME=you@example.com \
 *   LEGACY_PASSWORD='...' \
 *   LEGACY_START_URL=https://staff.maximuseducation.com.au/students \
 *   node scripts/migration/scrape-legacy-crm.mjs
 *
 * All configuration is environment variables -- nothing is hardcoded, and
 * nothing is committed. Never put real credentials in a file that gets
 * committed to git.
 *
 * Optional overrides, if the generic guesses below don't find your login
 * form (inspect the login page and copy the real selectors):
 *   LEGACY_USERNAME_SELECTOR   default: tries email/username inputs
 *   LEGACY_PASSWORD_SELECTOR   default: input[type=password]
 *   LEGACY_SUBMIT_SELECTOR     default: tries common submit buttons
 *   LEGACY_MAX_PAGES           default: 500
 *   LEGACY_DELAY_MS            default: 500 (politeness delay between pages)
 *   LEGACY_HEADED=1            run with a visible browser window, useful
 *                              the first time to watch it log in and confirm
 *                              the selectors actually work
 *   LEGACY_OUT_DIR             default: ./legacy-export
 */
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const env = process.env;
const required = (name) => {
  const value = env[name];
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
};

const baseUrl = required("LEGACY_BASE_URL").replace(/\/$/, "");
const loginUrl = env.LEGACY_LOGIN_URL || `${baseUrl}/login`;
const username = required("LEGACY_USERNAME");
const password = required("LEGACY_PASSWORD");
const startUrl = env.LEGACY_START_URL || baseUrl;
const maxPages = Number(env.LEGACY_MAX_PAGES || 500);
const delayMs = Number(env.LEGACY_DELAY_MS || 500);
const headed = env.LEGACY_HEADED === "1";
const outDir = path.resolve(env.LEGACY_OUT_DIR || "./legacy-export");
const pagesDir = path.join(outDir, "pages");
const filesDir = path.join(outDir, "files");

const FILE_EXTENSIONS = /\.(pdf|docx?|xlsx?|csv|png|jpe?g|gif|webp|zip)(\?|$)/i;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function slugFor(url) {
  const { pathname, search } = new URL(url);
  const base = (pathname + search).replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 120) || "root";
  const hash = createHash("sha1").update(url).digest("hex").slice(0, 8);
  return `${base}_${hash}`;
}

/** Runs inside the page: pulls out everything a legacy CRM screen is likely
 * to render a record's fields as, without knowing this site's markup. */
function extractPageData() {
  const clean = (value) => (value || "").replace(/\s+/g, " ").trim();

  const tables = Array.from(document.querySelectorAll("table")).map((table) => {
    const headers = Array.from(table.querySelectorAll("thead th, tr:first-child th")).map((th) =>
      clean(th.textContent),
    );
    const rows = Array.from(table.querySelectorAll("tbody tr, tr")).map((row) =>
      Array.from(row.querySelectorAll("td")).map((td) => clean(td.textContent)),
    ).filter((row) => row.length > 0);
    return { headers, rows };
  });

  const definitionLists = Array.from(document.querySelectorAll("dl")).map((dl) => {
    const terms = Array.from(dl.querySelectorAll("dt")).map((dt) => clean(dt.textContent));
    const values = Array.from(dl.querySelectorAll("dd")).map((dd) => clean(dd.textContent));
    const pairs = {};
    terms.forEach((term, index) => {
      if (term) pairs[term] = values[index] ?? "";
    });
    return pairs;
  });

  // A label pointing at an input/select/textarea, or a label wrapping one --
  // the two most common ways a form field is actually marked up.
  const labelledFields = {};
  document.querySelectorAll("label").forEach((label) => {
    const text = clean(label.textContent);
    if (!text) return;
    let field = null;
    if (label.htmlFor) field = document.getElementById(label.htmlFor);
    if (!field) field = label.querySelector("input, select, textarea");
    if (!field) return;
    let value = "";
    if (field.tagName === "SELECT") {
      value = field.options[field.selectedIndex]?.text ?? "";
    } else if (field.type === "checkbox" || field.type === "radio") {
      value = field.checked ? "checked" : "unchecked";
    } else {
      value = field.value ?? "";
    }
    labelledFields[text] = clean(String(value));
  });

  const links = Array.from(document.querySelectorAll("a[href]")).map((a) => ({
    text: clean(a.textContent),
    href: a.href,
  }));

  return {
    title: document.title,
    url: location.href,
    tables,
    definitionLists,
    labelledFields,
    links,
    bodyText: clean(document.body.innerText).slice(0, 20000),
  };
}

async function login(page) {
  await page.goto(loginUrl, { waitUntil: "domcontentloaded" });

  const usernameSelector =
    env.LEGACY_USERNAME_SELECTOR ||
    'input[type="email"], input[name*="email" i], input[name*="user" i], input[id*="email" i], input[id*="user" i]';
  const passwordSelector = env.LEGACY_PASSWORD_SELECTOR || 'input[type="password"]';
  const submitSelector =
    env.LEGACY_SUBMIT_SELECTOR ||
    'button[type="submit"], input[type="submit"], button:has-text("Log in"), button:has-text("Sign in")';

  await page.locator(usernameSelector).first().fill(username);
  await page.locator(passwordSelector).first().fill(password);
  await Promise.all([
    page.waitForLoadState("networkidle").catch(() => undefined),
    page.locator(submitSelector).first().click(),
  ]);

  // Best-effort confirmation: the password field should be gone once signed
  // in. If it's still there, the selectors above probably need overriding.
  const stillOnLogin = await page.locator(passwordSelector).count();
  if (stillOnLogin > 0) {
    console.warn(
      "Warning: a password field is still visible after attempting login. " +
        "Login may have failed -- check LEGACY_USERNAME_SELECTOR / " +
        "LEGACY_PASSWORD_SELECTOR / LEGACY_SUBMIT_SELECTOR, or run with " +
        "LEGACY_HEADED=1 to watch it happen.",
    );
  }
}

async function downloadFile(context, url, referer) {
  try {
    const response = await context.request.get(url, { headers: { referer } });
    if (!response.ok()) return null;
    const buffer = await response.body();
    const name = slugFor(url) + path.extname(new URL(url).pathname);
    const target = path.join(filesDir, name);
    await writeFile(target, buffer);
    return { url, savedAs: path.relative(outDir, target), bytes: buffer.length };
  } catch (error) {
    console.warn(`Could not download ${url}: ${error.message}`);
    return null;
  }
}

async function main() {
  await mkdir(pagesDir, { recursive: true });
  await mkdir(filesDir, { recursive: true });

  const browser = await chromium.launch({ headless: !headed });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log(`Logging in as ${username} at ${loginUrl} ...`);
  await login(page);
  console.log("Login step complete, starting crawl.");

  const origin = new URL(baseUrl).origin;
  const visited = new Set();
  const downloaded = new Set();
  const queue = [startUrl];
  const manifest = [];
  const fileManifest = [];

  while (queue.length > 0 && visited.size < maxPages) {
    const url = queue.shift();
    const normalized = url.split("#")[0];
    if (visited.has(normalized)) continue;
    visited.add(normalized);

    try {
      await page.goto(normalized, { waitUntil: "domcontentloaded", timeout: 30000 });
    } catch (error) {
      console.warn(`Skipping ${normalized}: ${error.message}`);
      continue;
    }

    const data = await page.evaluate(extractPageData);
    const slug = slugFor(normalized);
    await writeFile(
      path.join(pagesDir, `${slug}.json`),
      JSON.stringify(data, null, 2),
    );
    manifest.push({ url: normalized, slug, title: data.title });
    console.log(`[${visited.size}/${maxPages}] saved ${normalized}`);

    for (const link of data.links) {
      let linkUrl;
      try {
        linkUrl = new URL(link.href);
      } catch {
        continue;
      }
      if (linkUrl.origin !== origin) continue;
      const clean = linkUrl.toString().split("#")[0];

      if (FILE_EXTENSIONS.test(linkUrl.pathname) && !downloaded.has(clean)) {
        downloaded.add(clean);
        const record = await downloadFile(context, clean, normalized);
        if (record) fileManifest.push(record);
        continue;
      }

      if (
        !visited.has(clean) &&
        !/logout|signout|sign-out|log-out/i.test(clean) &&
        !FILE_EXTENSIONS.test(linkUrl.pathname)
      ) {
        queue.push(clean);
      }
    }

    await sleep(delayMs);
  }

  await writeFile(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  await writeFile(path.join(outDir, "files-manifest.json"), JSON.stringify(fileManifest, null, 2));

  await browser.close();
  console.log(`\nDone. ${manifest.length} pages saved to ${pagesDir}`);
  console.log(`${fileManifest.length} files downloaded to ${filesDir}`);
  console.log(`Send me a couple of the page JSON files (one list page, one detail page) next.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
