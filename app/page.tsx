"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import { siteConfig } from "../lib/config";
import { Wallet, Zap, Message, Clock, Robot } from "pixelarticons/react";

const API_BASE = "https://api.onchainhoodies.xyz";
const SKILL_URL = "https://github.com/FILTER8/onchainhoodies-bankr-skill";

const agentPrompts = [
  "Use Hoodie #1574 to buy another Hoodie from the floor with FloorOS.",
  "Use my Hoodie to mint a supported collection through MintOS.",
  "Show me the on-chain journey and activity of Hoodie #351.",
];

type NeighborKind = "Builder" | "Collector" | "Flipper" | "HODLer";
type Neighbor = { tokenId: number; name: string; image: string; kind: NeighborKind };
const kinds: NeighborKind[] = ["Builder", "Collector", "Flipper", "HODLer"];
const fallbacks: Record<NeighborKind, string> = {
  Builder: "/builder.png", Collector: "/collector.png", Flipper: "/flipper.png", HODLer: "/hodler.png",
};

async function randomHoodie(kind: NeighborKind, signal: AbortSignal): Promise<Neighbor> {
  const params = new URLSearchParams({ hoodie: kind, limit: "1", offset: "0", sort: "token" });
  const first = await fetch(`${API_BASE}/v1/search?${params}`, { signal });
  if (!first.ok) throw new Error("Could not load Hoodie supply");
  const firstJson = await first.json() as { total?: number };
  if (!firstJson.total || firstJson.total < 1) throw new Error("No Hoodies found");
  params.set("offset", String(Math.floor(Math.random() * firstJson.total)));
  const response = await fetch(`${API_BASE}/v1/search?${params}`, { signal });
  if (!response.ok) throw new Error("Could not load Hoodie");
  const json = await response.json() as { results?: Array<{ tokenId: number; name?: string; image?: string }> };
  const found = json.results?.[0];
  if (!found) throw new Error("Hoodie missing");
  return { tokenId: found.tokenId, name: found.name ?? `OnChainHoodie #${found.tokenId}`, image: found.image ?? `${API_BASE}/images/${found.tokenId}.svg`, kind };
}

const capabilities = [
  { number: "01", icon: Wallet, title: "OWN", detail: "Give your Hoodie its own wallet. It can hold ETH, OCH and NFTs.", href: "/hoodwallet", label: "HoodWallet" },
  { number: "02", icon: Zap, title: "ACT", detail: "Mint, buy, list and collect through HoodOS — as your Hoodie.", href: "/hoodos", label: "HoodOS apps" },
  { number: "03", icon: Message, title: "CONNECT", detail: "Speak through Hood Talk, follow other Hoodies and make a homepage.", href: "/hoodies", label: "Explore HoodPages" },
  { number: "04", icon: Clock, title: "REMEMBER", detail: "Every meaningful action contributes to a growing Hoodie history.", href: "/journey", label: "Hoodie Journey" },
];

