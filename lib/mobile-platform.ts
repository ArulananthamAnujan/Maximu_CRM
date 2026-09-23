/** The website has no native dependencies. The bundled app installs this bridge. */
export type NativePlatform = {
  signInWithGoogle: () => Promise<void>;
  connectWorkspace: () => Promise<void>;
  saveFile: (blob: Blob, filename: string) => Promise<void>;
  downloadDocuments: (ids: string[]) => Promise<void>;
};

declare global {
  interface Window { maximusNative?: NativePlatform }
}

export function isNativeApp(): boolean {
  return typeof window !== "undefined" && Boolean(window.maximusNative);
}

export function openGoogleSignIn(): Promise<void> {
  if (window.maximusNative) return window.maximusNative.signInWithGoogle();
  window.location.assign("/api/auth/google/start");
  return Promise.resolve();
}

export function connectGoogleWorkspace(): void {
  if (window.maximusNative) {
    void window.maximusNative.connectWorkspace().catch(reportMobileError);
    return;
  }
  window.location.assign("/api/auth/gmail/start?workspace=1");
}

export function browserWorkspaceReturn(): string | null {
  if (isNativeApp()) return null;
  try { return sessionStorage.getItem("maximus-workspace-return") ? "/mobile/workspace" : null; }
  catch { return null; }
}

export function saveDownload(blob: Blob, filename: string): void {
  if (window.maximusNative) {
    void window.maximusNative.saveFile(blob, filename).catch(reportMobileError);
    return;
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function reportMobileError(error: unknown): void {
  window.dispatchEvent(new CustomEvent("maximus:mobile-error", {
    detail: error instanceof Error ? error.message : "Please try again.",
  }));
}
