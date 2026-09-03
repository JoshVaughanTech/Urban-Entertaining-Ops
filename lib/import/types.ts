import type { RowIssue } from "./csv";

export type ImportKind = "ingredients" | "recipes";

export type ImportPlanRow = {
  line: number;
  label: string;
  detail: string;
  action: "create" | "update";
};

export type ImportState = {
  stage: "idle" | "preview" | "done";
  kind: ImportKind;
  csv: string;
  filename?: string;
  rows: ImportPlanRow[];
  issues: RowIssue[];
  message?: string;
};

export const emptyImport: ImportState = {
  stage: "idle",
  kind: "ingredients",
  csv: "",
  rows: [],
  issues: [],
};
