import type { Metadata } from "next";
import "./globals.css";
import "./figma-system.css";
import "./agent-workspace.css";
import "./copilot.css";
import "./house-style.css";
import "./brand-theme.css";

export const metadata: Metadata = {
  title: "Maximus CRM | Education & Migration Operations",
  description: "Case-centred education and migration operations for the Maximus team and its clients.",
  other: { "codex-preview": "development" },
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
