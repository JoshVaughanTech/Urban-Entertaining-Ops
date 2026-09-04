import { requireUser } from "@/lib/auth";
import { buildOrdering } from "@/lib/data/orders";
import { db } from "@/lib/db";
import { supplierCsv, supplierCsvFilename } from "@/lib/orders/csv";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** One CSV per supplier — the same text that gets attached to that
 *  supplier's purchase order, so the sheet in someone's downloads folder and
 *  the sheet in the supplier's inbox are identical.
 *
 *  `supplier` is a supplier id, or "none" for ingredients that have no
 *  supplier set. Those still have to be bought by someone. */
export async function GET(request: Request) {
  await requireUser();

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const supplier = searchParams.get("supplier") ?? "";

  if (!ISO.test(from) || !ISO.test(to)) {
    return new Response("Give a from and to date.", { status: 400 });
  }

  const view = await buildOrdering(db, from, to);
  const group = view.groups.find((g) =>
    supplier === "none" ? g.supplierId === null : g.supplierId === supplier,
  );

  if (!group) return new Response("Nothing to order from that supplier.", { status: 404 });

  const meta = { windowFrom: from, windowTo: to, business: "Urban Entertaining" };

  return new Response(supplierCsv(group, meta), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${supplierCsvFilename(group, meta)}"`,
      "Cache-Control": "no-store",
    },
  });
}
