import type { Metadata, Viewport } from "next";
import { Lato } from "next/font/google";
import "./globals.css";
import PwaServiceWorkerRegistration from "@/components/PwaServiceWorkerRegistration";

const lato = Lato({
  subsets: ["latin"],
  weight: ["300", "400", "700", "900"],
  variable: "--font-site",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://smartpos.lk";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SmartPOS",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: "#1fa783",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={lato.variable}>
      <body>
        {children}
        <PwaServiceWorkerRegistration />
      </body>
    </html>
  );
}
