"use client";

import "@rainbow-me/rainbowkit/styles.css";

import {
  RainbowKitProvider,
  lightTheme,
} from "@rainbow-me/rainbowkit";
import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { useState } from "react";
import { WagmiProvider } from "wagmi";
import { robinhoodChain, wagmiConfig } from "../lib/wagmi";
import { WalletProvider } from "./WalletProvider";

export default function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 2,
            staleTime: 15_000,
          },
        },
      })
  );

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          initialChain={robinhoodChain}
          modalSize="compact"
          theme={lightTheme({
            accentColor: "#000000",
            accentColorForeground: "#ccff00",
            borderRadius: "none",
            fontStack: "system",
            overlayBlur: "small",
          })}
        >
          <WalletProvider>{children}</WalletProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
