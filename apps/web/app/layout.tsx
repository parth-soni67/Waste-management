import type { Metadata } from "next";
import { DM_Sans, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

/**
 * Typography per design_guide.md §3:
 * - Display/headline: Plus Jakarta Sans (geometric humanist, similar to General Sans)
 * - Body/UI: DM Sans (clean grotesque, highly legible)
 */
const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  display: "swap",
  weight: ["500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: {
    default: "WasteWise AI",
    template: "%s | WasteWise AI",
  },
  description:
    "AI-Powered Predictive Waste Management & Municipal Intelligence Platform. " +
    "We predict where waste will appear, decide what needs attention first, " +
    "dynamically optimize collection, and verify that the problem was actually solved.",
  keywords: [
    "waste management",
    "smart city",
    "AI",
    "predictive analytics",
    "municipal intelligence",
    "route optimization",
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${dmSans.variable} ${plusJakarta.variable} h-full antialiased`}
    >
      <body
        suppressHydrationWarning
        className="min-h-full flex flex-col bg-[var(--color-canvas)] text-[var(--color-ink)]"
      >
        {children}
      </body>
    </html>
  );
}
