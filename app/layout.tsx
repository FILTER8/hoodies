import "./globals.css";
import type { Metadata, Viewport } from "next";
import AppShell from "../components/AppShell";

export const metadata: Metadata = {
  metadataBase: new URL("https://onchainhoodies.xyz"),
  title: {
    default: "OnChainHoodies",
    template: "%s · OnChainHoodies",
  },
  description:
    "A fully on-chain neighborhood built by builders for the people of Web3.",
  openGraph: {
    title: "OnChainHoodies",
    description:
      "The collection is permanent. The Hood keeps building.",
    images: [{ url: "/og-banner.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "OnChainHoodies",
    description:
      "The collection is permanent. The Hood keeps building.",
    images: ["/og-banner.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ccff00",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
