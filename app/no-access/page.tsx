import { CentredMessage } from "@/components/CentredMessage";
import { buttonClass } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "No access" };

/* Reached when someone signs in successfully but is not on the allowlist.
   Deliberately says nothing about what the app contains. */
export default function NoAccess() {
  return (
    <CentredMessage
      title="You don’t have access"
      actions={
        <form action="/auth/sign-out" method="post">
          <button type="submit" className={buttonClass()}>
            Sign out
          </button>
        </form>
      }
    >
      That email address isn’t set up for Urban Entertaining Operations. Ask whoever manages
      the account to add you, then sign in again.
    </CentredMessage>
  );
}
