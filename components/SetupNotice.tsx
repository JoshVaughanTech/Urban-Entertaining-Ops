import { Notice } from "@/components/ui";
import type { Loaded } from "@/lib/data/load";

type Failed = Extract<Loaded, { ok: false }>;

/** Error states say what happened and what to do about it. */
export function SetupNotice({ state }: { state: Failed }) {
  if (state.reason === "unconfigured") {
    return (
      <Notice>
        <strong>No database connection yet.</strong>
        <p style={{ margin: "6px 0 0" }}>
          Copy <code>.env.local.example</code> to <code>.env.local</code>, paste the Supabase
          connection string into <code>DATABASE_URL</code>, then restart the dev server.
        </p>
      </Notice>
    );
  }

  if (state.reason === "unmigrated") {
    return (
      <Notice>
        <strong>The database has no tables yet.</strong>
        <p style={{ margin: "6px 0 0" }}>
          Run <code>npm run db:migrate</code>, then <code>npm run db:seed</code>.
        </p>
      </Notice>
    );
  }

  if (state.reason === "unseeded") {
    return (
      <Notice>
        <strong>The database is empty.</strong>
        <p style={{ margin: "6px 0 0" }}>
          Run <code>npm run db:seed</code> to load the catalogue.
        </p>
      </Notice>
    );
  }

  return (
    <Notice>
      <strong>Could not read the catalogue.</strong>
      <p style={{ margin: "6px 0 0" }}>{state.message}</p>
    </Notice>
  );
}
