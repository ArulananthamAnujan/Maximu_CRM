import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./public.module.css";
export default function PublicLayout({ children }: { children: ReactNode }) {
 return <div className={styles.site}><header className={styles.header}><a className={styles.brand} href="/about">MAXIMUS <span>CRM</span></a><nav aria-label="Public navigation"><a href="/about">About</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><Link href="/">Sign in</Link></nav></header><main className={styles.content}>{children}</main><footer className={styles.footer}><strong>Maximus Education</strong><p>Education and migration case management</p><a href="mailto:info@maximuseducation.com.au">info@maximuseducation.com.au</a><nav aria-label="Policy links"><a href="/privacy">Privacy policy</a><a href="/terms">Terms of service</a><a href="/about">About Maximus CRM</a></nav></footer></div>;
}
