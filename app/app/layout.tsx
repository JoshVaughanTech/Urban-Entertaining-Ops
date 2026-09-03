import { Sidebar } from "@/components/Sidebar";
import { requireUser } from "@/lib/auth";
import styles from "@/components/AppShell.module.css";

/* Every screen under /app is per-session: it reads auth cookies and live
   catalogue data. Never prerender it. */
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className={styles.shell}>
      <Sidebar email={user.email} />
      <main className={styles.main}>{children}</main>
    </div>
  );
}
