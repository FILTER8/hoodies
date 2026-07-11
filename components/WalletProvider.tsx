"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

type WalletContextValue = {
  address: string | null;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
};

const WalletContext = createContext<WalletContextValue | null>(null);

function normalizeAddress(value: unknown) {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value)
    ? value
    : null;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const provider = window.ethereum;
    if (!provider) return;

    const restore = async () => {
      try {
        const accounts = (await provider.request({
          method: "eth_accounts",
        })) as unknown[];
        setAddress(normalizeAddress(accounts?.[0]));
      } catch {
        // Silent restore failure: the Connect button remains available.
      }
    };

    const onAccountsChanged = (...args: unknown[]) => {
      const accounts = args[0] as unknown[] | undefined;
      setAddress(normalizeAddress(accounts?.[0]));
    };

    void restore();
    provider.on?.("accountsChanged", onAccountsChanged);

    return () => {
      provider.removeListener?.("accountsChanged", onAccountsChanged);
    };
  }, []);

  const connect = useCallback(async () => {
    setError(null);

    if (!window.ethereum) {
      setError("No browser wallet found. Install MetaMask or another EVM wallet.");
      return;
    }

    setConnecting(true);
    try {
      const accounts = (await window.ethereum.request({
        method: "eth_requestAccounts",
      })) as unknown[];
      setAddress(normalizeAddress(accounts?.[0]));
    } catch (connectError) {
      setError(
        connectError instanceof Error
          ? connectError.message
          : "Wallet connection was cancelled."
      );
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    setError(null);
  }, []);

  const value = useMemo(
    () => ({ address, connecting, error, connect, disconnect }),
    [address, connecting, error, connect, disconnect]
  );

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}

export function useWallet() {
  const value = useContext(WalletContext);
  if (!value) {
    throw new Error("useWallet must be used inside WalletProvider");
  }
  return value;
}
