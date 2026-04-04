import type { Metadata } from "next";
import { Lato } from "next/font/google";
import "./globals.css";

const lato = Lato({
  subsets: ["latin"],
  weight: ["300", "400", "700", "900"],
  variable: "--font-site",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://smartpos.lk";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
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
    <html lang="en" className={lato.variable}>
      <body>{children}</body>
    </html>
  );
}
