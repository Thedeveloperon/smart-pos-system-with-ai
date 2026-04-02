import type { Metadata } from "next";
import { DM_Sans, Space_Grotesk } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-dm-sans",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-space-grotesk",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://smartpos.lk";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "SmartPOS - Fast Billing and Shop Management for Small Businesses",
    template: "%s | SmartPOS",
  },
  description:
    "A smart, easy-to-use POS system for small shops built for fast sales, simple stock control, and zero hassle.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: "SmartPOS",
    title: "SmartPOS - Fast Billing and Shop Management for Small Businesses",
    description:
      "Run sales, track stock, and get instant business insights from one smart POS system.",
    images: [
      {
        url: "/placeholder.svg",
        width: 1200,
        height: 630,
        alt: "SmartPOS marketing preview",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "SmartPOS - Fast Billing and Shop Management for Small Businesses",
    description:
      "Run sales, track stock, and get instant business insights from one smart POS system.",
    images: ["/placeholder.svg"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${dmSans.variable} ${spaceGrotesk.variable}`}>{children}</body>
    </html>
  );
}
