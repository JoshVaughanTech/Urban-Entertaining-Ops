import { requireUser } from "@/lib/auth";
import { INGREDIENT_TEMPLATE, RECIPE_TEMPLATE } from "@/lib/import/csv";

/** Hands back a CSV with the right headers and a few worked rows, so nobody
 *  has to guess the column names. */
export async function GET(request: Request) {
  await requireUser();

  const kind = new URL(request.url).searchParams.get("kind") === "recipes" ? "recipes" : "ingredients";
  const body = kind === "recipes" ? RECIPE_TEMPLATE : INGREDIENT_TEMPLATE;

  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ue-${kind}-template.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
