import type { ReactNode } from "react";
import styles from "./CentredMessage.module.css";

/** Used by the 404 and the error boundaries. Every one of them names what
 *  happened and offers a way onward — never a dead end. */
export function CentredMessage({
  title,
  children,
  detail,
  actions,
}: {
  title: string;
  children: ReactNode;
  detail?: string;
  actions?: ReactNode;
}) {
  return (
    <main className={styles.wrap}>
      <div className={styles.panel}>
        <div className={styles.brand}>Urban Entertaining</div>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.body}>{children}</p>
        {detail ? <p className={styles.detail}>{detail}</p> : null}
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>
    </main>
  );
}
