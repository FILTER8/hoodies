"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Contract, Interface, JsonRpcProvider, formatUnits } from "ethers";
import { encodeFunctionData, parseAbi } from "viem";
import type { Address, Hex } from "viem";
import SiteHeader from "../../../components/SiteHeader";
import SiteFooter from "../../../components/SiteFooter";
import HoodieSelector from "../../../components/HoodieSelector";
import HoodWalletFunds from "../../../components/HoodWalletFunds";
import { useWallet } from "../../../components/WalletProvider";
import { siteConfig } from "../../../lib/config";

const CHAIN = "robinhood";
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const HOOD_OS_ABI = ["function hoodInfo(uint256 tokenId) view returns (tuple(uint256 tokenId,address owner,address wallet,bool walletDeployed,bool active,address activationOwner,uint64 activatedAt,uint256 walletState,uint256 nativeBalance,uint256 paymentTokenBalance) info)"];
const EXECUTE_ABI = parseAbi(["function execute(address target,uint256 value,bytes data,uint8 operation) payable returns (bytes result)"]);
const ERC20_ABI = parseAbi(["function balanceOf(address) view returns (uint256)", "function allowance(address owner,address spender) view returns (uint256)", "function approve(address spender,uint256 amount) returns (bool)", "function decimals() view returns (uint8)"]);
const erc20Interface = new Interface(["function balanceOf(address) view returns (uint256)", "function allowance(address,address) view returns (uint256)"]);

type Hoodie = { tokenId: string; name: string; image?: string };
type Wallet = { tokenId: string; owner: string; walletAddress: string; walletDeployed: boolean; active: boolean; nativeBalance: bigint; usdgBalance: bigint };
type Listing = { orderHash: string; chain: string; protocolAddress: string; contract: string; tokenId: string; name: string; image: string | null; priceWei: string; priceExact: string; priceDisplay: string; currency: string; decimals: number; remainingQuantity: number; openseaUrl: string };
type ListingsResponse = { ok?: boolean; chain?: string; slug?: string; collection?: { name: string; image?: string | null; description?: string; openseaUrl?: string }; listings?: Listing[]; next?: string | null; error?: string };
// The fulfillment API must explicitly return validated ERC-20 approval metadata for USDG purchases.
// Never guess an approval spender from a marketplace URL or an order hash.
type FulfillResponse = { ok?: boolean; chain?: string; orderHash?: string; nft?: { contract: string; tokenId: string }; execution?: { target: string; value: string; data: Hex; paymentToken?: string; paymentAmount?: string; approvalTarget?: string }; error?: string };

function err(error: unknown): string {
  if (error && typeof error === "object") {
    const e = error as { shortMessage?: string; cause?: { shortMessage?: string }; message?: string };
    return e.shortMessage || e.cause?.shortMessage || e.message || "Action failed";
  }
  return String(error);
}
function same(a?: string | null, b?: string | null) { return Boolean(a && b && a.toLowerCase() === b.toLowerCase()); }
function artwork(id: string) { return `https://api.onchainhoodies.xyz/images/${encodeURIComponent(id)}.svg`; }
function pricedCurrency(listing: Listing) {
  const c = (listing.currency || "ETH").trim().toUpperCase();
  return c === USDG.toUpperCase() ? "USDG" : c;
}
function smallBalance(amount: bigint, decimals: number, precision = 3) {
  const divisor = BigInt(10) ** BigInt(Math.max(0, decimals - precision));
  const adjusted = decimals > precision ? (amount + divisor / BigInt(2)) / divisor : amount;
  const text = formatUnits(adjusted, Math.min(decimals, precision));
  return text.includes(".") ? text.replace(/0+$/, "").replace(/\.$/, "") : text;
}
function ListingArt({ listing }: { listing: Listing }) {
  const [failed, setFailed] = useState(false);
  const src = listing.image ? `/api/buyos/image?url=${encodeURIComponent(listing.image)}` : "";
  return <div className="aspect-square overflow-hidden bg-black">{src && !failed ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={listing.name} className="h-full w-full object-cover" loading="lazy" onError={() => setFailed(true)} />
  ) : <div className="grid h-full place-items-center p-3 text-[10px] text-[#ccff00]">NFT #{listing.tokenId}</div>}</div>;
}

