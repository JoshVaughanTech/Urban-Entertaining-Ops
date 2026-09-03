"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { buttonClass } from "@/components/ui";
import styles from "./login.module.css";

export function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setError("");

    try {
      const supabase = createClient();
      const origin = window.location.origin;
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` },
      });
      if (error) throw error;
      setState("sent");
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Could not send the link.");
    }
  }

  if (state === "sent") {
    return (
      <p className={styles.msg}>
        Check {email} for a sign-in link. It opens this app and expires in an hour.
      </p>
    );
  }

  return (
    <form onSubmit={submit}>
      <label className={styles.label} htmlFor="email">
        Work email
      </label>
      <input
        id="email"
        type="email"
        required
        autoComplete="email"
        className={styles.input}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@urbanentertaining.com.au"
      />
      <button
        type="submit"
        className={`${buttonClass()} ${styles.full}`}
        disabled={state === "sending"}
      >
        {state === "sending" ? "Sending…" : "Email me a sign-in link"}
      </button>
      {state === "error" ? <p className={styles.err}>{error}</p> : null}
    </form>
  );
}
