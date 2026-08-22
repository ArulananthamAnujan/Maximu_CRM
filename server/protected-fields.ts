/**
 * Encryption for the few fields that must never sit in the database as plain
 * text: passport numbers today, anything similar later.
 *
 * The key lives with the application, not with the database, so a copy of the
 * database on its own does not disclose a passport number. AES-GCM is used
 * through Web Crypto so this runs unchanged on Cloudflare Workers.
 */

export class ProtectedFieldError extends Error {}

declare global {
  var __MAXIMUS_FIELD_KEY__: string | undefined;
}

function keyMaterial(): string {
  return (
    globalThis.__MAXIMUS_FIELD_KEY__ ||
    process.env.FIELD_ENCRYPTION_KEY ||
    ""
  );
}

export function protectionConfigured(): boolean {
  return keyMaterial().length > 0;
}

async function importKey(): Promise<CryptoKey> {
  const material = keyMaterial();
  if (!material)
    throw new ProtectedFieldError(
      "FIELD_ENCRYPTION_KEY is not set, so passport numbers cannot be stored. Generate one with: openssl rand -base64 32",
    );
  // The key is a base64 32-byte value. Anything else is a configuration error
  // rather than something to paper over with a derived key.
  let raw: Uint8Array;
  try {
    const binary = atob(material.trim());
    raw = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1)
      raw[index] = binary.charCodeAt(index);
  } catch {
    throw new ProtectedFieldError(
      "FIELD_ENCRYPTION_KEY must be base64. Generate one with: openssl rand -base64 32",
    );
  }
  if (raw.length !== 32)
    throw new ProtectedFieldError(
      `FIELD_ENCRYPTION_KEY must decode to 32 bytes, got ${raw.length}. Generate one with: openssl rand -base64 32`,
    );
  return crypto.subtle.importKey(
    "raw",
    raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

const toBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};
const fromBase64 = (value: string): ArrayBuffer => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
};

/** Returns "v1.<iv>.<ciphertext>", so the scheme can be changed later. */
export async function protect(value: string): Promise<string> {
  const key = await importKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(value),
  );
  return `v1.${toBase64(iv)}.${toBase64(new Uint8Array(ciphertext))}`;
}

export async function reveal(stored: string): Promise<string> {
  const [version, iv, ciphertext] = stored.split(".");
  if (version !== "v1" || !iv || !ciphertext)
    throw new ProtectedFieldError("That stored value is not in a known format.");
  const key = await importKey();
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(iv) },
      key,
      fromBase64(ciphertext),
    );
    return new TextDecoder().decode(plain);
  } catch {
    throw new ProtectedFieldError(
      "That value could not be decrypted. The encryption key may have changed.",
    );
  }
}

/**
 * The form shown everywhere in place of the number: enough to recognise the
 * right document, not enough to use it. "N1234567" becomes "N12•••••7".
 */
export function mask(value: string): string {
  const trimmed = value.trim().toUpperCase();
  if (trimmed.length <= 4) return "•".repeat(trimmed.length);
  const head = trimmed.slice(0, 3);
  const tail = trimmed.slice(-1);
  return `${head}${"•".repeat(Math.max(1, trimmed.length - 4))}${tail}`;
}
