import { Document, Font, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import { longDate, money, moneyDeduction } from "@/lib/engine/format";
import type { QuoteDocument } from "@/lib/quotes/document";

/* ── fonts ──────────────────────────────────────────────────────────────
   The app uses Cormorant Garamond and Mulish. @react-pdf cannot use a
   webfont from CSS — it needs the font files themselves — and fetching them
   at render time would put a network call in the middle of every download.

   So the PDF ships with the built-in Times-Roman and Helvetica, which are
   the closest stand-ins, and this hook swaps in the real thing the moment
   the .ttf files are in the repo:

     1. drop Cormorant-Garamond.ttf and Mulish.ttf into assets/fonts/
     2. uncomment the two Font.register calls below
     3. change DISPLAY / BODY to "Cormorant Garamond" / "Mulish"

   Flagged in the Phase 3 summary as a deliberate, reversible deviation. */

export function registerBrandFonts() {
  // Font.register({ family: "Cormorant Garamond", src: "assets/fonts/Cormorant-Garamond.ttf" });
  // Font.register({ family: "Mulish", src: "assets/fonts/Mulish.ttf" });

  // Stops react-pdf hyphenating mid-word, which looks wrong on a quote.
  Font.registerHyphenationCallback((word) => [word]);
}

const DISPLAY = "Times-Roman";
const BODY = "Helvetica";

const INK = "#1F1D19";
const MUTED = "#7A756B";
const LINE = "#DDD8CE";
const LINE_SOFT = "#EEEAE2";

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
  logo: {
    width: 30,
    height: 30,
    borderWidth: 1,
    borderColor: LINE,
    borderStyle: "dashed",
    borderRadius: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: { fontSize: 6, color: MUTED },
  brand: { fontFamily: DISPLAY, fontSize: 11, color: MUTED },
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

/** Bold is expressed through the built-in bold face rather than a weight,
 *  because the stand-in families have no variable axis. */
const bold = { fontFamily: BODY === "Helvetica" ? "Helvetica-Bold" : BODY };

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
          <View style={styles.logo}>
            <Text style={styles.logoText}>LOGO</Text>
          </View>
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
