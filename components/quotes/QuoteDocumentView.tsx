import { longDate, money, moneyDeduction } from "@/lib/engine/format";
import type { QuoteDocument } from "@/lib/quotes/document";
import styles from "./document.module.css";

/** The client's copy, on screen. The PDF renders the same QuoteDocument, so
 *  what staff preview is what the client receives. */
export function QuoteDocumentView({ doc }: { doc: QuoteDocument }) {
  return (
    <article className={styles.sheet}>
      <div className={styles.brandRow}>
        {/* The navy mark, not the white one: this sheet is client-facing and
            renders on paper. Both are the site's logo-mono.png artwork. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-navy.png" alt="" className={styles.logo} aria-hidden="true" />
        <div className={styles.brand}>{doc.brand}</div>
      </div>

      <h1 className={styles.title}>{doc.title}</h1>
      <div className={styles.ref}>{doc.ref}</div>

      <p className={styles.meta}>
        {doc.clientName} · {longDate(doc.eventDate)} · {doc.guests} guests
        {doc.venue ? ` · ${doc.venue}` : ""}
      </p>

      <table className={styles.table}>
        <tbody>
          {doc.lines.map((line, i) => (
            <tr key={`${line.label}-${i}`}>
              <td>{line.label}</td>
              <td className={styles.num}>
                {line.showUnit ? `${line.qty} × ${money(line.unitPrice)}` : ""}
              </td>
              <td className={styles.num}>{money(line.amount)}</td>
            </tr>
          ))}

          {doc.discount > 0 ? (
            <tr>
              <td>Discount</td>
              <td />
              <td className={styles.num}>{moneyDeduction(doc.discount)}</td>
            </tr>
          ) : null}

          <tr className={styles.total}>
            <td>Total (inc. GST)</td>
            <td />
            <td className={styles.num}>{money(doc.total)}</td>
          </tr>
        </tbody>
      </table>

      <p className={styles.gst}>Includes {money(doc.gst)} GST.</p>

      {doc.includes.length > 0 ? (
        <>
          <p className={styles.heading}>Included in your package</p>
          <ul className={styles.list}>
            {doc.includes.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </>
      ) : null}

      {doc.menu.length > 0 ? (
        <>
          <p className={styles.heading}>Menu</p>
          <ul className={styles.list}>
            {doc.menu.map((item, i) => (
              <li key={`${item}-${i}`}>{item}</li>
            ))}
          </ul>
        </>
      ) : null}

      {doc.dietary.length > 0 ? (
        <p className={styles.note}>
          Dietary requirements catered for: {doc.dietary.join(", ")}.
        </p>
      ) : null}

      <p className={styles.terms}>
        Valid until {longDate(doc.validUntil)}. A {doc.depositPct}% deposit —{" "}
        {money(doc.depositAmount)} — confirms your date.
      </p>
    </article>
  );
}
