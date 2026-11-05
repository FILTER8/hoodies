"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Contract, Interface, JsonRpcProvider, formatEther, getAddress, isAddress } from "ethers";
import { parseAbi, encodeAbiParameters, keccak256 } from "viem";
import type { Address, Hex } from "viem";
import SiteHeader from "../../../components/SiteHeader";
import SiteFooter from "../../../components/SiteFooter";
import HoodieSelector from "../../../components/HoodieSelector";
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
        url.searchParams.set("limit", "24");
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
    if (initialCollectionLoaded.current) return;
    initialCollectionLoaded.current = true;
    const requested = new URLSearchParams(window.location.search).get("collection");
    if (requested && isAddress(requested)) void loadCollection(requested);
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

  async function claimMintbayHolder() {
    if (!collection?.mintbayHolderEnabled || !address || !tokenId || holderClaimState !== "available" || holderClaimPrice === null || pending || !owned) return;
    const mintAddress = collection.address;
    const claimingId = tokenId;
    setPending(true); setError(""); setMessage("Rechecking Mintbay holder whitelist and price…"); setTxHash("");
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
      setMintedHoodieId(claimingId); setRevealLoading(true);
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
    setTxHash(""); setMintedTokens([]); setMintedHoodieId(""); setRevealMessage("");
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
      setMintedHoodieId(claimingId);
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
    setPending(true); setError(""); setMessage("Checking mint and wallet permissions…"); setTxHash(""); setMintedTokens([]); setMintedHoodieId(""); setRevealMessage("");
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
      setMintedHoodieId(hood.tokenId);
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
        <header className="border-b border-[#ccff00] py-6">
          <p className="text-[9px] uppercase tracking-[0.2em] ">ROBINHOOD CHAIN / MINT AS YOUR HOODIE</p>
          <h1 className="mt-3 text-[clamp(2.6rem,5vw,5rem)] leading-[0.95] tracking-[-0.06em]">NET MINT.</h1>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed md:text-base">Mint on-chain collectibles into your Hoodie’s wallet, or claim eligible free NFTs directly to your connected wallet. No Bankr required.</p>
        </header>
        {address && (
          <div className="mt-6 space-y-3">
            <HoodieSelector hoodies={hoodies} selectedId={tokenId} onSelect={(id) => { setTokenId(id); setHood(null); }} imageForId={art} loading={ownershipLoading} disabled={pending} selectedActive={Boolean(hood?.active && hood?.tokenId === tokenId)} />
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border border-[#ccff00] p-3 text-[10px]">
              <span>HOODIE #{tokenId || "—"}</span>
              <span className={`inline-flex items-center gap-2 border border-[#ccff00] px-2 py-1 font-bold ${hood?.active ? "bg-[#ccff00] text-black" : "bg-black text-[#ccff00]"}`}>
                <span aria-hidden="true">{hood?.active ? "●" : "○"}</span>
                {hoodLoading ? "READING HOODWALLET…" : hood?.active ? "HOODWALLET ACTIVE" : "HOODWALLET INACTIVE"}
              </span>
              <span>WALLET ETH: {hood ? fmt(hood.nativeBalance) : "—"}</span>
              <span>CONNECTED ETH: {eoaBalance !== null ? fmt(eoaBalance) : "—"}</span>
              {hood && !hood.active && <Link href={`/hoodwallet?hoodie=${encodeURIComponent(hood.tokenId)}`} className="underline">ACTIVATE HOODWALLET →</Link>}
            </div>
          </div>
        )}
        <section className="mt-8 border border-[#ccff00]" aria-label="Discover NET collections">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#ccff00] p-4">
            <div>
              <p className="text-[9px] uppercase tracking-[0.17em] ">ON-CHAIN DISCOVERY</p>
              <h2 className="mt-2 text-2xl tracking-[-0.04em]">DISCOVER NET COLLECTIONS.</h2>
            </div>
            <span className="text-[9px] uppercase">{discoverTotal} INDEXED</span>
          </div>
          <div className="p-4">
            <label htmlFor="netmint-discover-search" className="text-[9px] uppercase tracking-[0.14em]">SEARCH BY NAME, SYMBOL OR CONTRACT</label>
            <input id="netmint-discover-search" value={discoverQuery} onChange={event => {
              setDiscoverQuery(event.target.value); setDiscoverPage(1); setDiscovered([]);
            }} className="mt-2 w-full border border-[#ccff00] bg-black p-3 text-sm outline-none placeholder:text-[#ccff00]" placeholder="64 Faces, symbol, or 0x…" />
            <p className="mt-3 text-[9px] leading-relaxed ">Indexing NET mint activity on Robinhood Chain. Collection compatibility is not a trust endorsement. Supply figures are cached; eligibility is checked when you mint.</p>
            {discoverError && <div className="mt-4 border border-[#ccff00] p-3 text-xs" role="alert">DIRECTORY UNAVAILABLE: {discoverError}. YOU CAN STILL ENTER A CONTRACT ADDRESS BELOW.</div>}
            {discoverLoading && discovered.length === 0 && !discoverError && <p className="mt-5 text-sm" role="status">READING COLLECTION DIRECTORY…</p>}
            {!discoverLoading && !discoverError && discovered.length === 0 && <p className="mt-5 text-sm">NO COLLECTIONS FOUND YET. THE INDEXER MAY STILL BE CATCHING UP.</p>}
            {discovered.length > 0 && <div className="mt-5 max-h-[350px] overflow-y-auto overscroll-contain border border-[#ccff00] p-3" role="region" aria-label="Scrollable NET collection directory" tabIndex={0}>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {orderedDiscovered.map(item => {
                const status = supplyStatus(item);
                const minted = safeBigInt(item.circulatingSupply);
                const max = safeBigInt(item.maxSupply);
                const price = safeBigInt(item.priceWei);
                return <article key={item.address} className="flex min-w-0 flex-col border border-[#ccff00] p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="min-w-0 break-words text-lg tracking-[-0.04em]">{item.name}</h3>
                    <span className={`shrink-0 border border-[#ccff00] px-2 py-1 text-[8px] uppercase ${status.atCapacity ? "bg-black text-[#ccff00]" : ""}`}>{status.label}</span>
                  </div>
                  <p className="mt-1 text-[9px] ">{item.symbol || "NFT"} / ROBINHOOD</p>
                  <p className="mt-3 break-all text-[9px] ">{item.address}</p>
                  <div className="mt-4 grid grid-cols-2 gap-3 border-y border-[#ccff00] py-3">
                    <div><p className="text-[8px] ">PRICE</p><p className="mt-1 text-base">{price === null ? "—" : price === BigInt(0) ? "FREE" : `${fmt(price)} ETH`}</p></div>
                    <div><p className="text-[8px] ">CIRCULATING / CAP</p><p className="mt-1 text-base">{minted?.toString() ?? "—"} / {max === BigInt(0) ? "∞" : max?.toString() ?? "—"}</p></div>
                  </div>
                  {status.percent !== null && <div className="mt-3 h-2 border border-[#ccff00]" aria-label={`${status.percent}% of maximum supply circulating`}><div className="h-full bg-black" style={{ width: `${status.percent}%` }}/></div>}
                  <div className="mt-auto pt-4">
                    <button type="button" disabled={collectionLoading || !item.interfaceCompatible || status.atCapacity} className="w-full bg-[#ccff00] border border-[#ccff00] px-3 py-3 text-[9px] font-bold uppercase tracking-[0.12em] text-black disabled:cursor-not-allowed disabled:opacity-50" onClick={() => {
                      void loadCollection(item.address);
                      document.getElementById("netmint-mint-flow")?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}>{status.atCapacity ? "MINTED OUT" : "SELECT COLLECTION →"}</button>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[9px] uppercase">
                      <a href={item.openSeaUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">OPENSEA ↗</a>
                      <a href={item.xSearchUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">SEARCH X ↗</a>
                      <a href={item.blockExplorerUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">CONTRACT ↗</a>
                    </div>
                  </div>
                </article>;
              })}
              </div>
            </div>}
            {discovered.length > 0 && <p className="mt-2 text-[9px] uppercase ">SCROLL TO EXPLORE MORE COLLECTIONS · MINTED-OUT COLLECTIONS LISTED LAST</p>}
            {discoverMore && <button type="button" className="mt-5 w-full border border-[#ccff00] px-4 py-3 text-[10px] uppercase disabled:cursor-not-allowed" disabled={discoverLoading} onClick={() => setDiscoverPage(page => page + 1)}>{discoverLoading ? "LOADING…" : "LOAD MORE COLLECTIONS ↓"}</button>}
          </div>
        </section>
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
              <section className="border border-[#ccff00]">
                <h2 className="border-b border-[#ccff00] p-4 text-[9px] uppercase">02 / NET Collection</h2>
                <div className="p-4">
                  <label className="text-[9px] uppercase" htmlFor="netmint-contract">Collection contract address</label>
                  <input id="netmint-contract" spellCheck={false} placeholder="0x…" className={inputClass} value={contractInput} onChange={e => { setContractInput(e.target.value); setCollection(null); setError(""); }} />
                  <button className={`${solidButton} mt-3`} disabled={collectionLoading || !isAddress(contractInput)} onClick={() => void loadCollection()}>{collectionLoading ? "Reading contract…" : "Read collection"}</button>
                  <p className="mt-3 text-[9px] leading-relaxed ">Only Robinhood Chain. Supports NET minting and Mintbay holder whitelists. Eligibility and claim price are checked on-chain before signing.</p>
                </div>
              </section>
              {collection && <section className="border border-[#ccff00]">
                <h2 className="border-b border-[#ccff00] p-4 text-[9px] uppercase">03 / Collection details</h2>
                <div className="grid gap-4 p-4 sm:grid-cols-2">
                  <div><span className="text-[9px] ">COLLECTION</span><p className="mt-2 text-xl">{collection.name} ({collection.symbol})</p></div>
                  <div><span className="text-[9px] ">PRICE EACH</span><p className="mt-2 text-xl">{fmt(collection.price)} ETH</p></div>
                  <div><span className="text-[9px] ">CIRCULATING SUPPLY</span><p className="mt-2 text-xl">{collection.totalSupply.toString()} / {collection.maxSupply === BigInt(0) ? "∞" : collection.maxSupply.toString()}</p></div>
                  <div><span className="text-[9px] ">PUBLIC MINT LIMIT PER WALLET</span><p className="mt-2 text-xl">{collection.maxMintsPerWallet === BigInt(0) ? "UNLIMITED" : collection.maxMintsPerWallet.toString()}</p></div>
                </div>
                  <div className="mx-4 mb-4 flex flex-wrap items-center gap-3 border-t border-[#ccff00] pt-4">
                    <button type="button" onClick={() => void copyCollectionLink()} className="border border-[#ccff00] px-4 py-3 text-[10px] font-bold uppercase hover:bg-[#ccff00] hover:text-black">COPY COLLECTION LINK ↗</button>
                    {shareFeedback && <span className="break-all text-[10px]" role="status">{shareFeedback}</span>}
                  </div>
                <p className="px-4 pb-4 text-[9px] ">Circulating supply can differ from total ever minted if tokens were burned. Mint availability is verified by transaction simulation.</p>
              </section>}
              {collection?.hoodieFreeMint && <section className="border border-[#ccff00]">
                <h2 className="border-b border-[#ccff00] p-4 text-[9px] uppercase">Free portrait / Hoodie claim</h2>
                <div className="space-y-3 p-4">
                  <p className="text-sm">One free NFT per OnChainHoodie ID, while supply lasts. No mint price; your connected wallet pays network gas.</p>
                  <p className="text-[10px]">Selected: Hoodie #{tokenId || "—"} / {freeClaimLoading ? "CHECKING CLAIM…" : freeClaimed === true ? "ALREADY CLAIMED" : freeClaimed === false ? "AVAILABLE" : "STATUS UNKNOWN"}</p>
                  <p className="text-[10px] font-bold">The contract sends the free NFT to your connected wallet, not your HoodWallet. You can transfer it to your HoodWallet separately afterwards.</p>
                  <button type="button" className={solidButton} disabled={!canFreeMint} onClick={() => void claimFreeMint()}>{pending ? "PLEASE WAIT…" : freeClaimed ? "FREE MINT ALREADY CLAIMED" : `CLAIM FREE NFT WITH HOODIE #${tokenId || "—"} →`}</button>
                  {!owned && <p className="text-[10px]">Connect the direct owner of the selected Hoodie to claim.</p>}
                </div>
              </section>}
              {collection?.mintbayHolderEnabled && address && tokenId && !collection.hoodieFreeMint && (
                <section className="border border-[#ccff00]">
                  <h2 className="border-b border-[#ccff00] p-4 text-[10px] uppercase">MINTBAY / HOODIE HOLDER CLAIM</h2>
                  <div className="space-y-3 p-4">
                    <p className="text-sm">Check Hoodie #{tokenId} against the Mintbay source whitelist. Free and paid claims mint to your connected owner wallet.</p>
                    <p className="text-xs" role="status">{holderClaimState === "checking" ? "CHECKING CLAIM…" : holderClaimState === "available" ? `ELIGIBLE · ${fmt(holderClaimPrice ?? BigInt(0))} ETH · ${holderClaimRemaining.toString()} LEFT` : "CLAIM NOT AVAILABLE"}</p>
                    {holderClaimInfo && <p className="text-xs">{holderClaimInfo}</p>}
                    <button type="button" disabled={!owned || holderClaimState !== "available" || pending} onClick={() => void claimMintbayHolder()} className="border border-[#ccff00] bg-[#ccff00] px-5 py-3 text-xs font-bold uppercase text-black disabled:cursor-not-allowed disabled:opacity-50">CLAIM WITH HOODIE #{tokenId} →</button>
                  </div>
                </section>
              )}
              {collection?.isNet && <section className="border border-[#ccff00]">
                <h2 className="border-b border-[#ccff00] p-4 text-[9px] uppercase">04 / Mint as Hoodie</h2>
                <div className="space-y-5 p-4">
                  <div><label className="text-[9px] uppercase" htmlFor="netmint-quantity">Quantity (1–100 per transaction)</label>
                    <input id="netmint-quantity" type="number" min={1} max={100} step={1} className={inputClass} value={quantity} onChange={e => setQuantity(e.target.value)} /></div>
                  <fieldset className="space-y-3 border border-[#ccff00] p-4">
                    <legend className="px-2 text-[9px] uppercase">Payment source</legend>
                    <label className="flex cursor-pointer items-start gap-3 text-sm"><input type="radio" checked={paySource === "eoa"} onChange={() => setPaySource("eoa")} name="netmint-payment" /><span><b>Connected wallet (recommended)</b><small className="mt-1 block ">EOA pays mint price and gas. NFT goes to HoodWallet.</small></span></label>
                    <label className="flex cursor-pointer items-start gap-3 text-sm"><input type="radio" checked={paySource === "hoodwallet"} onChange={() => setPaySource("hoodwallet")} name="netmint-payment" /><span><b>HoodWallet balance</b><small className="mt-1 block ">HoodWallet pays mint price; owner pays gas.</small></span></label>
                  </fieldset>
                  <div className="flex justify-between border-y border-[#ccff00] py-4 text-lg"><span>Total mint price</span><strong>{fmt(mintPrice)} ETH</strong></div>
                  {!enoughEth && validQuantity && <p className="text-[10px]">Insufficient ETH in the selected payment source.</p>}
                  <button className={solidButton} disabled={!canMint} onClick={() => void mint()}>{pending ? "Minting…" : `Mint as Hoodie #${hood?.tokenId || "—"} →`}</button>
                  <p className="text-[9px] leading-relaxed ">The connected owner always signs and pays network gas. For EOA payment the mint ETH passes through your HoodWallet in the same transaction. Simulations may fail for contracts with custom mint restrictions.</p>
                </div>
              </section>}
              {!!message && <div className="border border-[#ccff00] p-4 text-sm" role="status">{message}{txHash && <a href={`${EXPLORER_URL}/tx/${txHash}`} target="_blank" rel="noreferrer" className="mt-3 block underline">View transaction ↗</a>}</div>}
              {(revealLoading || revealMessage || mintedTokens.length > 0) && (
                <section className="border border-[#ccff00]" aria-label="Newly minted collectibles">
                  <h2 className="border-b border-[#ccff00] p-4 text-[9px] uppercase tracking-[0.16em]">05 / Your new collectibles</h2>
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
                                <a className="inline-block text-[9px] underline underline-offset-2" href={openSeaTokenUrl(collection!.address, token.id)} target="_blank" rel="noreferrer">VIEW ON OPENSEA ↗</a>
                                <button type="button" className="text-[9px] underline underline-offset-2 disabled:cursor-not-allowed" disabled={!token.image || downloadingId !== null} onClick={() => void downloadTokenPng(token)}>{downloadingId === token.id ? "EXPORTING PNG…" : "DOWNLOAD PNG 800×800 ↓"}</button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
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
      <SiteFooter />
    </main>
  );
}
