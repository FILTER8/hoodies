"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Contract, Interface, JsonRpcProvider, formatEther, getAddress, isAddress } from "ethers";
import { parseAbi, encodeAbiParameters, keccak256 } from "viem";
import type { Address, Hex } from "viem";
import SiteHeader from "../../../components/SiteHeader";
import SiteFooter from "../../../components/SiteFooter";
import HoodieSelector from "../../../components/HoodieSelector";
import HoodWalletFunds from "../../../components/HoodWalletFunds";
import { useWallet } from "../../../components/WalletProvider";
import { siteConfig } from "../../../lib/config";

const NET = "0x00000000B24D62781dB359b07880a105cD0b64e6";
const EXPLORER_URL = "https://robin.etherscan.io";
const HOOD_OS_ABI = [
  "function hoodInfo(uint256 tokenId) view returns (tuple(uint256 tokenId,address owner,address wallet,bool walletDeployed,bool active,address activationOwner,uint64 activatedAt,uint256 walletState,uint256 nativeBalance,uint256 paymentTokenBalance) info)",
] as const;
const NET_COLLECTION_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function NET() view returns (address)",
  "function price() view returns (uint256)",
  "function maxSupply() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function maxMintsPerWallet() view returns (uint256)",
  "function creatorReserve() view returns (uint256)",
  "function creatorMinted() view returns (uint256)",
  "function mint(uint256 amount) payable",
  "function hoodieClaimed(uint256 hoodieId) view returns (bool)",
  "function HOODIE_CONTRACT() view returns (address)",
  "function freeMint(uint256 hoodieId)",
] as const;
const HOOD_WALLET_SIGNATURE =
  "function execute(address target, uint256 value, bytes data, uint8 operation) payable returns (bytes result)";
const HOOD_WALLET_ABI = parseAbi([HOOD_WALLET_SIGNATURE]);
const mintInterface = new Interface(["function mint(uint256 amount) payable"]);
const freeMintInterface = new Interface(["function freeMint(uint256 hoodieId)"]);
const FREE_MINT_ABI = parseAbi(["function freeMint(uint256 hoodieId)"]);
const ERC721_TRANSFER_ABI = parseAbi(["function safeTransferFrom(address from,address to,uint256 tokenId)"]);
const erc721TransferInterface = new Interface(["function safeTransferFrom(address from,address to,uint256 tokenId)"]);
const MINTBAY_HOLDER_ABI = parseAbi(["function holderClaim(address sourceContract,uint256 sourceTokenId) payable"]);
const mintbayHolderInterface = new Interface(["function holderClaim(address sourceContract,uint256 sourceTokenId) payable"]);
const MINTBAY_ELIGIBILITY_ABI = [
  "function holderClaimEnabled() view returns (bool)",
  "function approvedClaimCollections(address) view returns (bool approved,uint256 priceEth)",
  "function claimsUsed(bytes32) view returns (uint256)",
  "function claimsPerToken() view returns (uint256)",
] as const;
const HOODIE_NFT_ADDRESS = "0x9Ec6C5b9f572A9B02138E553BC5F5882Da735F45";
const executeInterface = new Interface([HOOD_WALLET_SIGNATURE]);
const erc721Interface = new Interface([
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  "function tokenURI(uint256 tokenId) view returns (string)",
]);
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const MAX_REVEAL = 100;

type MintedToken = { id: string; image: string | null; title: string; metadataError?: string };

const PORTRAIT_ADDRESS = "0x2eE6305804dD94F7ff695C5Ab1f3AE805f317653";
const PNG_SIZE = 800;

function openSeaTokenUrl(collectionAddress: string, id: string) {
  return `https://opensea.io/assets/robinhood/${collectionAddress}/${id}`;
}

function safeCollectionFilename(name: string): string {
  return name.trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "Collection";
}

async function exportPng800(imageUrl: string, collectionName: string, collectionAddress: string, tokenId: string): Promise<void> {
  const image = new window.Image();
  // Required for remotely hosted art; data: SVGs work without external requests.
  image.crossOrigin = "anonymous";
  image.decoding = "async";
  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Unable to load the NFT artwork for PNG export."));
  });
  image.src = imageUrl;
  await loaded;

  // The portrait is an 8x8 SVG. First rasterize at its native resolution,
  // then scale with nearest-neighbor to retain perfectly crisp square pixels.
  const sourceSize = collectionAddress.toLowerCase() === PORTRAIT_ADDRESS.toLowerCase()
    ? 8
    : Math.max(1, Math.min(2048, image.naturalWidth || PNG_SIZE));
  const sourceHeight = collectionAddress.toLowerCase() === PORTRAIT_ADDRESS.toLowerCase()
    ? 8
    : Math.max(1, Math.min(2048, image.naturalHeight || PNG_SIZE));
  const source = document.createElement("canvas");
  source.width = sourceSize;
  source.height = sourceHeight;
  const sourceCtx = source.getContext("2d");
  if (!sourceCtx) throw new Error("Canvas is unavailable in this browser.");
  sourceCtx.imageSmoothingEnabled = false;
  sourceCtx.drawImage(image, 0, 0, sourceSize, sourceHeight);

  const output = document.createElement("canvas");
  output.width = PNG_SIZE;
  output.height = PNG_SIZE;
  const ctx = output.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable in this browser.");
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, PNG_SIZE, PNG_SIZE);
  ctx.drawImage(source, 0, 0, PNG_SIZE, PNG_SIZE);

  const blob = await new Promise<Blob>((resolve, reject) => {
    try {
      output.toBlob(result => result ? resolve(result) : reject(new Error("PNG encoding failed.")), "image/png");
    } catch (error) { reject(error); }
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeCollectionFilename(collectionName)}-${tokenId}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}


