import { defineChain } from "viem";

export type AppNetwork = "testnet" | "mainnet";

const configuredNetwork =
  process.env.NEXT_PUBLIC_NETWORK?.trim().toLowerCase();

export const appNetwork: AppNetwork =
  configuredNetwork === "mainnet" ? "mainnet" : "testnet";

export const robinhoodMainnet = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: [
        process.env.NEXT_PUBLIC_ROBINHOOD_MAINNET_RPC_URL?.trim() ||
          "https://rpc.mainnet.chain.robinhood.com",
      ],
    },
  },
  blockExplorers: {
    default: {
      name: "Robinhood Chain Explorer",
      url:
        process.env.NEXT_PUBLIC_ROBINHOOD_MAINNET_EXPLORER_URL?.trim() ||
        "https://robinhoodchain.blockscout.com",
    },
  },
});

export const robinhoodTestnet = defineChain({
  id: 46630,
  name: "Robinhood Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: [
        process.env.NEXT_PUBLIC_ROBINHOOD_TESTNET_RPC_URL?.trim() ||
          "https://rpc.testnet.chain.robinhood.com",
      ],
    },
  },
  blockExplorers: {
    default: {
      name: "Robinhood Testnet Explorer",
      url:
        process.env.NEXT_PUBLIC_ROBINHOOD_TESTNET_EXPLORER_URL?.trim() ||
        "https://explorer.testnet.chain.robinhood.com",
    },
  },
});

export const activeChain =
  appNetwork === "mainnet" ? robinhoodMainnet : robinhoodTestnet;

export const activeChainId = activeChain.id;
export const activeRpcUrl = activeChain.rpcUrls.default.http[0];
export const activeExplorerUrl = activeChain.blockExplorers.default.url;

export function isSupportedChainId(chainId?: number | null) {
  return chainId === robinhoodMainnet.id || chainId === robinhoodTestnet.id;
}

export function isActiveChainId(chainId?: number | null) {
  return chainId === activeChain.id;
}
