/** Retired profiles exist only to attribute historical case work. */
export function isRemovedStaffAccount(person: { id?: unknown; email?: unknown }) {
  return typeof person.id === "string" && typeof person.email === "string"
    && person.email.toLowerCase() === `removed+${person.id.toLowerCase()}@accounts.invalid`;
}
