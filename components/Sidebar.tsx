"use client";

import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./Sidebar.module.css";

type NavItem = { href: Route; label: string };

/** Nav order follows the handover (which adds Settings), grouped the way the
 *  mockup groups it: daily work at the top, catalogue admin at the bottom. */
const PRIMARY: NavItem[] = [
  { href: "/app/quotes/new", label: "New quote" },
  { href: "/app/quotes", label: "Quotes" },
  { href: "/app/ordering", label: "Ordering" },
];

const SECONDARY: NavItem[] = [
  { href: "/app/packages", label: "Packages" },
  { href: "/app/recipes", label: "Recipes" },
  { href: "/app/settings", label: "Settings" },
  { href: "/app/team", label: "Access" },
];

function isActive(pathname: string, href: string) {
  // "/app/quotes" must not light up while we're on "/app/quotes/new".
  if (href === "/app/quotes") return pathname === href || /^\/app\/quotes\/(?!new$)/.test(pathname);
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({ email }: { email: string }) {
  const pathname = usePathname();

  const item = ({ href, label }: NavItem) => (
    <Link
      key={href}
      href={href}
      className={`${styles.link} ${isActive(pathname, href) ? styles.on : ""}`}
      aria-current={isActive(pathname, href) ? "page" : undefined}
    >
      {label}
    </Link>
  );

  return (
    <nav className={styles.nav} aria-label="Sections">
      {/* The website's lockup: the mono mark on navy, wordmark in Montserrat.
          logo-mono.png is white artwork, so it only works on the dark nav —
          light surfaces use logo-navy.png instead. */}
      <Link href="/app/quotes/new" className={styles.brand}>
        <Image
          src="/logo-mono.png"
          alt=""
          width={105}
          height={105}
          className={styles.mark}
          priority
        />
        <span className={styles.wordmark}>
          Urban Entertaining
          <small>Operations</small>
        </span>
      </Link>

      {PRIMARY.map(item)}
      <div className={styles.spacer} />
      {SECONDARY.map(item)}

      <div className={styles.signOut}>
        {email ? <div className={styles.email}>{email}</div> : null}
        <form action="/auth/sign-out" method="post">
          <button type="submit" className={styles.link}>
            Sign out
          </button>
        </form>
      </div>
    </nav>
  );
}
