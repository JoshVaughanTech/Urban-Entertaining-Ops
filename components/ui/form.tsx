"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";
import { useReadOnly } from "@/components/ReadOnly";
import { buttonClass } from "./index";
import styles from "./form.module.css";

export { styles as form };

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && !error ? <p className={styles.hint}>{hint}</p> : null}
      {error ? <p className={styles.error}>{error}</p> : null}
    </div>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <div className={styles.row}>{children}</div>;
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  const { invalid, className, ...rest } = props;
  return (
    <input
      {...rest}
      className={`${styles.control} ${invalid ? styles.invalid : ""} ${className ?? ""}`}
    />
  );
}

export function Select(
  props: React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean },
) {
  const { invalid, className, children, ...rest } = props;
  return (
    <select
      {...rest}
      className={`${styles.control} ${invalid ? styles.invalid : ""} ${className ?? ""}`}
    >
      {children}
    </select>
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className, ...rest } = props;
  return <textarea {...rest} className={`${styles.control} ${className ?? ""}`} rows={rest.rows ?? 3} />;
}

export function Toggle({
  name,
  value,
  defaultChecked,
  children,
}: {
  name: string;
  value?: string;
  defaultChecked?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={styles.toggle}>
      <input type="checkbox" name={name} value={value} defaultChecked={defaultChecked} />
      {children}
    </label>
  );
}

/** Disables itself while the action is in flight, so a double-click can't
 *  write twice. */
export function SubmitButton({
  children = "Save",
  variant = "solid",
  writesNothing = false,
}: {
  children?: ReactNode;
  variant?: "solid" | "ghost";
  /** Set for a submit that only reads — a dry run, a search. Those stay
   *  available to a read-only account. */
  writesNothing?: boolean;
}) {
  const { pending } = useFormStatus();
  const readOnly = useReadOnly();
  if (readOnly && !writesNothing) return null;

  return (
    <button type="submit" className={buttonClass(variant)} disabled={pending}>
      {pending ? "Saving…" : children}
    </button>
  );
}

export function FormError({ children }: { children: ReactNode }) {
  return (
    <div className={styles.formError} role="alert">
      {children}
    </div>
  );
}

export function FormOk({ children }: { children: ReactNode }) {
  return (
    <div className={styles.formOk} role="status">
      {children}
    </div>
  );
}
