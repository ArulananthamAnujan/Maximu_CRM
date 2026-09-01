import type { Metadata } from "next";
import "./globals.css";
import "./figma-system.css";

export const metadata: Metadata = {
  title: "Maximus CRM | Education & Migration Operations",
  description: "Case-centred education and migration operations for the Maximus team and its clients.",
  other: { "codex-preview": "development" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
