"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";

const API_BASE = "https://api.onchainhoodies.xyz";
const X_HANDLE = "@OnChainHoodies";
const X_PROFILE = "https://x.com/OnChainHoodies";
const BUILDER_VAULT_ADDRESS =
  "0xC7c165bA3fCf9244A45977D4809202b1DC803941";
const BUILDER_VAULT_INITIAL_OCH = 150;

type VaultOwnershipResponse = {
  items?: Array<{
    tokenId: string;
    name?: string;
    image?: string;
  }>;
  count?: number;
  indexedTotal?: number | null;
  error?: string;
};

type ApiStatus = "checking" | "live" | "offline";

type HolderOverlapCollection = {
  id: string;
  name: string;
  sharedWallets: number;
  totalOCHHeldBySharedWallets: number;
  previousSharedWallets?: number | null;
  changeSincePrevious?: number | null;
};

type HolderOverlapResponse = {
  data?: {
    measuredAt?: string;
    collections?: HolderOverlapCollection[];
    leaderboard?: Array<{
      rank: number;
      collectionId: string;
      collection: string;
      sharedWallets: number;
    }>;
  };
};

const layers = [
  {
    number: "01",
    title: "Collection",
    copy: "Artwork, traits, Neighborhood Rarity and on-chain ink for every Hoodie.",
    endpoints: [
      "GET /v1/token/{tokenId}",
      "GET /v1/search",
      "GET /v1/traits",
      "GET /v1/leaderboard",
    ],
  },
  {
    number: "02",
    title: "Market",
    copy: "Listings, offers, sales history, collection activity and benchmark data from OpenSea.",
    endpoints: [
      "GET /v1/market/collection",
      "GET /v1/market/token/{tokenId}",
      "GET /v1/market/activity",
      "GET /v1/market/listings",
    ],
  },
  {
    number: "03",
    title: "Intelligence",
    copy: "Transparent discovery signals, holder benchmarks and cross-community ownership overlap.",
    endpoints: [
      "GET /v1/intelligence/token/{tokenId}",
      "GET /v1/intelligence/discovery",
      "GET /v1/intelligence/holder-overlap",
      "GET /v1/intelligence/wallet/{address}",
    ],
  },
];

