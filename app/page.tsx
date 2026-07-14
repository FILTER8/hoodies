"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import {
  contractExplorerUrl,
  shortAddress,
  siteConfig,
} from "../lib/config";

const API_BASE = "https://api.onchainhoodies.xyz";

type NeighborName = "Builder" | "Collector" | "Flipper" | "HODLer";

type NeighborToken = {
  tokenId: number;
  name: string;
  image: string;
  hoodie: NeighborName;
};

type SearchResult = {
  tokenId: number;
  name?: string;
  image?: string;
  traits?: {
    hoodie?: string;
  };
};

type SearchResponse = {
  total: number;
  results: SearchResult[];
};

const neighborTypes: NeighborName[] = [
  "Builder",
  "Collector",
  "Flipper",
  "HODLer",
];

const neighborFallbacks: Record<NeighborName, string> = {
  Builder: "/builder.png",
  Collector: "/collector.png",
  Flipper: "/flipper.png",
  HODLer: "/hodler.png",
};

const builds = [
  {
    label: "Live",
    title: "Grid Exporter",
    copy: "Choose the Hoodies in your wallet and export them as one clean, branded square PNG.",
    href: "/tools/export",
    action: "Open exporter",
  },
  {
    label: "Live",
    title: "Hoodie Cam",
    copy: "Capture your surroundings through the black-and-green 1-bit language of the Hood.",
    href: "/cam",
    action: "Open camera",
  },
  {
    label: "Live",
    title: "Hoodie Explorer",
    copy: "Explore traits, Neighborhood Rarity and the on-chain ink inside every Hoodie.",
    href: "/tools/explorer",
    action: "Open Explorer",
  },
  {
    label: "Research",
    title: "Agent Tools",
    copy: "Machine-readable tools for agents to inspect, understand and interact with fully on-chain NFTs.",
    href: "#agents",
    action: "Explore direction",
  },
];

const contracts = [
  { label: "Collection", address: siteConfig.collectionAddress },
  { label: "Renderer", address: siteConfig.rendererAddress },
  { label: "Pixel Data", address: siteConfig.pixelDataAddress },
];

function normalizeHoodie(value: string): NeighborName | null {
  const normalized = value.trim().toLowerCase();

  if (normalized === "builder") return "Builder";
  if (normalized === "collector") return "Collector";
  if (normalized === "flipper") return "Flipper";
  if (normalized === "hodler") return "HODLer";

  return null;
}

async function fetchRandomNeighbor(
  hoodie: NeighborName,
  signal?: AbortSignal,
): Promise<NeighborToken> {
  const params = new URLSearchParams({
    hoodie,
    limit: "1",
    offset: "0",
    sort: "token",
  });

  const firstResponse = await fetch(
    `${API_BASE}/v1/search?${params.toString()}`,
    {
      signal,
      cache: "no-store",
    },
  );

  if (!firstResponse.ok) {
    throw new Error(`Could not load ${hoodie} supply.`);
  }

  const firstData = (await firstResponse.json()) as SearchResponse;

  if (!Number.isFinite(firstData.total) || firstData.total < 1) {
    throw new Error(`No ${hoodie} Hoodies found.`);
  }

  const randomOffset = Math.floor(Math.random() * firstData.total);
  params.set("offset", String(randomOffset));

  const tokenResponse = await fetch(
    `${API_BASE}/v1/search?${params.toString()}`,
    {
      signal,
      cache: "no-store",
    },
  );

  if (!tokenResponse.ok) {
    throw new Error(`Could not load a random ${hoodie}.`);
  }

  const tokenData = (await tokenResponse.json()) as SearchResponse;
  const result = tokenData.results?.[0];

  if (!result || typeof result.tokenId !== "number") {
    throw new Error(`The ${hoodie} response was empty.`);
  }

  const resolvedHoodie =
    normalizeHoodie(result.traits?.hoodie ?? "") ?? hoodie;

  return {
    tokenId: result.tokenId,
    name: result.name ?? `OnChainHoodies #${result.tokenId}`,
    image:
      result.image ??
      `${API_BASE}/images/${result.tokenId}.svg`,
    hoodie: resolvedHoodie,
  };
}

