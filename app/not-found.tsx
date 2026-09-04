import Link from "next/link";
import { CentredMessage } from "@/components/CentredMessage";
import { buttonClass } from "@/components/ui";

export default function NotFound() {
  return (
    <CentredMessage
      title="Not found"
      actions={
        <>
          <Link href="/app/quotes" className={buttonClass("ghost")}>
            All quotes
          </Link>
          <Link href="/app/quotes/new" className={buttonClass()}>
            New quote
          </Link>
        </>
      }
    >
      That page doesn&rsquo;t exist. If you followed a quote link, it may have been cancelled
      or the link may be incomplete.
    </CentredMessage>
  );
}
