import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CanWrite } from "@/components/ReadOnly";
import { SetupNotice } from "@/components/SetupNotice";
import {
  ClientForm,
  ContactForm,
  DeleteClientButton,
  DeleteContactButton,
} from "@/components/forms/ClientForm";
import { Card, EmptyState, PageHeader, Tag } from "@/components/ui";
import { Table, ui } from "@/components/ui/table";
import { CONTACT_ROLE_LABELS } from "@/lib/clients/types";
import { countClientEvents, loadClient, loadClientHistory } from "@/lib/data/clients";
import { loadWorkspace } from "@/lib/data/load";
import { db } from "@/lib/db";
import { money, shortDate } from "@/lib/engine/format";

const STATUS_TONE: Record<string, "ok" | "warn" | "bad" | undefined> = {
  confirmed: "ok",
  sent: "warn",
  declined: "bad",
  cancelled: "bad",
};

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const isNew = id === "new";

  /* Anything that is not a uuid would reach Postgres and come back as
     "invalid input syntax for type uuid" — a 500 where a 404 is meant.
     /app/clients/foo is a typo, not a server fault. */
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!isNew && !UUID.test(id)) notFound();

  const state = await loadWorkspace();
  if (!state.ok) {
    return (
      <>
        <PageHeader title="Client" />
        <SetupNotice state={state} />
      </>
    );
  }

  const client = isNew ? null : await loadClient(db, id);
  if (!isNew && !client) notFound();

  const history = client ? await loadClientHistory(db, client.id) : [];

  /* What actually blocks deletion is events referencing the client, not
     quotes. One event quoted three times is one thing standing in the way,
     and an event with no quote is invisible to history but still blocks. */
  const eventCount = client ? await countClientEvents(db, client.id) : 0;

  return (
    <>
      <PageHeader
        title={isNew ? "New client" : (client?.name ?? "Client")}
        sub={
          isNew
            ? "What we should remember next time they call."
            : "Preferences and staff requests are internal — they never appear on a quote."
        }
      />

      <div className={ui.splitGrid}>
        <div className={ui.stack}>
          <Card title="Record">
            <ClientForm client={client} />
          </Card>

          {client ? (
            <Card title="Danger zone" className="dangerZone">
              <CanWrite>
                <DeleteClientButton id={client.id} eventCount={eventCount} />
              </CanWrite>
            </Card>
          ) : null}
        </div>

        <div className={ui.stack}>
          {client ? (
            <Card title="Contacts">
              {client.contacts.length === 0 ? (
                <p className={ui.muted} style={{ marginTop: 0 }}>
                  No contacts yet. The one marked primary is where a quote is sent.
                </p>
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Role</th>
                      <th>Email</th>
                      <th>Phone</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {client.contacts.map((contact) => (
                      <tr key={contact.id}>
                        <td>
                          {contact.name}{" "}
                          {contact.isPrimary ? <Tag tone="ok">Quotes go here</Tag> : null}
                        </td>
                        <td>{CONTACT_ROLE_LABELS[contact.role]}</td>
                        <td>{contact.email ?? <span className={ui.muted}>—</span>}</td>
                        <td>{contact.phone ?? <span className={ui.muted}>—</span>}</td>
                        <td className={ui.num}>
                          <CanWrite>
                            <DeleteContactButton clientId={client.id} contactId={contact.id} />
                          </CanWrite>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}

              <CanWrite>
                <div style={{ marginTop: 16, borderTop: "1px solid var(--line)", paddingTop: 16 }}>
                  <ContactForm clientId={client.id} />
                </div>
              </CanWrite>
            </Card>
          ) : (
            <Card title="Contacts">
              <p className={ui.muted} style={{ marginTop: 0 }}>
                Save the client first, then add their contacts.
              </p>
            </Card>
          )}

          {client ? (
            <Card title="Event history">
              {history.length === 0 ? (
                <EmptyState title="Nothing yet">
                  Quotes for this client will appear here.
                </EmptyState>
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Package</th>
                      <th className={ui.num}>Guests</th>
                      <th>Status</th>
                      <th className={ui.num}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((entry) => (
                      <tr key={entry.quoteId}>
                        <td>
                          <Link href={`/app/quotes/${entry.quoteId}` as Route}>
                            {shortDate(entry.eventDate)}
                          </Link>
                          <span className={`${ui.muted} ${ui.small}`}> · {entry.ref}</span>
                        </td>
                        <td>{entry.packageName ?? <span className={ui.muted}>—</span>}</td>
                        <td className={ui.num}>{entry.guests}</td>
                        <td>
                          <Tag tone={STATUS_TONE[entry.status]}>{entry.status}</Tag>
                        </td>
                        <td className={ui.num}>
                          {entry.total === null ? (
                            /* A draft has never been priced to anyone. Costing it
                               today would put a live number beside frozen ones. */
                            <span className={ui.muted}>Not sent</span>
                          ) : (
                            money(entry.total)
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
