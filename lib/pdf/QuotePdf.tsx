import { readFileSync } from "node:fs";
import path from "node:path";

import { Document, Font, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import { longDate, money, moneyDeduction } from "@/lib/engine/format";
import type { QuoteDocument } from "@/lib/quotes/document";

/* ── fonts ──────────────────────────────────────────────────
   The real brand faces, the same two the website serves. @react-pdf needs the
   files themselves rather than a webfont stylesheet, so the .ttf files live in
   assets/fonts/ — pulled from Google Fonts, both SIL Open Font License.

   They are read off disk at render time, which is why next.config.ts traces
   assets/fonts into the serverless bundle. Without that the PDF route builds
   fine and then throws on Vercel, where the repo is not on disk. */

const FONT_DIR = path.join(process.cwd(), "assets", "fonts");

let registered = false;

export function registerBrandFonts() {
  // Font.register mutates a module-level registry; doing it twice is wasteful
  // and, for the hyphenation callback, simply redundant.
  if (registered) return;

  Font.register({
    family: "Cormorant Garamond",
    fonts: [
      { src: path.join(FONT_DIR, "CormorantGaramond-Medium.ttf"), fontWeight: 500 },
      { src: path.join(FONT_DIR, "CormorantGaramond-SemiBold.ttf"), fontWeight: 600 },
    ],
  });

  Font.register({
    family: "Mulish",
    fonts: [
      { src: path.join(FONT_DIR, "Mulish-Regular.ttf"), fontWeight: 400 },
      { src: path.join(FONT_DIR, "Mulish-Bold.ttf"), fontWeight: 700 },
    ],
  });

  // Stops react-pdf hyphenating mid-word, which looks wrong on a quote.
  Font.registerHyphenationCallback((word) => [word]);

  registered = true;
}

const DISPLAY = "Cormorant Garamond";
const BODY = "Mulish";

/* The website palette. The two rules are the flat equivalents of its
   translucent --line / --line-soft over white, since a quote prints on paper. */
const INK = "#16263F";
const MUTED = "#5B6C86";
const LINE = "#DEE0E4";
const LINE_SOFT = "#EFF0F2";

/* The mark, handed to @react-pdf as bytes rather than a path. Given a string
   it treats anything non-http as a URL and calls fetch(), which on a local
   file path fails silently: the render succeeds and the logo is simply
   absent. Passing { data, format } is the only form that reliably embeds. */
const LOGO_PATH = path.join(process.cwd(), "public", "logo-navy.png");

let logo: { data: Buffer; format: "png" } | undefined;

function brandMark() {
  if (!logo) logo = { data: readFileSync(LOGO_PATH), format: "png" };
  return logo;
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 56,
    paddingHorizontal: 52,
    fontFamily: BODY,
    fontSize: 10,
    color: INK,
    lineHeight: 1.5,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  logo: { width: 30, height: 30 },
  brand: { fontFamily: BODY, fontSize: 9, color: MUTED, letterSpacing: 0.3 },
  title: { fontFamily: DISPLAY, fontSize: 28, marginTop: 2 },
  ref: { fontSize: 9, color: MUTED },
  meta: { color: MUTED, marginTop: 8, marginBottom: 20 },

  row: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: LINE_SOFT,
    paddingVertical: 6,
  },
  label: { flex: 1, paddingRight: 8 },
  unit: { width: 110, textAlign: "right", color: MUTED },
  amount: { width: 80, textAlign: "right" },

  totalRow: {
    flexDirection: "row",
    borderTopWidth: 2,
    borderTopColor: INK,
    paddingTop: 8,
    marginTop: 2,
  },
  totalLabel: { flex: 1, fontSize: 12 },
  totalAmount: { width: 80, textAlign: "right", fontSize: 12 },
  gst: { textAlign: "right", color: MUTED, fontSize: 9, marginTop: 5 },

  heading: { marginTop: 18, marginBottom: 4, fontSize: 11 },
  listItem: { color: MUTED, marginBottom: 2, paddingLeft: 10 },
  note: { color: MUTED, marginTop: 14 },
  terms: { color: MUTED, fontSize: 9, marginTop: 22 },

  footer: {
    position: "absolute",
    bottom: 28,
    left: 52,
    right: 52,
    textAlign: "center",
    color: MUTED,
    fontSize: 8,
  },
});

/** Mulish is registered at 400 and 700, so bold is a real weight now rather
 *  than the separate Helvetica-Bold family the stand-in needed. */
const bold = { fontWeight: 700 } as const;

export function QuotePdf({ doc }: { doc: QuoteDocument }) {
  registerBrandFonts();

  return (
    <Document
      title={`${doc.brand} — ${doc.title} ${doc.ref}`}
      author={doc.brand}
      subject={`Quotation for ${doc.clientName}`}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.brandRow}>
          <Image src={brandMark()} style={styles.logo} />
          <Text style={styles.brand}>{doc.brand}</Text>
        </View>

        <Text style={styles.title}>{doc.title}</Text>
        <Text style={styles.ref}>{doc.ref}</Text>

        <Text style={styles.meta}>
          {doc.clientName} · {longDate(doc.eventDate)} · {doc.guests} guests
          {doc.venue ? ` · ${doc.venue}` : ""}
        </Text>

        {doc.lines.map((line, i) => (
          <View key={`${line.label}-${i}`} style={styles.row} wrap={false}>
            <Text style={styles.label}>{line.label}</Text>
            <Text style={styles.unit}>
              {line.showUnit ? `${line.qty} × ${money(line.unitPrice)}` : ""}
            </Text>
            <Text style={styles.amount}>{money(line.amount)}</Text>
          </View>
        ))}

        {doc.discount > 0 ? (
          <View style={styles.row} wrap={false}>
            <Text style={styles.label}>Discount</Text>
            <Text style={styles.unit} />
            <Text style={styles.amount}>{moneyDeduction(doc.discount)}</Text>
          </View>
        ) : null}

        <View style={styles.totalRow} wrap={false}>
          <Text style={[styles.totalLabel, bold]}>Total (inc. GST)</Text>
          <Text style={[styles.totalAmount, bold]}>{money(doc.total)}</Text>
        </View>
        <Text style={styles.gst}>Includes {money(doc.gst)} GST.</Text>

        {doc.includes.length > 0 ? (
          <View wrap={false}>
            <Text style={[styles.heading, bold]}>Included in your package</Text>
            {doc.includes.map((item) => (
              <Text key={item} style={styles.listItem}>
                · {item}
              </Text>
            ))}
          </View>
        ) : null}

        {doc.menu.length > 0 ? (
          <View wrap={false}>
            <Text style={[styles.heading, bold]}>Menu</Text>
            {doc.menu.map((item, i) => (
              <Text key={`${item}-${i}`} style={styles.listItem}>
                · {item}
              </Text>
            ))}
          </View>
        ) : null}

        {doc.dietary.length > 0 ? (
          <Text style={styles.note}>
            Dietary requirements catered for: {doc.dietary.join(", ")}.
          </Text>
        ) : null}

        <Text style={styles.terms}>
          Valid until {longDate(doc.validUntil)}. A {doc.depositPct}% deposit —{" "}
          {money(doc.depositAmount)} — confirms your date.
        </Text>

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            totalPages > 1 ? `${doc.brand} · ${doc.ref} · ${pageNumber} of ${totalPages}` : `${doc.brand} · ${doc.ref}`
          }
          fixed
        />
      </Page>
    </Document>
  );
}
