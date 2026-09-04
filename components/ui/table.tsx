import type { ReactNode } from "react";
import styles from "./ui.module.css";

/** Wide tables scroll inside their own container rather than pushing the
 *  page sideways — staff open these on phones at venues. */
export function TableWrap({ children }: { children: ReactNode }) {
  return <div className={styles.tableWrap}>{children}</div>;
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <TableWrap>
      <table className={styles.table}>{children}</table>
    </TableWrap>
  );
}

export function GroupRow({ label, meta, span }: { label: string; meta?: string; span: number }) {
  return (
    <tr>
      <td colSpan={span} className={styles.groupRow}>
        {label}
        {meta ? <span className={styles.groupMeta}> — {meta}</span> : null}
      </td>
    </tr>
  );
}

export function Stats({ children, columns }: { children: ReactNode; columns?: number }) {
  return (
    <div
      className={styles.stats}
      style={columns ? { gridTemplateColumns: `repeat(${columns}, 1fr)` } : undefined}
    >
      {children}
    </div>
  );
}

export function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: ReactNode;
  tone?: "green" | "red";
}) {
  const color = tone === "red" ? "var(--red)" : tone === "green" ? "var(--green)" : undefined;
  return (
    <div className={styles.stat}>
      <span className={styles.statLabel}>{label}</span>
      <b className={styles.statValue} style={color ? { color } : undefined}>
        {value}
      </b>
    </div>
  );
}

export const ui = styles;
