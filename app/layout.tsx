import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Maximus CRM Next",
  description: "Education and migration operations, made clear.",
  other: { "codex-preview": "development" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