const examples = [
  {
    label: "Inspect a Hoodie",
    method: "GET",
    path: "/v1/token/125",
    description: "Traits, ranks, ink and direct artwork links.",
  },
  {
    label: "Find Collectors",
    method: "GET",
    path: "/v1/search?hoodie=Collector&limit=10",
    description: "Search the collection by Hoodie-specific traits.",
  },
  {
    label: "Read the Market",
    method: "GET",
    path: "/v1/market/token/125",
    description: "Listing, best offer, last sale and collection floor.",
  },
  {
    label: "Discover Listings",
    method: "GET",
    path: "/v1/intelligence/discovery?sort=score&limit=10",
    description: "Active listings enriched with transparent price, rank and ink signals.",
  },
  {
    label: "OG Community Race",
    method: "GET",
    path: "/v1/intelligence/holder-overlap",
    description: "See which established Ethereum NFT communities are moving into the Hood.",
  },
  {
    label: "Inspect a Wallet",
    method: "GET",
    path: "/v1/intelligence/wallet/{address}",
    description: "Check public overlap across OCH and benchmark NFT communities.",
  },
];

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="shrink-0 border-l border-current px-3 py-3 text-[8px] uppercase tracking-[0.14em]"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function CodeExample({
  method,
  path,
  label,
  description,
}: {
  method: string;
  path: string;
  label: string;
  description: string;
}) {
  const fullUrl = `${API_BASE}${path}`;

  return (
    <article className="flex min-h-[250px] flex-col justify-between border-b-2 border-r-2 border-black p-5 md:p-7">
      <div>
        <div className="flex items-start justify-between gap-4">
          <p className="text-[9px] uppercase tracking-[0.16em] opacity-60">
            {method}
          </p>
          <p className="text-[9px] uppercase tracking-[0.16em]">
            {label}
          </p>
        </div>

        <p className="mt-7 text-sm leading-relaxed opacity-70">
          {description}
        </p>
      </div>

      <div className="mt-8 border border-black">
        <div className="flex min-w-0 items-stretch">
          <code className="min-w-0 flex-1 break-all px-3 py-3 text-[10px] leading-relaxed">
            {fullUrl}
          </code>
          <CopyButton value={fullUrl} />
        </div>
      </div>
    </article>
  );
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function shortDate(value?: string) {
  if (!value) return "Live";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Live";

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export default function ApiPage() {
  const [status, setStatus] = useState<ApiStatus>("checking");
  const [overlap, setOverlap] = useState<HolderOverlapCollection[]>([]);
  const [measuredAt, setMeasuredAt] = useState<string>();
  const [vaultBalance, setVaultBalance] = useState<number | null>(null);
  const [vaultLoading, setVaultLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const [statusResponse, overlapResponse, vaultResponse] =
          await Promise.all([
            fetch(`${API_BASE}/v1`, {
              signal: controller.signal,
              cache: "no-store",
            }),
            fetch(`${API_BASE}/v1/intelligence/holder-overlap`, {
              signal: controller.signal,
              cache: "no-store",
            }),
            fetch(
              `/api/hoodies?owner=${encodeURIComponent(
                BUILDER_VAULT_ADDRESS,
              )}`,
              {
                signal: controller.signal,
                cache: "no-store",
              },
            ),
          ]);

        setStatus(statusResponse.ok ? "live" : "offline");

        if (overlapResponse.ok) {
          const data =
            (await overlapResponse.json()) as HolderOverlapResponse;

          setOverlap(data.data?.collections ?? []);
          setMeasuredAt(data.data?.measuredAt);
        }

        if (vaultResponse.ok) {
          const vaultData =
            (await vaultResponse.json()) as VaultOwnershipResponse;
          const uniqueCount = Array.isArray(vaultData.items)
            ? new Set(
                vaultData.items.map((item) => String(item.tokenId)),
              ).size
            : Number(vaultData.count ?? vaultData.indexedTotal ?? 0);

          setVaultBalance(
            Number.isFinite(uniqueCount) ? uniqueCount : null,
          );
        } else {
          setVaultBalance(null);
        }

        setVaultLoading(false);
      } catch (error) {
        if (
          error instanceof DOMException &&
          error.name === "AbortError"
        ) {
          return;
        }

        setStatus("offline");
        setVaultLoading(false);
      }
    }

    void load();

    return () => controller.abort();
  }, []);

  const raceByWallets = useMemo(
    () =>
      [...overlap].sort(
        (left, right) => right.sharedWallets - left.sharedWallets,
      ),
    [overlap],
  );

  const raceByHoodies = useMemo(
    () =>
      [...overlap].sort(
        (left, right) =>
          right.totalOCHHeldBySharedWallets -
          left.totalOCHHeldBySharedWallets,
      ),
    [overlap],
  );

  const distributedOCH =
    vaultBalance === null
      ? null
      : Math.max(0, BUILDER_VAULT_INITIAL_OCH - vaultBalance);

  const vaultExplorerUrl = `https://explorer.robinhoodchain.com/address/${BUILDER_VAULT_ADDRESS}`;

  const shareText = encodeURIComponent(
    "Building with the OnChainHoodies API — fully on-chain artwork, traits, rarity, ink, market data and holder intelligence. The Hood is built by builders. @OnChainHoodies",
  );
  const shareUrl = `https://x.com/intent/post?text=${shareText}`;

  return (
    <main className="min-h-screen bg-[#ccff00] text-black">
      <SiteHeader />

      <section className="mx-auto flex min-h-screen max-w-[1440px] flex-col justify-center px-6 pb-20 pt-28">
        <div className="section-heading-row border-black">
          <p>Builders / API</p>
          <p>
            Status ·{" "}
            {status === "checking"
              ? "Checking"
              : status === "live"
                ? "Live"
                : "Unavailable"}
          </p>
        </div>

        <div className="mt-14 grid gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <div>
            <p className="text-xs uppercase tracking-[0.22em]">
              Built by builders · Open to builders
            </p>

            <h1 className="mt-6 text-[clamp(4rem,11vw,10rem)] leading-[0.82] tracking-[-0.08em]">
              BUILD IN
              <br />
              THE HOOD.
            </h1>

            <p className="mt-9 max-w-2xl text-lg leading-relaxed md:text-2xl">
              One API for fully on-chain artwork, traits, rarity, ink,
              market data and collector intelligence.
            </p>

            <div className="mt-9 flex flex-wrap gap-3">
              <a
                href={`${API_BASE}/openapi.json`}
                target="_blank"
                rel="noreferrer"
                className="pixel-cta"
              >
                Open API spec
              </a>
              <a
                href={shareUrl}
                target="_blank"
                rel="noreferrer"
                className="pixel-cta pixel-cta-dark"
              >
                Share your build
              </a>
            </div>
          </div>

          <div className="border-2 border-black">
            <div className="border-b-2 border-black bg-black p-5 text-[#ccff00]">
              <p className="text-[9px] uppercase tracking-[0.18em] opacity-60">
                Base URL
              </p>
              <p className="mt-4 break-all text-xl leading-relaxed md:text-2xl">
                api.onchainhoodies.xyz
              </p>
            </div>

            <div className="grid grid-cols-2 text-[9px] uppercase tracking-[0.14em]">
              <div className="border-b border-r border-black p-4">
                Version
                <br />
                <span className="mt-2 block text-base">v1.5</span>
              </div>
              <div className="border-b border-black p-4">
                Access
                <br />
                <span className="mt-2 block text-base">Public</span>
              </div>
              <div className="border-r border-black p-4">
                Format
                <br />
                <span className="mt-2 block text-base">JSON</span>
              </div>
              <div className="p-4">
                Artwork
                <br />
                <span className="mt-2 block text-base">SVG</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-black px-6 py-24 text-[#ccff00]">
        <div className="mx-auto max-w-[1440px]">
          <div className="section-heading-row">
            <p>01 / Data layers</p>
            <p>One Hood · Three layers</p>
          </div>

          <div className="mt-12 grid gap-3 lg:grid-cols-3">
            {layers.map((layer) => (
              <article
                key={layer.number}
                className="flex min-h-[430px] flex-col justify-between border-2 border-[#ccff00] p-6 md:p-8"
              >
                <div>
                  <p className="text-[9px] uppercase tracking-[0.16em] opacity-60">
                    {layer.number}
                  </p>
                  <h2 className="mt-8 text-5xl leading-none tracking-[-0.06em]">
                    {layer.title}
                  </h2>
                  <p className="mt-7 text-base leading-relaxed opacity-75">
                    {layer.copy}
                  </p>
                </div>

                <div className="mt-10 space-y-2">
                  {layer.endpoints.map((endpoint) => (
                    <div
                      key={endpoint}
                      className="border border-[#ccff00] px-3 py-3 text-[9px] leading-relaxed tracking-[0.08em]"
                    >
                      {endpoint}
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-24">
        <div className="mx-auto max-w-[1440px]">
          <div className="section-heading-row border-black">
            <p>02 / Start building</p>
            <p>Copy · Call · Create</p>
          </div>

          <div className="mt-12 grid border-l-2 border-t-2 border-black md:grid-cols-2 xl:grid-cols-3">
            {examples.map((example) => (
              <CodeExample key={example.path} {...example} />
            ))}
          </div>

          <div className="mt-4 border-2 border-black p-5 md:flex md:items-center md:justify-between md:gap-8">
            <div>
              <p className="text-[9px] uppercase tracking-[0.16em] opacity-60">
                Need every route?
              </p>
              <p className="mt-3 text-lg">
                The OpenAPI document is the canonical machine-readable spec.
              </p>
            </div>

            <div className="mt-5 flex flex-wrap gap-2 md:mt-0">
              <a
                href={`${API_BASE}/openapi.json`}
                target="_blank"
                rel="noreferrer"
                className="pixel-cta"
              >
                Open OpenAPI
              </a>
              <CopyButton value={`${API_BASE}/openapi.json`} />
            </div>
          </div>
        </div>
      </section>

      <section className="bg-black px-6 py-24 text-[#ccff00]">
        <div className="mx-auto max-w-[1440px]">
          <div className="section-heading-row">
            <p>03 / Community intelligence</p>
            <p>Who moved into the Hood?</p>
          </div>

          <div className="mt-12 grid gap-10 lg:grid-cols-[0.75fr_1.25fr]">
            <div>
              <h2 className="section-title">
                OG communities.
                <br />
                Shared neighbors.
              </h2>

              <p className="mt-8 max-w-xl text-lg leading-relaxed opacity-75">
                Compare public wallet overlap between OnChainHoodies and
                established Ethereum NFT communities.
              </p>

              <p className="mt-5 text-[9px] uppercase tracking-[0.14em] opacity-55">
                Snapshot · {shortDate(measuredAt)}
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="border-2 border-[#ccff00]">
                <div className="border-b-2 border-[#ccff00] p-4">
                  <p className="text-[9px] uppercase tracking-[0.16em]">
                    By shared wallets
                  </p>
                </div>

                {raceByWallets.length > 0 ? (
                  raceByWallets.map((collection, index) => (
                    <div
                      key={collection.id}
                      className="grid grid-cols-[36px_1fr_auto] items-center gap-3 border-b border-[#ccff00] p-4 last:border-b-0"
                    >
                      <span className="text-[9px] opacity-55">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="text-sm">{collection.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xl">
                          {collection.sharedWallets}
                        </span>

                        {typeof collection.changeSincePrevious === "number" &&
                        collection.changeSincePrevious !== 0 ? (
                          <span className="border border-[#ccff00] px-2 py-1 text-[8px] uppercase tracking-[0.12em]">
                            {collection.changeSincePrevious > 0 ? "+" : ""}
                            {collection.changeSincePrevious}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="p-5 text-sm opacity-65">
                    Loading community race.
                  </p>
                )}
              </div>

              <div className="border-2 border-[#ccff00]">
                <div className="border-b-2 border-[#ccff00] p-4">
                  <p className="text-[9px] uppercase tracking-[0.16em]">
                    By Hoodies held
                  </p>
                </div>

                {raceByHoodies.length > 0 ? (
                  raceByHoodies.map((collection, index) => (
                    <div
                      key={collection.id}
                      className="grid grid-cols-[36px_1fr_auto] items-center gap-3 border-b border-[#ccff00] p-4 last:border-b-0"
                    >
                      <span className="text-[9px] opacity-55">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="text-sm">{collection.name}</span>
                      <span className="text-xl">
                        {collection.totalOCHHeldBySharedWallets}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="p-5 text-sm opacity-65">
                    Loading Hoodie holdings.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 py-24">
        <div className="mx-auto max-w-[1440px]">
          <div className="section-heading-row border-black">
            <p>04 / Builders welcome</p>
            <p>Build it in public</p>
          </div>

          <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_0.8fr] lg:items-end">
            <div>
              <h2 className="section-title">
                Made in the Hood?
                <br />
                Let the Hood know.
              </h2>

              <p className="mt-8 max-w-2xl text-lg leading-relaxed opacity-75 md:text-xl">
                Build explorers, agents, bots, market tools, games or
                something we have not imagined yet. Tag OnChainHoodies when
                you ship so the community can find it, test it and share it.
              </p>
            </div>

            <div className="border-2 border-black">
              <div className="border-b-2 border-black bg-black p-5 text-[#ccff00]">
                <p className="text-[9px] uppercase tracking-[0.16em] opacity-60">
                  Tag the Hood
                </p>
                <p className="mt-4 text-3xl">{X_HANDLE}</p>
              </div>

              <div className="grid grid-cols-2">
                <a
                  href={shareUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="border-r-2 border-black px-4 py-4 text-center text-[9px] uppercase tracking-[0.14em] underline underline-offset-4"
                >
                  Share a build ↗
                </a>
                <a
                  href={X_PROFILE}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-4 text-center text-[9px] uppercase tracking-[0.14em] underline underline-offset-4"
                >
                  Follow the Hood ↗
                </a>
              </div>
            </div>
          </div>

          <section className="mt-14 border-2 border-black">
            <div className="grid lg:grid-cols-[0.9fr_1.1fr]">
              <div className="bg-black p-6 text-[#ccff00] md:p-10">
                <p className="text-[9px] uppercase tracking-[0.18em] opacity-60">
                  Builder Treasury
                </p>

                <p className="mt-5 text-[clamp(4rem,9vw,8rem)] leading-[0.82] tracking-[-0.08em]">
                  {vaultLoading
                    ? "..."
                    : vaultBalance?.toLocaleString() ?? "—"}
                  <br />
                  OCH
                </p>

                <p className="mt-7 max-w-md text-base leading-relaxed opacity-75">
                  Live on-chain inventory reserved for builders who create real
                  value for the Hood.
                </p>

                <div className="mt-8 border border-[#ccff00]">
                  <div className="grid grid-cols-2 border-b border-[#ccff00]">
                    <div className="border-r border-[#ccff00] p-4">
                      <p className="text-[8px] uppercase tracking-[0.14em] opacity-60">
                        Initial allocation
                      </p>
                      <p className="mt-2 text-2xl">
                        {BUILDER_VAULT_INITIAL_OCH}
                      </p>
                    </div>

                    <div className="p-4">
                      <p className="text-[8px] uppercase tracking-[0.14em] opacity-60">
                        Distributed
                      </p>
                      <p className="mt-2 text-2xl">
                        {vaultLoading
                          ? "..."
                          : distributedOCH?.toLocaleString() ?? "—"}
                      </p>
                    </div>
                  </div>

                  <div className="p-4">
                    <p className="text-[8px] uppercase tracking-[0.14em] opacity-60">
                      Treasury wallet
                    </p>
                    <p className="mt-2 break-all text-sm">
                      {shortAddress(BUILDER_VAULT_ADDRESS)}
                    </p>

                    <a
                      href={vaultExplorerUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-4 inline-block text-[9px] uppercase tracking-[0.14em] underline underline-offset-4"
                    >
                      View on-chain ↗
                    </a>
                  </div>
                </div>
              </div>

              <div className="p-6 md:p-10">
                <p className="text-[9px] uppercase tracking-[0.18em] opacity-60">
                  Build useful things. Share in what you help create.
                </p>

                <h3 className="mt-6 text-4xl leading-[0.95] tracking-[-0.05em] md:text-6xl">
                  THE HOOD
                  <br />
                  REWARDS BUILDERS.
                </h3>

                <p className="mt-7 max-w-2xl text-base leading-relaxed opacity-75 md:text-lg">
                  Build something useful with the OnChainHoodies API, ship it
                  publicly and tag {X_HANDLE}. Strong builds may receive OCH
                  from the Builder Treasury and become part of the official Hood
                  ecosystem.
                </p>

                <div className="mt-8 grid grid-cols-2 border-l border-t border-black text-[9px] uppercase tracking-[0.13em] md:grid-cols-4">
                  {["Useful", "Original", "Working", "Openly shipped"].map(
                    (item) => (
                      <div
                        key={item}
                        className="border-b border-r border-black p-4 text-center"
                      >
                        {item}
                      </div>
                    ),
                  )}
                </div>

                <div className="mt-8 grid gap-2 md:grid-cols-3">
                  {[
                    ["Shipped", "A useful working experiment."],
                    ["Adopted", "Used and shared by the community."],
                    ["Core Build", "Becomes part of the official Hood ecosystem."],
                  ].map(([title, copy]) => (
                    <div key={title} className="border border-black p-4">
                      <p className="text-[8px] uppercase tracking-[0.16em] opacity-60">
                        {title}
                      </p>
                      <p className="mt-3 text-sm leading-relaxed">{copy}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-8 flex flex-wrap gap-3">
                  <a
                    href={shareUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="pixel-cta"
                  >
                    Share your build
                  </a>

                  <a
                    href={`${API_BASE}/openapi.json`}
                    target="_blank"
                    rel="noreferrer"
                    className="pixel-cta pixel-cta-dark"
                  >
                    View the API
                  </a>
                </div>

                <p className="mt-6 text-[9px] uppercase leading-relaxed tracking-[0.12em] opacity-55">
                  Rewards are selective and based on quality, usefulness,
                  originality and community impact. A submission does not
                  guarantee a reward.
                </p>
              </div>
            </div>
          </section>

          <div className="mt-14 border-2 border-black bg-black p-6 text-[#ccff00] md:p-10">
            <p className="text-[9px] uppercase tracking-[0.18em] opacity-60">
              Builder principle
            </p>
            <p className="mt-6 max-w-5xl text-3xl leading-tight tracking-[-0.04em] md:text-5xl">
              Most communities ask builders to contribute. The Hood wants
              builders to share in what they help create.
            </p>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}