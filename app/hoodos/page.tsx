"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";

type BuildType = "internal" | "community";
type BuildStatus = "live" | "building" | "coming";
type FilterType = "all" | BuildType;
type HoodOSApp = {
  id: string;
  name: string;
  tagline: string;
  description: string;
  href: string;
  icon?: string;
  fallbackIcon: string;
  buildType: BuildType;
  status: BuildStatus;
  external?: boolean;
};

const apps: HoodOSApp[] = [
  {
    id: "homepage",
    name: "HoodPage",
    tagline: "Make your little corner of the web",
    description: "Build and publish a personal homepage for your Hoodie with themes, live Hood Talk, links and creative blocks.",
    href: "/hoodos/homepage",
    fallbackIcon: "HP",
    buildType: "internal",
    status: "live",
  },
  {
    id: "profileos",
    name: "ProfileOS",
    tagline: "Give your Hoodie a profile",
    description:
      "Create and customize your HoodWallet's OpenSea profile with on-chain Hoodie artwork, Hood Talk, a pixel banner and a personal username.",
    href: "/hoodos/profileos",
    fallbackIcon: "P",
    buildType: "internal",
    status: "live",
  },
  {
    id: "hoodframe",
    name: "HoodFrame",
    tagline: "Frame a piece of your Hoodie",
    description:
      "Seal an 8x8 piece of your Hoodie as an on-chain collectible. Make it yours and explore the HoodFrame gallery.",
    href: "https://hoodframe.filter8.xyz/",
    fallbackIcon: "HF",
    buildType: "internal",
    status: "live",
    external: true,
  },
  {
    id: "face64",
    name: "FACE64",
    tagline: "Play the ranked tournament",
    description:
      "Compete in FACE64 with your Hoodie and submit an on-chain ranked tournament score.",
    href: "https://64faces.filter8.xyz/game",
    fallbackIcon: "64",
    buildType: "internal",
    status: "live",
    external: true,
  },
  {
  id:
    "hooney",

  name:
    "Hooney",

  tagline:
    "Swap with the Hive",

  description:
    "Community-built tokenized asset swaps where activated Hoodies can participate in the Hive fee-rebate system.",

  href:
    "https://v1.hooney.xyz/",

  icon:
    "/hoodos/hooney.png",

  fallbackIcon:
    "H",

  buildType:
    "community",

  status:
    "live",

  external:
    true,
},

{
  id:
    "hoodiestudio",

  name:
    "HoodieStudio",

  tagline:
    "Create with your Hoodie",

  description:
    "Community-built creation platform for creating fully-chain artworks with your Hoodie. Currently available on testnet.",

  href:
    "https://hoodiestudio.xyz/",

  icon:
    "/hoodos/hoodiestudio.png",

  fallbackIcon:
    "HS",

  buildType:
    "community",

  status:
    "live",

  external:
    true,
},
  {
  id:
    "flooros",

  name:
    "FloorOS",

  tagline:
    "Buy the floor for the Hood",

  description:
    "Use your activated Hoodie to acquire eligible OnChainHoodies for the protocol Treasury and earn OCH directly into your HoodWallet.",

  href:
    "/hoodos/flooros",

  icon:
    "/hoodos/flooros.png",

  fallbackIcon:
    "F",

  buildType:
    "internal",

  status:
    "live",
},

  {
    id: "netmint",
    name: "NET Mint",
    tagline: "Mint directly from NET contracts",
    description: "Collect supported NET-integrated on-chain NFTs with your Hoodie. Pay from your connected wallet or HoodWallet.",
    href: "/hoodos/netmint",
    fallbackIcon: "N",
    buildType: "internal",
    status: "live",
  },

  {
    id:
      "mintos",

    name:
      "MintOS",

    tagline:
      "Mint as your Hoodie",

    description:
      "Mint supported public OpenSea drops directly through your activated HoodWallet.",

    href:
      "/hoodos/mintos",

    icon:
      "/hoodos/mintos.png",

    fallbackIcon:
      "M",

    buildType:
      "internal",

    status:
      "live",
  },

  {
  id:
    "buyos",

  name:
    "BuyOS",

  tagline:
    "Collect as your Hoodie",

  description:
    "Browse Robinhood Chain OpenSea listings and buy NFTs directly through your activated HoodWallet.",

  href:
    "/hoodos/buyos",

  icon:
    "/hoodos/buyos.png",

  fallbackIcon:
    "B",

  buildType:
    "internal",

  status:
    "live",
},

  {
    id: "delegateos",
    name: "DelegateOS",
    tagline: "Give your Hoodie an agent",
    description: "Grant, limit, inspect and revoke on-chain permissions for another wallet or AI agent without transferring your Hoodie.",
    href: "/hoodos/delegateos",
    fallbackIcon: "D",
    buildType: "internal",
    status: "live",
  },

  {
    id:
      "hoodwallet",

    name:
      "HoodWallet",

    tagline:
      "Your Hoodie wallet",

    description:
      "Activate your Hoodie, hold assets and execute transactions directly from its on-chain account.",

    href:
      "/hoodwallet",

    icon:
      "/hoodos/wallet.png",

    fallbackIcon:
      "W",

    buildType:
      "internal",

    status:
      "live",
  },

  {
    id:
      "och-games",

    name:
      "OCH.Games",

    tagline:
      "Play with the Hood",

    description:
      "Community-built games and experiments using Hoodies, HoodWallets and OCH.",

    href:
      "https://och.games",

    icon:
      "/hoodos/games.png",

    fallbackIcon:
      "G",

    buildType:
      "community",

    status:
      "live",

    external:
      true,
  },

  {
    id:
      "hoodieswap",

    name:
      "HoodieSwap",

    tagline:
      "Trade in the Hood",

    description:
      "A community-built trading experience connected to the OnChainHoodies ecosystem.",

    href:
      "https://hoodieswap.xyz/",

    icon:
      "/hoodos/swap.png",

    fallbackIcon:
      "S",

    buildType:
      "community",

    status:
      "live",
  },

  {
    id:
      "next",

    name:
      "Build Next",

    tagline:
      "Add to HoodOS",

    description:
      "Games, agents, collectibles, claims and new Hoodie-native applications can all build on HoodOS.",

    href:
      "/hoodos/docs",

    icon:
      "/hoodos/build.png",

    fallbackIcon:
      "+",

    buildType:
      "community",

    status:
      "building",
  },
];



