"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Contract, Interface, JsonRpcProvider, formatEther, getAddress, isAddress } from "ethers";
import { parseAbi } from "viem";
import type { Address, Hex } from "viem";
import SiteHeader from "../../../components/SiteHeader";
import SiteFooter from "../../../components/SiteFooter";
import { useWallet } from "../../../components/WalletProvider";
import { siteConfig } from "../../../lib/config";
import { apiConfig, collectionApiUrl } from "../../../lib/api";

const NET = "0x00000000B24D62781dB359b07880a105cD0b64e6";
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
] as const;
const HOOD_WALLET_SIGNATURE =
  "function execute(address target, uint256 value, bytes data, uint8 operation) payable returns (bytes result)";
const HOOD_WALLET_ABI = parseAbi([HOOD_WALLET_SIGNATURE]);
const mintInterface = new Interface(["function mint(uint256 amount) payable"]);
const executeInterface = new Interface([HOOD_WALLET_SIGNATURE]);
const erc721Interface = new Interface([
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  "function tokenURI(uint256 tokenId) view returns (string)",
]);
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const MAX_REVEAL = 100;

type MintedToken = { id: string; image: string | null; title: string; metadataError?: string };

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
};
type PaySource = "eoa" | "hoodwallet";

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
  return apiConfig.isMainnet
    ? collectionApiUrl(`/images/${encodeURIComponent(tokenId)}.svg`)
    : `/api/hoodies/image?tokenId=${encodeURIComponent(tokenId)}`;
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
  const [collection, setCollection] = useState<Collection | null>(null);
  const [collectionLoading, setCollectionLoading] = useState(false);
  const [quantity, setQuantity] = useState("1");
  const [paySource, setPaySource] = useState<PaySource>("eoa");
  const [eoaBalance, setEoaBalance] = useState<bigint | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [txHash, setTxHash] = useState("");
  const [mintedTokens, setMintedTokens] = useState<MintedToken[]>([]);
  const [mintedHoodieId, setMintedHoodieId] = useState("");
  const [revealLoading, setRevealLoading] = useState(false);
  const [revealMessage, setRevealMessage] = useState("");

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

  const loadCollection = useCallback(async () => {
    setError(""); setMessage(""); setCollection(null); setTxHash(""); setMintedTokens([]); setMintedHoodieId(""); setRevealMessage("");
    if (!isAddress(contractInput)) { setError("Enter a valid Robinhood Chain collection contract address."); return; }
    setCollectionLoading(true);
    try {
      const nftAddress = getAddress(contractInput);
      if ((await provider.getCode(nftAddress)) === "0x") throw new Error("No contract found at this address on the configured chain.");
      const nft = new Contract(nftAddress, NET_COLLECTION_ABI, provider);
      const [name, symbol, netAddress, price, maxSupply, totalSupply, maxMintsPerWallet, creatorReserve, creatorMinted] = await Promise.all([
        nft.name(), nft.symbol(), nft.NET(), nft.price(), nft.maxSupply(), nft.totalSupply(),
        nft.maxMintsPerWallet(), nft.creatorReserve(), nft.creatorMinted(),
      ]);
      if (String(netAddress).toLowerCase() !== NET.toLowerCase()) {
        throw new Error("This contract does not advertise the expected NET Protocol integration.");
      }
      setCollection({ address: nftAddress, name: String(name), symbol: String(symbol),
        price: BigInt(price), maxSupply: BigInt(maxSupply), totalSupply: BigInt(totalSupply),
        maxMintsPerWallet: BigInt(maxMintsPerWallet), creatorReserve: BigInt(creatorReserve),
        creatorMinted: BigInt(creatorMinted),
      });
    } catch (e) { setError(`Unable to verify NET collection: ${errText(e)}`); }
    finally { setCollectionLoading(false); }
  }, [contractInput, provider]);

  const validQuantity = isAmount(quantity) && BigInt(quantity) <= BigInt(100);
  const amount = validQuantity ? BigInt(quantity) : BigInt(0);
  const mintPrice = collection ? collection.price * amount : BigInt(0);
  const owned = Boolean(address && hood && hood.owner.toLowerCase() === address.toLowerCase());
  const enoughEth = paySource === "eoa" ? eoaBalance !== null && eoaBalance >= mintPrice : Boolean(hood && hood.nativeBalance >= mintPrice);
  const canMint = Boolean(collection && hood?.active && hood.walletDeployed && owned && validQuantity && enoughEth && !pending && !hoodLoading && !collectionLoading);
  const chosenHoodie = hoodies.find(item => item.tokenId === tokenId);

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

  const inputClass = "mt-2 w-full border border-black bg-transparent p-3 text-sm outline-none placeholder:text-black/35";
  const solidButton = "w-full bg-black px-5 py-4 text-[10px] uppercase tracking-[0.16em] text-[#ccff00] disabled:cursor-not-allowed disabled:opacity-30";
  return (
    <main className="min-h-screen bg-[#ccff00] text-black">
      <SiteHeader />
      <section className="mx-auto max-w-[1200px] px-4 pb-24 pt-20 md:px-6 md:pt-24">
        <div className="flex items-center justify-between gap-3 border-b border-black pb-3 text-[9px] uppercase tracking-[0.15em]">
          <span>HoodOS / NET Mint</span>
          <Link href="/hoodos" className="underline underline-offset-4">Back to HoodOS →</Link>
        </div>
        <header className="border-b border-black py-12">
          <p className="text-[9px] uppercase tracking-[0.2em] opacity-55">Robinhood Chain / NET-integrated ERC721A</p>
          <h1 className="mt-5 text-[clamp(4rem,10vw,8rem)] leading-[0.8] tracking-[-0.075em]">NET<br/>MINT.</h1>
          <p className="mt-7 max-w-xl text-lg leading-relaxed">Mint on-chain collectibles directly into your Hoodie’s wallet. Pay with your connected wallet or your HoodWallet balance.</p>
        </header>
        {!address ? (
          <div className="mt-6 border border-black p-10 text-center">
            <h2 className="text-3xl">CONNECT YOUR WALLET</h2>
            <p className="mx-auto mt-4 max-w-md text-sm">Connect the wallet that owns your OnChainHoodie.</p>
            <button className={`${solidButton} mt-6 max-w-xs`} onClick={() => void connect()}>Connect wallet</button>
          </div>
        ) : (
          <div className="mt-6 grid gap-6 lg:grid-cols-[300px_1fr]">
            <aside className="border border-black self-start">
              <div className="border-b border-black p-4 text-[9px] uppercase">01 / Your Hoodie</div>
              {chosenHoodie && <div className="aspect-square bg-black"><Image unoptimized src={art(chosenHoodie.tokenId)} alt={`Hoodie #${chosenHoodie.tokenId}`} width={500} height={500} className="h-full w-full object-cover" /></div>}
              <div className="p-4">
                {ownershipLoading ? <p className="text-xs">Loading owned Hoodies…</p> : hoodies.length === 0 ? <p className="text-xs">No Hoodies found for the connected wallet.</p> : (
                  <select className={inputClass} value={tokenId} onChange={e => { setTokenId(e.target.value); setHood(null); }}>
                    {hoodies.map(h => <option key={h.tokenId} value={h.tokenId}>Hoodie #{h.tokenId}</option>)}
                  </select>
                )}
                {hoodLoading && <p className="mt-4 text-xs">Reading HoodWallet…</p>}
                {hood && <div className="mt-5 space-y-3 text-[10px]">
                  <div className="flex justify-between"><span>STATUS</span><b>{hood.active ? "ACTIVE" : "INACTIVE"}</b></div>
                  <div className="flex justify-between"><span>ETH BALANCE</span><b>{fmt(hood.nativeBalance)} ETH</b></div>
                  <a className="block break-all underline" href={`${siteConfig.explorerUrl.replace(/\/$/, "")}/address/${hood.wallet}`} target="_blank" rel="noreferrer">{hood.wallet}</a>
                  {!hood.active && <Link href="/hoodwallet" className="block underline">Activate HoodWallet →</Link>}
                </div>}
                <p className="mt-5 border-t border-black pt-4 text-[9px]">EOA ETH: {eoaBalance === null ? "…" : `${fmt(eoaBalance)} ETH`}</p>
              </div>
            </aside>
            <div className="min-w-0 space-y-5">
              <section className="border border-black">
                <h2 className="border-b border-black p-4 text-[9px] uppercase">02 / NET Collection</h2>
                <div className="p-4">
                  <label className="text-[9px] uppercase" htmlFor="netmint-contract">Collection contract address</label>
                  <input id="netmint-contract" spellCheck={false} placeholder="0x…" className={inputClass} value={contractInput} onChange={e => { setContractInput(e.target.value); setCollection(null); setError(""); }} />
                  <button className={`${solidButton} mt-3`} disabled={collectionLoading || !isAddress(contractInput)} onClick={() => void loadCollection()}>{collectionLoading ? "Reading contract…" : "Read NET collection"}</button>
                  <p className="mt-3 text-[9px] leading-relaxed opacity-60">Only Robinhood Chain. Recognizes the known NET-integrated ERC721A interface; always verify the contract yourself before minting.</p>
                </div>
              </section>
              {collection && <section className="border border-black">
                <h2 className="border-b border-black p-4 text-[9px] uppercase">03 / Collection details</h2>
                <div className="grid gap-4 p-4 sm:grid-cols-2">
                  <div><span className="text-[9px] opacity-60">COLLECTION</span><p className="mt-2 text-xl">{collection.name} ({collection.symbol})</p></div>
                  <div><span className="text-[9px] opacity-60">PRICE EACH</span><p className="mt-2 text-xl">{fmt(collection.price)} ETH</p></div>
                  <div><span className="text-[9px] opacity-60">CIRCULATING SUPPLY</span><p className="mt-2 text-xl">{collection.totalSupply.toString()} / {collection.maxSupply === BigInt(0) ? "∞" : collection.maxSupply.toString()}</p></div>
                  <div><span className="text-[9px] opacity-60">PUBLIC MINT LIMIT PER WALLET</span><p className="mt-2 text-xl">{collection.maxMintsPerWallet === BigInt(0) ? "UNLIMITED" : collection.maxMintsPerWallet.toString()}</p></div>
                </div>
                <p className="px-4 pb-4 text-[9px] opacity-60">Circulating supply can differ from total ever minted if tokens were burned. Mint availability is verified by transaction simulation.</p>
              </section>}
              {collection && <section className="border border-black">
                <h2 className="border-b border-black p-4 text-[9px] uppercase">04 / Mint as Hoodie</h2>
                <div className="space-y-5 p-4">
                  <div><label className="text-[9px] uppercase" htmlFor="netmint-quantity">Quantity (1–100 per transaction)</label>
                    <input id="netmint-quantity" type="number" min={1} max={100} step={1} className={inputClass} value={quantity} onChange={e => setQuantity(e.target.value)} /></div>
                  <fieldset className="space-y-3 border border-black p-4">
                    <legend className="px-2 text-[9px] uppercase">Payment source</legend>
                    <label className="flex cursor-pointer items-start gap-3 text-sm"><input type="radio" checked={paySource === "eoa"} onChange={() => setPaySource("eoa")} name="netmint-payment" /><span><b>Connected wallet (recommended)</b><small className="mt-1 block opacity-60">EOA pays mint price and gas. NFT goes to HoodWallet.</small></span></label>
                    <label className="flex cursor-pointer items-start gap-3 text-sm"><input type="radio" checked={paySource === "hoodwallet"} onChange={() => setPaySource("hoodwallet")} name="netmint-payment" /><span><b>HoodWallet balance</b><small className="mt-1 block opacity-60">HoodWallet pays mint price; owner pays gas.</small></span></label>
                  </fieldset>
                  <div className="flex justify-between border-y border-black py-4 text-lg"><span>Total mint price</span><strong>{fmt(mintPrice)} ETH</strong></div>
                  {!enoughEth && validQuantity && <p className="text-[10px]">Insufficient ETH in the selected payment source.</p>}
                  <button className={solidButton} disabled={!canMint} onClick={() => void mint()}>{pending ? "Minting…" : `Mint as Hoodie #${hood?.tokenId || "—"} →`}</button>
                  <p className="text-[9px] leading-relaxed opacity-60">The connected owner always signs and pays network gas. For EOA payment the mint ETH passes through your HoodWallet in the same transaction. Simulations may fail for contracts with custom mint restrictions.</p>
                </div>
              </section>}
              {!!message && <div className="border border-black p-4 text-sm" role="status">{message}{txHash && <a href={`${siteConfig.explorerUrl.replace(/\/$/, "")}/tx/${txHash}`} target="_blank" rel="noreferrer" className="mt-3 block underline">View transaction ↗</a>}</div>}
              {(revealLoading || revealMessage || mintedTokens.length > 0) && (
                <section className="border border-black" aria-label="Newly minted collectibles">
                  <h2 className="border-b border-black p-4 text-[9px] uppercase tracking-[0.16em]">05 / Your new collectibles</h2>
                  <div className="p-4">
                    {revealLoading ? <p className="text-sm" role="status">Reading your new NFT artwork from the blockchain…</p> : null}
                    {revealMessage && !revealLoading ? <p className="mb-4 text-sm" role="status">{revealMessage}</p> : null}
                    {mintedTokens.length > 0 && !revealLoading && (
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {mintedTokens.map(token => (
                          <div key={token.id} className="min-w-0 border border-black">
                            <div className="flex aspect-square items-center justify-center overflow-hidden bg-black text-[#ccff00]">
                              {token.image ? (
                                // External / IPFS / SVG data images can be displayed without Next image host configuration.
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={token.image} alt={token.title} className="h-full w-full object-contain" loading="lazy" referrerPolicy="no-referrer" />
                              ) : <span className="p-3 text-center text-[9px]">ARTWORK UNAVAILABLE</span>}
                            </div>
                            <div className="space-y-2 p-3">
                              <p className="break-words text-xs">{token.title}</p>
                              <p className="text-[9px] opacity-60">TOKEN #{token.id}</p>
                              {token.metadataError && <p className="break-words text-[8px] opacity-60">{token.metadataError}</p>}
                              <a className="inline-block text-[9px] underline underline-offset-2" href={`${siteConfig.explorerUrl.replace(/\/$/, "")}/token/${collection?.address}/instance/${token.id}`} target="_blank" rel="noreferrer">VIEW NFT ↗</a>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {mintedTokens.length > 0 && <Link className="mt-5 inline-block text-[10px] underline underline-offset-4" href={`/hoodwallet?hoodie=${mintedHoodieId || hood?.tokenId || tokenId}`} >VIEW IN HOODWALLET →</Link>}
                  </div>
                </section>
              )}
              {!!error && <div className="border border-black p-4 text-sm" role="alert">{error}</div>}
            </div>
          </div>
        )}
      </section>
      <SiteFooter />
    </main>
  );
}
