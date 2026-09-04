"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Card, PageHeader, buttonClass } from "@/components/ui";
import { FormError } from "@/components/ui/form";

/** Errors inside the app keep the sidebar, so staff can carry on somewhere
 *  else rather than being dumped on a blank page. */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <>
      <PageHeader title="This screen didn’t load" />
      <Card>
        <FormError>
          {error.message || "Something failed while loading this screen."}
        </FormError>
        {error.digest ? (
          <p style={{ color: "var(--muted)", fontSize: 11.5 }}>Reference: {error.digest}</p>
        ) : null}
        <p style={{ color: "var(--muted)" }}>
          Nothing was saved. If it keeps happening, check that the database is reachable and
          that the migration and seed have both been run.
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button type="button" className={buttonClass()} onClick={reset}>
            Try again
          </button>
          <Link href="/app/quotes" className={buttonClass("ghost")}>
            Back to quotes
          </Link>
        </div>
      </Card>
    </>
  );
}
