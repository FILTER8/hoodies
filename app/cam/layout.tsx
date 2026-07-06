import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Hoodie Cam",
  appleWebApp: {
    capable: true,
    title: "Hoodie Cam",
    statusBarStyle: "black-translucent",
  },
};

export default function CamLayout({ children }: { children: React.ReactNode }) {
  return children;
}