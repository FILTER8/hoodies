"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
} from "react";
import {
  useAccount,
  useDisconnect,
} from "wagmi";

type WalletContextValue = {
  address: string | null;
  connecting: boolean;
  connected: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
};

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const {
    address,
    isConnected,
    isConnecting,
    isReconnecting,
  } = useAccount();
  const { disconnect: disconnectWallet } = useDisconnect();
  const { openConnectModal } = useConnectModal();

  const connect = useCallback(async () => {
    openConnectModal?.();
  }, [openConnectModal]);

  const disconnect = useCallback(() => {
    disconnectWallet();
  }, [disconnectWallet]);

  const value = useMemo<WalletContextValue>(
    () => ({
      address: address ?? null,
      connecting: isConnecting || isReconnecting,
      connected: isConnected,
      error: null,
      connect,
      disconnect,
    }),
    [
      address,
      connect,
      disconnect,
      isConnected,
      isConnecting,
      isReconnecting,
    ]
  );

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const value = useContext(WalletContext);

  if (!value) {
    throw new Error("useWallet must be used inside WalletProvider");
  }

  return value;
}
