/* eslint-disable @next/next/no-img-element -- External R2 GIFs and on-chain SVGs intentionally use raw img elements. */
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Address } from "viem";
import SiteHeader from "../../../components/SiteHeader";
import SiteFooter from "../../../components/SiteFooter";
import HoodieHomepageView from "../../../components/HoodieHomepageView";
import HoodpageMidiPlayer from "../../../components/HoodpageMidiPlayer";
import { useWallet } from "../../../components/WalletProvider";
import { defaultHomepage, EMPTY_MEDIA, fetchMediaLibrary, mediaUrl, fetchHomepageLive, type MediaLibrary, type HomepageLiveData, homepageApi, type HomepageConfig, type HomepageModule, type TextSize } from "../../../lib/hoodieHomepage";

type Owned = { tokenId: string; name?: string };
function errorText(error: unknown) { return error instanceof Error ? error.message : "Something went wrong"; }
function jsonResponse<T>(response: Response): Promise<T> { return response.json() as Promise<T>; }
function freshId(): string { return `m${Math.random().toString(36).slice(2,10)}`; }
const button = "min-h-10 border border-current px-3 py-2 text-[10px] uppercase tracking-[.09em] hover:bg-black hover:text-[#ccff00] disabled:opacity-30";
const field = "w-full min-w-0 border border-black bg-transparent px-3 py-2 text-sm outline-offset-2";

