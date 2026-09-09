import type { Metadata } from "next";
import { Cormorant_Garamond, Montserrat, Mulish } from "next/font/google";
import "./globals.css";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600"],
  style: ["normal", "italic"],
  variable: "--font-cormorant",
  display: "swap",
});

const mulish = Mulish({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-mulish",
  display: "swap",
});

/* The website sets its wordmark in Montserrat, apart from both the display and
   the body face. It is used here only for the brand lockup in the nav. */
const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-montserrat",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Urban Entertaining — Operations",
    template: "%s · Urban Entertaining",
  },
  description: "Quoting and ordering for Urban Entertaining.",
  // Internal tool; the public quote page sets its own noindex too.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en-AU"
      className={`${cormorant.variable} ${mulish.variable} ${montserrat.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
