import Link from "next/link";

import { CanWrite } from "@/components/ReadOnly";
import { SetupNotice } from "@/components/SetupNotice";
import { Card, EmptyState, PageHeader, Tag, buttonClass } from "@/components/ui";
import { Table, ui } from "@/components/ui/table";
import { listClients } from "@/lib/data/clients";
import { loadWorkspace } from "@/lib/data/load";
import { db } from "@/lib/db";
import { money, shortDate } from "@/lib/engine/format";

export const metadata = { title: "Clients" };

export default async function ClientsPage() {
  const state = await loadWorkspace();
  if (!state.ok) {
    return (
      <>
        <PageHeader title="Clients" sub="Who we have cooked for, and what we learned." />
        <SetupNotice state={state} />
      </>
    );
  }

  const clients = await listClients(db);

  return (
    <>
      <PageHeader
        title="Clients"
        sub="Who we have cooked for, and what we learned. Most recently active first."
      />

      <div className={ui.chips} style={{ marginBottom: 16 }}>
        <span style={{ flex: 1 }} />
        <CanWrite>
          <Link href="/app/clients/new" className={buttonClass()}>
            New client
          </Link>
        </CanWrite>
      </div>

      {clients.length === 0 ? (
        <Card>
          <EmptyState title="No clients yet">
            One is created automatically the first time you quote a name that does not match an
            existing client.
          </EmptyState>
        </Card>
      ) : (
        <Card>
          <Table>
            <thead>
              <tr>
                <th>Client</th>
                <th>Primary contact</th>
                <th className={ui.num}>Events</th>
                <th className={ui.num}>Last event</th>
                <th className={ui.num}>Confirmed value</th>
                <th className={ui.num}>Discount</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr key={client.id}>
                  <td>
                    <Link href={`/app/clients/${client.id}`}>{client.name}</Link>
                  </td>
                  <td>
                    {client.primaryContactName ? (
                      <>
                        {client.primaryContactName}
                        {client.primaryContactEmail ? (
                          <span className={`${ui.muted} ${ui.small}`}>
                            {" "}
                            · {client.primaryContactEmail}
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <span className={ui.muted}>None set</span>
                    )}
                  </td>
                  <td className={ui.num}>{client.eventCount}</td>
                  <td className={ui.num}>
                    {client.lastEventDate ? (
                      shortDate(client.lastEventDate)
                    ) : (
                      <span className={ui.muted}>—</span>
                    )}
                  </td>
                  <td className={ui.num}>
                    {client.lifetimeValue > 0 ? (
                      money(client.lifetimeValue)
                    ) : (
                      <span className={ui.muted}>—</span>
                    )}
                  </td>
                  <td className={ui.num}>
                    {client.discountPct > 0 ? (
                      <Tag tone="ok">{client.discountPct}%</Tag>
                    ) : (
                      <span className={ui.muted}>—</span>
                    )}
                  </td>
                  <td className={ui.num}>
                    <Link
                      href={`/app/clients/${client.id}`}
                      className={buttonClass("ghost")}
                      style={{ padding: "4px 10px" }}
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}
