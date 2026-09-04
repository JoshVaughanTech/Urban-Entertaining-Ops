"use client";

import { createContext, useContext, type ReactNode } from "react";

/* Whether the signed-in person may change anything.
 *
 * This is presentation only — it decides whether a control is worth showing.
 * The actual boundary is `denyReadOnly()` in every write action, which does
 * not trust the browser at all. Hiding a button here and forgetting the
 * guard there would be a security hole, not a tidy-up. */
const ReadOnlyContext = createContext(false);

export function ReadOnlyProvider({
  readOnly,
  children,
}: {
  readOnly: boolean;
  children: ReactNode;
}) {
  return <ReadOnlyContext.Provider value={readOnly}>{children}</ReadOnlyContext.Provider>;
}

export const useReadOnly = () => useContext(ReadOnlyContext);

/** Renders its children only for someone who can act on them. */
export function CanWrite({ children }: { children: ReactNode }) {
  return useReadOnly() ? null : <>{children}</>;
}
