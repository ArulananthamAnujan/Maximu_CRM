// Netlify's runtime API and the Node environment are both supported.
// Keep the same fallback as the Next.js server without logging values.
export const runtimeEnv = name => globalThis.Netlify?.env?.get(name) || process.env[name] || "";
