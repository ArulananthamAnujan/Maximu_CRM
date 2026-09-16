export const functions = [
  ["dashboard", "Dashboard"], ["enquiries", "Enquiries"], ["students", "Students"],
  ["applications", "Applications"], ["visas", "Visa"], ["direct_visas", "Clients"],
  ["defer", "Deferred cases"], ["case_complete", "Enrolled / completed"],
  ["finance", "Accounts"], ["reports", "Reports"], ["courseFinder", "Course finder"],
  ["documents", "File manager"], ["templates", "Standard documents & templates"],
  ["administration", "Staff & Masters"], ["integrations", "Integrations"],
  ["work", "Tasks"], ["calendar", "Calendar"], ["communications", "Messages & campaigns"],
  ["workflows", "Workflows"], ["compliance", "Activity & compliance"], ["ai", "Copilot"],
] as const;
export const detailFunctions = [
  ["view_applications", "View applications"], ["all_applications", "All applications"],
  ["partner_access", "Partner access"], ["student_documents", "Student documents"],
  ["whatsapp", "WhatsApp"],
] as const;
export const actionPermissions = [
  ["action_delete", "Delete"], ["action_bulk_delete", "Bulk delete"],
  ["action_export", "Excel / export"], ["action_assign", "Assign"],
  ["action_send_email", "Send email"], ["action_send_sms", "Send SMS"],
  ["action_send_whatsapp", "Send WhatsApp"],
] as const;
export const accessGroups = [
  ["study_access", "Study Abroad permission"], ["direct_visa_access", "Direct Visa permission"],
  ["special_access", "Special permission"],
] as const;
export type ServiceMode = "study" | "direct_visa";
export type FunctionKey = typeof functions[number][0];
export type ModulePermission = FunctionKey | typeof detailFunctions[number][0];
export type PermissionKey = ModulePermission | `${ServiceMode}.${ModulePermission}`
  | typeof actionPermissions[number][0] | typeof accessGroups[number][0];
export type FunctionAccess = Partial<Record<PermissionKey, boolean>>;
export type AccessIdentity = { role: string; functionAccess?: FunctionAccess | null; serviceMode?: ServiceMode };
export const caseFunctions: FunctionKey[] = ["enquiries", "students", "applications", "visas", "direct_visas", "defer", "case_complete"];
export const modulePermissions = [...functions, ...detailFunctions];
export const permissionKeys: PermissionKey[] = [
  ...modulePermissions.map(([key]) => key), ...actionPermissions.map(([key]) => key), ...accessGroups.map(([key]) => key),
  ...(["study", "direct_visa"] as const).flatMap(mode => modulePermissions.map(([key]) => `${mode}.${key}` as PermissionKey)),
];
const dependencies: Partial<Record<ModulePermission, ModulePermission>> = {
  view_applications: "applications", all_applications: "view_applications", partner_access: "administration",
  student_documents: "documents", whatsapp: "communications",
};
export function canUse(identity: AccessIdentity | null | undefined, key: string, mode = identity?.serviceMode): boolean {
  if (!identity) return false;
  if (identity.role === "super_admin" || identity.role === "client") return true;
  if (!permissionKeys.includes(key as PermissionKey)) return false;
  const access = identity.functionAccess;
  if (accessGroups.some(([name]) => name === key)) return access?.[key as PermissionKey] !== false;
  if (actionPermissions.some(([name]) => name === key)) {
    return access?.special_access !== false && access?.[key as PermissionKey] !== false
      && (key !== "action_bulk_delete" || access?.action_delete !== false);
  }
  const scoped = /^(study|direct_visa)\.(.+)$/.exec(key);
  if (scoped) return canUse(identity, scoped[2], scoped[1] as ServiceMode);
  if (key === "integrations" || ((key === "administration" || key === "partner_access") && identity.role !== "admin")) return false;
  if (access?.[key as PermissionKey] === false) return false;
  if (!mode) return canUse(identity, key, "study") || canUse(identity, key, "direct_visa");
  if (access?.[mode === "study" ? "study_access" : "direct_visa_access"] === false
    || access?.[`${mode}.${key}` as PermissionKey] === false) return false;
  const dependency = dependencies[key as ModulePermission];
  return !dependency || canUse(identity, dependency, mode);
}
export const canUseAny = (identity: AccessIdentity, keys: readonly string[]) => keys.some(key => canUse(identity, key));
export function stageFunction(stage: unknown): FunctionKey {
  return ({ enquiry: "enquiries", student: "students", application: "applications", visa: "visas", deferred: "defer", completed: "case_complete" } as Record<string, FunctionKey>)[String(stage)] ?? "enquiries";
}
export function roleForLevel(level: string) { return ["super_admin", "platform_owner"].includes(level) ? "super_admin" : ["branch_admin", "manager"].includes(level) ? "admin" : level === "student" ? "client" : "staff"; }
export function validatedAccess(value: unknown): FunctionAccess | null {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) throw new Error("Choose valid function access options.");
  for (const [key, enabled] of Object.entries(value)) if (!permissionKeys.includes(key as PermissionKey) || typeof enabled !== "boolean") throw new Error("Choose valid function access options.");
  return value as FunctionAccess;
}
