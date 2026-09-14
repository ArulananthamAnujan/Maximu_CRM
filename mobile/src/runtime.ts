import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { ActionSheet, ActionSheetButtonStyle } from "@capacitor/action-sheet";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { Network } from "@capacitor/network";
import { Haptics } from "@capacitor/haptics";
import { SplashScreen } from "@capacitor/splash-screen";
import { reportMobileError } from "../../lib/mobile-platform";
import { apiTarget, AUTH_REDIRECT, CRM_ORIGIN, createProofKey, MAX_FILE_BYTES, safeFilename, validAuthCallback, WORKSPACE_REDIRECT } from "./policy";

const PROOF_KEY = "maximus-mobile-pkce";
type AuthConfig = { url: string; publishableKey: string };
let oauthBusy = false;
let shareQueue = Promise.resolve();

async function authConfig(): Promise<AuthConfig> {
  const response = await fetch("/api/mobile/config", { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Google sign-in is not available yet.");
  const url = new URL(body.url);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".supabase.co") || url.username || url.password || !body.publishableKey) {
    throw new Error("The sign-in configuration is invalid.");
  }
  return { url: url.origin, publishableKey: body.publishableKey };
}

async function signInWithGoogle() {
  if (!Capacitor.isNativePlatform()) throw new Error("Use an Android or iPhone build to test Google sign-in.");
  const config = await authConfig();
  const proof = await createProofKey();
  // Only the short-lived PKCE verifier is held here; CRM tokens remain in native HTTP cookies.
  sessionStorage.setItem(PROOF_KEY, JSON.stringify({ ...proof, createdAt: Date.now() }));
  const url = new URL(`${config.url}/auth/v1/authorize`);
  url.searchParams.set("provider", "google");
  url.searchParams.set("redirect_to", AUTH_REDIRECT);
  url.searchParams.set("code_challenge", proof.challenge);
  url.searchParams.set("code_challenge_method", "s256");
  await Browser.open({ url: url.toString(), presentationStyle: "fullscreen" });
}

async function completeGoogleSignIn(value: string) {
  if (!validAuthCallback(value) || oauthBusy) return;
  const stored = sessionStorage.getItem(PROOF_KEY);
  if (!stored) throw new Error("This sign-in has expired. Start Google sign-in again.");
  const proof = JSON.parse(stored) as { verifier: string; createdAt: number };
  if (Date.now() - proof.createdAt > 10 * 60_000 || !/^[A-Za-z0-9_-]{43}$/.test(proof.verifier)) {
    sessionStorage.removeItem(PROOF_KEY);
    throw new Error("This sign-in has expired. Start Google sign-in again.");
  }
  const url = new URL(value);
  const code = url.searchParams.get("code");
  if (!code || url.searchParams.has("error")) {
    sessionStorage.removeItem(PROOF_KEY);
    throw new Error("Google sign-in was cancelled. You can try again or use your password.");
  }
  oauthBusy = true;
  try {
    const config = await authConfig();
    const result = await CapacitorHttp.post({
      url: `${config.url}/auth/v1/token?grant_type=pkce`,
      headers: { apikey: config.publishableKey, "Content-Type": "application/json" },
      data: { auth_code: code, code_verifier: proof.verifier },
      connectTimeout: 15_000, readTimeout: 30_000,
    });
    sessionStorage.removeItem(PROOF_KEY);
    if (result.status !== 200 || !result.data.access_token || !result.data.refresh_token) {
      throw new Error("Google sign-in could not be verified. Please start again.");
    }
    const session = await fetch("/api/auth/google/callback", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: result.data.access_token, refresh_token: result.data.refresh_token,
        expires_in: result.data.expires_in, token_type: result.data.token_type }),
    });
    const body = await session.json();
    if (!session.ok) throw new Error(body.error || "Your CRM account could not be verified.");
    await Browser.close().catch(() => undefined);
    window.location.replace("/");
  } finally { oauthBusy = false; }
}

