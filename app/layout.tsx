import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  metadataBase: new URL("https://onchainhoodies.xyz"),

  title: "HOODIES",

  description:
    "The fully on-chain neighborhood of Web3. 1-bit. Hand-drawn. Fully on-chain.",

  openGraph: {
    title: "HOODIES",
    description:
      "The fully on-chain neighborhood of Web3. 1-bit. Hand-drawn. Fully on-chain.",
    images: [
      {
        url: "/og-banner.png",
        width: 1200,
        height: 630,
      },
    ],
  },

  twitter: {
    card: "summary_large_image",
    title: "HOODIES",
    description:
      "The fully on-chain neighborhood of Web3. 1-bit. Hand-drawn. Fully on-chain.",
    images: ["/og-banner.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}