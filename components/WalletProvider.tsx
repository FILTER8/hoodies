"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
} from "react";
import type { WalletClient } from "viem";
import {
  useAccount,
  useChainId,
  useDisconnect,
  useSwitchChain,
  useWalletClient,
} from "wagmi";
import { siteConfig } from "../lib/config";

type WalletContextValue = {
  address: string | null;
  chainId: number | null;
  requiredChainId: number;
  requiredChainName: string;
  connecting: boolean;
  switchingNetwork: boolean;
  connected: boolean;
  onRequiredNetwork: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  ensureRequiredNetwork: () => Promise<void>;
  getWalletClient: () => Promise<WalletClient>;
};

const WalletContext = createContext<WalletContextValue | null>(null);

function messageFromError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unable to switch wallet network.";
}

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

  const chainId = useChainId();
  const { disconnect: disconnectWallet } = useDisconnect();
  const { openConnectModal } = useConnectModal();

  const {
    refetch: refetchWalletClient,
  } = useWalletClient();

  const {
    switchChainAsync,
    isPending: switchingNetwork,
    error: switchError,
  } = useSwitchChain();

  const connect = useCallback(async () => {
    openConnectModal?.();
  }, [openConnectModal]);

  const disconnect = useCallback(() => {
    disconnectWallet();
  }, [disconnectWallet]);

  const ensureRequiredNetwork = useCallback(async () => {
    if (!isConnected) {
      openConnectModal?.();
      throw new Error("Connect your wallet first.");
    }

    if (chainId === siteConfig.chainId) {
      return;
    }

    if (!switchChainAsync) {
      throw new Error(
        `Please switch your wallet to ${siteConfig.chainName}.`,
      );
    }

    await switchChainAsync({
      chainId: siteConfig.chainId,
    });
  }, [
    chainId,
    isConnected,
    openConnectModal,
    switchChainAsync,
  ]);

  const getWalletClient = useCallback(async (): Promise<WalletClient> => {
    if (!isConnected) {
      openConnectModal?.();
      throw new Error("Connect your wallet first.");
    }

    const result = await refetchWalletClient();

    if (!result.data) {
      throw new Error("No connected wallet client was found.");
    }

    return result.data;
  }, [
    isConnected,
    openConnectModal,
    refetchWalletClient,
  ]);

  const value = useMemo<WalletContextValue>(
    () => ({
      address: address ?? null,
      chainId: isConnected ? chainId : null,
      requiredChainId: siteConfig.chainId,
      requiredChainName: siteConfig.chainName,
      connecting: isConnecting || isReconnecting,
      switchingNetwork,
      connected: isConnected,
      onRequiredNetwork:
        isConnected && chainId === siteConfig.chainId,
      error: switchError ? messageFromError(switchError) : null,
      connect,
      disconnect,
      ensureRequiredNetwork,
      getWalletClient,
    }),
    [
      address,
      chainId,
      connect,
      disconnect,
      ensureRequiredNetwork,
      getWalletClient,
      isConnected,
      isConnecting,
      isReconnecting,
      switchError,
      switchingNetwork,
    ],
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