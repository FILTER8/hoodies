/* eslint-disable @next/next/no-img-element -- The on-chain SVG and R2 pixel decorations must retain their original pixels. */
import Link from "next/link";
import { mediaUrl, type HomepageDirectoryEntry } from "../lib/hoodieHomepage";

export default function HoodieHomepageTile({ entry }: { entry: HomepageDirectoryEntry }) {
  const p = entry.preview;
  const isGreen = p?.theme === "green";
  const ink = isGreen ? "#000000" : "#ccff00";
  const paper = isGreen ? "#ccff00" : "#000000";
  const bg = p?.background?.asset ? mediaUrl("backgrounds", p.background.asset) : "";
  const mode = p?.background?.mode || "tile";
  const backgroundStyle: React.CSSProperties = {
    color: ink,
    backgroundColor: paper,
    ...(bg ? {
      backgroundImage: `url("${bg}")`,
      backgroundRepeat: mode === "tile" ? "repeat" : "no-repeat",
      backgroundSize: mode === "tile" ? `${p?.background?.scale ?? 100}% auto` : mode === "cover" ? "cover" : mode === "contain" ? "contain" : "100% 100%",
      backgroundPosition: "center top",
    } : {}),
  };
  const decoration = p?.decorations?.[0];
  return (
    <Link href={`/hoodie/${entry.tokenId}`} className="group block min-w-0 border border-[#ccff00] bg-black transition-colors hover:bg-[#ccff00] hover:text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ccff00]" aria-label={`Visit Hoodie #${entry.tokenId}'s homepage`}>
      <div className="flex items-center justify-between gap-2 border-b border-[#ccff00] px-2 py-2 text-[9px] sm:text-[10px]">
        <span className="truncate">HOODIE-{entry.tokenId}.HTML</span><span aria-hidden="true">▣ ×</span>
      </div>
      <div className="relative aspect-square overflow-hidden p-3 sm:p-4" style={backgroundStyle}>
        <div className="flex h-full flex-col items-center justify-center gap-2 overflow-hidden text-center">
          <p className="max-w-full break-words border px-2 py-1 text-[9px] leading-snug sm:text-xs" style={{borderColor:ink,backgroundColor:paper}}>{entry.title || `HOODIE #${entry.tokenId}`}</p>
          {p?.marquee && <p className="max-w-full truncate px-2 text-[8px] sm:text-[9px]" style={{backgroundColor:paper}}>{p.marquee}</p>}
          <img src={`https://api.onchainhoodies.xyz/images/${entry.tokenId}.svg`} alt="" loading="lazy" className="max-h-[42%] max-w-[50%] border object-contain [image-rendering:pixelated]" style={{width:Math.min(124,Math.max(56,(p?.avatarSize ?? 144) * .7)),borderColor:ink,backgroundColor:paper}} />
          <p className="px-2 text-[10px] sm:text-xs" style={{backgroundColor:paper}}>HOODIE #{entry.tokenId}</p>
          {decoration && <img src={mediaUrl(decoration.kind, decoration.file)} alt="" loading="lazy" className="max-h-8 max-w-[70%] object-contain [image-rendering:pixelated]" />}
          {p?.about && <p className="max-w-[92%] truncate px-2 text-[8px] sm:text-[9px]" style={{backgroundColor:paper}}>{p.about}</p>}
        </div>
      </div>
      <div className="p-3">
        <div className="flex items-center justify-between gap-2"><h2 className="text-xs sm:text-sm">HOODIE #{entry.tokenId}</h2><span className="text-[10px]">VISIT ↗</span></div>
        <time className="mt-2 block text-[10px] opacity-75" dateTime={entry.updatedAt}>UPDATED {new Date(entry.updatedAt).toLocaleDateString("en-GB",{year:"numeric",month:"short",day:"numeric",timeZone:"UTC"})}</time>
      </div>
    </Link>
  );
}