export default function Home() {
  const [neighbors, setNeighbors] = useState<Partial<Record<NeighborKind, Neighbor>>>({});
  const [floor, setFloor] = useState<string | null>(null);
  const [promptIndex, setPromptIndex] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => {
      setPromptIndex(current => (current + 1) % agentPrompts.length);
    }, 6500);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    kinds.forEach(kind => {
      randomHoodie(kind, controller.signal).then(value => {
        if (!controller.signal.aborted) setNeighbors(prev => ({ ...prev, [kind]: value }));
      }).catch(() => {});
    });
    fetch(`${API_BASE}/v1/market/collection`, { signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then((raw: unknown) => {
        if (!raw || typeof raw !== "object" || controller.signal.aborted) return;
        const r = raw as Record<string, unknown>;
        const d = r.data && typeof r.data === "object" ? r.data as Record<string, unknown> : r;
        const f = d.floor ?? d.floorPrice ?? d.floor_price;
        const v = typeof f === "object" && f ? (f as Record<string, unknown>).amount ?? (f as Record<string, unknown>).value : f;
        const num = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
        if (Number.isFinite(num)) setFloor(`${num.toFixed(4)} ETH`);
      }).catch(() => {});
    return () => controller.abort();
  }, []);

  return (
    <main className="bg-[#ccff00] text-black">
      <SiteHeader />

      {/* 01: Immediately explain what makes this collection different. */}
      <section className="mx-auto grid min-h-[min(850px,100svh)] max-w-[1440px] gap-8 px-6 pb-20 pt-32 lg:grid-cols-[1.2fr_0.8fr] lg:items-center lg:gap-12">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] md:text-xs">6,000 fully on-chain characters · Robinhood Chain</p>
          <h1 className="mt-7 text-[clamp(3.9rem,9.5vw,9rem)] leading-[0.85] tracking-[-0.075em]">
            MORE LIFE<br />ON-CHAIN.
          </h1>
          <p className="mt-8 max-w-2xl text-lg leading-relaxed md:text-2xl">
            6,000 fully on-chain characters with their own wallets, apps and stories. Collect a Hoodie. Give it a life of its own.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/hoodos" className="pixel-cta pixel-cta-dark">Explore HoodOS →</Link>
            <Link href="/hoodies" className="pixel-cta">Meet the Hoodies →</Link>
          </div>
          <p className="mt-7 text-[10px] uppercase tracking-[0.13em] opacity-65">A neighborhood that keeps growing — on-chain.</p>
        </div>
        <div className="relative mx-auto w-full max-w-[480px] border-2 border-black bg-black p-5 text-[#ccff00] lg:max-w-none">
          <div className="flex items-center justify-between border-b border-[#ccff00] pb-3 text-[10px] uppercase tracking-[0.16em]">
            <span>Hoodie identity</span><span>Live on-chain</span>
          </div>
          <img src="/onchainhoodies.gif" alt="Animated OnChainHoodies" className="image-render-pixel mx-auto my-6 aspect-square max-h-[355px] w-full object-contain" />
          <div className="grid grid-cols-3 gap-2 border-t border-[#ccff00] pt-4 text-center text-[9px] uppercase tracking-[0.12em]">
            <span>Own</span><span>Act</span><span>Remember</span>
          </div>
        </div>
      </section>

      {/* 02: Give real examples rather than a list of protocols. */}
      <section className="bg-black px-6 py-20 text-[#ccff00] md:py-24" id="what-is-possible">
        <div className="mx-auto max-w-[1440px]">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] opacity-60">01 / Real capabilities</p>
              <h2 className="mt-5 text-[clamp(2.8rem,7vw,6.3rem)] leading-[0.9] tracking-[-0.06em]">FROM HOLDING<br />TO DOING.</h2>
            </div>
            <Link href="/hoodos" className="pixel-cta border-[#ccff00]">All HoodOS apps →</Link>
          </div>
          <div className="mt-12 grid border-l-2 border-t-2 border-[#ccff00] md:grid-cols-2 lg:grid-cols-4">
            {capabilities.map(item => (
              <Link key={item.number} href={item.href} className="group flex min-h-[280px] flex-col justify-between border-b-2 border-r-2 border-[#ccff00] p-6 transition-colors duration-150 hover:bg-[#ccff00] hover:!text-black focus-visible:bg-[#ccff00] focus-visible:!text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px]">
                <div className="text-[#ccff00] group-hover:!text-black group-focus-visible:!text-black">
                  <p className="text-[10px] tracking-[0.18em] opacity-60">{item.number} / {item.label}</p>
                  <div className="mt-8 flex h-16 w-16 items-center justify-start"><item.icon width={48} height={48} aria-hidden="true" /></div>
                  <h3 className="mt-7 text-4xl tracking-[-0.04em]">{item.title}</h3>
                  <p className="mt-4 max-w-xs text-sm leading-relaxed opacity-80">{item.detail}</p>
                </div>
                <span className="mt-6 text-xs text-[#ccff00] group-hover:!text-black group-focus-visible:!text-black">Explore →</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* 03: The new direction becomes visible before secondary collection details. */}
      <section className="px-6 py-20 md:py-24" id="agents">
        <div className="mx-auto grid max-w-[1440px] gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <div className="flex items-center justify-between gap-5">
              <p className="text-[10px] uppercase tracking-[0.18em] opacity-65">02 / Humans + agents</p>
              <Robot width={64} height={64} aria-hidden="true" className="shrink-0" />
            </div>
            <h2 className="mt-5 text-[clamp(3rem,7vw,6.5rem)] leading-[0.9] tracking-[-0.06em]">TELL YOUR<br />HOODIE<br />WHAT TO DO.</h2>
            <p className="mt-8 max-w-lg text-lg leading-relaxed">Use HoodOS yourself, or let an authorized AI agent operate your Hoodie. The same on-chain identity, different ways to interact.</p>
            <a href={SKILL_URL} target="_blank" rel="noopener noreferrer" className="pixel-cta pixel-cta-dark mt-8 inline-flex">Get the Bankr skill ↗</a>
          </div>
          <div className="border-2 border-black bg-black p-5 text-[#ccff00] md:p-8">
            <div className="flex items-center justify-between border-b border-[#ccff00] pb-4 text-[10px] uppercase tracking-[0.14em]">
              <span>Try an agent instruction</span><span>HoodOS</span>
            </div>
            <div className="flex min-h-[230px] items-center py-8">
              <p key={promptIndex} className="text-2xl leading-snug tracking-[-0.03em] md:text-4xl" aria-live="off">
                “{agentPrompts[promptIndex]}”
              </p>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-[#ccff00] pt-4">
              <span className="text-[9px] uppercase tracking-[0.12em] opacity-65">Ideas for your Hoodie</span>
              <div className="flex gap-2" aria-label="Example agent prompts">
                {agentPrompts.map((_, index) => (
                  <button
                    key={index}
                    type="button"
                    aria-label={`Show prompt ${index + 1}`}
                    aria-pressed={index === promptIndex}
                    onClick={() => setPromptIndex(index)}
                    className={`h-3 w-7 border border-[#ccff00] transition-colors ${index === promptIndex ? "bg-[#ccff00]" : "bg-black hover:bg-[#ccff00]"}`}
                  />
                ))}
              </div>
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-3">
              {["01 / Choose Hoodie", "02 / Give instructions", "03 / Make it happen"].map(step => (
                <div key={step} className="border border-[#ccff00] p-3 text-[10px] uppercase tracking-[0.12em]">{step}</div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 04: Show actual collection artwork; avoid an overwhelming market terminal. */}
      <section className="bg-black px-6 py-20 text-[#ccff00] md:py-24" id="collection">
        <div className="mx-auto max-w-[1440px]">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] opacity-65">03 / The collection</p>
              <h2 className="mt-5 text-[clamp(3rem,7vw,6rem)] leading-[0.9] tracking-[-0.06em]">FOUR TYPES.<br />ONE HOOD.</h2>
              <p className="mt-5 max-w-xl text-base leading-relaxed md:text-lg">6,000 CC0, fully on-chain 1-bit characters: Builders, Collectors, Flippers and HODLers.</p>
            </div>
            <a href={siteConfig.openSeaUrl} target="_blank" rel="noopener noreferrer" className="pixel-cta border-[#ccff00]">Explore the collection ↗</a>
          </div>
          <div className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-4">
            {kinds.map(kind => {
              const hoodie = neighbors[kind];
              return <Link href={hoodie ? `/hoodies/${hoodie.tokenId}` : "/hoodies"} key={kind} className="group border-2 border-[#ccff00] transition-colors hover:bg-[#ccff00] hover:text-black">
                <div className="aspect-square overflow-hidden bg-black"><img src={hoodie?.image ?? fallbacks[kind]} alt={`${kind} Hoodie`} loading="lazy" className="image-render-pixel h-full w-full object-cover" /></div>
                <div className="flex items-center justify-between gap-2 border-t-2 border-[#ccff00] p-3 text-xs uppercase tracking-[0.1em]"><span>{kind}</span><span>{hoodie ? `#${hoodie.tokenId}` : "→"}</span></div>
              </Link>;
            })}
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-3 border-y-2 border-[#ccff00] py-5 text-[10px] uppercase tracking-[0.14em]">
            <span>Robinhood Chain</span><span>Fully on-chain</span><span>CC0</span>
            {floor && <span>Collection floor: {floor}</span>}
            <a href={siteConfig.openSeaUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">OpenSea ↗</a>
          </div>
        </div>
      </section>

      {/* 05: One clean entry point for building and deeper technical information. */}
      <section className="bg-[#ccff00] px-6 py-20 text-black md:py-24" id="build">
        <div className="mx-auto grid max-w-[1440px] gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] opacity-60">04 / Open to builders</p>
            <h2 className="mt-5 text-[clamp(3rem,7vw,6rem)] leading-[0.9] tracking-[-0.06em]">BUILD WHAT<br />COMES NEXT.</h2>
            <p className="mt-7 max-w-xl text-lg leading-relaxed opacity-80">The art is CC0. The data and APIs are public. HoodOS gives builders a way to create things Hoodies can actually use.</p>
            <div className="mt-8 flex flex-wrap gap-3"><Link href="/builders" className="pixel-cta pixel-cta-dark">Community builds →</Link><Link href="/api" className="pixel-cta">Builder API →</Link></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Link href="/journey" className="group border-2 border-black p-5 text-black transition-colors hover:bg-black hover:!text-[#ccff00] focus-visible:bg-black focus-visible:!text-[#ccff00]"><div className="text-black group-hover:!text-[#ccff00] group-focus-visible:!text-[#ccff00]"><p className="text-[10px] uppercase tracking-[0.14em] opacity-60">Explore</p><h3 className="mt-6 text-2xl">Hoodie Journey</h3><p className="mt-3 text-sm opacity-70">See the history each Hoodie builds.</p><p className="mt-7 text-xs">Open →</p></div></Link>
            <Link href="/och" className="group border-2 border-black p-5 text-black transition-colors hover:bg-black hover:!text-[#ccff00] focus-visible:bg-black focus-visible:!text-[#ccff00]"><div className="text-black group-hover:!text-[#ccff00] group-focus-visible:!text-[#ccff00]"><p className="text-[10px] uppercase tracking-[0.14em] opacity-60">Economy</p><h3 className="mt-6 text-2xl">$OCH</h3><p className="mt-3 text-sm opacity-70">Explore the token and the Hood economy.</p><p className="mt-7 text-xs">Open →</p></div></Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
