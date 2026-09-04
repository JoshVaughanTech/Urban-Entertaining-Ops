"use client";

import Link from "next/link";
import { useEffect } from "react";
import { CentredMessage } from "@/components/CentredMessage";
import { buttonClass } from "@/components/ui";

/** Last-resort boundary. Says what happened, gives the digest so a failure in
 *  production can be found in the logs, and always offers a way onward. */
export default function GlobalError({
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
    <CentredMessage
      title="Something went wrong"
      detail={error.digest ? `Reference: ${error.digest}` : undefined}
      actions={
        <>
          <button type="button" className={buttonClass()} onClick={reset}>
            Try again
          </button>
          <Link href="/app/quotes" className={buttonClass("ghost")}>
            Back to quotes
          </Link>
        </>
      }
    >
      The page couldn&rsquo;t load. Nothing you were working on has been saved, so try again
      before re-entering anything.
    </CentredMessage>
  );
}