export default function Home() {
  const [neighbors, setNeighbors] = useState<
    Partial<Record<NeighborName, NeighborToken>>
  >({});
  const [loadingNeighbors, setLoadingNeighbors] = useState<
    Partial<Record<NeighborName, boolean>>
  >({});

  const refreshNeighbor = useCallback(
    async (hoodie: NeighborName, signal?: AbortSignal) => {
      setLoadingNeighbors((current) => ({
        ...current,
        [hoodie]: true,
      }));

      try {
        const nextNeighbor = await fetchRandomNeighbor(hoodie, signal);

        setNeighbors((current) => ({
          ...current,
          [hoodie]: nextNeighbor,
        }));
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        console.error(error);
      } finally {
        if (!signal?.aborted) {
          setLoadingNeighbors((current) => ({
            ...current,
            [hoodie]: false,
          }));
        }
      }
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();

    void Promise.all(
      neighborTypes.map((hoodie) =>
        refreshNeighbor(hoodie, controller.signal),
      ),
    );

    return () => controller.abort();
  }, [refreshNeighbor]);

  return (
    <main className="bg-[#ccff00] text-black">
      <SiteHeader />

      <section className="mx-auto flex min-h-screen max-w-[1440px] flex-col items-center justify-center px-6 pb-16 pt-28 text-center">
        <img
          src="/onchainhoodies.gif"
          alt="Animated OnChainHoodie"
          className="image-render-pixel mb-9 w-[220px] md:w-[350px]"
        />

        <h1 className="text-[clamp(4rem,12vw,10rem)] leading-[0.82] tracking-[-0.08em]">
          WELCOME TO
          <br />
          THE HOOD
        </h1>

        <p className="mt-10 max-w-xl text-lg leading-relaxed md:text-2xl">
          A fully on-chain neighborhood.
        </p>

        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <a href="#builds" className="pixel-cta">
            Explore the builds
          </a>
          <a
            href={siteConfig.openSeaUrl}
            target="_blank"
            rel="noreferrer"
            className="pixel-cta pixel-cta-dark"
          >
            View on OpenSea
          </a>
        </div>

        <div className="mt-16 grid w-full max-w-5xl grid-cols-2 border-2 border-black text-[10px] uppercase tracking-[0.16em] md:grid-cols-4">
          {[
            "6,000 Hoodies",
            siteConfig.chainName,
            "Fully On-Chain",
            "CC0",
          ].map((item) => (
            <div
              key={item}
              className="border-black p-4 even:border-l-2 md:border-l-2 md:first:border-l-0"
            >
              {item}
            </div>
          ))}
        </div>
      </section>

      <section id="collection" className="bg-black px-6 py-24 text-[#ccff00]">
        <div className="mx-auto max-w-[1440px]">
          <div className="section-heading-row">
            <p>01 / Collection</p>
            <p>Meet the Hood</p>
          </div>

          <div className="mt-12 grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
            <div>
              <h2 className="section-title">
                Four neighbors.
                <br />
                One Hood.
              </h2>

              <p className="mt-8 max-w-xl text-lg leading-relaxed opacity-80 md:text-xl">
                Builders, Collectors, Flippers and HODLers. Familiar faces from
                the on-chain world, hand-drawn in 1-bit and stored fully
                on-chain.
              </p>

              <p className="mt-5 text-[10px] uppercase tracking-[0.16em] opacity-60">
                Tap a neighbor to meet another.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {neighborTypes.map((hoodie) => {
                const neighbor = neighbors[hoodie];
                const isLoading = loadingNeighbors[hoodie] ?? false;
                const image = neighbor?.image ?? neighborFallbacks[hoodie];
                const tokenLabel = neighbor
                  ? `#${neighbor.tokenId}`
                  : "Loading";

                return (
                  <button
                    key={hoodie}
                    type="button"
                    onClick={() => void refreshNeighbor(hoodie)}
                    disabled={isLoading}
                    aria-label={`Load another ${hoodie} Hoodie`}
                    className="group border-2 border-[#ccff00] text-left disabled:cursor-wait disabled:opacity-70"
                  >
                    <div className="relative aspect-square overflow-hidden bg-[#ccff00]">
                      <img
                        src={image}
                        alt={
                          neighbor?.name ??
                          `${hoodie} OnChainHoodie`
                        }
                        className={`image-render-pixel h-full w-full object-cover ${
                          isLoading ? "opacity-100" : "opacity-100"
                        }`}
                      />
                    </div>

                    <div className="flex items-center justify-between gap-2 border-t-2 border-[#ccff00] p-3 text-[10px] uppercase tracking-[0.14em]">
                      <span>{hoodie}</span>
                      <span className="opacity-60">{tokenLabel}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section id="builds" className="px-6 py-24">
        <div className="mx-auto max-w-[1440px]">
          <div className="section-heading-row border-black">
            <p>02 / Builds</p>
            <p>Built in the Hood</p>
          </div>

          <div className="mt-12 grid border-l-2 border-t-2 border-black md:grid-cols-2">
            {builds.map((build, index) => (
              <article
                key={build.title}
                className="flex min-h-[330px] flex-col justify-between border-b-2 border-r-2 border-black p-6 md:p-10"
              >
                <div>
                  <div className="flex items-start justify-between gap-6">
                    <span className="text-[10px] uppercase tracking-[0.18em] opacity-60">
                      {String(index + 1).padStart(2, "0")}
                    </span>

                    <span className="border border-black px-2 py-1 text-[9px] uppercase tracking-[0.14em]">
                      {build.label}
                    </span>
                  </div>

                  <h3 className="mt-12 text-4xl leading-none md:text-5xl">
                    {build.title}
                  </h3>

                  <p className="mt-6 max-w-xl text-base leading-relaxed opacity-75 md:text-lg">
                    {build.copy}
                  </p>
                </div>

                {build.href === "#" ? (
                  <span className="mt-10 text-xs uppercase tracking-[0.18em] opacity-50">
                    {build.action} →
                  </span>
                ) : (
                  <Link
                    href={build.href}
                    className="mt-10 text-xs uppercase tracking-[0.18em] underline underline-offset-4"
                  >
                    {build.action} →
                  </Link>
                )}
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="agents" className="bg-black px-6 py-24 text-[#ccff00]">
        <div className="mx-auto grid max-w-[1440px] gap-12 lg:grid-cols-2">
          <div>
            <div className="section-heading-row">
              <p>03 / Agents</p>
              <p>Humans + machines</p>
            </div>

            <h2 className="section-title mt-12">
              Readable by humans.
              <br />
              Ready for agents.
            </h2>
          </div>

          <div className="flex flex-col justify-end">
            <p className="max-w-2xl text-lg leading-relaxed opacity-80 md:text-2xl">
              Fully on-chain data gives collectors, builders and agents an open
              foundation to inspect traits, interpret artwork and create new
              ways to explore the collection.
            </p>

            <div className="mt-10 grid grid-cols-2 border-l border-t border-[#ccff00] text-[10px] uppercase tracking-[0.14em]">
              {[
                "On-chain metadata",
                "Trait inspection",
                "Machine-readable artwork",
                "Agent tools",
              ].map((item) => (
                <div
                  key={item}
                  className="border-b border-r border-[#ccff00] p-4"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="contracts" className="px-6 py-24">
        <div className="mx-auto max-w-[1440px]">
          <div className="section-heading-row border-black">
            <p>04 / On-chain</p>
            <p>Verify everything</p>
          </div>

          <div className="mt-12 grid gap-12 lg:grid-cols-[0.7fr_1.3fr]">
            <div>
              <h2 className="section-title">Contracts, not promises.</h2>

              <p className="mt-8 max-w-lg text-lg leading-relaxed opacity-75">
                Collection data, rendering and pixels live on-chain. Inspect
                the contracts, read the code and verify the Hood yourself.
              </p>
            </div>

            <div className="border-l-2 border-t-2 border-black">
              {contracts.map((contract) => {
                const href = contractExplorerUrl(contract.address);

                return (
                  <div
                    key={contract.label}
                    className="grid gap-3 border-b-2 border-r-2 border-black p-5 md:grid-cols-[160px_1fr_auto] md:items-center"
                  >
                    <span className="text-[10px] uppercase tracking-[0.16em] opacity-60">
                      {contract.label}
                    </span>

                    <code className="break-all text-sm">
                      {contract.address || "Add address in .env.local"}
                    </code>

                    {href === "#" ? (
                      <span className="text-[10px] uppercase tracking-[0.14em] opacity-40">
                        {shortAddress(contract.address)}
                      </span>
                    ) : (
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] uppercase tracking-[0.14em] underline underline-offset-4"
                      >
                        Explorer ↗
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}