"use client";
/* eslint-disable @next/next/no-img-element -- On-chain SVG and pixel GIFs must preserve their native pixels. */
import Link from "next/link";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { homepageApi, mediaUrl, type HomepageDirectoryEntry } from "../lib/hoodieHomepage";

const GIF_TOKEN = /(\[\[gif:([a-zA-Z0-9_.-]+\.gif)\]\])/gi;

function MarqueePreview({ text }: { text: string }) {
  // React nodes, never HTML injection; use the same GIF token syntax as HoodPage.
  const pieces = text.split(GIF_TOKEN);
  const parts: ReactNode[] = [];
  for (let i = 0; i < pieces.length; i++) {
    // The capturing groups are: full token, then filename.
    if (i % 3 === 1) {
      const file = pieces[i + 1];
      const url = mediaUrl("gifs", file);
      if (url) parts.push(<img key={i} src={url} alt={file.replace(/\.gif$/i, "")} loading="lazy" className="mx-1 inline-block h-5 max-w-[72px] object-contain align-middle [image-rendering:pixelated]" />);
      i += 1;
      continue;
    }
    if (i % 3 === 0 && pieces[i]) parts.push(<span key={i}>{pieces[i]}</span>);
  }
  return <span className="inline-flex min-w-0 max-w-full items-center gap-0 overflow-hidden whitespace-nowrap">{parts}</span>;
}

function useNftBackground(entry: HomepageDirectoryEntry): string {
  const nft = entry.preview?.background?.nft;
  const [url, setUrl] = useState("");
  const contract = nft?.contract;
  const tokenId = nft?.tokenId;
  useEffect(() => {
    if (!contract || !tokenId) return;
    const abort = new AbortController();
    (async () => {
      try {
        const journey = await fetch(homepageApi(`/v1/token/${entry.tokenId}/journey`), { signal: abort.signal });
        if (!journey.ok) return;
        const data = await journey.json() as { hoodWallet?: { address?: string | null } };
        const wallet = data.hoodWallet?.address;
        if (!wallet || abort.signal.aborted) return;
        const result = await fetch(`/api/hoodwallet/assets?address=${encodeURIComponent(wallet)}`, { signal: abort.signal });
        if (!result.ok) return;
        const inventory = await result.json() as { nfts?: Array<{ contract: string; tokenId: string; image?: string; spam?: boolean }> };
        const chosen = inventory.nfts?.find(item => !item.spam && item.contract.toLowerCase() === contract.toLowerCase() && String(item.tokenId) === tokenId);
        if (!abort.signal.aborted && chosen?.image && /^(https?:\/\/|data:image\/)/i.test(chosen.image)) setUrl(chosen.image);
      } catch { /* A missing collection image must not break the directory. */ }
    })();
    return () => abort.abort();
  }, [entry.tokenId, contract, tokenId]);
  return url;
}

export default function HoodieHomepageTile({ entry }: { entry: HomepageDirectoryEntry }) {
  const p = entry.preview;
  const isGreen = p?.theme === "green";
  const ink = isGreen ? "#000000" : "#ccff00";
  const paper = isGreen ? "#ccff00" : "#000000";
  const nftBackground = useNftBackground(entry);
  const bg = nftBackground || (p?.background?.asset ? mediaUrl("backgrounds", p.background.asset) : "");
  const mode = p?.background?.mode || "tile";
  const scale = Math.max(25, Math.min(300, p?.background?.scale ?? 100));
  const backgroundStyle: CSSProperties = {
    color: ink,
    backgroundColor: p?.backgroundColor && /^#[0-9a-f]{6}$/i.test(p.backgroundColor) ? p.backgroundColor : paper,
    ...(bg ? {
      backgroundImage: `url("${bg.replace(/"/g, "%22")}")`,
      backgroundRepeat: mode === "tile" ? "repeat" : "no-repeat",
      backgroundSize: mode === "tile" ? (nftBackground ? `${Math.round(scale * 1.5)}px auto` : `${scale}% auto`) : mode === "cover" ? "cover" : mode === "contain" ? "contain" : "100% 100%",
      backgroundPosition: "center top",
    } : {}),
  };
  const decoration = p?.decorations?.[0];
  return (
    <Link href={`/hoodies/${entry.tokenId}`} className="group block min-w-0 border border-[#ccff00] bg-black transition-colors hover:bg-[#ccff00] hover:text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ccff00]" aria-label={`Visit Hoodie #${entry.tokenId}'s homepage`}>
      <div className="flex items-center justify-between gap-2 border-b border-[#ccff00] px-2 py-2 text-[9px] sm:text-[10px]">
        <span className="truncate">HOODIE-{entry.tokenId}.HTML</span><span aria-hidden="true">▣ ×</span>
      </div>
      <div className="relative aspect-square overflow-hidden p-3 sm:p-4" style={backgroundStyle}>
        <div className="flex h-full flex-col items-center justify-center gap-2 overflow-hidden text-center">
          <p className="max-w-full break-words border px-2 py-1 text-[9px] leading-snug sm:text-xs" style={{ borderColor: ink, backgroundColor: paper }}>{entry.title || `HOODIE #${entry.tokenId}`}</p>
          {p?.marquee && <div className="max-w-full overflow-hidden px-2 text-[8px] sm:text-[9px]" style={{ backgroundColor: paper }}><MarqueePreview text={p.marquee} /></div>}
          <img src={`https://api.onchainhoodies.xyz/images/${entry.tokenId}.svg`} alt="" loading="lazy" className="max-h-[42%] max-w-[50%] border object-contain [image-rendering:pixelated]" style={{ width: Math.min(124, Math.max(56, (p?.avatarSize ?? 144) * .7)), borderColor: ink, backgroundColor: paper }} />
          <p className="px-2 text-[10px] sm:text-xs" style={{ backgroundColor: paper }}>HOODIE #{entry.tokenId}</p>
          {decoration && <img src={mediaUrl(decoration.kind, decoration.file)} alt="" loading="lazy" className="max-h-8 max-w-[70%] object-contain [image-rendering:pixelated]" />}
          {p?.about && <p className="max-w-[92%] truncate px-2 text-[8px] sm:text-[9px]" style={{ backgroundColor: paper }}>{p.about}</p>}
        </div>
      </div>
      <div className="p-3">
        <div className="flex items-center justify-between gap-2"><h2 className="text-xs sm:text-sm">HOODIE #{entry.tokenId}</h2><span className="text-[10px]">VISIT ↗</span></div>
        <time className="mt-2 block text-[10px] opacity-75" dateTime={entry.updatedAt}>UPDATED {new Date(entry.updatedAt).toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" })}</time>
      </div>
    </Link>
  );
}
