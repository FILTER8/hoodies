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

/** The small, always-on follow button and the optional customizable stats module share the same API. */
export default function HoodieFollowing({ tokenId, mode = "button", showFollowers = true, showFollowing = true, showLists = true }: {
  tokenId: number; mode?: "button" | "stats"; showFollowers?: boolean; showFollowing?: boolean; showLists?: boolean;
}) {
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
    if (mode !== "button") return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      if (!address) { setOwned([]); setActor(""); return; }
      try {
        const response = await fetch(`/api/hoodies?owner=${encodeURIComponent(address)}`, { cache: "no-store", signal: controller.signal });
        const data = await response.json() as { items?: OwnedHoodie[] };
        if (!response.ok) throw Error("Unable to load Hoodies");
        if (controller.signal.aborted) return;
        const valid = (data.items || []).filter(h => String(h.tokenId) !== String(tokenId));
        setOwned(valid);
        setActor(current => valid.some(h => String(h.tokenId) === current) ? current : String(valid[0]?.tokenId ?? ""));
      } catch { if (!controller.signal.aborted) setOwned([]); }
    }, 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [address, tokenId, mode]);

  const refresh = useCallback(async (viewer: string) => {
    const query = viewer ? `?viewer=${encodeURIComponent(viewer)}` : "";
    const response = await fetch(api(`${tokenId}${query}`), { cache: "no-store" });
    const data = await response.json() as Counts;
    if (!response.ok) throw Error(data.error || "Cannot read followers");
    setCounts(data);
  }, [tokenId]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => { void refresh(mode === "button" ? actor : "").catch(e => { if (!cancelled) setError(shortError(e)); }); }, 0);
    const onChanged = (event: Event) => {
      if ((event as CustomEvent<{ tokenId: number }>).detail?.tokenId === tokenId) {
        void refresh(mode === "button" ? actor : "").catch(() => {});
      }
    };
    window.addEventListener("hoodie-follow-changed", onChanged);
    return () => { cancelled = true; window.clearTimeout(timer); window.removeEventListener("hoodie-follow-changed", onChanged); };
  }, [refresh, actor, mode, tokenId]);

  const showList = useCallback(async (category: "followers" | "following", offset: number, append: boolean) => {
    setListLoading(true); setError("");
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
    if (working || !actor || !address || !counts) return;
    setWorking(true); setError(""); setNotice("");
    const action = counts.isFollowing ? "unfollow" : "follow";
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
      window.dispatchEvent(new CustomEvent("hoodie-follow-changed", { detail: { tokenId } }));
      setNotice(result.changed ? (action === "follow" ? `Following as Hoodie #${actor}` : `Unfollowed as Hoodie #${actor}`) : "Already up to date");
    } catch (e) { setError(shortError(e)); }
    finally { setWorking(false); }
  }

  if (mode === "button") return <div className="flex w-full flex-wrap items-center justify-start gap-2 text-left" aria-label="Follow this Hoodie">
    <div className="inline-flex max-w-full flex-wrap items-center gap-2 bg-black p-1.5 text-[#ccff00]">
      {!address ? <button type="button" onClick={() => void connect()} className="border border-[#ccff00] px-3 py-2 text-[10px] font-bold">+ FOLLOW</button>
        : owned.length === 0 ? <span className="px-2 py-1 text-[10px]">OWN ANOTHER HOODIE TO FOLLOW</span>
        : <>
          {owned.length > 1 && <select aria-label="Follow as Hoodie" className="max-w-[130px] border border-[#ccff00] bg-black px-2 py-2 text-[10px]" value={actor} onChange={e => setActor(e.target.value)} disabled={working}>{owned.map(h => <option key={h.tokenId} value={h.tokenId}>#{h.tokenId}</option>)}</select>}
          <button type="button" onClick={() => void changeFollowing()} disabled={working || !actor || !counts} className="border border-[#ccff00] px-3 py-2 text-[10px] font-bold hover:bg-[#ccff00] hover:text-black disabled:opacity-50">
            {working ? "SIGNING…" : counts?.isFollowing ? "✓ FOLLOWING · UNFOLLOW" : "+ FOLLOW"}
          </button>
        </>}
    </div>
    {notice && <span role="status" className="bg-black px-2 py-1 text-[9px] text-[#ccff00]">{notice}</span>}
    {error && <span role="alert" className="bg-black px-2 py-1 text-[9px] text-[#ccff00]">{error}</span>}
  </div>;

  return <div className="w-full" aria-label={`Hoodie #${tokenId} neighbors`}>
    <p className="mb-3 text-[10px] font-bold tracking-widest">HOODIE #{tokenId} · NEIGHBORS</p>
    <div className="flex flex-wrap justify-center gap-4">
      {showFollowers && <button type="button" disabled={!showLists} onClick={() => { const next = tab === "followers" ? null : "followers"; setTab(next); if (next) void showList(next, 0, false); }} className={`border border-current px-3 py-2 ${showLists ? "hover:underline" : ""}`}><strong>{counts?.followers ?? "–"}</strong> FOLLOWERS</button>}
      {showFollowing && <button type="button" disabled={!showLists} onClick={() => { const next = tab === "following" ? null : "following"; setTab(next); if (next) void showList(next, 0, false); }} className={`border border-current px-3 py-2 ${showLists ? "hover:underline" : ""}`}><strong>{counts?.following ?? "–"}</strong> FOLLOWING</button>}
    </div>
    {error && <p role="alert" className="mt-3 text-xs">{error}</p>}
    {showLists && tab && <div className="mt-4 border-t border-current pt-3">
      <div className="mb-3 flex justify-between gap-2 text-xs"><strong>{tab.toUpperCase()}</strong><button type="button" onClick={() => setTab(null)}>× CLOSE</button></div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {items.map(item => <Link key={item.tokenId} href={`/hoodies/${item.tokenId}`} className="flex items-center gap-2 border border-current p-2 text-left text-[10px] hover:underline">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="" loading="lazy" src={`https://api.onchainhoodies.xyz/images/${item.tokenId}.svg`} className="h-9 w-9 shrink-0 object-contain [image-rendering:pixelated]"/>
          #{item.tokenId}
        </Link>)}
      </div>
      {!listLoading && items.length === 0 && <p className="mt-2 text-xs opacity-75">No Hoodies yet.</p>}
      {hasMore && <button type="button" disabled={listLoading} className="mt-3 border border-current px-3 py-2 text-[10px]" onClick={() => void showList(tab, items.length, true)}>{listLoading ? "LOADING…" : "LOAD MORE"}</button>}
    </div>}
  </div>;
}