/** Lightweight, recognisable monochrome symbols for apps without uploaded artwork. */
function AppGlyph({ id }: { id: string }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  const glyphs: Record<string, ReactNode> = {
    homepage: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M7 6.5h.01M10 6.5h.01M7 13h10M7 16h6" /></>,
    profileos: <><circle cx="12" cy="8" r="3.2" /><path d="M5 20v-1.8a7 7 0 0 1 14 0V20H5Z" /></>,
    hoodframe: <><path d="M4 4h16v16H4zM8 8h8v8H8z"/><path d="M4 9h4M16 15h4"/></>,
    face64: <><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/><path d="M5.5 5.5h1M11.5 11.5h1M17.5 17.5h1"/></>,
    hooney: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="M8 9v6m8-6v6M8 12h8"/></>,
    hoodiestudio: <><path d="m5 17 11-11 3 3-11 11-4 1 1-4Z"/><path d="m14 8 3 3M5 5h4M7 3v4M19 16v5M16.5 18.5h5"/></>,
    flooros: <><path d="M4 20h16M6 17h12M8 14h8M10 11h4M12 4v6"/><path d="m9 7 3-3 3 3"/></>,
    netmint: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18m-11 3-3 3 3 3m4-6 3 3-3 3"/></>,
    mintos: <><path d="M12 3v12m-4-4 4 4 4-4"/><path d="M5 16v4h14v-4M6 7l2-2m10 2-2-2"/></>,
    buyos: <><path d="M4 5h2l2 11h11l2-8H7"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/></>,
    delegateos: <><path d="M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></>,
    hoodwallet: <><rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18M16 14h3M6 6V4h12"/></>,
    "och-games": <><rect x="3" y="8" width="18" height="11" rx="5"/><path d="M8 11v6M5 14h6M16 13h.01M19 15h.01"/></>,
    hoodieswap: <><path d="M4 8h15m-4-4 4 4-4 4M20 16H5m4-4-4 4 4 4"/></>,
    next: <><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/></>,
  };

  return (
    <svg viewBox="0 0 24 24" className="h-[43%] w-[43%]" aria-hidden="true" {...common}>
      {glyphs[id] ?? <><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12h8"/></>}
    </svg>
  );
}

function AppIcon({ app, large = false }: { app: HoodOSApp; large?: boolean }) {
  const dimension = large ? "h-24 w-24 sm:h-28 sm:w-28" : "h-[76px] w-[76px] sm:h-[88px] sm:w-[88px]";

  return (
    <div
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-[20px] border border-[#ccff00] bg-[#ccff00] text-black transition-transform duration-150 sm:rounded-[22px] ${dimension}`}
    >
      <AppGlyph id={app.id} />
    </div>
  );
}

function AppDialog({ app, onClose }: { app: HoodOSApp; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const available = app.href !== "#" && app.status === "live";

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black p-4 sm:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`${app.name} information`}
        className="w-full max-w-[480px] border border-[#ccff00] bg-black p-5 text-[#ccff00]  sm:p-8"
      >
        <div className="flex items-start justify-between gap-4">
          <AppIcon app={app} large />
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close app details"
            className="flex h-10 w-10 items-center justify-center border border-[#ccff00] text-xl hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ccff00]"
          >
            ×
          </button>
        </div>
        <p className="mt-7 text-[10px] uppercase tracking-[0.18em] ">
          {app.buildType === "internal" ? "OnChainHoodies" : "Community build"} / {app.status}
        </p>
        <h2 className="mt-2 text-3xl leading-none tracking-[-0.045em] sm:text-4xl">{app.name}</h2>
        <p className="mt-3 text-xs uppercase tracking-[0.13em] ">{app.tagline}</p>
        <div className="my-6 h-px bg-[#ccff00]" />
        <p className="text-sm leading-7 sm:text-base">{app.description}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          {available ? (
            app.external ? (
              <a href={app.href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 flex-1 items-center justify-center border border-[#ccff00] bg-black px-5 text-xs font-bold uppercase tracking-widest text-[#ccff00] hover:underline">
                Open App ↗
              </a>
            ) : (
              <Link href={app.href} className="inline-flex min-h-11 flex-1 items-center justify-center border border-[#ccff00] bg-black px-5 text-xs font-bold uppercase tracking-widest text-[#ccff00] hover:underline">
                Open App →
              </Link>
            )
          ) : (
            <span className="inline-flex min-h-11 flex-1 items-center justify-center border border-[#ccff00] px-5 text-xs uppercase tracking-widest ">
              {app.status === "building" ? "In development" : "Coming soon"}
            </span>
          )}
          <button type="button" onClick={onClose} className="min-h-11 border border-[#ccff00] px-5 text-xs uppercase tracking-widest hover:underline">
            Back
          </button>
        </div>
      </section>
    </div>
  );
}

export default function HoodOSPage() {
  const [filter, setFilter] = useState<FilterType>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = apps.find((item) => item.id === selectedId) ?? null;
  const visibleApps = useMemo(
    () => (filter === "all" ? apps : apps.filter((app) => app.buildType === filter)),
    [filter],
  );
  const closeDialog = () => setSelectedId(null);

  return (
    <main className="min-h-screen bg-black text-[#ccff00]">
      <SiteHeader />
      <div className="mx-auto w-full max-w-[1260px] px-4 pb-24 pt-24 sm:px-6 md:pt-28">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#ccff00] pb-5">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] ">OnChainHoodies / Application Launcher</p>
            <h1 className="mt-2 text-4xl tracking-[-0.07em] sm:text-6xl">HOODOS<span className="">_</span></h1>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-5">
          <p className="max-w-lg text-sm leading-relaxed ">
            Your Hoodie. Your apps. Select an icon to learn more and launch.
          </p>
          <div className="flex items-center gap-1" role="group" aria-label="Filter applications">
            {([ ["all", "All"], ["internal", "Our apps"], ["community", "Community"] ] as const).map(([value, label]) => (
              <button
                type="button"
                key={value}
                onClick={() => setFilter(value)}
                aria-pressed={filter === value}
                className={`min-h-10 border border-[#ccff00] px-3 text-[10px] uppercase tracking-[0.09em] transition-colors ${filter === value ? "bg-black text-[#ccff00] underline underline-offset-4" : "bg-black text-[#ccff00] hover:underline"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <section aria-label="HoodOS applications" className="mt-8 border-t border-[#ccff00] pt-8">
          <div className="grid grid-cols-3 gap-x-3 gap-y-9 sm:grid-cols-4 sm:gap-x-5 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
            {visibleApps.map((app) => (
              <button
                key={app.id}
                type="button"
                onClick={() => setSelectedId(app.id)}
                aria-label={`View ${app.name} details`}
                className="group flex min-w-0 flex-col items-center gap-3 text-center focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ccff00]"
              >
                <div className="transition-transform duration-150 group-hover:-translate-y-1 group-hover:scale-[1.05] group-focus-visible:-translate-y-1">
                  <AppIcon app={app} />
                </div>
                <span className="w-full break-words text-[11px] font-medium leading-4 sm:text-xs">{app.name}</span>
                {app.status !== "live" && <span className="text-[9px] uppercase tracking-wider ">{app.status}</span>}
              </button>
            ))}
          </div>
          {visibleApps.length === 0 && <p className="py-12 text-sm ">No apps in this category.</p>}
        </section>

        <section className="mt-20 flex flex-col items-start justify-between gap-5 border-t border-[#ccff00] pt-8 sm:flex-row sm:items-end">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] ">Open infrastructure</p>
            <h2 className="mt-3 text-2xl tracking-tight sm:text-3xl">BUILD FOR THE HOOD.</h2>
            <p className="mt-3 max-w-lg text-sm leading-relaxed ">
              Build applications, tools and games around HoodOS and HoodWallet.
            </p>
          </div>
          <Link href="/hoodos/docs" className="inline-flex min-h-11 items-center justify-center border border-[#ccff00] px-5 text-xs uppercase tracking-widest hover:underline">
            Developer docs →
          </Link>
        </section>
      </div>
      <SiteFooter />
      {selected && <AppDialog key={selected.id} app={selected} onClose={closeDialog} />}
    </main>
  );
}
