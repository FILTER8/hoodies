/* eslint-disable @next/next/no-img-element -- External R2 GIFs and on-chain SVGs intentionally use raw img elements. */
import MidiPlayer from "./HoodpageMidiPlayer";
import type { CSSProperties } from "react";
import { mediaUrl, type HomepageConfig, type HomepageLiveData, type HomepageModule, type TextSize } from "../lib/hoodieHomepage";

const sizes: Record<TextSize, string> = { sm: "text-[11px] sm:text-xs", md: "text-xs sm:text-sm", lg: "text-base sm:text-lg", xl: "text-xl sm:text-2xl" };
const sizeClass = (size?: TextSize) => sizes[size || "md"];
const balance2 = (value: string) => { const n = Number(String(value).replaceAll(",", "")); return Number.isFinite(n) ? n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"; };
function panel(module: HomepageModule, fallback = false): string {
  const base = (module.framed ?? fallback) ? "border border-current" : "";
  const fill = module.textFill || "none";
  // Text fill overrides module inversion to guarantee legible contrast.
  const colors = fill === "black" ? "!bg-black !text-[#ccff00]" : fill === "robin" ? "!bg-[#ccff00] !text-black" : module.inverted ? "homepage-invert" : "";
  return `${base} ${colors} p-3 sm:p-5 ${module.align === "left" ? "text-left" : module.align === "right" ? "text-right" : "text-center"}`;
}

const safeHref = (url: string) => { try { const v = new URL(url); return v.protocol === "https:" || v.protocol === "http:" ? v.toString() : "#"; } catch { return "#"; } };
function TextWithGifs({ text }: { text: string }) {
  // Text is always rendered as text nodes. The only markup is our controlled GIF token.
  const parts = text.split(/(\[\[gif:[a-zA-Z0-9_.-]+\.gif\]\])/gi);
  return <>{parts.map((part, i) => {
    const match = /^\[\[gif:([a-zA-Z0-9_.-]+\.gif)\]\]$/i.exec(part);
    const url = match && mediaUrl("gifs", match[1]);
    return url ? <img key={i} src={url} loading="lazy" alt={match![1].replace(/\.gif$/i, "")} className="mx-1 inline-block max-h-24 max-w-full align-middle [image-rendering:pixelated]" /> : <span key={i}>{part}</span>;
  })}</>;
}
const isNftSelected = (keys: string[] | undefined, contract: string, tokenId: string) => !keys?.length || keys.includes(`${contract.toLowerCase()}:${tokenId}`);

export default function HoodieHomepageView({ id, config, live = {} }: { id: number; config: HomepageConfig; live?: HomepageLiveData }) {
  const greenBackground = config.theme === "green";
  const background = config.background?.asset && mediaUrl("backgrounds", config.background.asset);
  const mode = config.background?.mode || "tile";
  const scale = Math.min(300,Math.max(25,config.background?.scale ?? 100));
  const theme: CSSProperties = {
    backgroundColor: greenBackground ? "#ccff00" : "#000000",
    color: greenBackground ? "#000000" : "#ccff00",
    borderColor: greenBackground ? "#000000" : "#ccff00",
    ...(background ? {
      backgroundImage: `url("${background}")`,
      backgroundRepeat: mode === "tile" ? "repeat" : "no-repeat",
      backgroundSize: mode === "tile" ? `${scale}% auto` : mode === "cover" ? "cover" : mode === "contain" ? "contain" : "100% 100%",
      backgroundPosition: "center top",
    } : {}),
    "--hood-fg": greenBackground ? "#000000" : "#ccff00",
    "--hood-bg": greenBackground ? "#ccff00" : "#000000",
  } as CSSProperties;
  const image = `https://api.onchainhoodies.xyz/images/${id}.svg`;
  return <div style={theme} className={`hoodpage min-h-[calc(100dvh-64px)] w-full overflow-hidden text-center [font-family:DepartureMono,monospace] ${config.showOuterFrame ? "border-2" : ""}`}>
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-5 px-3 py-7 sm:gap-7 sm:px-7 sm:py-10">
      {config.title !== "" && <h2 className="break-words px-2 text-[11px] uppercase tracking-[.16em] opacity-80 sm:text-sm">★ {config.title || "THE WORLD WIDE HOOD"} ★</h2>}
      {config.modules.map(module => {
        if (module.type === "identity") return <section key={module.id} className={`${panel(module)} flex flex-col items-center gap-3`}>
          <p className="text-[10px] tracking-[.14em]">WELCOME TO MY PAGE</p>
          <img src={image} alt={`Hoodie #${id}`} width={module.avatarSize || 144} height={module.avatarSize || 144} style={{width:Math.min(320,Math.max(64,module.avatarSize || 144)),height:Math.min(320,Math.max(64,module.avatarSize || 144))}} className="max-w-full border border-current object-contain [image-rendering:pixelated]" />
          <h1 className={`break-words tracking-tight ${module.size === "sm" ? "text-lg" : module.size === "xl" ? "text-4xl sm:text-6xl" : module.size === "lg" ? "text-3xl sm:text-4xl" : "text-2xl sm:text-3xl"}`}>HOODIE #{id}</h1>
          {module.showSubtitle !== false && <p className="text-[9px] opacity-75">FULLY ON-CHAIN · EST. 2026</p>}
        </section>;
        if (module.type === "talk") return <section key={module.id} className={panel(module, true)}><p className="mb-3 text-[10px] tracking-widest opacity-75">HOOD TALK</p><p className={`whitespace-pre-wrap break-words leading-relaxed ${sizeClass(module.size)}`}><TextWithGifs text={live.quote || "This Hoodie hasn't spoken yet."}/></p></section>;
        if (module.type === "text") return <section key={module.id} className={`${panel(module, true)}`}>{module.title && <h2 className={`mb-3 break-words ${sizeClass(module.size)}`}><TextWithGifs text={module.title}/></h2>}<p className={`whitespace-pre-wrap break-words leading-relaxed ${sizeClass(module.size)}`}><TextWithGifs text={module.text}/></p></section>;
        if (module.type === "links") return <section key={module.id} className={`${panel(module)} flex flex-wrap justify-center gap-2`}>{module.items.map((link, index) => <a key={`${module.id}-${index}`} href={safeHref(link.url)} target="_blank" rel="noopener noreferrer" className={`max-w-full break-all border border-current px-3 py-2 underline underline-offset-4 hover:opacity-70 ${sizeClass(module.size)}`}>[<TextWithGifs text={link.label || "LINK"}/>]</a>)}</section>;
        if (module.type === "divider") return <div key={module.id} aria-hidden="true" className={`${panel(module)} ${sizeClass(module.size)}`}>
          {module.asset ? <img src={mediaUrl("decorations", module.asset)} alt="" loading="lazy" className="mx-auto h-auto max-h-24 max-w-full object-contain [image-rendering:pixelated]" /> : module.style === "stars" ? "✦ · ★ · ✦ · ★ · ✦" : "━━━━━━━━━━━━━━━━━━━━"}
        </div>;
        if (module.type === "marquee") return <section key={module.id} className={`${panel(module)} overflow-hidden`}><div className={`w-full overflow-hidden ${sizeClass(module.size)}`}><div className="animate-[hoodpageMarquee_18s_linear_infinite] motion-reduce:animate-none whitespace-nowrap"><TextWithGifs text={module.text}/></div></div></section>;
        if (module.type === "decor") return <section key={module.id} className={panel(module)}>
          <img src={mediaUrl("gifs", module.asset)} loading="lazy" alt={module.asset.replaceAll("-", " ")} style={{width:module.width || 160}} className="mx-auto h-auto max-w-full [image-rendering:pixelated]" />
        </section>;
        if (module.type === "midi") return <section key={module.id} className={panel(module)}><MidiPlayer key={module.asset} file={module.asset} title={module.label || module.asset.replace(/\.(mid|midi)$/i, "").replace(/[-_]/g, " ")} loop={module.loop === true}/></section>;
        if (module.type === "assets") {
          const tokens = (module.showTokens === false ? [] : (live.assets || []).filter(a => !module.tokenSymbols?.length || module.tokenSymbols.some(s => s.toLowerCase() === (a.contract || a.symbol).toLowerCase() || s.toLowerCase() === a.symbol.toLowerCase()))).slice(0,module.limit || 12);
          const nfts = (module.showNfts === false ? [] : (live.nfts || []).filter(n => isNftSelected(module.nftKeys,n.contract,n.tokenId))).slice(0,module.limit || 12);
          return <section key={module.id} className={panel(module, true)}><h2 className={`mb-4 ${sizeClass(module.size)}`}>HOODWALLET ASSETS</h2>
            {!live.wallet ? <p className="text-xs opacity-70">HoodWallet not available.</p> : <>
              {module.showTokens !== false && <div className="mb-4"><h3 className="mb-2 text-[10px] tracking-widest opacity-70">TOKENS</h3>{tokens.length ? <div className="grid gap-2 sm:grid-cols-2">{tokens.map((a,i) => <div className="flex items-start justify-between gap-3 border border-current p-3 text-left" key={`${a.contract||a.symbol}-${i}`}><span className={`break-all ${sizeClass(module.size)}`}>{a.symbol}</span><span className={`break-all text-right ${sizeClass(module.size)}`}>{balance2(a.balanceFormatted)}</span></div>)}</div> : <p className="text-xs opacity-70">No selected tokens to display.</p>}</div>}
              {module.showNfts !== false && <div><h3 className="mb-2 text-[10px] tracking-widest opacity-70">NFTS</h3>{nfts.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">{nfts.map((n,i) => <div className="min-w-0 border border-current p-2" key={`${n.contract}-${n.tokenId}-${i}`}>{n.image ? <img src={n.image} alt={n.name || `NFT #${n.tokenId}`} loading="lazy" className="mx-auto aspect-square w-full object-contain [image-rendering:pixelated]" /> : <div className="aspect-square border border-current"/>}<p className="mt-2 break-words text-[10px]">{n.name || `${n.collectionName} #${n.tokenId}`}</p></div>)}</div> : <p className="text-xs opacity-70">No selected NFTs to display.</p>}</div>}
            </>}
          </section>;
        }
        if (module.type === "journey") {
          const milestones = (live.milestones || []).filter(m => !module.completedOnly || m.completed).slice(0,module.limit || 12);
          return <section key={module.id} className={panel(module, true)}><h2 className={`mb-4 ${sizeClass(module.size)}`}>HOOD JOURNEY</h2>{milestones.length ? <div className="grid gap-2 sm:grid-cols-2">{milestones.map((m,i) => <div key={i} className="flex items-center justify-between gap-3 border border-current p-3 text-left"><span className={`break-words ${sizeClass(module.size)}`}>{m.name}</span><span className="shrink-0 text-[10px]">{m.completed ? "✓ DONE" : "○ OPEN"}</span></div>)}</div> : <p className="text-xs opacity-70">No Journey milestones to display.</p>}</section>;
        }
        return null;
      })}
      <p className="mt-5 text-[9px] tracking-wider opacity-75">MADE IN THE HOOD · HOOD IT.</p>
    </div>
    <style>{`.hoodpage .homepage-invert{color:var(--hood-bg);background:var(--hood-fg)}@keyframes hoodpageMarquee{from{transform:translateX(100%)}to{transform:translateX(-100%)}}`}</style>
  </div>;
}
