export const STUDENT_FOLDER_TEMPLATE = [
  "01 Personal and Identity", "02 Academic Records", "03 English and Other Tests",
  "04 Employment and Financial", "05 Education Applications", "06 Offers Payments and CoE",
  "07 Visa Matters", "08 Dependants", "09 Agreements and Consent",
  "10 Accounts and Receipts", "11 Generated Documents", "99 Archive",
] as const;

export function studentFolderName(fullName: string, crmId: string) {
  return `${fullName.trim()} - ${crmId.trim()}`.replace(/[\\/:*?"<>|]/g, "-");
}

export type DriveJob = {
  operation: "provision_student" | "upload" | "move" | "archive" | "reconcile";
  organisationId: string; clientId: string; documentId?: string; payload: Record<string, unknown>;
};

// Production consumes queued DriveJob rows with supportsAllDrives=true.
