import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Hoodie Cam",
  appleWebApp: {
    capable: true,
    title: "Hoodie Cam",
    statusBarStyle: "black-translucent",
  },
  icons: {
    apple: "/cam-icon-180.png",
  },
};

export default function CamLayout({ children }: { children: React.ReactNode }) {
  return children;
}