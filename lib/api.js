const network =
  process.env.NEXT_PUBLIC_NETWORK?.trim().toLowerCase() === "mainnet"
    ? "mainnet"
    : "testnet";

const productionApiUrl =
  process.env.NEXT_PUBLIC_PRODUCTION_API_URL?.trim() ||
  "https://api.onchainhoodies.xyz";

export const collectionApiBase =
  network === "mainnet" ? productionApiUrl : "";

export const hoodTalkApiBase = "";

function joinUrl(base, path) {
  const cleanBase = base.replace(/\/+$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;

  return `${cleanBase}${cleanPath}`;
}

export function collectionApiUrl(path) {
  return joinUrl(collectionApiBase, path);
}

export function hoodTalkApiUrl(path = "/api/hood-talk") {
  return joinUrl(hoodTalkApiBase, path);
}

export const apiConfig = {
  network,
  isMainnet: network === "mainnet",
  isTestnet: network === "testnet",
  collectionApiBase,
  hoodTalkApiBase,
};