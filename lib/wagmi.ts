import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "viem";
import { robinhoodMainnet, robinhoodTestnet } from "./network";

const projectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim() ||
  "00000000000000000000000000000000";

export const walletConnectConfigured =
  projectId !== "00000000000000000000000000000000";

export const wagmiConfig = getDefaultConfig({
  appName: "OnChainHoodies",
  appDescription:
    "A fully on-chain neighborhood for builders, collectors, flippers and HODLers.",
  appUrl: "https://onchainhoodies.xyz",
  projectId,
  chains: [robinhoodMainnet, robinhoodTestnet],
  transports: {
    [robinhoodMainnet.id]: http(
      process.env.NEXT_PUBLIC_ROBINHOOD_MAINNET_RPC_URL?.trim() ||
        "https://rpc.mainnet.chain.robinhood.com",
    ),
    [robinhoodTestnet.id]: http(
      process.env.NEXT_PUBLIC_ROBINHOOD_TESTNET_RPC_URL?.trim() ||
        "https://rpc.testnet.chain.robinhood.com",
    ),
  },
  ssr: true,
});
