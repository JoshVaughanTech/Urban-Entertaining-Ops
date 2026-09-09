import Image from "next/image";

import { Card, Notice } from "@/components/ui";
import { HashSession } from "@/components/auth/HashSession";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { safeLanding } from "@/lib/supabase/routes";
import { LoginForm } from "./LoginForm";
import styles from "./login.module.css";

// Reads Supabase env at request time, not build time.
export const dynamic = "force-dynamic";

const REASONS: Record<string, string> = {
  "link-expired": "That sign-in link has expired. Request a new one.",
  "missing-code": "That link was incomplete. Request a new one.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reason?: string }>;
}) {
  const { next, reason } = await searchParams;
  const configured = isSupabaseConfigured();
  const safeNext = safeLanding(next);
  const message = reason ? REASONS[reason] : undefined;

  return (
    <div className={styles.wrap}>
      <div className={styles.panel}>
        {/* Navy mark: this page sits on the light ground, not the nav. */}
        <div className={styles.brand}>
          <Image
            src="/logo-navy.png"
            alt=""
            width={105}
            height={105}
            className={styles.mark}
            priority
          />
          <span>
            Urban Entertaining
            <small>Operations</small>
          </span>
        </div>

        {configured ? (
          <Card>
            {/* An implicit-flow link lands here carrying its tokens in the
                fragment; HashSession finishes the sign-in before the form
                is ever shown. */}
            <HashSession>
              <p className={styles.intro}>Sign in with a link sent to your email.</p>
              {message ? <p className={styles.err}>{message}</p> : null}
              <LoginForm next={safeNext} />
            </HashSession>
          </Card>
        ) : (
          <Notice>
            <strong>Supabase isn’t connected yet.</strong>
            <p style={{ margin: "6px 0 0" }}>
              Copy <code>.env.local.example</code> to <code>.env.local</code> and fill in{" "}
              <code>NEXT_PUBLIC_SUPABASE_URL</code>, <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> and{" "}
              <code>DATABASE_URL</code> from the Supabase dashboard, then restart the dev server.
            </p>
          </Notice>
        )}
      </div>
    </div>
  );
}
