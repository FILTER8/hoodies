"use client";

import { WalletProvider } from "./WalletProvider";

export default function AppShell({ children }: { children: React.ReactNode }) {
  return <WalletProvider>{children}</WalletProvider>;
}
