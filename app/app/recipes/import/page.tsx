import Link from "next/link";
import { ImportForm } from "@/components/forms/ImportForm";
import { PageHeader } from "@/components/ui";
import { ui } from "@/components/ui/table";

export default function ImportPage() {
  return (
    <>
      <PageHeader
        title="Import"
        sub="Bring ingredients and recipes in from a spreadsheet. Nothing is written until you have seen exactly what will change."
      />

      <div className={ui.chips} style={{ marginBottom: 16 }}>
        <Link href="/app/recipes" className={ui.chip}>
          Back to recipes
        </Link>
      </div>

      <ImportForm />
    </>
  );
}
