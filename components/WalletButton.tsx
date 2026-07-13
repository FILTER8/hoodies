"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { walletConnectConfigured } from "../lib/wagmi";

export default function WalletButton() {
  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        mounted,
        openAccountModal,
        openChainModal,
        openConnectModal,
        authenticationStatus,
      }) => {
        const ready =
          mounted && authenticationStatus !== "loading";
        const connected =
          ready &&
          account &&
          chain &&
          (!authenticationStatus ||
            authenticationStatus === "authenticated");

        return (
          <div
            {...(!ready && {
              "aria-hidden": true,
              style: {
                opacity: 0,
                pointerEvents: "none",
                userSelect: "none",
              },
            })}
          >
            {!connected ? (
              <button
                type="button"
                onClick={openConnectModal}
                className="group flex min-h-10 items-center gap-2 border-2 border-black bg-black px-4 py-2 text-[10px] uppercase tracking-[0.14em] text-[#ccff00] transition-colors hover:bg-[#ccff00] hover:text-black"
              >
                <span
                  aria-hidden="true"
                  className="h-2 w-2 bg-[#ccff00] group-hover:bg-black"
                />
                <span>
                  {walletConnectConfigured
                    ? "Connect wallet"
                    : "Connect wallet"}
                </span>
              </button>
            ) : chain.unsupported ? (
              <button
                type="button"
                onClick={openChainModal}
                className="flex min-h-10 items-center gap-2 border-2 border-black bg-black px-4 py-2 text-[10px] uppercase tracking-[0.14em] text-[#ccff00]"
              >
                <span
                  aria-hidden="true"
                  className="h-2 w-2 bg-red-500"
                />
                Wrong network
              </button>
            ) : (
              <div className="flex items-stretch">
                <button
                  type="button"
                  onClick={openChainModal}
                  className="hidden items-center gap-2 border-2 border-r-0 border-black px-3 py-2 text-[9px] uppercase tracking-[0.12em] transition-colors hover:bg-black hover:text-[#ccff00] xl:flex"
                  aria-label={`Connected to ${chain.name}`}
                >
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 bg-black"
                  />
                  {chain.name}
                </button>

                <button
                  type="button"
                  onClick={openAccountModal}
                  className="flex min-h-10 items-center gap-2 border-2 border-black bg-black px-4 py-2 text-[10px] uppercase tracking-[0.14em] text-[#ccff00] transition-colors hover:bg-[#ccff00] hover:text-black"
                >
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 bg-[#ccff00]"
                  />
                  {account.displayName}
                </button>
              </div>
            )}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
