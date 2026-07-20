export const siteConfig = {
  name: "OnChainHoodies",
  shortName: "HOODIES",
  description:
    "A fully on-chain neighborhood built by builders for the people of Web3.",
  xUrl: "https://x.com/OnChainHoodies",
  githubUrl: "https://github.com/FILTER8/hoodies",
  mintbayUrl: "https://mintbay.xyz",
  discordUrl: "https://discord.gg/onchainhood",
  openSeaUrl: process.env.NEXT_PUBLIC_OPENSEA_URL || "#",
  explorerUrl: process.env.NEXT_PUBLIC_EXPLORER_URL || "#",
  collectionAddress: process.env.NEXT_PUBLIC_COLLECTION_ADDRESS || "",
  rendererAddress: process.env.NEXT_PUBLIC_RENDERER_ADDRESS || "",
  pixelDataAddress: process.env.NEXT_PUBLIC_PIXEL_DATA_ADDRESS || "",
  chainName: process.env.NEXT_PUBLIC_CHAIN_NAME || "Robinhood Chain",
};

export function shortAddress(address: string) {
  if (!address) return "Coming soon";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function contractExplorerUrl(address: string) {
  if (!address || !siteConfig.explorerUrl || siteConfig.explorerUrl === "#") {
    return "#";
  }

  return `${siteConfig.explorerUrl.replace(/\/$/, "")}/address/${address}`;
}
