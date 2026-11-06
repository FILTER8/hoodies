"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useWallet } from "./WalletProvider";
import { homepageApi } from "../lib/hoodieHomepage";

type Counts = { ok?: boolean; followers: number; following: number; isFollowing: boolean | null; error?: string };
type Listed = { items?: Array<{ tokenId: number; since: number; url: string }>; hasMore?: boolean; error?: string };
type OwnedHoodie = { tokenId: string; name?: string };
const api = (suffix: string) => homepageApi(`/v1/homepage/social/${suffix}`);
const shortError = (value: unknown) => value instanceof Error ? value.message : "Please try again";

/** Built-in social footer for every published Hoodie homepage. No editor module required. */
export default function HoodieFollowing({ tokenId }: { tokenId: number }) {
  const { address, connect, getWalletClient, ensureRequiredNetwork } = useWallet();
  const [owned, setOwned] = useState<OwnedHoodie[]>([]);
  const [actor, setActor] = useState("");
  const [counts, setCounts] = useState<Counts | null>(null);
  const [tab, setTab] = useState<"followers" | "following" | null>(null);
  const [items, setItems] = useState<Array<{ tokenId: number; url: string }>>([]);
  const [hasMore, setHasMore] = useState(false);
  const [working, setWorking] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      if (!address) { setOwned([]); setActor(""); return; }
      try {
        const response = await fetch(`/api/hoodies?owner=${encodeURIComponent(address)}`, { cache: "no-store", signal: controller.signal });
        const data = await response.json() as { items?: OwnedHoodie[] };
        if (!response.ok) throw Error("Unable to load your Hoodies");
        const valid = (data.items || []).filter(h => String(h.tokenId) !== String(tokenId));
        setOwned(valid);
        setActor(current => valid.some(h => h.tokenId === current) ? current : String(valid[0]?.tokenId || ""));
      } catch { if (!controller.signal.aborted) setOwned([]); }
    }, 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [address, tokenId]);

  const refresh = useCallback(async (viewer: string) => {
    const query = viewer ? `?viewer=${encodeURIComponent(viewer)}` : "";
    const response = await fetch(api(`${tokenId}${query}`), { cache: "no-store" });
    const data = await response.json() as Counts;
    if (!response.ok) throw Error(data.error || "Cannot read followers");
    setCounts(data);
  }, [tokenId]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void refresh(actor).catch(error => { if (!cancelled) setError(shortError(error)); });
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [refresh, actor]);

  const showList = useCallback(async (category: "followers" | "following", offset: number, append: boolean) => {
    setListLoading(true);
    setError("");
    try {
      const response = await fetch(api(`${tokenId}/${category}?limit=12&offset=${offset}`), { cache: "no-store" });
      const data = await response.json() as Listed;
      if (!response.ok) throw Error(data.error || "Cannot load Hoodie list");
      setItems(previous => append ? [...previous, ...(data.items || [])] : data.items || []);
      setHasMore(Boolean(data.hasMore));
    } catch (e) { setError(shortError(e)); }
    finally { setListLoading(false); }
  }, [tokenId]);

  async function changeFollowing() {
    if (working || !actor || !address) return;
    setWorking(true); setError(""); setNotice("");
    const action = counts?.isFollowing ? "unfollow" : "follow";
    try {
      await ensureRequiredNetwork();
      const challengeResponse = await fetch(api("nonce"), {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ actorTokenId: Number(actor), targetTokenId: tokenId, action }),
      });
      const challenge = await challengeResponse.json() as { message?: string; nonce?: string; error?: string };
      if (!challengeResponse.ok || !challenge.message || !challenge.nonce) throw Error(challenge.error || "Could not prepare signature");
      const client = await getWalletClient();
      if (!client.account || client.account.address.toLowerCase() !== address.toLowerCase()) throw Error("Connected wallet changed");
      const signature = await client.signMessage({ account: client.account, message: challenge.message });
      const saveResponse = await fetch(api("action"), {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ nonce: challenge.nonce, signature }),
      });
      const result = await saveResponse.json() as { error?: string; changed?: boolean };
      if (!saveResponse.ok) throw Error(result.error || "Could not update following");
      await refresh(actor);
      if (tab) await showList(tab, 0, false);
      setNotice(result.changed ? (action === "follow" ? `Hoodie #${actor} now follows #${tokenId}` : `Hoodie #${actor} unfollowed #${tokenId}`) : "Already up to date");
    } catch (e) { setError(shortError(e)); }
    finally { setWorking(false); }
  }

  return <section className="mx-auto my-5 w-full max-w-[1180px] px-3 sm:px-7" aria-label="Hoodie Following">
    <div className="border border-[#ccff00] bg-black p-4 text-[#ccff00] sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold tracking-[.12em]">ONE WORLD WIDE HOOD</p>
          <p className="mt-1 text-[9px] opacity-75">HOODIE #{tokenId} · NEIGHBORS</p>
        </div>
        <div className="flex items-center gap-3 text-[10px]">
          <button type="button" onClick={() => { const next = tab === "followers" ? null : "followers"; setTab(next); if (next) void showList(next, 0, false); }} className="underline underline-offset-4">{counts?.followers ?? "–"} FOLLOWERS</button>
          <button type="button" onClick={() => { const next = tab === "following" ? null : "following"; setTab(next); if (next) void showList(next, 0, false); }} className="underline underline-offset-4">{counts?.following ?? "–"} FOLLOWING</button>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {!address ? <button type="button" onClick={() => void connect()} className="bg-[#ccff00] px-4 py-3 text-[10px] font-bold text-black">CONNECT TO FOLLOW</button>
          : owned.length === 0 ? <p className="text-[10px] opacity-75">Own another Hoodie to follow this page.</p>
          : <>
            <label htmlFor={`following-from-${tokenId}`} className="text-[10px]">AS</label>
            <select id={`following-from-${tokenId}`} className="min-w-[135px] border border-[#ccff00] bg-black px-2 py-3 text-[10px] text-[#ccff00]" value={actor} onChange={e => setActor(e.target.value)} disabled={working}>
              {owned.map(h => <option key={h.tokenId} value={h.tokenId}>HOODIE #{h.tokenId}</option>)}
            </select>
            <button type="button" onClick={() => void changeFollowing()} disabled={working || !actor || !counts} className="bg-[#ccff00] px-4 py-3 text-[10px] font-bold text-black disabled:opacity-50">
              {working ? "SIGNING…" : counts?.isFollowing ? "✓ FOLLOWING · UNFOLLOW" : "+ FOLLOW HOODIE"}
            </button>
          </>}
      </div>
      {notice && <p role="status" className="mt-3 text-[10px]">{notice}</p>}
      {error && <p role="alert" className="mt-3 text-[10px]">{error}</p>}
      {tab && <div className="mt-4 border-t border-[#ccff00] pt-3">
        <div className="mb-3 flex items-center justify-between text-[10px]"><strong>{tab.toUpperCase()}</strong><button type="button" onClick={() => setTab(null)} aria-label="Close following list">×</button></div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {items.map(item => <Link key={item.tokenId} href={`/hoodies/${item.tokenId}`} className="flex items-center gap-2 border border-[#ccff00] p-2 text-[10px] hover:bg-[#ccff00] hover:text-black">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="" loading="lazy" src={`https://api.onchainhoodies.xyz/images/${item.tokenId}.svg`} className="h-9 w-9 object-contain [image-rendering:pixelated]"/>
            #{item.tokenId}
          </Link>)}
        </div>
        {!listLoading && items.length === 0 && <p className="text-[10px] opacity-75">Nobody here yet. Be the first!</p>}
        {hasMore && <button type="button" disabled={listLoading} className="mt-3 border border-[#ccff00] px-3 py-2 text-[10px] disabled:opacity-50" onClick={() => void showList(tab, items.length, true)}>{listLoading ? "LOADING…" : "LOAD MORE"}</button>}
      </div>}
    </div>
  </section>;
}