async function connectWorkspace() {
  const response = await fetch("/api/auth/session", { cache: "no-store" });
  const body = await response.json();
  if (!response.ok || !body.identity?.profileId) throw new Error("Sign in before connecting Google Workspace.");
  // The browser signs in independently. No CRM cookie or token is put in a URL.
  await Browser.open({ url: `${CRM_ORIGIN}/mobile/workspace#profile=${encodeURIComponent(body.identity.profileId)}` });
}

async function saveFileNow(blob: Blob, filename: string) {
  if (blob.size > MAX_FILE_BYTES) throw new Error("Use the CRM website to download files larger than 25 MB.");
  if (!Capacitor.isNativePlatform()) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = filename; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("The file could not be prepared."));
    reader.readAsDataURL(blob);
  });
  const folder = `maximus-share/${Date.now()}-${crypto.randomUUID()}`;
  const path = `${folder}/${safeFilename(filename)}`;
  const result = await Filesystem.writeFile({ directory: Directory.Cache, path, data, recursive: true });
  try { await Share.share({ title: filename, files: [result.uri], dialogTitle: "Save or share document" }); }
  catch (error) {
    // Cancellation is a normal end to a share sheet, not a failed CRM write.
    if (!/cancel|dismiss/i.test(String(error))) throw error;
  }
  // Android resolves its chooser before another app has necessarily read the file.
  // Leave the private cache entry available; prune old entries on the next launch.
}

function saveFile(blob: Blob, filename: string) {
  const next = shareQueue.then(() => saveFileNow(blob, filename));
  shareQueue = next.catch(() => undefined);
  return next;
}

async function downloadDocument(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || "The document could not be downloaded.");
  }
  const disposition = response.headers.get("content-disposition") || "";
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  let filename = disposition.match(/filename="([^"]+)"/i)?.[1] || "maximus-document";
  if (encoded) { try { filename = decodeURIComponent(encoded); } catch { /* use plain filename */ } }
  await saveFile(await response.blob(), filename);
}

function installTransport() {
  // Capacitor's patched fetch preserves FormData and native HttpOnly session cookies.
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = input instanceof Request ? input.url : String(input);
    const target = apiTarget(raw, window.location.origin);
    if (!target) return nativeFetch(input, init);
    if (!(input instanceof Request)) return nativeFetch(target, { ...init, credentials: "include" });
    const original = new Request(input, init);
    return nativeFetch(target, {
      method: original.method, headers: original.headers, signal: original.signal,
      credentials: "include", cache: original.cache,
      body: ["GET", "HEAD"].includes(original.method) ? undefined : await original.blob(),
    });
  };
}