function resolveMetadataUrl(value: string): string | null {
  if (value.startsWith("ipfs://")) {
    const path = value.slice(7).replace(/^ipfs\//, "");
    return `https://ipfs.io/ipfs/${path}`;
  }
  if (value.startsWith("ar://")) return `https://arweave.net/${value.slice(5)}`;
  if (/^https:\/\//i.test(value)) return value;
  if (value.startsWith("data:image/svg+xml") || value.startsWith("data:image/png") || value.startsWith("data:image/jpeg") || value.startsWith("data:image/webp") || value.startsWith("data:image/gif")) return value;
  return null;
}

function dataJson(uri: string): unknown {
  const match = /^data:application\/json(?:;charset=[^;,]+)?(;base64)?,([\s\S]*)$/i.exec(uri);
  if (!match) throw new Error("Unsupported on-chain metadata encoding");
  const data = match[1]
    ? new TextDecoder().decode(Uint8Array.from(atob(match[2]), char => char.charCodeAt(0)))
    : decodeURIComponent(match[2]);
  return JSON.parse(data) as unknown;
}

async function loadTokenMetadata(uri: string): Promise<{ image: string | null; title?: string }> {
  let parsed: unknown;
  if (uri.startsWith("data:application/json")) {
    parsed = dataJson(uri);
  } else {
    const source = resolveMetadataUrl(uri);
    if (!source || source.startsWith("data:")) throw new Error("Unsupported tokenURI format");
    const response = await fetch(source, { signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(`Metadata HTTP ${response.status}`);
    parsed = await response.json() as unknown;
  }
  if (!parsed || typeof parsed !== "object") throw new Error("Missing metadata object");
  const metadata = parsed as Record<string, unknown>;
  const rawImage = typeof metadata.image === "string" ? metadata.image :
    typeof metadata.image_url === "string" ? metadata.image_url : null;
  return {
    image: rawImage ? resolveMetadataUrl(rawImage) : null,
    title: typeof metadata.name === "string" ? metadata.name : undefined,
  };
}

async function revealMintedTokens(
  provider: JsonRpcProvider,
  nftAddress: string,
  hoodWallet: string,
  logs: readonly { address: string; topics: readonly string[]; data: string }[],
): Promise<MintedToken[]> {
  const tokenIds: string[] = [];
  for (const log of logs) {
    if (log.address.toLowerCase() !== nftAddress.toLowerCase()) continue;
    try {
      const event = erc721Interface.parseLog({ topics: [...log.topics], data: log.data });
      if (event?.name === "Transfer" &&
          String(event.args[0]).toLowerCase() === ZERO_ADDRESS &&
          String(event.args[1]).toLowerCase() === hoodWallet.toLowerCase()) {
        tokenIds.push(BigInt(event.args[2]).toString());
      }
    } catch { /* Other events in the receipt are expected. */ }
  }
  // Never infer token IDs from totalSupply: burned tokens can create gaps.
  return Promise.all([...new Set(tokenIds)].slice(0, MAX_REVEAL).map(async (id) => {
    const token: MintedToken = { id, title: `Token #${id}`, image: null };
    try {
      const data = erc721Interface.encodeFunctionData("tokenURI", [BigInt(id)]);
      const result = await provider.call({ to: nftAddress, data });
      const [uri] = erc721Interface.decodeFunctionResult("tokenURI", result);
      const metadata = await loadTokenMetadata(String(uri));
      token.image = metadata.image;
      if (metadata.title) token.title = metadata.title;
      if (!token.image) token.metadataError = "Artwork not available in metadata";
    } catch (error) { token.metadataError = errText(error); }
    return token;
  }));
}


type Hoodie = { tokenId: string; name: string; image?: string };
type HoodInfo = { tokenId: string; owner: string; wallet: string; walletDeployed: boolean; active: boolean; nativeBalance: bigint };
type Collection = {
  address: string; name: string; symbol: string; price: bigint;
  maxSupply: bigint; totalSupply: bigint; maxMintsPerWallet: bigint;
  creatorReserve: bigint; creatorMinted: bigint;
  hoodieFreeMint: boolean;
  isNet: boolean;
  mintbayHolderEnabled: boolean;
};
type PaySource = "eoa" | "hoodwallet";

type DiscoveredCollection = {
  address: string;
  name: string;
  symbol: string;
  priceWei: string;
  circulatingSupply: string;
  maxSupply: string;
  maxMintsPerWallet: string;
  updatedAt?: string;
  interfaceCompatible: boolean;
  openSeaUrl: string;
  xSearchUrl: string;
  blockExplorerUrl: string;
};
type DiscoveryResponse = {
  chainId: number;
  collections: DiscoveredCollection[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
};
const NETMINT_DIRECTORY = "https://api.onchainhoodies.xyz/v1/netmint/collections";
const tokenOneArtCache = new Map<string, string | null>();

/** Only fetch token #1 for collection cards near the viewport. */
function LazyCollectionArtwork({ address, provider }: { address: string; provider: JsonRpcProvider }) {
  const node = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [artwork, setArtwork] = useState<string | null>(tokenOneArtCache.get(address.toLowerCase()) ?? null);
  useEffect(() => {
    const element = node.current;
    if (!element) return;
    if (typeof IntersectionObserver === "undefined") {
      const job = window.setTimeout(() => setVisible(true), 0);
      return () => window.clearTimeout(job);
    }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: "120px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    const key = address.toLowerCase();
    if (tokenOneArtCache.has(key)) {
      const job = window.setTimeout(() => setArtwork(tokenOneArtCache.get(key) ?? null), 0);
      return () => window.clearTimeout(job);
    }
    let cancelled = false;
    const job = window.setTimeout(async () => {
      try {
        const contract = new Contract(address, ["function tokenURI(uint256) view returns (string)"], provider);
        const metadata = await loadTokenMetadata(String(await contract.tokenURI(BigInt(1))));
        tokenOneArtCache.set(key, metadata.image);
        if (!cancelled) setArtwork(metadata.image);
      } catch {
        tokenOneArtCache.set(key, null);
      }
    }, 0);
    return () => { cancelled = true; window.clearTimeout(job); };
  }, [visible, address, provider]);
  return <div ref={node} className="mt-2 flex h-[76px] w-[76px] items-center justify-center overflow-hidden border border-[#ccff00] bg-black">
    {artwork ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={artwork} alt="Collection token #1" className="h-full w-full object-contain" loading="lazy" referrerPolicy="no-referrer" />
    ) : <span className="px-1 text-center text-[8px]">NFT #1</span>}
  </div>;
}
function safeBigInt(value: string): bigint | null {
  try { return BigInt(value); } catch { return null; }
}
function supplyStatus(item: DiscoveredCollection): { label: string; atCapacity: boolean; percent: number | null } {
  const max = safeBigInt(item.maxSupply);
  const minted = safeBigInt(item.circulatingSupply);
  if (max === null || minted === null) return { label: "SUPPLY UNKNOWN", atCapacity: false, percent: null };
  if (max === BigInt(0)) return { label: "UNLIMITED SUPPLY", atCapacity: false, percent: null };
  const percent = Math.min(100, Math.round(Number(minted * BigInt(100) / max)));
  return { label: minted >= max ? "MINTED OUT" : "MINT STATUS: CHECK", atCapacity: minted >= max, percent };
}


function errText(error: unknown): string {
  if (error && typeof error === "object") {
    const e = error as { shortMessage?: string; reason?: string; message?: string };
    return e.shortMessage || e.reason || e.message || "Operation failed";
  }
  return String(error || "Operation failed");
}
function short(address: string) { return `${address.slice(0, 6)}…${address.slice(-4)}`; }
function fmt(value: bigint) {
  const text = formatEther(value);
  const [integer, decimal = ""] = text.split(".");
  const fraction = decimal.slice(0, 6).replace(/0+$/, "");
  return fraction ? `${integer}.${fraction}` : integer;
}
function isAmount(value: string) { return /^[1-9]\d*$/.test(value.trim()); }
function art(tokenId: string) {
  // NET Mint runs on Robinhood mainnet; do not depend on NEXT_PUBLIC_NETWORK.
  return `https://api.onchainhoodies.xyz/images/${encodeURIComponent(tokenId)}.svg`;
}

export default function NetMintPage() {
  const { address, connect, ensureRequiredNetwork, getWalletClient } = useWallet();
  const provider = useMemo(() => new JsonRpcProvider(siteConfig.rpcUrl, Number(siteConfig.chainId), { staticNetwork: true }), []);
  const [hoodies, setHoodies] = useState<Hoodie[]>([]);
  const [fundsOpen, setFundsOpen] = useState(false);
  const [tokenId, setTokenId] = useState("");
  const [hood, setHood] = useState<HoodInfo | null>(null);
  const [ownershipLoading, setOwnershipLoading] = useState(false);
  const [hoodLoading, setHoodLoading] = useState(false);
  const [contractInput, setContractInput] = useState("");
  const initialCollectionLoaded = useRef(false);
  const [shareFeedback, setShareFeedback] = useState("");
  const [collection, setCollection] = useState<Collection | null>(null);
  const [collectionLoading, setCollectionLoading] = useState(false);
  const [quantity, setQuantity] = useState("1");
  const [paySource, setPaySource] = useState<PaySource>("eoa");
  const [eoaBalance, setEoaBalance] = useState<bigint | null>(null);
  const [pending, setPending] = useState(false);
  const [freeClaimed, setFreeClaimed] = useState<boolean | null>(null);
  const [freeClaimLoading, setFreeClaimLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [txHash, setTxHash] = useState("");
  const [mintedTokens, setMintedTokens] = useState<MintedToken[]>([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState("");
  const [mintedHoodieId, setMintedHoodieId] = useState("");
  const [mintedCollectionAddress, setMintedCollectionAddress] = useState("");
  const [mintedToEoa, setMintedToEoa] = useState(false);
  const [transferredTokens, setTransferredTokens] = useState<Record<string, boolean>>({});
  const [transferringId, setTransferringId] = useState<string | null>(null);
  const [transferMessage, setTransferMessage] = useState("");
  const [transferError, setTransferError] = useState("");
  const [revealLoading, setRevealLoading] = useState(false);
  const [revealMessage, setRevealMessage] = useState("");
  const [holderClaimState, setHolderClaimState] = useState<"checking" | "available" | "unavailable">("unavailable");
  const [holderClaimPrice, setHolderClaimPrice] = useState<bigint | null>(null);
  const [holderClaimRemaining, setHolderClaimRemaining] = useState<bigint>(BigInt(0));
  const [holderClaimInfo, setHolderClaimInfo] = useState("");
  const [discoverQuery, setDiscoverQuery] = useState("");
  const [discoverPage, setDiscoverPage] = useState(1);
  const [discovered, setDiscovered] = useState<DiscoveredCollection[]>([]);
  const orderedDiscovered = useMemo(() => [...discovered].sort((a, b) => {
    const aFull = supplyStatus(a).atCapacity;
    const bFull = supplyStatus(b).atCapacity;
    return Number(aFull) - Number(bFull) || a.name.localeCompare(b.name);
  }), [discovered]);
  const [discoverTotal, setDiscoverTotal] = useState(0);
  const [discoverMore, setDiscoverMore] = useState(false);
  const [discoverLoading, setDiscoverLoading] = useState(true);
  const [discoverError, setDiscoverError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setDiscoverLoading(true);
      setDiscoverError("");
      try {
        const url = new URL(NETMINT_DIRECTORY);
        url.searchParams.set("limit", "12");
        url.searchParams.set("page", String(discoverPage));
        if (discoverQuery.trim()) url.searchParams.set("q", discoverQuery.trim());
        const response = await fetch(url.toString(), { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error(`Directory responded with HTTP ${response.status}`);
        const data = await response.json() as DiscoveryResponse;
        if (controller.signal.aborted) return;
        if (data.chainId !== 4663 || !Array.isArray(data.collections)) throw new Error("Unexpected directory response");
        setDiscovered(previous => discoverPage === 1 ? data.collections : [
          ...previous,
          ...data.collections.filter(item => !previous.some(existing => existing.address.toLowerCase() === item.address.toLowerCase())),
        ]);
        setDiscoverTotal(data.total);
        setDiscoverMore(data.hasMore);
      } catch (error) {
        if (!controller.signal.aborted) setDiscoverError(errText(error));
      } finally {
        if (!controller.signal.aborted) setDiscoverLoading(false);
      }
    }, discoverPage === 1 ? 300 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [discoverQuery, discoverPage]);


  const fetchHood = useCallback(async (id: string) => {
    if (!id || !address) { setHood(null); return; }
    setHoodLoading(true);
    try {
      const contract = new Contract(siteConfig.hoodOSAddress, HOOD_OS_ABI, provider);
      const info = await contract.hoodInfo(BigInt(id));
      const h: HoodInfo = {
        tokenId: id, owner: String(info.owner), wallet: String(info.wallet),
        walletDeployed: Boolean(info.walletDeployed), active: Boolean(info.active),
        nativeBalance: BigInt(info.nativeBalance),
      };
      if (h.owner.toLowerCase() !== address.toLowerCase()) throw new Error("Connected wallet does not own this Hoodie.");
      setHood(h);
    } catch (e) { setHood(null); setError(errText(e)); }
    finally { setHoodLoading(false); }
  }, [address, provider]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    queueMicrotask(async () => {
      if (cancelled) return;
      setHoodies([]); setTokenId(""); setHood(null); setEoaBalance(null);
      if (!address) return;
      setOwnershipLoading(true);
      try {
        const [response, balance] = await Promise.all([
          fetch(`/api/hoodies?owner=${encodeURIComponent(address)}`, { cache: "no-store", signal: controller.signal }),
          provider.getBalance(address),
        ]);
        const payload = await response.json() as { items?: Hoodie[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "Unable to load Hoodies");
        if (cancelled) return;
        const unique = [...new Map((payload.items || []).map(h => [String(h.tokenId), h])).values()];
        setHoodies(unique); setTokenId(unique[0]?.tokenId || ""); setEoaBalance(balance);
      } catch (e) { if (!cancelled && !controller.signal.aborted) setError(errText(e)); }
      finally { if (!cancelled) setOwnershipLoading(false); }
    });
    return () => { cancelled = true; controller.abort(); };
  }, [address, provider]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) void fetchHood(tokenId); });
    return () => { cancelled = true; };
  }, [fetchHood, tokenId]);

  const loadCollection = useCallback(async (addressOverride?: string) => {
    const requestedContract = addressOverride ?? contractInput;
    if (addressOverride) setContractInput(addressOverride);
    setError(""); setMessage(""); setShareFeedback(""); setCollection(null); setFreeClaimed(null); setTxHash(""); setMintedTokens([]); setMintedHoodieId(""); setRevealMessage("");
    if (!isAddress(requestedContract)) { setError("Enter a valid Robinhood Chain collection contract address."); return; }
    setCollectionLoading(true);
    try {
      const nftAddress = getAddress(requestedContract);
      if ((await provider.getCode(nftAddress)) === "0x") throw new Error("No contract found at this address on the configured chain.");
      const nft = new Contract(nftAddress, NET_COLLECTION_ABI, provider);
      // Mintbay's holder-claim extension can be on a NET collection or a
      // separate Mintbay contract. Do not require NET() merely to claim.
      const [name, symbol, price, maxSupply, totalSupply, maxMintsPerWallet] = await Promise.all([
        nft.name(), nft.symbol(), nft.price(), nft.maxSupply(), nft.totalSupply(), nft.maxMintsPerWallet(),
      ]);
      let isNet = false;
      try { isNet = String(await nft.NET()).toLowerCase() === NET.toLowerCase(); } catch { /* Mintbay-only collection */ }
      const mintbay = new Contract(nftAddress, MINTBAY_ELIGIBILITY_ABI, provider);
      let mintbayHolderEnabled = false;
      try { mintbayHolderEnabled = Boolean(await mintbay.holderClaimEnabled()); } catch { /* Standard NET collection */ }
      if (!isNet && !mintbayHolderEnabled) throw new Error("Neither a NET collection nor an enabled Mintbay holder-claim collection.");
      let creatorReserve = BigInt(0), creatorMinted = BigInt(0);
      if (isNet) {
        try { creatorReserve = BigInt(await nft.creatorReserve()); creatorMinted = BigInt(await nft.creatorMinted()); }
        catch { /* Not required for minting */ }
      }
      let hoodieFreeMint = false;
      if (isNet) {
        try {
          const hoodieAddress = String(await nft.HOODIE_CONTRACT());
          if (hoodieAddress.toLowerCase() === HOODIE_NFT_ADDRESS.toLowerCase()) {
            await nft.hoodieClaimed(BigInt(0));
            hoodieFreeMint = true;
          }
        } catch { /* Standard NET contracts do not expose this */ }
      }
      setCollection({ address: nftAddress, name: String(name), symbol: String(symbol),
        price: BigInt(price), maxSupply: BigInt(maxSupply), totalSupply: BigInt(totalSupply),
        maxMintsPerWallet: BigInt(maxMintsPerWallet), creatorReserve, creatorMinted,
        hoodieFreeMint, isNet, mintbayHolderEnabled,
      });
    } catch (e) { setError(`Unable to verify collection: ${errText(e)}`); }
    finally { setCollectionLoading(false); }
  }, [contractInput, provider]);

  // A shared URL selects and reads the collection once on initial page load.
  // This works without requiring the visitor to connect a wallet first.
  useEffect(() => {
    // Defer the initial collection load to avoid synchronously updating React
    // state within an effect. Cleanup also handles React Strict Mode remounts.
    const timer = window.setTimeout(() => {
      if (initialCollectionLoaded.current) return;
      initialCollectionLoaded.current = true;
      const requested = new URLSearchParams(window.location.search).get("collection");
      if (requested && isAddress(requested)) void loadCollection(requested);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadCollection]);

  async function copyCollectionLink() {
    if (!collection) return;
    const url = new URL(window.location.pathname, window.location.origin);
    url.searchParams.set("collection", collection.address);
    try {
      await navigator.clipboard.writeText(url.toString());
      setShareFeedback("Collection link copied!");
    } catch {
      setShareFeedback(`Copy this link: ${url.toString()}`);
    }
  }

  useEffect(() => {
    let cancelled = false;
    const nftAddress = collection?.hoodieFreeMint ? collection.address : null;
    const id = tokenId;
    queueMicrotask(async () => {
      if (cancelled) return;
      setFreeClaimed(null);
      if (!nftAddress || !id) { setFreeClaimLoading(false); return; }
      setFreeClaimLoading(true);
      try {
        const nft = new Contract(nftAddress, NET_COLLECTION_ABI, provider);
        const claimed = Boolean(await nft.hoodieClaimed(BigInt(id)));
        if (!cancelled) setFreeClaimed(claimed);
      } catch { if (!cancelled) setFreeClaimed(null); }
      finally { if (!cancelled) setFreeClaimLoading(false); }
    });
    return () => { cancelled = true; };
  }, [collection?.address, collection?.hoodieFreeMint, tokenId, provider]);

  // Mintbay's authoritative eligibility is on-chain: source whitelist, price,
  // claims-used and per-token allowance. A failed read must never enable claims.
  useEffect(() => {
    const contractAddress = collection?.mintbayHolderEnabled ? collection.address : null;
    const ownerAddress = address;
    const selectedId = tokenId;
    let cancelled = false;
    queueMicrotask(async () => {
      if (cancelled) return;
      setHolderClaimState(contractAddress && ownerAddress && selectedId ? "checking" : "unavailable");
      setHolderClaimPrice(null);
      setHolderClaimRemaining(BigInt(0));
      setHolderClaimInfo("");
      if (!contractAddress || !ownerAddress || !selectedId) return;
      try {
        const contract = new Contract(contractAddress, MINTBAY_ELIGIBILITY_ABI, provider);
        const source = new Contract(HOODIE_NFT_ADDRESS, ["function ownerOf(uint256) view returns (address)"], provider);
        const claimKey = keccak256(encodeAbiParameters(
          [{ type: "address" }, { type: "uint256" }],
          [HOODIE_NFT_ADDRESS as Address, BigInt(selectedId)],
        ));
        const [enabled, whitelist, used, allowance, owner] = await Promise.all([
          contract.holderClaimEnabled(),
          contract.approvedClaimCollections(HOODIE_NFT_ADDRESS),
          contract.claimsUsed(claimKey),
          contract.claimsPerToken(),
          source.ownerOf(BigInt(selectedId)),
        ]);
        if (!enabled || !Boolean(whitelist[0]) || String(owner).toLowerCase() !== ownerAddress.toLowerCase())
          throw new Error("Selected Hoodie is not eligible for this collection.");
        const remaining = BigInt(allowance) - BigInt(used);
        if (remaining <= BigInt(0)) throw new Error("This Hoodie has already used its holder-claim allowance.");
        const claimPrice = BigInt(whitelist[1]);
        const data = mintbayHolderInterface.encodeFunctionData("holderClaim", [HOODIE_NFT_ADDRESS, BigInt(selectedId)]);
        await provider.call({ to: contractAddress, from: ownerAddress, data, value: claimPrice });
        if (cancelled) return;
        setHolderClaimPrice(claimPrice);
        setHolderClaimRemaining(remaining);
        setHolderClaimState("available");
        setHolderClaimInfo(`Eligible • ${remaining.toString()} claim(s) remaining. Transaction simulation passed.`);
      } catch (e) {
        if (!cancelled) { setHolderClaimState("unavailable"); setHolderClaimInfo(errText(e)); }
      }
    });
    return () => { cancelled = true; };
  }, [collection?.address, collection?.mintbayHolderEnabled, address, tokenId, provider]);

  // The claim transaction mints into the EOA because the collection uses msg.sender.
  // The NFT can be sent to the ERC-6551 account afterwards, with EOA paying gas.
  async function transferClaimedNftToHoodWallet(claimedTokenId: string) {
    if (!address || !mintedCollectionAddress || !mintedHoodieId || !mintedToEoa || pending || transferringId !== null || transferredTokens[claimedTokenId]) return;
    setTransferringId(claimedTokenId);
    setTransferError("");
    setTransferMessage("Verifying NFT ownership and HoodWallet destination…");
    try {
      await ensureRequiredNetwork();
      const os = new Contract(siteConfig.hoodOSAddress, HOOD_OS_ABI, provider);
      const hoodieInfo = await os.hoodInfo(BigInt(mintedHoodieId));
      if (String(hoodieInfo.owner).toLowerCase() !== address.toLowerCase()) {
        throw new Error(`The connected wallet no longer owns Hoodie #${mintedHoodieId}.`);
      }
      if (!Boolean(hoodieInfo.walletDeployed) || !Boolean(hoodieInfo.active)) {
        throw new Error(`Activate and deploy HoodWallet #${mintedHoodieId} before moving the NFT.`);
      }
      const destination = getAddress(String(hoodieInfo.wallet));
      if (destination.toLowerCase() === address.toLowerCase()) throw new Error("The destination is the connected wallet.");
      if (await provider.getCode(destination) === "0x") throw new Error("HoodWallet contract is not deployed.");
      const nft = new Contract(mintedCollectionAddress, ["function ownerOf(uint256) view returns (address)"], provider);
      const nftOwner = String(await nft.ownerOf(BigInt(claimedTokenId)));
      if (nftOwner.toLowerCase() !== address.toLowerCase()) {
        if (nftOwner.toLowerCase() === destination.toLowerCase()) {
          setTransferredTokens(previous => ({ ...previous, [claimedTokenId]: true }));
          setTransferMessage(`Token #${claimedTokenId} is already in HoodWallet #${mintedHoodieId}.`);
          return;
        }
        throw new Error(`Token #${claimedTokenId} is no longer owned by your connected wallet.`);
      }
      const client = await getWalletClient();
      if (!client.account || client.account.address.toLowerCase() !== address.toLowerCase()) {
        throw new Error("Connected wallet changed. Reconnect before transferring.");
      }
      const data = erc721TransferInterface.encodeFunctionData("safeTransferFrom", [address, destination, BigInt(claimedTokenId)]);
      setTransferMessage("Simulating safe NFT transfer…");
      await provider.call({ from: address, to: mintedCollectionAddress, data });
      setTransferMessage(`Approve sending NFT #${claimedTokenId} to HoodWallet #${mintedHoodieId} (EOA pays gas)…`);
      const hash = await client.writeContract({
        chain: null,
        account: client.account,
        address: mintedCollectionAddress as Address,
        abi: ERC721_TRANSFER_ABI,
        functionName: "safeTransferFrom",
        args: [address as Address, destination as Address, BigInt(claimedTokenId)],
      });
      setTransferMessage(`Transfer submitted: ${short(hash)}. Waiting for confirmation…`);
      const receipt = await provider.waitForTransaction(hash, 1);
      if (!receipt || receipt.status !== 1) throw new Error("NFT transfer did not confirm successfully.");
      const finalOwner = String(await nft.ownerOf(BigInt(claimedTokenId)));
      if (finalOwner.toLowerCase() !== destination.toLowerCase()) throw new Error("Transfer confirmed but the NFT owner does not match the HoodWallet. Verify on explorer.");
      setTransferredTokens(previous => ({ ...previous, [claimedTokenId]: true }));
      setTransferMessage(`NFT #${claimedTokenId} is now held by HoodWallet #${mintedHoodieId}.`);
    } catch (e) {
      setTransferError(errText(e));
      setTransferMessage("");
    } finally {
      setTransferringId(null);
    }
  }

  async function claimMintbayHolder() {
    if (!collection?.mintbayHolderEnabled || !address || !tokenId || holderClaimState !== "available" || holderClaimPrice === null || pending || !owned) return;
    const mintAddress = collection.address;
    const claimingId = tokenId;
    setPending(true); setError(""); setMessage("Rechecking Mintbay holder whitelist and price…"); setTxHash("");
    setMintedTokens([]); setMintedCollectionAddress(""); setMintedHoodieId(""); setMintedToEoa(false); setTransferredTokens({}); setTransferMessage(""); setTransferError("");
    try {
      const contract = new Contract(mintAddress, MINTBAY_ELIGIBILITY_ABI, provider);
      const source = new Contract(HOODIE_NFT_ADDRESS, ["function ownerOf(uint256) view returns (address)"], provider);
      const claimKey = keccak256(encodeAbiParameters(
        [{ type: "address" }, { type: "uint256" }], [HOODIE_NFT_ADDRESS as Address, BigInt(claimingId)],
      ));
      const [enabled, whitelist, used, allowance, owner] = await Promise.all([
        contract.holderClaimEnabled(), contract.approvedClaimCollections(HOODIE_NFT_ADDRESS),
        contract.claimsUsed(claimKey), contract.claimsPerToken(), source.ownerOf(BigInt(claimingId)),
      ]);
      if (!enabled || !whitelist[0] || BigInt(allowance) <= BigInt(used)) throw new Error("Hoodie claim is no longer available.");
      if (String(owner).toLowerCase() !== address.toLowerCase()) throw new Error("You no longer own this Hoodie.");
      const price = BigInt(whitelist[1]);
      if (price !== holderClaimPrice) throw new Error("Whitelist price changed. Select the Hoodie again to refresh.");
      const data = mintbayHolderInterface.encodeFunctionData("holderClaim", [HOODIE_NFT_ADDRESS, BigInt(claimingId)]);
      await ensureRequiredNetwork();
      await provider.call({ to: mintAddress, from: address, data, value: price });
      const client = await getWalletClient();
      if (!client.account || client.account.address.toLowerCase() !== address.toLowerCase()) throw new Error("Wallet changed. Reconnect and retry.");
      setMessage(`Confirm the ${fmt(price)} ETH holder claim in your wallet…`);
      const hash = await client.writeContract({ chain: null, account: client.account, address: mintAddress as Address,
        abi: MINTBAY_HOLDER_ABI, functionName: "holderClaim", args: [HOODIE_NFT_ADDRESS as Address, BigInt(claimingId)], value: price });
      setTxHash(hash); setMessage("Claim submitted. Waiting for confirmation…");
      const receipt = await provider.waitForTransaction(hash, 1);
      if (!receipt || receipt.status !== 1) throw new Error("Holder claim transaction failed.");
      setHolderClaimState("unavailable"); setHolderClaimPrice(null);
      setMessage(`Mintbay holder claim confirmed with Hoodie #${claimingId}.`);
      setMintedHoodieId(claimingId); setMintedCollectionAddress(mintAddress); setMintedToEoa(true); setRevealLoading(true);
      try {
        const tokens = await revealMintedTokens(provider, mintAddress, address, receipt.logs);
        setMintedTokens(tokens); setRevealMessage(tokens.length ? "Your claimed NFTs" : "Claim confirmed. No ERC-721 mint event could be decoded.");
      } catch (e) { setRevealMessage(`Claim confirmed; metadata unavailable: ${errText(e)}`); }
      finally { setRevealLoading(false); }
    } catch (e) { setError(errText(e)); setMessage(""); }
    finally { setPending(false); }
  }

  const validQuantity = isAmount(quantity) && BigInt(quantity) <= BigInt(100);
  const amount = validQuantity ? BigInt(quantity) : BigInt(0);
  const mintPrice = collection ? collection.price * amount : BigInt(0);
  const owned = Boolean(address && hood && hood.owner.toLowerCase() === address.toLowerCase());
  const enoughEth = paySource === "eoa" ? eoaBalance !== null && eoaBalance >= mintPrice : Boolean(hood && hood.nativeBalance >= mintPrice);
  const canMint = Boolean(collection?.isNet && hood?.active && hood.walletDeployed && owned && validQuantity && enoughEth && !pending && !hoodLoading && !collectionLoading);

  const canFreeMint = Boolean(collection?.hoodieFreeMint && address && owned && tokenId &&
    freeClaimed === false && !freeClaimLoading && !pending && !collectionLoading);

  async function claimFreeMint() {
    if (!canFreeMint || !collection || !address || !tokenId) return;
    const claimingId = tokenId;
    const nftAddress = collection.address;
    setPending(true); setError(""); setMessage("Checking your free Hoodie claim…");
    setTxHash(""); setMintedTokens([]); setMintedHoodieId(""); setMintedCollectionAddress(""); setMintedToEoa(false); setTransferredTokens({}); setTransferMessage(""); setTransferError(""); setRevealMessage("");
    try {
      const nft = new Contract(nftAddress, NET_COLLECTION_ABI, provider);
      const hoodiesContract = new Contract(HOODIE_NFT_ADDRESS, ["function ownerOf(uint256 tokenId) view returns (address)"], provider);
      const [claimed, owner, currentSupply, cap] = await Promise.all([
        nft.hoodieClaimed(BigInt(claimingId)), hoodiesContract.ownerOf(BigInt(claimingId)),
        nft.totalSupply(), nft.maxSupply(),
      ]);
      if (claimed) { setFreeClaimed(true); throw new Error(`Hoodie #${claimingId} already claimed its free portrait.`); }
      if (String(owner).toLowerCase() !== address.toLowerCase()) throw new Error("Connected wallet no longer directly owns this Hoodie.");
      if (BigInt(cap) !== BigInt(0) && BigInt(currentSupply) >= BigInt(cap)) throw new Error("Collection is minted out.");
      const data = freeMintInterface.encodeFunctionData("freeMint", [BigInt(claimingId)]);
      await ensureRequiredNetwork();
      setMessage("Simulating the free claim…");
      await provider.call({ from: address, to: nftAddress, data });
      const walletClient = await getWalletClient();
      if (!walletClient.account || walletClient.account.address.toLowerCase() !== address.toLowerCase()) {
        throw new Error("Connected wallet changed. Please reconnect.");
      }
      setMessage("Confirm the free claim in your wallet (gas only)…");
      const hash = await walletClient.writeContract({
        chain: null,
        account: walletClient.account,
        address: nftAddress as Address,
        abi: FREE_MINT_ABI,
        functionName: "freeMint",
        args: [BigInt(claimingId)],
      });
      setTxHash(hash);
      setMessage(`Free claim ${short(hash)} submitted. Waiting for confirmation…`);
      const receipt = await provider.waitForTransaction(hash, 1);
      if (!receipt || receipt.status !== 1) throw new Error("Free claim was not confirmed successfully.");
      setFreeClaimed(true);
      setMintedHoodieId(claimingId); setMintedCollectionAddress(nftAddress); setMintedToEoa(true);
      setMessage(`Free portrait claimed using Hoodie #${claimingId}! The NFT was minted to your connected wallet.`);
      setRevealLoading(true);
      try {
        const tokens = await revealMintedTokens(provider, nftAddress, address, receipt.logs);
        setMintedTokens(tokens);
        setRevealMessage(tokens.length ? "Your newly minted free portrait" : "Claim confirmed. NFT Transfer event not found in receipt.");
      } catch (e) { setRevealMessage(`Claim confirmed, but artwork could not load: ${errText(e)}`); }
      finally { setRevealLoading(false); }
      try { setEoaBalance(await provider.getBalance(address)); } catch { /* Claim still succeeded. */ }
    } catch (e) { setError(errText(e)); setMessage(""); }
    finally { setPending(false); }
  }

  async function mint() {
    if (pending || !canMint || !collection || !hood || !address || !validQuantity) return;
    const currentPrice = collection.price * amount;
    const outerValue = paySource === "eoa" ? currentPrice : BigInt(0);
    setPending(true); setError(""); setMessage("Checking mint and wallet permissions…"); setTxHash(""); setMintedTokens([]); setMintedHoodieId(""); setMintedCollectionAddress(""); setMintedToEoa(false); setTransferredTokens({}); setTransferMessage(""); setTransferError(""); setRevealMessage("");
    try {
      // Re-read price and account ownership so a stale UI cannot build an incorrect transaction.
      const nft = new Contract(collection.address, NET_COLLECTION_ABI, provider);
      const os = new Contract(siteConfig.hoodOSAddress, HOOD_OS_ABI, provider);
      const [latestPrice, info, latestEoaBalance, latestHoodBalance] = await Promise.all([
        nft.price(), os.hoodInfo(BigInt(hood.tokenId)), provider.getBalance(address), provider.getBalance(hood.wallet),
      ]);
      if (String(info.owner).toLowerCase() !== address.toLowerCase() || !Boolean(info.active) ||
          String(info.wallet).toLowerCase() !== hood.wallet.toLowerCase() || !Boolean(info.walletDeployed)) {
        throw new Error("Hoodie ownership, activation or wallet deployment has changed.");
      }
      const latestCost = BigInt(latestPrice) * amount;
      if (latestCost !== currentPrice) throw new Error("Mint price changed. Reload the collection before proceeding.");
      if (paySource === "eoa" && latestEoaBalance < latestCost) throw new Error("EOA has insufficient ETH for mint price (and must also cover gas).");
      if (paySource === "hoodwallet" && latestHoodBalance < latestCost) throw new Error("HoodWallet has insufficient ETH.");
      const data = mintInterface.encodeFunctionData("mint", [amount]);
      const execData = executeInterface.encodeFunctionData("execute", [collection.address, latestCost, data, 0]);
      await ensureRequiredNetwork();
      setMessage("Simulating the exact HoodWallet transaction…");
      await provider.call({ from: address, to: hood.wallet, data: execData, value: outerValue });
      const walletClient = await getWalletClient();
      if (!walletClient.account) throw new Error("Wallet account unavailable.");
      setMessage("Please confirm the transaction in your connected wallet…");
      const hash = await walletClient.writeContract({
        chain: null,
        account: walletClient.account,
        address: hood.wallet as Address,
        abi: HOOD_WALLET_ABI,
        functionName: "execute",
        args: [collection.address as Address, latestCost, data as Hex, 0],
        value: outerValue,
      });
      setTxHash(hash);
      setMessage(`Transaction ${short(hash)} submitted. Waiting for confirmation…`);
      const receipt = await provider.waitForTransaction(hash, 1);
      if (!receipt || receipt.status !== 1) throw new Error("Mint transaction was not confirmed successfully.");
      setMessage(`Mint confirmed! ${quantity} NFT${amount === BigInt(1) ? "" : "s"} minted to HoodWallet #${hood.tokenId}.`);
      setMintedHoodieId(hood.tokenId); setMintedCollectionAddress(collection.address); setMintedToEoa(false);
      setRevealLoading(true);
      try {
        const revealed = await revealMintedTokens(provider, collection.address, hood.wallet, receipt.logs);
        setMintedTokens(revealed);
        setRevealMessage(revealed.length ? "Your newly minted collectibles" : "Mint confirmed. No matching ERC-721 mint Transfer events were found in the transaction receipt.");
      } catch (revealError) {
        setRevealMessage(`Mint confirmed, but the artwork reveal could not load: ${errText(revealError)}`);
      } finally {
        setRevealLoading(false);
      }
      try {
        await fetchHood(hood.tokenId);
        setEoaBalance(await provider.getBalance(address));
      } catch { /* Do not report a confirmed mint as failed if a balance refresh fails. */ }
    } catch (e) { setError(errText(e)); setMessage(""); }
    finally { setPending(false); }
  }

  async function downloadTokenPng(token: MintedToken) {
    if (!collection || !token.image || downloadingId !== null) return;
    setDownloadError("");
    setDownloadingId(token.id);
    try {
      await exportPng800(token.image, collection.name, collection.address, token.id);
    } catch (error) {
      setDownloadError(`Token #${token.id}: ${errText(error)}. Some external image hosts do not permit canvas export.`);
    } finally {
      setDownloadingId(null);
    }
  }

  const inputClass = "mt-2 w-full border border-[#ccff00] bg-black p-3 text-sm outline-none placeholder:text-[#ccff00]";
  const solidButton = "w-full bg-[#ccff00] border border-[#ccff00] px-5 py-4 text-[10px] font-bold uppercase tracking-[0.16em] text-black disabled:cursor-not-allowed disabled:opacity-50";
  return (
    <main className="min-h-screen bg-black text-[#ccff00]">
      <SiteHeader />
      <section className="mx-auto max-w-none px-4 pb-24 pt-12 md:px-8 md:pt-16">
        <div className="flex items-center justify-between gap-3 border-b border-[#ccff00] pb-3 text-[9px] uppercase tracking-[0.15em]">
          <span>HoodOS / NET Mint</span>
          <Link href="/hoodos" className="underline underline-offset-4">Back to HoodOS →</Link>
        </div>
        <header className="border-b border-[#ccff00] py-5">

          <h1 className="mt-2 text-[clamp(2.3rem,5vw,4rem)] leading-[0.95] tracking-[-0.06em]">NET MINT.</h1>
          <p className="mt-2 text-sm">Choose a collection and mint straight into your HoodWallet.</p>
        </header>
        {address && (
          <div className="mt-6 space-y-3">
            <HoodieSelector hoodies={hoodies} selectedId={tokenId} onSelect={(id) => { setTokenId(id); setHood(null); }} imageForId={art} loading={ownershipLoading} disabled={pending} selectedActive={Boolean(hood?.active && hood?.tokenId === tokenId)} />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md bg-[#ccff00]/5 px-3 py-2.5 text-[10px]">
              <span>HOODIE #{tokenId || "—"}</span>
              <span className={`inline-flex items-center gap-2 border border-[#ccff00] px-2 py-1 font-bold ${hood?.active ? "bg-[#ccff00] text-black" : "bg-black text-[#ccff00]"}`}>
                <span aria-hidden="true">{hood?.active ? "●" : "○"}</span>
                {hoodLoading ? "READING HOODWALLET…" : hood?.active ? "HOODWALLET ACTIVE" : "HOODWALLET INACTIVE"}
              </span>
              <span>WALLET ETH: {hood ? fmt(hood.nativeBalance) : "—"}</span>
              <span>CONNECTED ETH: {eoaBalance !== null ? fmt(eoaBalance) : "—"}</span>
              {hood && !hood.active && <Link href={`/hoodwallet?hoodie=${encodeURIComponent(hood.tokenId)}`} className="underline">ACTIVATE HOODWALLET →</Link>}
              {hood?.walletDeployed && <button type="button" disabled={pending} onClick={() => setFundsOpen(true)} className="ml-auto border border-[#ccff00] bg-[#ccff00] px-3 py-2 text-[10px] font-bold text-black disabled:opacity-40">+ ADD / WITHDRAW FUNDS ↗</button>}
            </div>
          </div>
        )}
        <div id="netmint-mint-flow" className="scroll-mt-20" />
        {!address ? (
          <div className="mt-6 border border-[#ccff00] p-10 text-center">
            <h2 className="text-3xl">CONNECT YOUR WALLET</h2>
            <p className="mx-auto mt-4 max-w-md text-sm">Connect the wallet that owns your OnChainHoodie.</p>
            <button className={`${solidButton} mt-6 max-w-xs`} onClick={() => void connect()}>Connect wallet</button>
          </div>
        ) : (
          <div className="mt-6 space-y-5">
            <div className="min-w-0 space-y-5">
              <section className="rounded-md ring-1 ring-[#ccff00]/40">
                <h2 className="px-4 pt-4 text-sm font-bold uppercase">CHOOSE A COLLECTION</h2>
                <div className="p-4">
                  <label className="text-[9px] uppercase" htmlFor="netmint-contract">Collection contract address</label>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <input id="netmint-contract" spellCheck={false} placeholder="Paste collection contract (0x…)" className="min-w-0 flex-1 border border-[#ccff00] bg-black px-3 py-3 text-xs outline-none" value={contractInput} onChange={e => { setContractInput(e.target.value); setCollection(null); setError(""); }} />
                    <button type="button" className="shrink-0 bg-[#ccff00] px-5 py-3 text-xs font-bold uppercase text-black disabled:opacity-40" disabled={collectionLoading || !isAddress(contractInput)} onClick={() => void loadCollection()}>{collectionLoading ? "Loading…" : "LOAD ↗"}</button>
                  </div>

                </div>
                        <details id="netmint-discover" className="mx-4 mb-4 mt-2" aria-label="Discover NET collections">
          <summary className="cursor-pointer py-3 text-[11px] font-bold uppercase tracking-[0.08em]">OR BROWSE COLLECTIONS · {discoverTotal} INDEXED <span className="ml-2 text-[10px]">▾</span></summary>

          <div className="pt-2 pb-1">
            <label htmlFor="netmint-discover-search" className="text-[9px] uppercase tracking-[0.14em]">SEARCH BY NAME, SYMBOL OR CONTRACT</label>
            <input id="netmint-discover-search" value={discoverQuery} onChange={event => {
              setDiscoverQuery(event.target.value); setDiscoverPage(1); setDiscovered([]);
            }} className="mt-2 w-full border border-[#ccff00] bg-black p-3 text-sm outline-none placeholder:text-[#ccff00]" placeholder="64 Faces, symbol, or 0x…" />

            {discoverError && <div className="mt-4 border border-[#ccff00] p-3 text-xs" role="alert">DIRECTORY UNAVAILABLE: {discoverError}. YOU CAN STILL ENTER A CONTRACT ADDRESS BELOW.</div>}
            {discoverLoading && discovered.length === 0 && !discoverError && <p className="mt-5 text-sm" role="status">READING COLLECTION DIRECTORY…</p>}
            {!discoverLoading && !discoverError && discovered.length === 0 && <p className="mt-5 text-sm">NO COLLECTIONS FOUND YET. THE INDEXER MAY STILL BE CATCHING UP.</p>}
            {discovered.length > 0 && <div className="mt-4 max-h-[660px] overflow-y-auto overscroll-contain pr-2" role="region" aria-label="Scrollable NET collection directory" tabIndex={0}>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-6">
              {orderedDiscovered.map(item => {
                const status = supplyStatus(item);
                const minted = safeBigInt(item.circulatingSupply);
                const max = safeBigInt(item.maxSupply);
                const price = safeBigInt(item.priceWei);
                const selected = collection?.address.toLowerCase() === item.address.toLowerCase();
                const disabled = collectionLoading || !item.interfaceCompatible || status.atCapacity;
                return <article key={item.address} className={`flex min-w-0 flex-col rounded-md border p-2.5 transition-colors ${selected ? "border-[#ccff00] bg-[#ccff00]/10" : "border-[#ccff00]/35 hover:border-[#ccff00]"}`}>
                  <button type="button" aria-pressed={selected} disabled={disabled} onClick={() => {
                    void loadCollection(item.address);
                    const directory = document.getElementById("netmint-discover");
                    if (directory instanceof HTMLDetailsElement) directory.open = false;
                  }} className="flex min-w-0 flex-1 flex-col items-start text-left disabled:cursor-not-allowed disabled:opacity-50" title={`Select ${item.name}`}>
                    <div className="flex w-full items-start justify-between gap-1.5">
                      <h3 className="min-w-0 break-words text-[11px] font-bold leading-tight">{item.name}</h3>
                      {selected && <span className="shrink-0 text-[10px]">✓</span>}
                    </div>
                    <LazyCollectionArtwork address={item.address} provider={provider} />
                    <div className="mt-auto flex w-full flex-wrap items-baseline justify-between gap-x-2 gap-y-1 pt-2 text-[9px]">
                      <span>{price === null ? "—" : price === BigInt(0) ? "FREE" : `${fmt(price)} ETH`}</span>
                      <span className="opacity-80">{minted?.toString() ?? "—"} / {max === BigInt(0) ? "∞" : max?.toString() ?? "—"}</span>
                    </div>
                    {status.atCapacity && <span className="mt-1 text-[9px]">MINTED OUT</span>}
                  </button>
                  <div className="mt-2 flex flex-wrap gap-x-2.5 gap-y-1 border-t border-[#ccff00]/25 pt-2 text-[8px] uppercase">
                    <a href={item.openSeaUrl} target="_blank" rel="noreferrer" className="hover:underline">OPENSEA ↗</a>
                    <a href={item.xSearchUrl} target="_blank" rel="noreferrer" className="hover:underline">X ↗</a>
                    <a href={item.blockExplorerUrl} target="_blank" rel="noreferrer" className="hover:underline">CONTRACT ↗</a>
                  </div>
                </article>;
              })}
              </div>
            </div>}

            {discoverMore && <button type="button" className="mt-5 w-full border border-[#ccff00] px-4 py-3 text-[10px] uppercase disabled:cursor-not-allowed" disabled={discoverLoading} onClick={() => setDiscoverPage(page => page + 1)}>{discoverLoading ? "LOADING…" : "LOAD MORE COLLECTIONS ↓"}</button>}
          </div>
        </details>
              </section>
              {collection && <section className="rounded-md bg-[#ccff00]/5 ring-1 ring-[#ccff00]/40">
                <div className="flex flex-wrap items-start justify-between gap-3 p-4">
                  <div className="min-w-0"><p className="text-[9px] uppercase">SELECTED COLLECTION</p>
                    <h2 className="mt-1 break-words text-xl">{collection.name}</h2>
                    <p className="mt-1 text-xs">{collection.symbol} · {fmt(collection.price)} ETH each · {collection.totalSupply.toString()} / {collection.maxSupply === BigInt(0) ? "∞" : collection.maxSupply.toString()} minted</p>
                  </div>
                  <button type="button" onClick={() => void copyCollectionLink()} className="border border-[#ccff00] px-3 py-2 text-[9px] uppercase">SHARE ↗</button>
                </div>
                {shareFeedback && <p className="px-4 pb-3 text-[10px]" role="status">{shareFeedback}</p>}
                <details className="border-t border-[#ccff00]/25 px-4 py-3 text-[10px]">
                  <summary className="cursor-pointer uppercase">COLLECTION DETAILS / LIMITS ▾</summary>
                  <p className="mt-3 break-all">CONTRACT: {collection.address}</p>
                  <p className="mt-2">MAX MINTS PER WALLET: {collection.maxMintsPerWallet === BigInt(0) ? "UNLIMITED" : collection.maxMintsPerWallet.toString()}</p>
                  <p className="mt-2">Mint availability and eligibility are checked again before signing.</p>
                </details>
              </section>}
              {collection?.hoodieFreeMint && <section className="rounded-md bg-[#ccff00]/5 ring-1 ring-[#ccff00]/35">
                <h2 className="px-4 pt-4 text-sm font-bold uppercase">FREE HOODIE CLAIM</h2>
                <div className="space-y-3 p-4">
                  <p className="text-xs">Claim once per Hoodie. Free mint; EOA pays gas.</p>
                  <p className="text-[10px]">Selected: Hoodie #{tokenId || "—"} / {freeClaimLoading ? "CHECKING CLAIM…" : freeClaimed === true ? "ALREADY CLAIMED" : freeClaimed === false ? "AVAILABLE" : "STATUS UNKNOWN"}</p>
                  <p className="text-[10px]">After claiming, you can move the NFT into HoodWallet in one extra step.</p>
                  <button type="button" className={solidButton} disabled={!canFreeMint} onClick={() => void claimFreeMint()}>{pending ? "PLEASE WAIT…" : freeClaimed ? "FREE MINT ALREADY CLAIMED" : `CLAIM FREE NFT WITH HOODIE #${tokenId || "—"} →`}</button>
                  {!owned && <p className="text-[10px]">Connect the direct owner of the selected Hoodie to claim.</p>}
                </div>
              </section>}
              {collection?.mintbayHolderEnabled && address && tokenId && !collection.hoodieFreeMint && (
                <section className="rounded-md bg-[#ccff00]/5 ring-1 ring-[#ccff00]/35">
                  <h2 className="px-4 pt-4 text-sm font-bold uppercase">HOODIE HOLDER CLAIM</h2>
                  <div className="space-y-3 p-4">
                    <p className="text-sm">Check Hoodie #{tokenId} against the Mintbay source whitelist. Claims mint to your connected wallet; afterwards you can move each NFT to your HoodWallet below.</p>
                    <p className="text-xs" role="status">{holderClaimState === "checking" ? "CHECKING CLAIM…" : holderClaimState === "available" ? `ELIGIBLE · ${fmt(holderClaimPrice ?? BigInt(0))} ETH · ${holderClaimRemaining.toString()} LEFT` : "CLAIM NOT AVAILABLE"}</p>
                    {holderClaimInfo && <p className="text-xs">{holderClaimInfo}</p>}
                    <button type="button" disabled={!owned || holderClaimState !== "available" || pending} onClick={() => void claimMintbayHolder()} className="border border-[#ccff00] bg-[#ccff00] px-5 py-3 text-xs font-bold uppercase text-black disabled:cursor-not-allowed disabled:opacity-50">CLAIM WITH HOODIE #{tokenId} →</button>
                  </div>
                </section>
              )}
              {collection?.isNet && <section className="rounded-md bg-[#ccff00]/5 ring-1 ring-[#ccff00]/35">
                <h2 className="px-4 pt-4 text-sm font-bold uppercase">MINT WITH YOUR HOODWALLET</h2>
                <div className="space-y-4 p-4">
                  <div><label className="text-[9px] uppercase" htmlFor="netmint-quantity">Quantity (1–100 per transaction)</label>
                    <input id="netmint-quantity" type="number" min={1} max={100} step={1} className={inputClass} value={quantity} onChange={e => setQuantity(e.target.value)} /></div>
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase">PAY MINT PRICE WITH</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-3 text-xs ${paySource === "eoa" ? "border-[#ccff00] bg-[#ccff00]/10" : "border-[#ccff00]/30"}`}>
                        <input type="radio" checked={paySource === "eoa"} onChange={() => setPaySource("eoa")} name="netmint-payment" />
                        <span><strong>Connected wallet</strong><span className="mt-1 block text-[10px]">Pays ETH + gas</span></span>
                      </label>
                      <label className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-3 text-xs ${paySource === "hoodwallet" ? "border-[#ccff00] bg-[#ccff00]/10" : "border-[#ccff00]/30"}`}>
                        <input type="radio" checked={paySource === "hoodwallet"} onChange={() => setPaySource("hoodwallet")} name="netmint-payment" />
                        <span><strong>HoodWallet</strong><span className="mt-1 block text-[10px]">Uses its ETH balance · EOA pays gas</span></span>
                      </label>
                    </div>
                    <p className="text-[10px] font-bold">✓ NFT MINTS DIRECTLY INTO HOODWALLET #{tokenId || "—"}</p>
                  </div>
                  <div className="flex justify-between border-t border-[#ccff00]/25 py-3 text-base"><span>Total mint price</span><strong>{fmt(mintPrice)} ETH</strong></div>
                  {!enoughEth && validQuantity && <p className="text-[10px]">Insufficient ETH in the selected payment source.</p>}
                  <button className={solidButton} disabled={!canMint} onClick={() => void mint()}>{pending ? "Minting…" : `Mint as Hoodie #${hood?.tokenId || "—"} →`}</button>
                  
                </div>
              </section>}
              {!!message && <div className="border border-[#ccff00] p-4 text-sm" role="status">{message}{txHash && <a href={`${EXPLORER_URL}/tx/${txHash}`} target="_blank" rel="noreferrer" className="mt-3 block underline">View transaction ↗</a>}</div>}
              {(revealLoading || revealMessage || mintedTokens.length > 0) && (
                <section className="rounded-md ring-1 ring-[#ccff00]/35" aria-label="Newly minted collectibles">
                  <h2 className="px-4 pt-4 text-sm font-bold uppercase">YOUR NEW COLLECTIBLES</h2>
                  <div className="p-4">
                    {revealLoading ? <p className="text-sm" role="status">Reading your new NFT artwork from the blockchain…</p> : null}
                    {revealMessage && !revealLoading ? <p className="mb-4 text-sm" role="status">{revealMessage}</p> : null}
                    {mintedTokens.length > 0 && !revealLoading && (
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {mintedTokens.map(token => (
                          <div key={token.id} className="min-w-0 border border-[#ccff00]">
                            <div className="flex aspect-square items-center justify-center overflow-hidden bg-black text-[#ccff00]">
                              {token.image ? (
                                // External / IPFS / SVG data images can be displayed without Next image host configuration.
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={token.image} alt={token.title} className="h-full w-full object-contain" loading="lazy" referrerPolicy="no-referrer" />
                              ) : <span className="p-3 text-center text-[9px]">ARTWORK UNAVAILABLE</span>}
                            </div>
                            <div className="space-y-2 p-3">
                              <p className="break-words text-xs">{token.title}</p>
                              <p className="text-[9px] ">TOKEN #{token.id}</p>
                              {token.metadataError && <p className="break-words text-[8px] ">{token.metadataError}</p>}
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                                <a className="inline-block text-[9px] underline underline-offset-2" href={openSeaTokenUrl(mintedCollectionAddress || collection!.address, token.id)} target="_blank" rel="noreferrer">VIEW ON OPENSEA ↗</a>
                                <button type="button" className="text-[9px] underline underline-offset-2 disabled:cursor-not-allowed" disabled={!token.image || downloadingId !== null} onClick={() => void downloadTokenPng(token)}>{downloadingId === token.id ? "EXPORTING PNG…" : "DOWNLOAD PNG 800×800 ↓"}</button>
                                {mintedToEoa && <button type="button"
                                  className="w-full border border-[#ccff00] bg-[#ccff00] px-3 py-3 text-[9px] font-bold uppercase text-black disabled:cursor-not-allowed disabled:opacity-50"
                                  disabled={!address || pending || transferringId !== null || transferredTokens[token.id] || !mintedHoodieId}
                                  onClick={() => void transferClaimedNftToHoodWallet(token.id)}>
                                  {transferredTokens[token.id] ? `✓ IN HOODWALLET #${mintedHoodieId}` : transferringId === token.id ? "TRANSFERRING…" : `MOVE TO HOODWALLET #${mintedHoodieId} →`}
                                </button>}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {mintedToEoa && mintedTokens.length > 0 && <p className="mt-3 text-[10px]">Your claim minted to the connected wallet. Moving it to HoodWallet requires a second wallet confirmation and EOA gas. You can keep it in your EOA instead.</p>}
                    {transferMessage && <p className="mt-3 border border-[#ccff00] p-3 text-xs" role="status">{transferMessage}</p>}
                    {transferError && <p className="mt-3 border border-[#ccff00] p-3 text-xs" role="alert">TRANSFER: {transferError}</p>}
                    {downloadError && <p className="mt-3 border border-[#ccff00] p-3 text-xs" role="alert">{downloadError}</p>}
                    {mintedTokens.length > 0 && <Link className="mt-5 inline-block text-[10px] underline underline-offset-4" href={`/hoodwallet?hoodie=${mintedHoodieId || hood?.tokenId || tokenId}`} >OPEN HOODWALLET →</Link>}
                  </div>
                </section>
              )}
              {!!error && <div className="border border-[#ccff00] p-4 text-sm" role="alert">{error}</div>}
            </div>
          </div>
        )}

      </section>
      {fundsOpen && address && hood?.walletDeployed && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-3 sm:p-6" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setFundsOpen(false); }}>
          <div role="dialog" aria-modal="true" aria-label="Manage HoodWallet funds" className="max-h-[92dvh] w-full max-w-xl overflow-y-auto border-2 border-[#ccff00] bg-black text-[#ccff00] shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#ccff00] bg-black px-4 py-3">
              <p className="text-xs font-bold uppercase">HOODIE #{hood.tokenId} · FUNDS</p>
              <button type="button" onClick={() => setFundsOpen(false)} className="border border-[#ccff00] px-3 py-2 text-xs font-bold" aria-label="Close funds popup">✕ CLOSE</button>
            </div>
            <div className="p-3"><HoodWalletFunds key={`${hood.tokenId}:${hood.wallet}`} tokenId={hood.tokenId} hoodWallet={hood.wallet} active={hood.active}
              onBalancesChanged={async () => { await fetchHood(hood.tokenId); setEoaBalance(await provider.getBalance(address)); }} /></div>
          </div>
        </div>
      )}
      <SiteFooter />
    </main>
  );
}
