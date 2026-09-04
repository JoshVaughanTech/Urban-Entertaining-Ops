"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { commitImport, previewImport } from "@/lib/actions/import";
import { Actions, Card, Tag, buttonClass } from "@/components/ui";
import { Table, ui } from "@/components/ui/table";
import { Field, FormError, FormOk, Select, SubmitButton, Textarea, form } from "@/components/ui/form";
import { emptyImport, type ImportKind } from "@/lib/import/types";

export function ImportForm() {
  const [state, preview] = useActionState(previewImport, emptyImport);
  const [commitState, commit] = useActionState(commitImport, emptyImport);
  const [kind, setKind] = useState<ImportKind>("ingredients");

  // Whichever step ran most recently is the one to show.
  const active = commitState.stage === "idle" ? state : commitState;
  const blocking = active.issues.length > 0;

  if (active.stage === "done") {
    return (
      <Card>
        <FormOk>{active.message}</FormOk>
        <Actions>
          <Link href="/app/recipes?tab=ingredients" className={buttonClass("ghost")}>
            View ingredients
          </Link>
          <Link href="/app/recipes" className={buttonClass()}>
            View recipes
          </Link>
        </Actions>
      </Card>
    );
  }

  return (
    <>
      <Card title="Choose a file">
        <form action={preview}>
          <div className={form.narrow}>
            <Field label="What are you importing?" htmlFor="kind">
              <Select
                id="kind"
                name="kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as ImportKind)}
              >
                <option value="ingredients">Ingredients</option>
                <option value="recipes">Recipes</option>
              </Select>
            </Field>

            <Field
              label="CSV file"
              htmlFor="file"
              hint="Or paste the rows below if that is easier."
            >
              <input id="file" name="file" type="file" accept=".csv,text/csv" className={form.control} />
            </Field>

            <Field label="Paste CSV" htmlFor="csv">
              <Textarea id="csv" name="csv" rows={6} defaultValue={active.csv} />
            </Field>
          </div>

          <Actions>
            <a
              href={`/app/recipes/import/template?kind=${kind}`}
              className={buttonClass("ghost")}
              download
            >
              Download template
            </a>
            <SubmitButton writesNothing>Check the file</SubmitButton>
          </Actions>
        </form>
      </Card>

      {active.message ? (
        <div style={{ marginTop: 18 }}>
          <FormError>{active.message}</FormError>
        </div>
      ) : null}

      {active.issues.length > 0 ? (
        <Card title={`${active.issues.length} problem${active.issues.length === 1 ? "" : "s"} to fix`} className={ui.cardGap}>
          <p className={ui.muted} style={{ marginTop: 0 }}>
            Nothing is written until every row is clean. Fix these in the file and upload it again.
          </p>
          <Table>
            <thead>
              <tr>
                <th className={ui.num}>Line</th>
                <th>Column</th>
                <th>Problem</th>
              </tr>
            </thead>
            <tbody>
              {active.issues.map((issue, i) => (
                <tr key={`${issue.line}-${issue.column}-${i}`}>
                  <td className={ui.num}>{issue.line}</td>
                  <td className={ui.small}>{issue.column ?? "—"}</td>
                  <td>{issue.message}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : null}

      {active.stage === "preview" && active.rows.length > 0 ? (
        <Card title={`${active.rows.length} row${active.rows.length === 1 ? "" : "s"} ready`}>
          <Table>
            <thead>
              <tr>
                <th className={ui.num}>Line</th>
                <th>Name</th>
                <th>Detail</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {active.rows.map((row) => (
                <tr key={`${row.line}-${row.label}`}>
                  <td className={ui.num}>{row.line}</td>
                  <td>{row.label}</td>
                  <td className={`${ui.muted} ${ui.small}`}>{row.detail}</td>
                  <td>
                    <Tag tone={row.action === "create" ? "ok" : "warn"}>
                      {row.action === "create" ? "New" : "Overwrite"}
                    </Tag>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>

          <form action={commit}>
            <input type="hidden" name="kind" value={active.kind} />
            <input type="hidden" name="csv" value={active.csv} />
            <Actions>
              <SubmitButton>
                {blocking ? "Fix the problems first" : `Import ${active.rows.length} rows`}
              </SubmitButton>
            </Actions>
          </form>
        </Card>
      ) : null}
    </>
  );
}
