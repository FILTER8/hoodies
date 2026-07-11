"use client";

import { useWallet } from "./WalletProvider";

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default function WalletButton() {
  const { address, connecting, error, connect, disconnect } = useWallet();

  return (
    <div className="relative">
      <button
        type="button"
        onClick={address ? disconnect : connect}
        className="border-2 border-black px-4 py-2 text-[11px] uppercase tracking-[0.16em] transition-colors hover:bg-black hover:text-[#ccff00]"
      >
        {connecting
          ? "Connecting"
          : address
          ? shortAddress(address)
          : "Connect Wallet"}
      </button>

      {error && (
        <div className="absolute right-0 top-full mt-2 w-64 border-2 border-black bg-[#ccff00] p-3 text-[10px] leading-relaxed">
          {error}
        </div>
      )}
    </div>
  );
}
