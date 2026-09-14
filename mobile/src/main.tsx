import { Component, type ErrorInfo, type ReactNode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import Home from "../../app/page";
import "../../app/globals.css";
import "../../app/figma-system.css";
import "../../app/agent-workspace.css";
import "../../app/copilot.css";
import "./mobile.css";
import { installMobilePlatform, mobileReady } from "./runtime";

class AppBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { void error; void info; /* Never log a client's screen or records. */ }
  render() {
    if (this.state.failed) return <main className="mobileStartup"><h1>Let’s reopen your workspace</h1>
      <p>Your saved work remains in Maximus CRM.</p><button onClick={() => location.reload()}>Reopen app</button></main>;
    return this.props.children;
  }
}

function MobileApp() {
  const [online, setOnline] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const network = (event: Event) => setOnline((event as CustomEvent<boolean>).detail);
    const failure = (event: Event) => setError((event as CustomEvent<string>).detail);
    window.addEventListener("maximus:network", network);
    window.addEventListener("maximus:mobile-error", failure);
    void mobileReady();
    return () => { window.removeEventListener("maximus:network", network); window.removeEventListener("maximus:mobile-error", failure); };
  }, []);
  return <AppBoundary><Home />
    {!online && <div className="mobileNotice" role="status"><strong>You’re offline</strong><span>Reconnect before saving changes or opening files.</span></div>}
    {error && <div className="mobileNotice mobileError" role="alert"><span>{error}</span><button onClick={() => setError("")}>Dismiss</button></div>}
  </AppBoundary>;
}

installMobilePlatform().then(() => createRoot(document.getElementById("root")!).render(<MobileApp />)).catch(() => {
  createRoot(document.getElementById("root")!).render(<main className="mobileStartup"><h1>Maximus CRM</h1>
    <p>The app could not start. Please try again.</p><button onClick={() => location.reload()}>Retry</button></main>);
  void mobileReady();
});