export default function HomepageEditor() {
  const { address, connect, getWalletClient, ensureRequiredNetwork } = useWallet();
  const [owned, setOwned] = useState<Owned[]>([]);
  const [tokenId, setTokenId] = useState("");
  const [config, setConfig] = useState<HomepageConfig>(() => defaultHomepage(0));
  const [live, setLive] = useState<HomepageLiveData>({});
  const [media, setMedia] = useState<MediaLibrary>(EMPTY_MEDIA);
  const [mediaError, setMediaError] = useState("");
  const [textTarget, setTextTarget] = useState("");
  const [openModules, setOpenModules] = useState<string[]>([]);
  const [device, setDevice] = useState<"mobile" | "desktop">("mobile");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const id = Number(tokenId || 0);
  const isOwned = useMemo(() => owned.some(item => item.tokenId === tokenId), [owned, tokenId]);

  useEffect(() => {
    let cancelled = false;
    async function loadOwned() {
      if (!address) { if (!cancelled) { setOwned([]); setTokenId(""); } return; }
      try {
        const response = await fetch(`/api/hoodies?owner=${encodeURIComponent(address)}`, { cache: "no-store" });
        const data = await jsonResponse<{ items?: Owned[]; error?: string }>(response);
        if (!response.ok) throw new Error(data.error || "Could not load your Hoodies");
        if (cancelled) return;
        const items = (data.items || []).map(item => ({ ...item, tokenId: String(item.tokenId) }));
        setOwned(items);
        const queryId = new URLSearchParams(window.location.search).get("hoodie");
        setTokenId(previous => items.some(item => item.tokenId === previous) ? previous : items.some(item => item.tokenId === queryId) ? queryId! : items[0]?.tokenId || "");
      } catch (e) { if (!cancelled) setError(errorText(e)); }
    }
    void loadOwned();
    return () => { cancelled = true; };
  }, [address]);

  useEffect(() => {
    let cancelled = false;
    async function loadPage() {
      if (!tokenId) { if (!cancelled) setLoaded(false); return; }
      try {
        const pageResponse = await fetch(homepageApi(`/v1/homepage/${tokenId}`), { cache: "no-store" });
        const page = await jsonResponse<{ config?: HomepageConfig | null }>(pageResponse);
        if (!pageResponse.ok) throw new Error("Could not load homepage");
        const loadedConfig = page.config?.version === 2 ? page.config : defaultHomepage(Number(tokenId));
        if (!cancelled) { setOpenModules([]); setConfig(loadedConfig); setLive({}); setLoaded(true); setStatus(""); setError(""); }
        // Optional live information is fetched separately so it never blocks editing.
        const info = await fetchHomepageLive(Number(tokenId), { ...loadedConfig, modules: [
          { id: "live-assets", type: "assets" }, { id: "live-journey", type: "journey" }, {id:"live-memory", type:"memory"},
        ] });
        if (!cancelled) setLive(info);
      } catch (e) { if (!cancelled) { setError(errorText(e)); setLoaded(false); } }
    }
    void loadPage();
    return () => { cancelled = true; };
  }, [tokenId]);

  useEffect(() => {
    let cancelled = false;
    fetchMediaLibrary().then(items => { if (!cancelled) { setMedia(items); setMediaError(""); } })
      .catch(e => { if (!cancelled) setMediaError(errorText(e)); });
    return () => { cancelled = true; };
  }, []);

  function insertGif(file: string) {
    const firstText = config.modules.find(m => m.type === "text" || m.type === "marquee");
    const target = config.modules.find(m => (m.type === "text" || m.type === "marquee") && m.id === textTarget) || firstText;
    if (target) {
      editModule(target.id, m => m.type === "text" || m.type === "marquee" ? { ...m, text: `${m.text}${m.text.endsWith("\n") || !m.text ? "" : "\n"}[[gif:${file}]]` } : m);
      setTextTarget(target.id);
      setStatus(`Added ${file} to your text.`);
    } else if (config.modules.length < 16) {
      const newId = freshId();
      setConfig(previous => ({ ...previous, modules: [...previous.modules, { id: newId, type: "text", title: "", text: `[[gif:${file}]]` }] }));
      setTextTarget(newId); setOpenModules(prev => [...prev, newId]);
      setStatus(`Created a text section with ${file}.`);
    } else {
      setStatus("Maximum 16 modules. Remove one to add a GIF.");
    }
  }
  function insertDivider(file: string) {
    if (config.modules.length >= 16) { setStatus("Maximum 16 modules. Remove one to add a divider."); return; }
    setConfig(previous => ({ ...previous, modules: [...previous.modules, { id: freshId(), type: "divider", style: "line", asset: file, framed: false }] }));
    setStatus(`Added ${file} as a divider.`);
  }

  function insertMidi(file: string, label: string) {
    const existing = config.modules.find(m => m.type === "midi");
    if (!existing && config.modules.length >= 16) { setStatus("Maximum 16 modules. Remove one to add music."); return; }
    setConfig(previous => {
      const music = previous.modules.find(m => m.type === "midi");
      if (music) return { ...previous, modules: previous.modules.map(m => m.type === "midi" ? { ...m, asset: file, label } : m) };
      return { ...previous, modules: [...previous.modules, { id: freshId(), type: "midi", asset: file, label, loop: false, framed: true, textFill: "black" }] };
    });
    setStatus(`Selected ${label} as your homepage soundtrack.`);
  }

  function editModule(id: string, edit: (module: HomepageModule) => HomepageModule) {
    setConfig(previous => ({ ...previous, modules: previous.modules.map(module => module.id === id ? edit(module) : module) }));
  }
  function move(id: string, delta: -1 | 1) {
    setConfig(previous => {
      const next = [...previous.modules]; const i = next.findIndex(module => module.id === id); const j = i + delta;
      if (i < 0 || j < 0 || j >= next.length) return previous;
      [next[i], next[j]] = [next[j], next[i]];
      return { ...previous, modules: next };
    });
  }
  function add(type: HomepageModule["type"]) {
    if (type === "midi" && config.modules.some(m => m.type === "midi")) { setStatus("Only one music player is allowed. Choose a track in the MIDI Library to change it."); return; }
    if (config.modules.length >= 16) return;
    const id = freshId();
    const newModule: HomepageModule = type === "identity" ? { id, type } :
      type === "talk" ? { id, type, textFill: "black" } :
      type === "text" ? { id, type, title: "MY MESSAGE", text: "Type something here..." } :
      type === "links" ? { id, type, items: [{ label: "ONCHAINHOODIES", url: "https://onchainhoodies.xyz" }] } :
      type === "divider" ? { id, type, style: "line", asset: media.decorations[0]?.file } :
      type === "assets" ? { id, type, framed: true, showTokens: true, showNfts: true, limit: 12 } :
      type === "journey" ? { id, type, framed: true, completedOnly: true, limit: 12, showStats: false } :
      type === "memory" ? { id, type, framed: true, limit: 5, showStats: false } :
      type === "netmint" ? { id, type, framed: true, collection: "" } :
      type === "decor" ? {id, type, asset:media.gifs[0]?.file || "star.gif", width:160} :
      type === "midi" ? {id, type, asset:media.midi[0]?.file || "", label:"", loop:false, framed:true, textFill:"black"} :
      { id, type: "marquee", text: "★ HELLO FROM THE HOOD ★" };
    setConfig(previous => ({ ...previous, modules: [...previous.modules, newModule] }));
    setOpenModules(previous => [...previous, id]);
  }
  async function publish() {
    if (!tokenId || !isOwned || busy || !loaded || !address) return;
    setBusy(true); setError(""); setStatus("Checking your wallet...");
    try {
      await ensureRequiredNetwork();
      if ((config.modules.some(m => m.type === "assets") || config.background?.nft) && !live.wallet) {
        throw new Error("HoodWallet information is not available yet. Try again once it has loaded.");
      }
      const nonceResponse = await fetch(homepageApi("/v1/homepage/nonce"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tokenId: id, config }), cache: "no-store" });
      const challenge = await jsonResponse<{ nonce?: string; message?: string; error?: string }>(nonceResponse);
      if (!nonceResponse.ok || !challenge.message || !challenge.nonce) throw new Error(challenge.error || "Could not prepare signature");
      setStatus("Sign the homepage update in your wallet...");
      const wallet = await getWalletClient();
      const signature = await wallet.signMessage({ account: address as Address, message: challenge.message });
      setStatus("Publishing your page...");
      const saveResponse = await fetch(homepageApi(`/v1/homepage/${tokenId}`), { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ nonce: challenge.nonce, signature, config }), cache: "no-store" });
      const result = await jsonResponse<{ ok?: boolean; error?: string }>(saveResponse);
      if (!saveResponse.ok || !result.ok) throw new Error(result.error || "Could not publish homepage");
      setStatus("Published! Your homepage is live.");
    } catch (e) { setError(errorText(e)); setStatus(""); }
    finally { setBusy(false); }
  }

  return <main className="min-h-screen bg-[#ccff00] text-black">
    <SiteHeader />
    <div className="mx-auto max-w-[1500px] px-4 pb-10 pt-28 sm:px-6 sm:pb-16 sm:pt-32">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3 border-b border-black pb-5">
        <div><p className="mb-2 text-[10px] uppercase tracking-widest">HoodOS / Personal Web</p><h1 className="text-4xl tracking-tight sm:text-6xl">YOUR HOMEPAGE.</h1></div>
        <div className="flex flex-wrap gap-4"><Link href="/hoodies" className="text-xs underline underline-offset-4">World Wide Hood ↗</Link><Link href="/hoodos" className="text-xs underline underline-offset-4">Back to HoodOS</Link></div>
      </div>
      {!address ? <section className="border border-black p-7 text-center"><p className="mb-5">Connect your wallet to edit your Hoodie homepage.</p><button className={button} onClick={() => void connect()}>Connect wallet</button></section> :
      owned.length === 0 ? <section className="border border-black p-7 text-center">No Hoodies found for this wallet.</section> :
      <>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <label className="flex flex-col gap-2 text-xs uppercase tracking-widest">Choose Hoodie
            <select value={tokenId} onChange={e => setTokenId(e.target.value)} className="min-h-12 min-w-[180px] border border-black bg-[#ccff00] px-3 text-lg">
              {owned.map(item => <option value={item.tokenId} key={item.tokenId}>Hoodie #{item.tokenId}</option>)}
            </select>
          </label>
          {isOwned && <Link href={`/hoodies/${tokenId}`} target="_blank" className="text-sm underline underline-offset-4">View public homepage ↗</Link>}
        </div>
        <div className="grid gap-6 lg:grid-cols-[minmax(320px,0.75fr)_minmax(0,1.25fr)]">
          <section className="min-w-0 space-y-5">
            <details open className="border border-black p-3 sm:p-4">
              <summary className="cursor-pointer select-none py-2 text-lg uppercase tracking-widest">STYLE</summary>
              <div className="mt-3">
              
              <label className="flex flex-col gap-2 text-xs uppercase">Theme
                <select className={field} value={config.theme} onChange={e => setConfig(previous => ({ ...previous, theme: e.target.value as HomepageConfig["theme"] }))}>
                  <option value="robin">Classic Robin — black / green</option><option value="green">Robin Inverted — green / black</option>
                </select>
              </label>
              <div className="mt-4 space-y-3 border-t border-black pt-4">
                <p className="text-xs uppercase">Background library · {media.backgrounds.length} files</p>
                {mediaError && <p role="alert" className="text-xs">{mediaError}. Check the HOODPAGE_ASSETS binding and upload paths.</p>}
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  <button type="button" className={`aspect-square border-2 text-[10px] ${!config.background ? "border-black font-bold" : "border-transparent"}`} onClick={() => setConfig(prev => ({ ...prev, background: undefined }))}>
                    <span className="flex h-full items-center justify-center bg-black text-[#ccff00]">COLOR</span>
                  </button>
                  {media.backgrounds.map(bg => <button type="button" key={bg.file} title={bg.label} className={`min-w-0 overflow-hidden border-2 ${config.background?.asset === bg.file ? "border-black" : "border-transparent"}`} onClick={() => setConfig(prev => ({ ...prev, background: { asset: bg.file, mode: "tile", scale: 100 } }))}>
                    <img src={bg.url} loading="lazy" alt={bg.label} className="aspect-square w-full bg-black object-cover [image-rendering:pixelated]" />
                    <span className="block truncate py-1 text-[9px]">{bg.label}</span>
                  </button>)}
                </div>
                <label className="mt-3 flex items-center gap-3 text-xs uppercase">Custom background color <input aria-label="Custom background color" type="color" className="h-10 w-16 cursor-pointer border border-black bg-transparent p-0" value={config.backgroundColor || (config.theme === "green" ? "#ccff00" : "#000000")} onChange={e => setConfig(prev => ({ ...prev, backgroundColor: e.target.value, background: undefined }))}/><span>{config.backgroundColor || (config.theme === "green" ? "#CCFF00" : "#000000")}</span></label>
                <div className="mt-3 border-t border-black pt-3 text-xs">
                  <p className="mb-2 font-bold uppercase">Or tile an NFT from this HoodWallet</p>
                  <div className="grid max-h-48 grid-cols-3 gap-2 overflow-auto sm:grid-cols-4">
                    {(live.nfts || []).filter(n=>n.image).map(n=> <button type="button" key={`${n.contract}:${n.tokenId}`} title={`${n.collectionName} #${n.tokenId}`} className={`border-2 p-1 ${config.background?.nft?.contract.toLowerCase()===n.contract.toLowerCase() && config.background.nft.tokenId===n.tokenId ? "border-black" : "border-transparent"}`} onClick={()=>setConfig(prev=>({...prev,background:{nft:{contract:n.contract,tokenId:n.tokenId},mode:"tile",scale:100}}))}><img src={n.image} alt={n.name} loading="lazy" className="aspect-square w-full bg-black object-contain [image-rendering:pixelated]"/><span className="block truncate text-[9px]">#{n.tokenId}</span></button>)}
                  </div>
                  {!live.nfts?.length && <p className="opacity-70">No NFT artwork in this HoodWallet, or inventory still loading.</p>}
                </div>
                {config.background && <>
                  <label className="flex flex-col gap-2 text-xs uppercase">Background display
                    <select className={field} value={config.background.mode} onChange={e=>setConfig(prev=>({...prev,background:prev.background?{...prev.background,mode:e.target.value as "tile"|"cover"|"contain"|"stretch"}:undefined}))}>
                      <option value="tile">Tile / repeat</option><option value="cover">Full screen / cover</option><option value="contain">Fit / contain</option><option value="stretch">Stretch</option>
                    </select>
                  </label>
                  {config.background.mode === "tile" && <label className="flex flex-col gap-2 text-xs uppercase">Pattern scale: {config.background.scale}%
                    <input type="range" min="25" max="300" step="25" value={config.background.scale} onChange={e=>setConfig(prev=>({...prev,background:prev.background?{...prev.background,scale:Number(e.target.value)}:undefined}))}/>
                  </label>}
                </>}
                <p className="text-[10px] opacity-70">Upload new files to the R2 backgrounds folder to add them here automatically.</p>
              </div>
              <label className="mt-4 flex flex-col gap-2 text-xs uppercase">Homepage title
                <input className={field} maxLength={100} value={config.title ?? "THE WORLD WIDE HOOD"} onChange={e => setConfig(prev => ({...prev, title:e.target.value}))}/>
              </label>
              <label className="mt-4 flex items-center gap-2 text-xs uppercase">
                <input type="checkbox" checked={config.showOuterFrame === true} onChange={e=>setConfig(prev=>({...prev,showOuterFrame:e.target.checked}))}/>
                Outer frame (optional)
              </label>
              </div>
            </details>
            <details className="border border-black p-3 sm:p-4">
              <summary className="cursor-pointer select-none py-2 text-lg uppercase tracking-widest">GIF LIBRARY</summary>
              <div className="mt-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                
                <span className="text-[10px]">{media.gifs.length} GIFS</span>
              </div>
              <p className="mb-2 text-[10px] opacity-70">Tap a GIF to add it to your selected Text or Marquee section.</p>
              {mediaError && <p role="alert" className="mb-2 text-xs">{mediaError}</p>}
              <div className="max-h-52 overflow-y-auto overscroll-contain border border-black p-2 sm:max-h-60" role="region" aria-label="Scrollable GIF library" tabIndex={0}>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-6">
                  {media.gifs.map(gif => <button type="button" key={gif.file} title={`Insert ${gif.label}`} aria-label={`Insert ${gif.label} into text`} className="group min-w-0 border border-black/40 p-1 transition-colors hover:bg-black focus-visible:outline-2 focus-visible:outline-black" onClick={() => insertGif(gif.file)}>
                    <img src={gif.url} loading="lazy" alt="" className="mx-auto aspect-square w-full bg-black object-contain [image-rendering:pixelated]" />
                    <span className="mt-1 block truncate text-[9px] group-hover:text-[#ccff00]">{gif.label}</span>
                  </button>)}
                </div>
                {!media.gifs.length && !mediaError && <p className="p-2 text-xs">No GIFs found in hoodpage/gifs/.</p>}
              </div>
              <p className="mt-2 text-[10px] opacity-70">Choose a Text or Marquee section below, then tap GIFs to insert them.</p>
              </div>
            </details>

            <details className="border border-black p-3 sm:p-4">
              <summary className="cursor-pointer select-none py-2 text-lg uppercase tracking-widest">MIDI LIBRARY</summary>
              <div className="mt-3">
              <div className="mb-2 flex items-center justify-between gap-2"><span className="text-[10px]">{media.midi.length} TRACKS</span></div>
              <p className="mb-2 text-[10px] opacity-70">Select one track for your homepage. Press Play to preview it here first.</p>
              <div className="max-h-64 space-y-2 overflow-y-auto border border-black p-2" role="region" aria-label="Scrollable MIDI library" tabIndex={0}>
                {media.midi.map(track => {
                  const selected = config.modules.some(m => m.type === "midi" && m.asset === track.file);
                  return <div key={track.file} className={`flex flex-wrap items-center justify-between gap-2 border p-2 ${selected ? "border-black bg-black/10" : "border-black/30"}`}>
                    <button type="button" className="min-w-0 flex-1 truncate text-left text-xs hover:underline" title={`Use ${track.label} on my homepage`} onClick={() => insertMidi(track.file, track.label)}>{selected ? "✓" : "♫"} {track.label}</button>
                    <HoodpageMidiPlayer file={track.file} title={track.label} compact />
                  </div>;
                })}
                {!media.midi.length && <p className="p-2 text-xs">No tracks found. Upload .mid or .midi files to hoodpage/midi/ in R2.</p>}
              </div>
              </div>
            </details>
            <details open className="border border-black p-3 sm:p-4">
              <summary className="cursor-pointer select-none py-2 text-lg uppercase tracking-widest">MODULES</summary>
              <div className="mt-3">
              <div className="mb-3 flex gap-2"><button type="button" className={button} onClick={() => setOpenModules(config.modules.map(m=>m.id))}>Expand all</button><button type="button" className={button} onClick={() => setOpenModules([])}>Collapse all</button></div><p className="mb-4 text-xs opacity-60">Move, edit or remove blocks. Your Hoodie image and Hood Talk update automatically.</p>
              <div className="mb-5 flex flex-wrap gap-2">
                {(["text", "links", "divider", "marquee", "identity", "talk", "assets", "journey", "memory", "netmint", "decor", "midi"] as const).map(type => <button key={type} className={button} disabled={config.modules.length >= 16 || (type === "midi" && (!media.midi.length || config.modules.some(m => m.type === "midi")))} onClick={() => add(type)}>+ {type}</button>)}
              </div>
              <div className="space-y-3">
                {config.modules.map((module, index) => <div key={module.id} className="border border-black p-3">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <button type="button" aria-expanded={openModules.includes(module.id)} className="text-left text-xs uppercase tracking-widest" onClick={() => setOpenModules(previous => previous.includes(module.id) ? previous.filter(id => id !== module.id) : [...previous, module.id])}><span aria-hidden="true">{openModules.includes(module.id) ? "▾" : "▸"}</span> {index + 1}. {module.type}</button>
                    <div className="flex gap-1"><button title="Move up" aria-label="Move module up" className={button} disabled={index === 0} onClick={() => move(module.id, -1)}>↑</button><button title="Move down" aria-label="Move module down" className={button} disabled={index === config.modules.length - 1} onClick={() => move(module.id, 1)}>↓</button><button title="Remove" aria-label="Remove module" className={button} onClick={() => setConfig(previous => ({ ...previous, modules: previous.modules.filter(m => m.id !== module.id) }))}>×</button></div>
                  </div>
                  {openModules.includes(module.id) && <>
                  <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <label className="flex items-center gap-2 text-[10px] uppercase"><input type="checkbox" checked={module.framed ?? (module.type === "text" || module.type === "talk" || module.type === "assets" || module.type === "journey")} onChange={e => editModule(module.id,m=>({...m,framed:e.target.checked}))}/> Frame</label>
                    <label className="flex items-center gap-2 text-[10px] uppercase"><input type="checkbox" checked={module.inverted === true} onChange={e=>editModule(module.id,m=>({...m,inverted:e.target.checked}))}/> Invert colors</label>
                    <label className="flex items-center gap-2 text-[10px] uppercase">Text fill
                      <select aria-label="Text background fill" className="min-w-0 border border-black bg-transparent p-1" value={module.textFill || "none"} onChange={e=>editModule(module.id,m=>({...m,textFill:e.target.value as "none"|"black"|"robin"}))}>
                        <option value="none">None</option><option value="black">Black</option><option value="robin">Robin</option>
                      </select>
                    </label>
                    <label className="flex items-center gap-2 text-[10px] uppercase">Font size <select aria-label="Font size" className="min-w-0 border border-black bg-transparent p-1" value={module.size || "md"} onChange={e=>editModule(module.id,m=>({...m,size:e.target.value as TextSize}))}><option value="sm">Small</option><option value="md">Normal</option><option value="lg">Large</option><option value="xl">Extra large</option></select></label>
                    <label className="flex items-center gap-2 text-[10px] uppercase">Text alignment <select aria-label="Text alignment" className="border border-black bg-transparent p-1" value={module.align || "center"} onChange={e => editModule(module.id, m => ({ ...m, align: e.target.value as "left" | "center" | "right" }))}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
                  </div>
                  {module.type === "identity" && <div className="space-y-3"><label className="flex flex-col gap-2 text-xs">Profile image size: {module.avatarSize || 144}px<input type="range" min="64" max="320" step="8" value={module.avatarSize || 144} onChange={e=>editModule(module.id,m=>m.type === "identity" ? {...m,avatarSize:Number(e.target.value)} : m)}/></label><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={module.showSubtitle !== false} onChange={e=>editModule(module.id,m=>m.type === "identity" ? {...m,showSubtitle:e.target.checked} : m)}/> Show subtitle</label></div>}
                  {module.type === "assets" && <div className="space-y-3 text-xs">
                    <div className="flex flex-wrap gap-4"><label className="flex items-center gap-2"><input type="checkbox" checked={module.showTokens !== false} onChange={e=>editModule(module.id,m=>m.type === "assets" ? {...m,showTokens:e.target.checked}:m)}/> Tokens</label><label className="flex items-center gap-2"><input type="checkbox" checked={module.showNfts !== false} onChange={e=>editModule(module.id,m=>m.type === "assets" ? {...m,showNfts:e.target.checked}:m)}/> NFTs</label></div>
                    <label className="flex items-center gap-3">Maximum displayed <input type="number" min={1} max={24} className="w-20 border border-black bg-transparent p-2" value={module.limit || 12} onChange={e=>editModule(module.id,m=>m.type === "assets" ? {...m,limit:Math.min(24,Math.max(1,Number(e.target.value)||1))}:m)}/></label>
                    <p className="opacity-70">Choose specific assets, or leave all unselected to display the first available ones.</p>
                    {module.showTokens !== false && <div className="max-h-40 space-y-1 overflow-auto border border-black p-2"><p className="mb-2 font-bold">Select tokens</p>{(live.assets || []).map((a,i)=>{const all=module.tokenSymbols || [];const key=(a.contract || a.symbol).toLowerCase();const selected=all.includes(key) || all.includes(a.symbol);return <label key={`${a.contract||a.symbol}-${i}`} className="flex items-center gap-2"><input type="checkbox" checked={selected} onChange={e=>editModule(module.id,m=>m.type === "assets" ? {...m,tokenSymbols:e.target.checked ? [...(m.tokenSymbols||[]),key] : (m.tokenSymbols||[]).filter(x=>x!==key && x!==a.symbol)}:m)}/>{a.symbol} · {Number(String(a.balanceFormatted).replaceAll(",", "")).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</label>})}{!live.assets?.length && <p>Loading assets or none found.</p>}</div>}
                    {module.showNfts !== false && <div className="max-h-48 space-y-1 overflow-auto border border-black p-2"><p className="mb-2 font-bold">Select NFTs</p>{(live.nfts || []).map((n,i)=>{const key=`${n.contract.toLowerCase()}:${n.tokenId}`;return <label key={`${key}-${i}`} className="flex items-center gap-2"><input type="checkbox" checked={(module.nftKeys||[]).includes(key)} onChange={e=>editModule(module.id,m=>m.type === "assets" ? {...m,nftKeys:e.target.checked ? [...(m.nftKeys||[]),key] : (m.nftKeys||[]).filter(x=>x!==key)}:m)}/>{n.name || `${n.collectionName} #${n.tokenId}`}</label>})}{!live.nfts?.length && <p>Loading NFTs or none found.</p>}</div>}
                    <p className="opacity-70">If no individual items are checked, all available assets are eligible for display.</p>
                  </div>}
                  {module.type === "decor" && <div className="space-y-3 text-xs">
                    <p>Choose a GIF · {media.gifs.length} available</p>
                    <div className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
                      {media.gifs.map(gif => <button type="button" title={gif.label} key={gif.file} className={`min-w-0 border-2 p-1 ${module.asset === gif.file ? "border-black" : "border-transparent"}`} onClick={() => editModule(module.id, m => m.type === "decor" ? { ...m, asset: gif.file } : m)}>
                        <img src={gif.url} loading="lazy" alt={gif.label} className="aspect-square w-full bg-black object-contain [image-rendering:pixelated]" />
                        <span className="block truncate py-1 text-[9px]">{gif.label}</span>
                      </button>)}
                    </div>
                    <label className="flex flex-col gap-2">GIF width: {module.width || 160}px<input type="range" min="32" max="480" step="8" value={module.width || 160} onChange={e=>editModule(module.id,m=>m.type === "decor" ? {...m,width:Number(e.target.value)}:m)}/></label>
                    {mediaUrl("gifs", module.asset) && <img src={mediaUrl("gifs", module.asset)} alt="Selected decoration" className="max-h-24 max-w-full bg-black [image-rendering:pixelated]" />}
                  </div>}
                  {module.type === "midi" && <div className="space-y-3 text-xs">
                    <p>Selected song: <strong>{module.asset}</strong>. Change or preview it in the MIDI Library above.</p>
                    <label className="block">Player title<input className={field} maxLength={70} value={module.label || ""} placeholder="My homepage soundtrack" onChange={e => editModule(module.id, m => m.type === "midi" ? {...m,label:e.target.value} : m)}/></label>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={module.loop === true} onChange={e => editModule(module.id,m => m.type === "midi" ? {...m,loop:e.target.checked} : m)}/> Loop track</label>
                  </div>}
                  {module.type === "memory" && <div className="space-y-3 text-xs"><label className="flex items-center gap-2"><input type="checkbox" checked={module.showStats === true} onChange={e=>editModule(module.id,m=>m.type==="memory"?{...m,showStats:e.target.checked}:m)}/> Show total Memories and HOOD ITs counters</label><p>Verified timeline from the Hoodie Memory endpoint, including signed homepage updates.</p><label className="flex items-center gap-2">Show last <input className="w-20 border border-black bg-transparent p-2" type="number" min={1} max={20} value={module.limit || 5} onChange={e=>editModule(module.id,m=>m.type==="memory"?{...m,limit:Math.min(20,Math.max(1,Number(e.target.value)||1))}:m)}/></label><label className="block">Filter source or event type (optional)<input className={field} maxLength={50} value={module.category || ""} onChange={e=>editModule(module.id,m=>m.type==="memory"?{...m,category:e.target.value}:m)} placeholder="HOODPAGE, HOODOS, ..."/></label></div>}
                  {module.type === "netmint" && <div className="space-y-3 text-xs"><label className="block">Collection address<input className={field} maxLength={42} value={module.collection} onChange={e=>editModule(module.id,m=>m.type==="netmint"?{...m,collection:e.target.value}:m)} placeholder="0x..."/></label><p>The collection name is read automatically from the contract. Token #1 artwork is loaded from its tokenURI (when available).</p><p>Visitors open NET Mint with this collection preselected. The contract is checked in NET Mint before any transaction.</p></div>}
                  {module.type === "journey" && <div className="space-y-3 text-xs"><label className="flex items-center gap-2"><input type="checkbox" checked={module.showStats === true} onChange={e=>editModule(module.id,m=>m.type==="journey"?{...m,showStats:e.target.checked}:m)}/> Show HOOD ITs and Memories counters</label><label className="flex items-center gap-2"><input type="checkbox" checked={module.completedOnly === true} onChange={e=>editModule(module.id,m=>m.type === "journey" ? {...m,completedOnly:e.target.checked}:m)}/> Completed milestones only</label><label className="flex items-center gap-3">Maximum displayed <input type="number" min="1" max="24" value={module.limit || 12} className="w-20 border border-black bg-transparent p-2" onChange={e=>editModule(module.id,m=>m.type === "journey" ? {...m,limit:Math.min(24,Math.max(1,Number(e.target.value)||1))}:m)}/></label></div>}
                  {module.type === "text" && <div className="space-y-2"><label className="flex items-center gap-2 text-xs"><input type="radio" name="gif-text-target" checked={(textTarget || config.modules.find(m => m.type === "text" || m.type === "marquee")?.id) === module.id} onChange={() => setTextTarget(module.id)} /> Insert GIFs into this text section</label><input aria-label="Section title" className={field} maxLength={70} value={module.title} onChange={e => editModule(module.id, m => m.type === "text" ? { ...m, title: e.target.value } : m)}/><textarea aria-label="Section text" rows={4} className={field} maxLength={2000} value={module.text} onChange={e => editModule(module.id, m => m.type === "text" ? { ...m, text: e.target.value } : m)}/></div>}
                  {module.type === "marquee" && <label className="block text-xs"><span className="mb-2 flex items-center gap-2"><input type="radio" name="gif-text-target" checked={(textTarget || config.modules.find(m => m.type === "text" || m.type === "marquee")?.id) === module.id} onChange={() => setTextTarget(module.id)} /> Insert GIFs here</span><input aria-label="Scrolling text" className={field} maxLength={500} value={module.text} onChange={e => editModule(module.id, m => m.type === "marquee" ? { ...m, text: e.target.value } : m)}/></label>}
                  {module.type === "divider" && <div className="space-y-2 text-xs">
                    <p className="font-bold uppercase">Divider gallery · tap to select</p>
                    <div className="grid max-h-40 grid-cols-3 gap-2 overflow-y-auto border border-black p-2 sm:grid-cols-4" role="region" aria-label="Divider gallery" tabIndex={0}>
                      {media.decorations.map(item => <button type="button" key={item.file} title={item.label} aria-label={`Select divider ${item.label}`} className={`min-w-0 border-2 p-1 ${module.asset === item.file ? "border-black" : "border-black/20"}`} onClick={() => editModule(module.id,m=>m.type==="divider"?{...m,asset:item.file,style:"line"}:m)}><img src={item.url} alt={item.label} loading="lazy" className="h-9 w-full bg-black object-contain [image-rendering:pixelated]" /></button>)}
                      <button type="button" className={`border-2 p-2 ${!module.asset && module.style === "line" ? "border-black" : "border-black/20"}`} onClick={() => editModule(module.id,m=>m.type==="divider"?{...m,asset:undefined,style:"line"}:m)}>────</button>
                      <button type="button" className={`border-2 p-2 ${!module.asset && module.style === "stars" ? "border-black" : "border-black/20"}`} onClick={() => editModule(module.id,m=>m.type==="divider"?{...m,asset:undefined,style:"stars"}:m)}>✦ ★ ✦</button>
                    </div>
                  </div>}
                  {module.type === "links" && <div className="space-y-3">{module.items.map((link, i) => <div key={i} className="grid grid-cols-[1fr_auto] gap-2"><input aria-label={`Link ${i+1} label`} className={field} maxLength={45} placeholder="Label" value={link.label} onChange={e => editModule(module.id, m => m.type === "links" ? { ...m, items: m.items.map((x,j) => j===i ? { ...x, label: e.target.value } : x) } : m)}/><button className={button} aria-label="Remove link" onClick={() => editModule(module.id, m => m.type === "links" ? { ...m, items: m.items.filter((_,j) => j!==i) } : m)}>×</button><label className="col-span-2 text-[10px]">LINK ICON · GIF LIBRARY<select aria-label={`Link ${i+1} GIF`} className={field} value={link.gif || ""} onChange={e=>editModule(module.id,m=>m.type==="links"?{...m,items:m.items.map((x,j)=>j===i?{...x,gif:e.target.value||undefined}:x)}:m)}><option value="">Text only</option>{media.gifs.map(g=><option key={g.file} value={g.file}>{g.label}</option>)}</select></label><input aria-label={`Link ${i+1} URL`} className={`${field} col-span-2`} maxLength={250} placeholder="https://..." value={link.url} onChange={e => editModule(module.id, m => m.type === "links" ? { ...m, items: m.items.map((x,j) => j===i ? { ...x, url: e.target.value } : x) } : m)}/></div>)}<button className={button} disabled={module.items.length >= 12} onClick={() => editModule(module.id, m => m.type === "links" ? { ...m, items: [...m.items, { label: "NEW LINK", url: "https://onchainhoodies.xyz" }] } : m)}>+ Add link</button></div>}
                  {module.type === "talk" && <p className="text-xs opacity-60">Latest Hood Talk, loaded from the chain</p>}
                  </>}
                </div>)}
              </div>
              </div>
            </details>
            <div className="flex flex-wrap gap-2"><button className={button} onClick={() => { if (window.confirm("Reset your draft to the default template?")) setConfig(defaultHomepage(id)); }}>Reset draft</button><button className="min-h-11 flex-1 bg-black px-5 py-3 text-xs uppercase tracking-widest text-[#ccff00] disabled:opacity-50" disabled={busy || !isOwned || !loaded} onClick={() => void publish()}>{busy ? "Publishing..." : "Sign & Publish"}</button></div>
            {status && <p role="status" className="border border-black p-3 text-sm">{status}</p>}
            {error && <p role="alert" className="border border-red-800 bg-red-100 p-3 text-sm text-red-900">{error}</p>}
          </section>
          <section className="min-w-0 lg:sticky lg:top-24 lg:self-start">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl">LIVE PREVIEW</h2><div className="flex gap-2"><button className={`${button} ${device === "mobile" ? "bg-black text-[#ccff00]" : ""}`} onClick={() => setDevice("mobile")}>Mobile</button><button className={`${button} ${device === "desktop" ? "bg-black text-[#ccff00]" : ""}`} onClick={() => setDevice("desktop")}>Desktop</button></div></div>
            <div className="flex min-h-[570px] justify-center overflow-hidden border border-black bg-[#1a1a1a] p-2 sm:p-5">
              <div className={`w-full transition-[max-width] duration-200 ${device === "mobile" ? "max-w-[390px]" : "max-w-full"}`}><HoodieHomepageView id={id} config={config} live={live} showFollowing={false}/></div>
            </div>
            <p className="mt-3 text-xs opacity-65">Preview updates as you edit. Publish with your wallet to make changes public.</p>
          </section>
        </div>
      </>}
    </div>
    <SiteFooter />
  </main>;
}
