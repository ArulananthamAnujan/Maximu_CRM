"use client";
import { Home, FolderOpen, CalendarDays, Mail, Menu } from "lucide-react";
import { isNativeApp } from "@/lib/mobile-platform";

export function MobileNavigation({ active, client, navigate, menu }: {
  active: string; client: boolean; navigate: (module: "dashboard" | "portal" | "enquiries" | "work" | "communications") => void; menu: () => void;
}) {
  if (!isNativeApp()) return null;
  const items = client
    ? [{ key: "portal" as const, label: "My account", Icon: Home }]
    : [{ key: "dashboard" as const, label: "Home", Icon: Home }, { key: "enquiries" as const, label: "Cases", Icon: FolderOpen },
      { key: "work" as const, label: "Tasks", Icon: CalendarDays }, { key: "communications" as const, label: "Messages", Icon: Mail }];
  return <nav className="mobileTabbar" aria-label="Mobile navigation">
    {items.map(({ key, label, Icon }) => <button key={key} aria-current={active === key ? "page" : undefined} onClick={() => navigate(key)}><Icon size={22} /><span>{label}</span></button>)}
    <button onClick={menu}><Menu size={22} /><span>More</span></button>
  </nav>;
}