async function choosePhoto(input: HTMLInputElement) {
  const choice = await ActionSheet.showActions({ title: "Add a document", options: [
    { title: "Take a photo" }, { title: "Choose a file" }, { title: "Cancel", style: ActionSheetButtonStyle.Cancel },
  ] });
  if (choice.index === 1) {
    input.dataset.nativeFilePicker = "1";
    input.click();
    delete input.dataset.nativeFilePicker;
  }
  if (choice.index !== 0) return;
  let photo;
  try { photo = await Camera.getPhoto({ source: CameraSource.Camera, resultType: CameraResultType.Uri,
    quality: 85, width: 2200, correctOrientation: true, saveToGallery: false }); }
  catch (error) { if (/cancel/i.test(String(error))) return; throw error; }
  if (!photo.webPath) throw new Error("The photo could not be opened.");
  const blob = await (await fetch(photo.webPath)).blob();
  const files = new DataTransfer();
  files.items.add(new File([blob], `document-${Date.now()}.${photo.format}`, { type: `image/${photo.format}` }));
  input.files = files.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function installLinksAndCamera() {
  document.addEventListener("click", event => {
    const target = event.target instanceof Element ? event.target : null;
    const input = target?.closest<HTMLInputElement>('input[type="file"]');
    if (Capacitor.isNativePlatform() && input && !input.disabled && !input.dataset.nativeFilePicker &&
      (!input.accept || /image|\.jpe?g|\.png/i.test(input.accept))) {
      event.preventDefault(); event.stopPropagation();
      void choosePhoto(input).catch(reportMobileError);
      return;
    }
    const anchor = target?.closest<HTMLAnchorElement>("a[href]");
    if (!anchor) return;
    const url = new URL(anchor.href, window.location.href);
    const api = apiTarget(url.toString(), window.location.origin);
    if (api && url.pathname === "/api/crm/documents") {
      event.preventDefault(); void downloadDocument(api).catch(reportMobileError);
    } else if (api && /\/api\/auth\/(gmail|calendar)\/start/.test(url.pathname)) {
      event.preventDefault(); void connectWorkspace().catch(reportMobileError);
    } else if (url.origin !== window.location.origin && ["https:", "http:"].includes(url.protocol)) {
      event.preventDefault(); void Browser.open({ url: url.toString() }).catch(reportMobileError);
    }
  }, true);
}

function enhanceTables() {
  let queued = false;
  const update = () => {
    queued = false;
    for (const table of document.querySelectorAll<HTMLTableElement>("table")) {
      const headers = Array.from(table.tHead?.rows[0]?.cells || []);
      if (headers.length < 4) continue;
      table.dataset.mobileCards = "true";
      for (const body of table.tBodies) for (const row of body.rows) {
        if (row.cells.length !== headers.length) continue;
        for (let index = 0; index < row.cells.length; index++) {
          const cell = row.cells[index];
          const header = headers[index];
          cell.dataset.label = header.textContent?.trim() || header.querySelector("input")?.getAttribute("aria-label") || "Select";
        }
      }
    }
  };
  new MutationObserver(() => {
    if (!queued) { queued = true; requestAnimationFrame(update); }
  }).observe(document.getElementById("root")!, { childList: true, subtree: true });
}

export async function installMobilePlatform() {
  document.documentElement.classList.add("maximusNative");
  if (Capacitor.isNativePlatform()) installTransport();
  window.maximusNative = {
    signInWithGoogle, connectWorkspace, saveFile,
    async downloadDocuments(ids) {
      for (const id of ids) await downloadDocument(`/api/crm/documents?documentId=${encodeURIComponent(id)}`);
    },
  };
  installLinksAndCamera();
  enhanceTables();
  const onNetwork = (connected: boolean) => window.dispatchEvent(new CustomEvent("maximus:network", { detail: connected }));
  await Network.addListener("networkStatusChange", status => onNetwork(status.connected));
  const keyboard = () => document.documentElement.classList.toggle("mobileKeyboard", Boolean(window.visualViewport && window.innerHeight - window.visualViewport.height > 160));
  window.visualViewport?.addEventListener("resize", keyboard);
  if (Capacitor.isNativePlatform()) {
    await App.addListener("appUrlOpen", ({ url }) => {
      if (validAuthCallback(url)) void completeGoogleSignIn(url).catch(reportMobileError);
      else if (url === WORKSPACE_REDIRECT) { void Browser.close().catch(() => undefined); window.location.reload(); }
    });
    await App.addListener("backButton", () => {
      if (window.dispatchEvent(new Event("maximus:back", { cancelable: true }))) void App.minimizeApp();
    });
    await App.addListener("appStateChange", ({ isActive }) => {
      document.documentElement.classList.toggle("mobileBackground", !isActive);
      if (isActive) window.dispatchEvent(new Event("maximus:resume"));
    });
    document.addEventListener("click", event => {
      if ((event.target as Element)?.closest?.(".mobileTabbar button")) void Haptics.selectionChanged().catch(() => undefined);
    });
    const cached = await Filesystem.readdir({ directory: Directory.Cache, path: "maximus-share" }).catch(() => ({ files: [] }));
    for (const entry of cached.files) {
      const createdAt = Number(entry.name.split("-")[0]);
      if (Number.isFinite(createdAt) && Date.now() - createdAt > 60 * 60_000) {
        await Filesystem.rmdir({ directory: Directory.Cache, path: `maximus-share/${entry.name}`, recursive: true }).catch(() => undefined);
      }
    }
    const launch = await App.getLaunchUrl();
    if (launch?.url && validAuthCallback(launch.url)) void completeGoogleSignIn(launch.url).catch(reportMobileError);
  }
}

export async function mobileReady() {
  const status = await Network.getStatus();
  window.dispatchEvent(new CustomEvent("maximus:network", { detail: status.connected }));
  await SplashScreen.hide().catch(() => undefined);
}
