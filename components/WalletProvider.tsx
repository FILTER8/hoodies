"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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

const WalletContext =
  createContext<WalletContextValue | null>(
    null,
  );

const PASSPORT_API_BASE =
  process.env
    .NEXT_PUBLIC_PASSPORT_API_URL
    ?.trim() ||
  (process.env.NODE_ENV === "development"
    ? "http://localhost:8787"
    : "https://passport-api.onchainhoodies.xyz");

function messageFromError(
  error: unknown,
) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unable to switch wallet network.";
}

function sameWallet(
  a?: string | null,
  b?: string | null,
) {
  return (
    !!a &&
    !!b &&
    a.toLowerCase() ===
      b.toLowerCase()
  );
}

async function getPassportSessionWallet():
  Promise<string | null> {
  try {
    const response =
      await fetch(
        `${PASSPORT_API_BASE}/v1/account`,
        {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        },
      );

    if (response.status === 401) {
      return null;
    }

    if (!response.ok) {
      return null;
    }

    const data =
      (await response.json()) as {
        wallet?: string | null;
      };

    return data.wallet ?? null;
  } catch {
    return null;
  }
}

async function logoutPassportSession() {
  try {
    await fetch(
      `${PASSPORT_API_BASE}/v1/auth/logout`,
      {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          "content-type":
            "application/json",
        },
      },
    );
  } catch {
    /*
     * Wallet switching should never fail
     * because Passport logout could not
     * be reached.
     */
  }
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

  const chainId =
    useChainId();

  const {
    disconnect:
      disconnectWallet,
  } = useDisconnect();

  const {
    openConnectModal,
  } = useConnectModal();

  const {
    refetch:
      refetchWalletClient,
  } = useWalletClient();

  const {
    switchChainAsync,
    isPending:
      switchingNetwork,
    error:
      switchError,
  } = useSwitchChain();

  /*
   * Prevent multiple simultaneous
   * Passport session checks during
   * wallet reconnect / switch events.
   */
  const sessionCheckId =
    useRef(0);

  /*
   * Keep the Passport cookie synchronized
   * with the wallet currently connected
   * through Wagmi.
   *
   * IMPORTANT:
   *
   * This does NOT remove the wallet/X
   * relationship from the database.
   *
   * It only destroys the browser session
   * if that session belongs to another
   * wallet.
   */
  useEffect(() => {
    const currentAddress =
      address?.toLowerCase() ??
      null;

    const checkId =
      ++sessionCheckId.current;

    if (
      !isConnected ||
      !currentAddress
    ) {
      return;
    }

    void (async () => {
      const sessionWallet =
        await getPassportSessionWallet();

      /*
       * Wallet changed again while the
       * request was running.
       */
      if (
        checkId !==
        sessionCheckId.current
      ) {
        return;
      }

      /*
       * No Passport session.
       *
       * Nothing to clear.
       */
      if (!sessionWallet) {
        return;
      }

      /*
       * Existing Passport session already
       * belongs to the connected wallet.
       */
      if (
        sameWallet(
          sessionWallet,
          currentAddress,
        )
      ) {
        return;
      }

      console.log(
        "Connected wallet changed. Clearing stale Passport session.",
        {
          sessionWallet,
          connectedWallet:
            currentAddress,
        },
      );

      await logoutPassportSession();
    })();
  }, [
    address,
    isConnected,
  ]);

  const connect =
    useCallback(
      async () => {
        openConnectModal?.();
      },
      [
        openConnectModal,
      ],
    );

  const disconnect =
    useCallback(() => {
      /*
       * Clear the browser Passport session
       * when explicitly disconnecting too.
       *
       * Do not wait on this request before
       * disconnecting RainbowKit.
       */
      void logoutPassportSession();

      disconnectWallet();
    }, [
      disconnectWallet,
    ]);

  const ensureRequiredNetwork =
    useCallback(
      async () => {
        if (!isConnected) {
          openConnectModal?.();

          throw new Error(
            "Connect your wallet first.",
          );
        }

        if (
          chainId ===
          siteConfig.chainId
        ) {
          return;
        }

        if (
          !switchChainAsync
        ) {
          throw new Error(
            `Please switch your wallet to ${siteConfig.chainName}.`,
          );
        }

        await switchChainAsync({
          chainId:
            siteConfig.chainId,
        });
      },
      [
        chainId,
        isConnected,
        openConnectModal,
        switchChainAsync,
      ],
    );

  const getWalletClient =
    useCallback(
      async (): Promise<WalletClient> => {
        if (!isConnected) {
          openConnectModal?.();

          throw new Error(
            "Connect your wallet first.",
          );
        }

        const result =
          await refetchWalletClient();

        if (!result.data) {
          throw new Error(
            "No connected wallet client was found.",
          );
        }

        return result.data;
      },
      [
        isConnected,
        openConnectModal,
        refetchWalletClient,
      ],
    );

  const value =
    useMemo<WalletContextValue>(
      () => ({
        address:
          address ??
          null,

        chainId:
          isConnected
            ? chainId
            : null,

        requiredChainId:
          siteConfig.chainId,

        requiredChainName:
          siteConfig.chainName,

        connecting:
          isConnecting ||
          isReconnecting,

        switchingNetwork,

        connected:
          isConnected,

        onRequiredNetwork:
          isConnected &&
          chainId ===
            siteConfig.chainId,

        error:
          switchError
            ? messageFromError(
                switchError,
              )
            : null,

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
    <WalletContext.Provider
      value={value}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const value =
    useContext(
      WalletContext,
    );

  if (!value) {
    throw new Error(
      "useWallet must be used inside WalletProvider",
    );
  }

  return value;
}