export default function BuyOSPage() {
  const { address, connect, ensureRequiredNetwork, getWalletClient } = useWallet();
  const provider = useMemo(() => new JsonRpcProvider(siteConfig.rpcUrl, Number(siteConfig.chainId), { staticNetwork: true }), []);
  const [hoodies, setHoodies] = useState<Hoodie[]>([]);
  const [hoodieId, setHoodieId] = useState("");
  const [hood, setHood] = useState<Wallet | null>(null);
  const [hoodiesLoading, setHoodiesLoading] = useState(false);
  const [walletLoading, setWalletLoading] = useState(false);
  const [fundsOpen, setFundsOpen] = useState(false);
  const [marketUrl, setMarketUrl] = useState("");
  const [slug, setSlug] = useState("");
  const [collection, setCollection] = useState<ListingsResponse["collection"] | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [chosen, setChosen] = useState<Listing | null>(null);
  const [buying, setBuying] = useState(false);
  const [payEthFromEoa, setPayEthFromEoa] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const initialUrl = useRef(false);

  const refreshHood = useCallback(async (id: string) => {
    if (!id || !address) { setHood(null); return; }
    setWalletLoading(true);
    try {
      const os = new Contract(siteConfig.hoodOSAddress, HOOD_OS_ABI, provider);
      const info = await os.hoodInfo(BigInt(id));
      const walletAddress = String(info.wallet);
      const usdg = new Contract(USDG, erc20Interface, provider);
      let usdgBalance = BigInt(0);
      try { usdgBalance = BigInt(await usdg.balanceOf(walletAddress)); } catch { /* Balance may be temporarily unavailable */ }
      setHood({ tokenId: id, owner: String(info.owner), walletAddress, walletDeployed: Boolean(info.walletDeployed), active: Boolean(info.active), nativeBalance: BigInt(info.nativeBalance), usdgBalance });
    } catch (e) { setHood(null); setError(err(e)); }
    finally { setWalletLoading(false); }
  }, [address, provider]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setHoodies([]); setHoodieId(""); setHood(null);
      if (!address) return;
      setHoodiesLoading(true);
      try {
        const response = await fetch(`/api/hoodies?owner=${encodeURIComponent(address)}`, { cache: "no-store", signal: controller.signal });
        const payload = await response.json() as { items?: Hoodie[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "Unable to load Hoodies");
        if (controller.signal.aborted) return;
        const unique = [...new Map((payload.items || []).map(h => [String(h.tokenId), h])).values()];
        unique.sort((a,b) => Number(a.tokenId) - Number(b.tokenId));
        setHoodies(unique); setHoodieId(unique[0]?.tokenId || "");
      } catch (e) { if (!controller.signal.aborted) setError(err(e)); }
      finally { if (!controller.signal.aborted) setHoodiesLoading(false); }
    }, 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [address]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refreshHood(hoodieId); }, 0);
    return () => window.clearTimeout(timer);
  }, [hoodieId, refreshHood]);

  const loadCollection = useCallback(async (override?: string) => {
    const input = (override ?? marketUrl).trim();
    if (!input) { setError("Paste an OpenSea collection URL."); return; }
    setLoading(true); setError(""); setSuccess(""); setChosen(null);
    try {
      const response = await fetch(`/api/buyos/listings?${new URLSearchParams({ url: input })}`, { cache: "no-store" });
      const data = await response.json() as ListingsResponse;
      if (!response.ok || !data.ok || data.chain !== CHAIN) throw new Error(data.error || "Unable to load Robinhood OpenSea listings.");
      setMarketUrl(input); setSlug(data.slug || ""); setCollection(data.collection || null);
      setListings(data.listings || []); setNext(data.next || null);
    } catch (e) { setError(err(e)); }
    finally { setLoading(false); }
  }, [marketUrl]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (initialUrl.current) return;
      initialUrl.current = true;
      const shared = new URLSearchParams(window.location.search).get("collection");
      if (shared) void loadCollection(shared);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadCollection]);

  async function loadMore() {
    if (!slug || !next || loadingMore) return;
    setLoadingMore(true); setError("");
    try {
      const params = new URLSearchParams({ slug, cursor: next });
      const response = await fetch(`/api/buyos/listings?${params}`, { cache: "no-store" });
      const data = await response.json() as ListingsResponse;
      if (!response.ok || !data.ok || data.chain !== CHAIN) throw new Error(data.error || "Unable to load more listings.");
      setListings(previous => {
        const known = new Set(previous.map(l => l.orderHash));
        return [...previous, ...(data.listings || []).filter(l => !known.has(l.orderHash))];
      });
      setNext(data.next || null);
    } catch (e) { setError(err(e)); }
    finally { setLoadingMore(false); }
  }

  async function share() {
    const url = new URL(window.location.pathname, window.location.origin);
    url.searchParams.set("collection", marketUrl.trim());
    try { await navigator.clipboard.writeText(url.toString()); setSuccess("Collection link copied."); }
    catch { setError("Unable to copy collection link."); }
  }

  const ownerReady = Boolean(hood && address && same(hood.owner, address) && hood.active && hood.walletDeployed);
  const selectedCurrency = chosen ? pricedCurrency(chosen) : "ETH";

  async function buy() {
    if (!chosen || !hood || !address || buying || !ownerReady) return;
    const order = chosen;
    const buyer = hood;
    setBuying(true); setError(""); setSuccess("");
    try {
      const response = await fetch("/api/buyos/fulfill", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, orderHash: order.orderHash, chain: order.chain, protocolAddress: order.protocolAddress, contract: order.contract, tokenId: order.tokenId, hoodWallet: buyer.walletAddress }),
      });
      const payload = await response.json() as FulfillResponse;
      if (!response.ok || !payload.ok || !payload.execution || payload.chain !== CHAIN) throw new Error(payload.error || "Could not prepare purchase.");
      if (payload.orderHash && payload.orderHash.toLowerCase() !== order.orderHash.toLowerCase()) throw new Error("Marketplace order changed. Reload listings.");
      if (payload.nft && (!same(payload.nft.contract, order.contract) || payload.nft.tokenId !== order.tokenId)) throw new Error("Marketplace returned a different NFT.");
      const execution = payload.execution;
      if (!/^0x[0-9a-fA-F]{40}$/.test(execution.target) || !/^0x[0-9a-fA-F]*$/.test(execution.data)) throw new Error("Invalid marketplace execution.");
      const nativeValue = BigInt(execution.value);
      const currency = pricedCurrency(order);
      if (currency === "WETH") throw new Error("WETH listings are not supported by this BuyOS flow yet.");
      if (currency !== "ETH" && currency !== "USDG") throw new Error(`Currency ${currency} is not supported by BuyOS.`);
      await ensureRequiredNetwork();
      const client = await getWalletClient();
      if (!client.account || !same(client.account.address, address)) throw new Error("Connected wallet changed.");
      // ETH payment can be forwarded from EOA in the same transaction. NFT is still bought by HoodWallet.
      let externalValue = BigInt(0);
      if (currency === "ETH") {
        if (payEthFromEoa) {
          const eoaEth = await provider.getBalance(address);
          if (eoaEth <= nativeValue) throw new Error("Your connected wallet needs ETH for price and gas.");
          externalValue = nativeValue;
        } else if (await provider.getBalance(buyer.walletAddress) < nativeValue) {
          throw new Error("Insufficient HoodWallet ETH. Use connected-wallet payment or Add Funds.");
        }
      } else {
        // USDG orders require the API to identify the actual ERC-20 spender and exact amount.
        // Never blindly approve an arbitrary marketplace target or guess from the order hash.
        if (!execution.paymentToken || !same(execution.paymentToken, USDG) ||
            !execution.paymentAmount || !execution.approvalTarget ||
            !/^0x[0-9a-fA-F]{40}$/.test(execution.approvalTarget)) {
          throw new Error("This USDG listing needs ERC-20 payment metadata from /api/buyos/fulfill (paymentToken, paymentAmount, approvalTarget). The purchase was not sent.");
        }
        const amount = BigInt(execution.paymentAmount);
        if (amount <= BigInt(0)) throw new Error("Invalid USDG amount.");
        const usdToken = new Contract(USDG, erc20Interface, provider);
        const current = BigInt(await usdToken.balanceOf(buyer.walletAddress));
        if (current < amount) throw new Error("Not enough USDG in your HoodWallet. Use Add Funds to deposit USDG.");
        const spender = execution.approvalTarget as Address;
        if (same(spender, buyer.walletAddress) || same(spender, USDG)) throw new Error("Unsafe approval target.");
        const existing = BigInt(await usdToken.allowance(buyer.walletAddress, spender));
        if (existing < amount) {
          // An exact amount approval, directly from the HoodWallet. Never an unlimited allowance.
          const approveData = encodeFunctionData({ abi: ERC20_ABI, functionName: "approve", args: [spender, amount] });
          const encoded = encodeFunctionData({ abi: EXECUTE_ABI, functionName: "execute", args: [USDG as Address, BigInt(0), approveData, 0] });
          await provider.call({ from: address, to: buyer.walletAddress, data: encoded });
          const approvalHash = await client.writeContract({ chain: null, account: client.account, address: buyer.walletAddress as Address, abi: EXECUTE_ABI, functionName: "execute", args: [USDG as Address, BigInt(0), approveData, 0] });
          const receipt = await provider.waitForTransaction(approvalHash, 1);
          if (!receipt || receipt.status !== 1) throw new Error("USDG approval transaction failed.");
        }
        if (nativeValue > BigInt(0)) throw new Error("USDG fulfillment unexpectedly requires native ETH; this order is not supported.");
      }
      const call = encodeFunctionData({ abi: EXECUTE_ABI, functionName: "execute", args: [execution.target as Address, nativeValue, execution.data, 0] });
      await provider.call({ from: address, to: buyer.walletAddress, data: call, value: externalValue });
      const hash = await client.writeContract({ chain: null, account: client.account, address: buyer.walletAddress as Address, abi: EXECUTE_ABI, functionName: "execute", args: [execution.target as Address, nativeValue, execution.data, 0], value: externalValue });
      const receipt = await provider.waitForTransaction(hash, 1);
      if (!receipt || receipt.status !== 1) throw new Error("Purchase transaction failed.");
      setChosen(null); setSuccess(`${order.name} purchased through Hoodie #${buyer.tokenId}!`);
      await refreshHood(buyer.tokenId);
      await loadCollection();
    } catch (e) { setError(err(e)); }
    finally { setBuying(false); }
  }

  const field = "min-w-0 flex-1 border border-[#ccff00]/60 bg-black px-3 py-3 text-xs text-[#ccff00] outline-none placeholder:text-[#ccff00]/40";
  const outline = "border border-[#ccff00] px-3 py-2 text-[10px] uppercase disabled:opacity-40";
  const solid = "bg-[#ccff00] px-4 py-3 text-xs font-bold uppercase text-black disabled:opacity-40";

  return <main className="min-h-screen bg-black text-[#ccff00]">
    <SiteHeader />
    <section className="mx-auto max-w-none px-4 pb-20 pt-12 md:px-8 md:pt-16">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#ccff00]/50 pb-3 text-[10px] uppercase"><span>HoodOS / BuyOS</span><Link href="/hoodos" className="underline underline-offset-4">Back to HoodOS ↗</Link></div>
      <header className="py-7"><p className="text-[10px] uppercase tracking-[0.15em]">OpenSea / Robinhood Chain</p><h1 className="mt-2 text-4xl tracking-tight md:text-6xl">BUY OS.</h1><p className="mt-3 text-sm">Buy NFTs from the floor, directly into your HoodWallet.</p></header>
      {!address ? <div className="rounded border border-[#ccff00]/50 p-7 text-center"><p className="mb-4 text-sm">Connect to buy as your Hoodie.</p><button type="button" className={solid} onClick={() => void connect()}>CONNECT WALLET →</button></div> : <div className="mb-6 space-y-3">
        <HoodieSelector hoodies={hoodies} selectedId={hoodieId} onSelect={id => { setHoodieId(id); setHood(null); setChosen(null); }} imageForId={artwork} loading={hoodiesLoading} disabled={buying} selectedActive={Boolean(hood?.active && hood.tokenId === hoodieId)}/>
        <div className="flex flex-wrap items-center gap-3 rounded border border-[#ccff00]/40 px-3 py-3 text-[10px]">
          <span>HOODIE #{hoodieId || "—"}</span>
          <span className={hood?.active ? "font-bold" : "opacity-60"}>{walletLoading ? "READING WALLET…" : hood?.active ? "● ACTIVE" : "○ INACTIVE"}</span>
          <span>{hood ? smallBalance(hood.nativeBalance, 18) : "—"} ETH</span>
          <span>{hood ? smallBalance(hood.usdgBalance, 6) : "—"} USDG</span>
          {hood?.active && <button type="button" className={outline} onClick={() => setFundsOpen(true)}>ADD / WITHDRAW FUNDS ↗</button>}
          {hood && !hood.active && <Link href="/hoodwallet" className="underline">ACTIVATE WALLET ↗</Link>}
        </div>
      </div>}
      <section className="rounded border border-[#ccff00]/50 p-4 md:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg">FIND A COLLECTION.</h2>{marketUrl && <button className={outline} disabled={!marketUrl.trim()} onClick={() => void share()}>SHARE ↗</button>}</div>
        <form className="flex gap-2" onSubmit={e => { e.preventDefault(); void loadCollection(); }}><input className={field} value={marketUrl} onChange={e => setMarketUrl(e.target.value)} placeholder="Paste an OpenSea collection URL…" /><button type="submit" className={solid} disabled={loading || !marketUrl.trim()}>{loading ? "LOADING…" : "LOAD ↗"}</button></form>
        {collection && <div className="mt-4 flex flex-wrap items-end justify-between gap-3"><div><h3 className="text-xl">{collection.name}</h3><p className="text-xs opacity-70">{listings.length} listings loaded · ETH / USDG where supported</p></div>{collection.openseaUrl && <a className="text-xs underline" href={collection.openseaUrl} rel="noreferrer" target="_blank">OPENSEA ↗</a>}</div>}
      </section>
      {listings.length > 0 && <section className="mt-5">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
          {listings.map(listing => {
            const currency = pricedCurrency(listing);
            const isEth = currency === "ETH";
            const isUsdg = currency === "USDG";
            const supported = isEth || isUsdg;
            return <button key={listing.orderHash} type="button" className="group flex min-w-0 flex-col overflow-hidden rounded border border-[#ccff00]/40 bg-black text-left transition-colors hover:border-[#ccff00] hover:bg-[#ccff00]/10 disabled:cursor-not-allowed disabled:opacity-40" disabled={!ownerReady || buying || !supported} onClick={() => setChosen(listing)}>
              <ListingArt listing={listing}/>
              <div className="flex w-full flex-1 flex-col gap-1 p-3"><span className="truncate text-xs">{listing.name}</span><span className="text-[10px] opacity-60">#{listing.tokenId}</span><span className="mt-auto pt-2 text-sm font-bold">{listing.priceDisplay} {currency}</span><span className="mt-2 text-[10px] uppercase underline underline-offset-2">{supported ? "BUY AS HOODIE ↗" : "UNSUPPORTED TOKEN"}</span></div>
            </button>;
          })}
        </div>
        {next && <button type="button" className={`${outline} mt-4 w-full py-3`} disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? "LOADING…" : "LOAD MORE ↓"}</button>}
      </section>}
      {success && <p className="mt-5 rounded border border-[#ccff00] p-4 text-sm" role="status">{success}</p>}
      {error && <p className="mt-5 rounded border border-[#ccff00] p-4 text-sm" role="alert">{error}</p>}
    </section>
    {fundsOpen && hood && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-3" role="dialog" aria-modal="true" aria-label="HoodWallet funds" onMouseDown={e => { if (e.target === e.currentTarget) setFundsOpen(false); }}>
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto border border-[#ccff00] bg-black p-4 text-[#ccff00] md:p-5"><div className="mb-4 flex items-center justify-between gap-3"><p className="text-sm">HOODIE #{hood.tokenId} · FUNDS</p><button type="button" className={outline} onClick={() => setFundsOpen(false)}>× CLOSE</button></div><HoodWalletFunds tokenId={hood.tokenId} hoodWallet={hood.walletAddress} active={hood.active} onBalancesChanged={() => refreshHood(hood.tokenId)}/></div>
    </div>}
    {chosen && hood && <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/90 p-3" role="dialog" aria-modal="true" aria-label="Confirm NFT purchase">
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded border border-[#ccff00] bg-black p-4 text-[#ccff00]">
        <div className="mb-4 flex items-center justify-between"><h2 className="text-lg">BUY AS HOODIE #{hood.tokenId}</h2><button className={outline} disabled={buying} onClick={() => setChosen(null)}>×</button></div>
        <div className="mx-auto max-w-[180px]"><ListingArt listing={chosen}/></div>
        <h3 className="mt-4 text-lg">{chosen.name} <span className="text-xs opacity-60">#{chosen.tokenId}</span></h3>
        <p className="mt-2 text-xl">{chosen.priceDisplay} {selectedCurrency}</p>
        {selectedCurrency === "ETH" && <div className="mt-4 flex gap-2"><button type="button" disabled={buying} onClick={() => setPayEthFromEoa(true)} className={`${outline} flex-1 ${payEthFromEoa ? "bg-[#ccff00] text-black" : ""}`}>EOA PAYS</button><button type="button" disabled={buying} onClick={() => setPayEthFromEoa(false)} className={`${outline} flex-1 ${!payEthFromEoa ? "bg-[#ccff00] text-black" : ""}`}>HOODWALLET PAYS</button></div>}
        {selectedCurrency === "USDG" && <p className="mt-3 text-xs">USDG must be in your HoodWallet. BuyOS may request a separate exact-amount approval before purchase; the API must provide validated approval metadata.</p>}
        <p className="mt-3 text-xs opacity-70">Your Hoodie receives the NFT. The connected wallet signs and pays network gas.</p>
        <div className="mt-4 flex gap-2"><button type="button" className={`${outline} flex-1`} disabled={buying} onClick={() => { setChosen(null); setFundsOpen(true); }}>FUNDS</button><button type="button" className={`${solid} flex-[2]`} disabled={buying} onClick={() => void buy()}>{buying ? "PURCHASING…" : "CONFIRM BUY ↗"}</button></div>
      </div>
    </div>}
    <SiteFooter />
  </main>;
}
