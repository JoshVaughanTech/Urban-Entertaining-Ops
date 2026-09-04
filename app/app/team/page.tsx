import { SetupNotice } from "@/components/SetupNotice";
import { InviteForm, RevokeButton, RoleToggle } from "@/components/forms/TeamForms";
import { Card, PageHeader, Tag } from "@/components/ui";
import { Table, ui } from "@/components/ui/table";
import { requireAdmin } from "@/lib/auth";
import { loadWorkspace } from "@/lib/data/load";
import { bootstrapEmails, listMembers } from "@/lib/data/members";
import { db } from "@/lib/db";

export const metadata = { title: "Access" };

export default async function TeamPage() {
  const me = await requireAdmin();
  const state = await loadWorkspace();

  if (!state.ok) {
    return (
      <>
        <PageHeader title="Access" />
        <SetupNotice state={state} />
      </>
    );
  }

  const members = await listMembers(db);
  const admins = members.filter((m) => m.role === "admin").length;
  const bootstrap = bootstrapEmails();

  return (
    <>
      <PageHeader
        title="Access"
        sub="Only these people can sign in. Everyone else is turned away, whatever address they use."
      />

      <div className={ui.stack}>
        <Card title="Give someone access">
          <InviteForm />
        </Card>

        <Card title={`${members.length} ${members.length === 1 ? "person" : "people"}`}>
          <Table>
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
                <th>Access</th>
                <th>Status</th>
                <th />
                <th />
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td>{m.email}</td>
                  <td className={ui.small}>{m.name ?? "—"}</td>
                  <td>
                    <Tag tone={m.role === "admin" ? "ok" : "warn"}>{m.role}</Tag>
                  </td>
                  <td className={`${ui.muted} ${ui.small}`}>
                    {m.authUserId ? "Has signed in" : "Not yet signed in"}
                    {m.id === me.id ? " · you" : ""}
                  </td>
                  <td className={ui.num}>
                    <RoleToggle
                      id={m.id}
                      role={m.role}
                      disabled={m.role === "admin" && admins <= 1}
                    />
                  </td>
                  <td className={ui.num}>
                    {m.id === me.id ? null : <RevokeButton id={m.id} email={m.email} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>

        {bootstrap.length > 0 ? (
          <Card title="Admitted by configuration">
            <p className={ui.muted} style={{ marginTop: 0 }}>
              These addresses are in <code>ALLOWED_EMAILS</code> and are let in as admins even
              without a row above. Clear that variable once real people are on the list.
            </p>
            <p style={{ margin: 0 }}>{bootstrap.join(", ")}</p>
          </Card>
        ) : null}
      </div>
    </>
  );
}
