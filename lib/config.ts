import {
  activeChain,
  activeExplorerUrl,
  activeRpcUrl,
  appNetwork,
} from "./network";

const mainnetCollectionAddress =
  process.env.NEXT_PUBLIC_HOODIES_MAINNET_ADDRESS?.trim() ||
  process.env.NEXT_PUBLIC_COLLECTION_ADDRESS?.trim() ||
  "";

const testnetCollectionAddress =
  process.env.NEXT_PUBLIC_HOODIES_TESTNET_ADDRESS?.trim() || "";

const mainnetRegistryAddress =
  process.env.NEXT_PUBLIC_HOOD_TALK_REGISTRY_MAINNET_ADDRESS?.trim() || "";

const testnetRegistryAddress =
  process.env.NEXT_PUBLIC_HOOD_TALK_REGISTRY_TESTNET_ADDRESS?.trim() || "";

const mainnetRendererAddress =
  process.env.NEXT_PUBLIC_RENDERER_MAINNET_ADDRESS?.trim() ||
  process.env.NEXT_PUBLIC_RENDERER_ADDRESS?.trim() ||
  "";

const testnetRendererAddress =
  process.env.NEXT_PUBLIC_RENDERER_TESTNET_ADDRESS?.trim() || "";

const mainnetPixelDataAddress =
  process.env.NEXT_PUBLIC_PIXEL_DATA_MAINNET_ADDRESS?.trim() ||
  process.env.NEXT_PUBLIC_PIXEL_DATA_ADDRESS?.trim() ||
  "";

const testnetPixelDataAddress =
  process.env.NEXT_PUBLIC_PIXEL_DATA_TESTNET_ADDRESS?.trim() || "";

export const siteConfig = {
  name: "OnChainHoodies",
  shortName: "HOODIES",
  description:
    "A fully on-chain neighborhood built by builders for the people of Web3.",
  xUrl: "https://x.com/OnChainHoodies",
  githubUrl: "https://github.com/FILTER8/hoodies",
  mintbayUrl: "https://mintbay.xyz",
  discordUrl: "https://discord.gg/onchainhood",
  openSeaUrl: process.env.NEXT_PUBLIC_OPENSEA_URL?.trim() || "#",

  network: appNetwork,
  chain: activeChain,
  chainId: activeChain.id,
  chainName: activeChain.name,
  rpcUrl: activeRpcUrl,
  explorerUrl: activeExplorerUrl,

  collectionAddress:
    appNetwork === "mainnet"
      ? mainnetCollectionAddress
      : testnetCollectionAddress,

  hoodTalkRegistryAddress:
    appNetwork === "mainnet"
      ? mainnetRegistryAddress
      : testnetRegistryAddress,

  rendererAddress:
    appNetwork === "mainnet"
      ? mainnetRendererAddress
      : testnetRendererAddress,

  pixelDataAddress:
    appNetwork === "mainnet"
      ? mainnetPixelDataAddress
      : testnetPixelDataAddress,
};

export function shortAddress(address: string) {
  if (!address) return "Coming soon";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function contractExplorerUrl(address: string) {
  if (!address) return "#";
  return `${siteConfig.explorerUrl.replace(/\/$/, "")}/address/${address}`;
}

export function transactionExplorerUrl(hash: string) {
  if (!hash) return "#";
  return `${siteConfig.explorerUrl.replace(/\/$/, "")}/tx/${hash}`;
}
