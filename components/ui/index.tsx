import type { ReactNode } from "react";
import styles from "./ui.module.css";

export function PageHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <header>
      <h1 className={styles.pageTitle}>{title}</h1>
      {sub ? <p className={styles.pageSub}>{sub}</p> : null}
    </header>
  );
}

export function Card({
  title,
  children,
  className,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`${styles.card} ${className ?? ""}`}>
      {title ? <h2 className={styles.cardTitle}>{title}</h2> : null}
      {children}
    </section>
  );
}

/** Empty states carry the next action, not just an apology — the mockup's
 *  copy pattern ("Choose a package" / "Select a package above..."). */
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className={styles.empty}>
      <b className={styles.emptyTitle}>{title}</b>
      {children}
    </div>
  );
}

export function Tag({
  tone = "ok",
  children,
}: {
  tone?: "ok" | "warn" | "bad";
  children: ReactNode;
}) {
  return <span className={`${styles.tag} ${styles[tone]}`}>{children}</span>;
}

export function Actions({ children }: { children: ReactNode }) {
  return <div className={styles.actions}>{children}</div>;
}

export function Notice({ children }: { children: ReactNode }) {
  return <div className={styles.notice}>{children}</div>;
}

export const buttonClass = (variant: "solid" | "ghost" = "solid") =>
  `${styles.btn} ${variant === "ghost" ? styles.ghost : ""}`;
