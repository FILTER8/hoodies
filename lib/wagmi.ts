import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { defineChain, http } from "viem";

const projectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim() ||
  "00000000000000000000000000000000";

export const walletConnectConfigured =
  projectId !== "00000000000000000000000000000000";

export const robinhoodChain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: {
    name: "Ether",
    symbol: "ETH",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.mainnet.chain.robinhood.com"],
    },
  },
  blockExplorers: {
    default: {
      name: "Robinhood Chain Explorer",
      url: "https://robinhoodchain.blockscout.com",
    },
  },
});

export const wagmiConfig = getDefaultConfig({
  appName: "OnChainHoodies",
  appDescription:
    "A fully on-chain neighborhood for builders, collectors, flippers and HODLers.",
  appUrl: "https://onchainhoodies.xyz",
  projectId,
  chains: [robinhoodChain],
  transports: {
    [robinhoodChain.id]: http(
      process.env.NEXT_PUBLIC_ROBINHOOD_RPC_URL?.trim() ||
        "https://rpc.mainnet.chain.robinhood.com"
    ),
  },
  ssr: true,
});
