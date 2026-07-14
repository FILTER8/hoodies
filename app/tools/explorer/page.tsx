"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import SiteHeader from "../../../components/SiteHeader";
import SiteFooter from "../../../components/SiteFooter";
import { useWallet } from "../../../components/WalletProvider";
import { siteConfig } from "../../../lib/config";

const API_BASE = "https://api.onchainhoodies.xyz";

function passthroughImageLoader({ src }: { src: string }) {
  return src;
}

type OwnedHoodie = {
  tokenId: string;
  name: string;
  image: string;
};

type OwnershipResponse = {
  items?: OwnedHoodie[];
  count?: number;
  indexedTotal?: number | null;
  pagesRead?: number;
  error?: string;
};

type TraitState = "present" | "none" | "suppressed-by-full-hood";

type TraitDetail = {
  traitId?: string;
  value: string | null;
  state?: TraitState;
  count?: number;
  hoodieSupply?: number;
  withinHoodiePercent?: number;
  collectionPercent?: number;
  tier?: string;
  contribution?: number;
  scored?: boolean;
};

type TokenTraits = {
  hoodie: string;
  dress: TraitDetail;
  mouth: TraitDetail;
  top: TraitDetail;
  eyes: TraitDetail;
};

type TokenApiResponse = {
  version: string;
  collection: {
    name: string;
    chain: string;
    contract: string;
    supply: number;
    fullyOnChain: boolean;
    license: string;
  };
  token: {
    id: number;
    name: string;
    description?: string;
  };
  image: {
    svg: string;
    sha256?: string;
    width: number;
    height: number;
  };
  traits: TokenTraits;
  ink: {
    blackPixels: number;
    canvasPixels: number;
    canvasCoveragePercent: number;
    rank: number;
    moreInkThanPercent: number;
  };
  rarity: {
    method: string;
    score: number;
    neighborhood: {
      hoodie: string;
      rank: number;
      outOf: number;
      rarerThanPercent: number;
    };
    collection: {
      rank: number;
      outOf: number;
      rarerThanPercent: number;
    };
    combination: {
      occurrences: number;
      unique: boolean;
    };
  };
  links?: {
    api?: string;
    image?: string;
    metadata?: string;
    website?: string;
  };
};

type SearchResult = {
  tokenId: number;
  name: string;
  image: string;
  api: string;
  traits: {
    hoodie: string;
    dress?: string | null;
    mouth?: string | null;
    top?: string | null;
    eyes?: string | null;
  };
  ink: {
    blackPixels: number;
    canvasCoveragePercent: number;
    rank: number;
  };
  rarity: {
    neighborhood: {
      hoodie: string;
      rank: number;
      outOf: number;
      rarerThanPercent: number;
    };
    collection: {
      rank: number;
      outOf: number;
      rarerThanPercent: number;
    };
  };
};

type SearchResponse = {
  total: number;
  offset: number;
  limit: number;
  results: SearchResult[];
};

type SimilarHoodie = SearchResult & {
  sharedTraits: number;
  inkDifference: number;
};

type WalletProfile = {
  total: number;
  averageCollectionRank: number;
  averageInk: number;
  bestRankToken: TokenApiResponse | null;
  mostInkToken: TokenApiResponse | null;
  favoriteNeighborhood: string;
  favoriteTrait: {
    layer: TraitKey;
    value: string;
    count: number;
  } | null;
  neighborhoodCounts: Record<string, number>;
};

const traitKeys = ["dress", "mouth", "top", "eyes"] as const;
type TraitKey = (typeof traitKeys)[number];

function absoluteApiUrl(value: string | undefined, fallback: string) {
  if (!value) return fallback;
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  return `${API_BASE}${value.startsWith("/") ? value : `/${value}`}`;
}

function ownedArtworkUrl(hoodie: OwnedHoodie) {
  return (
    hoodie.image ||
    `${API_BASE}/images/${encodeURIComponent(hoodie.tokenId)}.svg`
  );
}

function displayTraitValue(trait: TraitDetail) {
  if (trait.state === "suppressed-by-full-hood") return "Covered by full hood";
  if (trait.state === "none" || !trait.value) return "None";
  return trait.value;
}

function formatPercent(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value.toFixed(2)}%`;
}

function formatRank(rank: number | undefined, total: number | undefined) {
  if (
    typeof rank !== "number" ||
    typeof total !== "number" ||
    !Number.isFinite(rank) ||
    !Number.isFinite(total)
  ) {
    return "—";
  }

  return `#${rank.toLocaleString()} / ${total.toLocaleString()}`;
}

function topPercent(rarerThanPercent: number | undefined) {
  if (
    typeof rarerThanPercent !== "number" ||
    !Number.isFinite(rarerThanPercent)
  ) {
    return "—";
  }

  return `${Math.round(Math.max(0, 100 - rarerThanPercent))}%`;
}

function normalizeOwnedHoodies(items: OwnedHoodie[]) {
  return Array.from(
    new Map(items.map((item) => [String(item.tokenId), item])).values(),
  ).sort((left, right) => {
    const leftId = BigInt(left.tokenId);
    const rightId = BigInt(right.tokenId);
    return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
  });
}

function countSharedTraits(
  selected: TokenApiResponse,
  candidate: SearchResult,
) {
  return traitKeys.reduce((total, key) => {
    const selectedValue = selected.traits[key]?.value?.toLowerCase() ?? null;
    const candidateValue = candidate.traits[key]?.toLowerCase() ?? null;

    return total + (selectedValue && selectedValue === candidateValue ? 1 : 0);
  }, 0);
}

async function fetchToken(
  tokenId: string,
  signal?: AbortSignal,
): Promise<TokenApiResponse> {
  const response = await fetch(
    `${API_BASE}/v1/token/${encodeURIComponent(tokenId)}`,
    {
      signal,
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(`Unable to load Hoodie #${tokenId}.`);
  }

  return (await response.json()) as TokenApiResponse;
}

async function fetchSimilarHoodies(
  token: TokenApiResponse,
  signal?: AbortSignal,
): Promise<SimilarHoodie[]> {
  const params = new URLSearchParams({
    hoodie: token.traits.hoodie,
    limit: "250",
    sort: "rarity",
  });

  const response = await fetch(
    `${API_BASE}/v1/search?${params.toString()}`,
    {
      signal,
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error("Unable to find nearby Hoodies.");
  }

  const data = (await response.json()) as SearchResponse;

  return (data.results || [])
    .filter((candidate) => candidate.tokenId !== token.token.id)
    .map((candidate) => ({
      ...candidate,
      sharedTraits: countSharedTraits(token, candidate),
      inkDifference: Math.abs(
        candidate.ink.blackPixels - token.ink.blackPixels,
      ),
    }))
    .sort((left, right) => {
      if (right.sharedTraits !== left.sharedTraits) {
        return right.sharedTraits - left.sharedTraits;
      }

      if (left.inkDifference !== right.inkDifference) {
        return left.inkDifference - right.inkDifference;
      }

      return (
        left.rarity.neighborhood.rank -
        right.rarity.neighborhood.rank
      );
    })
    .slice(0, 4);
}

function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="flex min-h-[220px] items-center justify-center border border-[var(--hood-fg)] px-5 text-center text-[10px] uppercase tracking-[0.16em]">
      {label}
    </div>
  );
}

function OwnedArtwork({ hoodie }: { hoodie: OwnedHoodie }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--hood-fg)] p-3 text-center text-[8px] uppercase tracking-[0.12em] text-[var(--hood-bg)]">
        Artwork unavailable
      </div>
    );
  }

  return (
    <Image
      loader={passthroughImageLoader}
      unoptimized
      src={ownedArtworkUrl(hoodie)}
      alt={hoodie.name || `OnChainHoodies #${hoodie.tokenId}`}
      width={512}
      height={512}
      sizes="40px"
      onError={() => setFailed(true)}
      className="image-render-pixel h-full w-full object-cover"
    />
  );
}

function ApiArtwork({
  src,
  alt,
  className = "",
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className={`flex h-full w-full items-center justify-center bg-[var(--hood-fg)] p-3 text-center text-[8px] uppercase tracking-[0.12em] text-[var(--hood-bg)] ${className}`}
      >
        Artwork unavailable
      </div>
    );
  }

  return (
    <Image
      loader={passthroughImageLoader}
      unoptimized
      src={src}
      alt={alt}
      width={1024}
      height={1024}
      sizes="(max-width: 1024px) 100vw, 50vw"
      onError={() => setFailed(true)}
      className={`image-render-pixel h-full w-full object-cover ${className}`}
    />
  );
}

function Stat({
  label,
  value,
  detail,
  dark = false,
}: {
  label: string;
  value: string;
  detail?: string;
  dark?: boolean;
}) {
  return (
    <div
      className={`border p-4 ${
        dark
          ? "border-[var(--hood-fg)] bg-[var(--hood-fg)] text-[var(--hood-bg)]"
          : "border-[var(--hood-fg)] bg-[var(--hood-bg)] text-[var(--hood-fg)]"
      }`}
    >
      <p className="text-[8px] uppercase tracking-[0.16em] opacity-60">
        {label}
      </p>
      <p className="mt-3 text-2xl leading-none tracking-[-0.04em]">
        {value}
      </p>
      {detail && (
        <p className="mt-3 text-[9px] uppercase leading-relaxed tracking-[0.12em] opacity-65">
          {detail}
        </p>
      )}
    </div>
  );
}

function TraitCard({
  layer,
  trait,
}: {
  layer: TraitKey;
  trait: TraitDetail;
}) {
  const value = displayTraitValue(trait);
  const isSuppressed = trait.state === "suppressed-by-full-hood";

  return (
    <article className="flex min-h-[190px] flex-col justify-between border border-[var(--hood-fg)] p-4">
      <div>
        <p className="text-[8px] uppercase tracking-[0.16em] opacity-60">
          {layer}
        </p>

        <h3 className="mt-5 break-words text-xl leading-none tracking-[-0.03em] md:text-2xl">
          {value}
        </h3>
      </div>

      {isSuppressed ? (
        <p className="mt-6 text-[9px] uppercase leading-relaxed tracking-[0.12em] opacity-60">
          This layer is visually replaced by the full hood and is not scored
          twice.
        </p>
      ) : (
        <div className="mt-6 border-t border-[var(--hood-fg)] pt-4 text-sm leading-relaxed">
          <p>
            {trait.count?.toLocaleString() ?? "—"} in this neighborhood
          </p>
          <p className="mt-1 opacity-65">
            {formatPercent(trait.withinHoodiePercent)} of{" "}
            {trait.hoodieSupply?.toLocaleString() ?? "—"} Hoodies
          </p>

          {trait.tier && !isSuppressed && (
            <span className="mt-4 inline-block border border-[var(--hood-fg)] bg-[var(--hood-fg)] px-2 py-1 text-[8px] uppercase tracking-[0.12em] text-[var(--hood-bg)]">
              {trait.tier}
            </span>
          )}
        </div>
      )}
    </article>
  );
}


function openSeaTokenUrl(contract: string, tokenId: number) {
  return `https://opensea.io/item/robinhood/${contract}/${tokenId}`;
}

async function svgToPngDownload(
  svgUrl: string,
  tokenId: number,
  size = 2400,
) {
  const response = await fetch(svgUrl, { cache: "no-store" });

  if (!response.ok) {
    throw new Error("Unable to load the SVG for PNG export.");
  }

  const svgText = await response.text();
  const svgBlob = new Blob([svgText], {
    type: "image/svg+xml;charset=utf-8",
  });
  const objectUrl = URL.createObjectURL(svgBlob);

try {
  const image = new window.Image();
  image.decoding = "sync";

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () =>
      reject(new Error("Unable to render the Hoodie."));
    image.src = objectUrl;
  });

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas is unavailable.");
  }

  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, size, size);
  context.drawImage(image, 0, 0, size, size);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) resolve(result);
        else reject(new Error("Unable to create the PNG."));
      }, "image/png");
    });

    const downloadUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.download = `onchainhoodies-${tokenId}.png`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(downloadUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}


async function fetchOwnedTokenData(
  owned: OwnedHoodie[],
): Promise<TokenApiResponse[]> {
  const results: TokenApiResponse[] = [];
  const concurrency = 10;

  for (let index = 0; index < owned.length; index += concurrency) {
    const batch = owned.slice(index, index + concurrency);

    const settled = await Promise.allSettled(
      batch.map((hoodie) => fetchToken(hoodie.tokenId)),
    );

    for (const result of settled) {
      if (result.status === "fulfilled") {
        results.push(result.value);
      }
    }
  }

  return results;
}

function buildWalletProfile(tokens: TokenApiResponse[]): WalletProfile | null {
  if (tokens.length === 0) return null;

  const neighborhoodCounts: Record<string, number> = {};
  const traitCounts = new Map<string, number>();

  let totalRank = 0;
  let totalInk = 0;
  let bestRankToken: TokenApiResponse | null = null;
  let mostInkToken: TokenApiResponse | null = null;

  for (const token of tokens) {
    const hoodie = token.traits.hoodie;
    neighborhoodCounts[hoodie] = (neighborhoodCounts[hoodie] ?? 0) + 1;

    totalRank += token.rarity.collection.rank;
    totalInk += token.ink.blackPixels;

    if (
      !bestRankToken ||
      token.rarity.collection.rank <
        bestRankToken.rarity.collection.rank
    ) {
      bestRankToken = token;
    }

    if (
      !mostInkToken ||
      token.ink.blackPixels > mostInkToken.ink.blackPixels
    ) {
      mostInkToken = token;
    }

    for (const layer of traitKeys) {
      const value = token.traits[layer]?.value;
      if (!value) continue;

      const key = `${layer}:${value}`;
      traitCounts.set(key, (traitCounts.get(key) ?? 0) + 1);
    }
  }

  const favoriteNeighborhood =
    Object.entries(neighborhoodCounts).sort((left, right) => {
      if (right[1] !== left[1]) return right[1] - left[1];
      return left[0].localeCompare(right[0]);
    })[0]?.[0] ?? "Mixed";

  const favoriteTraitEntry = Array.from(traitCounts.entries()).sort(
    (left, right) => {
      if (right[1] !== left[1]) return right[1] - left[1];
      return left[0].localeCompare(right[0]);
    },
  )[0];

  let favoriteTrait: WalletProfile["favoriteTrait"] = null;

  if (favoriteTraitEntry) {
    const [layer, value] = favoriteTraitEntry[0].split(":");

    favoriteTrait = {
      layer: layer as TraitKey,
      value,
      count: favoriteTraitEntry[1],
    };
  }

  return {
    total: tokens.length,
    averageCollectionRank: Math.round(totalRank / tokens.length),
    averageInk: Math.round(totalInk / tokens.length),
    bestRankToken,
    mostInkToken,
    favoriteNeighborhood,
    favoriteTrait,
    neighborhoodCounts,
  };
}

export default function HoodieExplorerPage() {
  const { address, connect } = useWallet();

  const [ownedHoodies, setOwnedHoodies] = useState<OwnedHoodie[]>([]);
  const [selectedTokenId, setSelectedTokenId] = useState("");
  const [token, setToken] = useState<TokenApiResponse | null>(null);
  const [similarHoodies, setSimilarHoodies] = useState<SimilarHoodie[]>([]);

  const [ownershipLoading, setOwnershipLoading] = useState(false);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [ownershipChecked, setOwnershipChecked] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(true);

  const [error, setError] = useState<string | null>(null);
  const [ownershipNote, setOwnershipNote] = useState("");
  const [searchId, setSearchId] = useState("");
  const [downloadingPng, setDownloadingPng] = useState(false);
  const [darkHood, setDarkHood] = useState(false);
  const [walletProfile, setWalletProfile] = useState<WalletProfile | null>(null);
  const [walletProfileLoading, setWalletProfileLoading] = useState(false);

  const isHolder = ownedHoodies.length > 0;

  const loadOwnership = useCallback(async () => {
    if (!address) {
      setOwnedHoodies([]);
      setSelectedTokenId("");
      setToken(null);
      setSimilarHoodies([]);
      setOwnershipChecked(false);
      setOwnershipNote("");
      setError(null);
      return;
    }

    setOwnershipLoading(true);
    setOwnershipChecked(false);
    setOwnershipNote("");
    setError(null);

    try {
      const params = new URLSearchParams({ owner: address });
      const response = await fetch(`/api/hoodies?${params.toString()}`, {
        cache: "no-store",
      });
      const data = (await response.json()) as OwnershipResponse;

      if (!response.ok) {
        throw new Error(data.error || "Unable to read Hoodie ownership.");
      }

      const unique = normalizeOwnedHoodies(data.items || []);
      setOwnedHoodies(unique);

      setSelectedTokenId((current) => {
        if (unique.some((hoodie) => hoodie.tokenId === current)) {
          return current;
        }

        return unique[0]?.tokenId ?? "";
      });

      if (
        typeof data.indexedTotal === "number" &&
        data.indexedTotal !== unique.length
      ) {
        setOwnershipNote(
          `Alchemy reported ${data.indexedTotal} records; ${unique.length} unique Hoodies were loaded.`,
        );
      }
    } catch (loadError) {
      setOwnedHoodies([]);
      setSelectedTokenId("");
      setToken(null);
      setSimilarHoodies([]);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to read Hoodie ownership.",
      );
    } finally {
      setOwnershipLoading(false);
      setOwnershipChecked(true);
    }
  }, [address]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadOwnership();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadOwnership]);

  useEffect(() => {
    if (!isHolder) return;

    let active = true;

    async function loadWalletProfile() {
      setWalletProfileLoading(true);

      try {
        const tokenData = await fetchOwnedTokenData(ownedHoodies);

        if (active) {
          setWalletProfile(buildWalletProfile(tokenData));
        }
      } catch (profileError) {
        console.error(profileError);

        if (active) {
          setWalletProfile(null);
        }
      } finally {
        if (active) {
          setWalletProfileLoading(false);
        }
      }
    }

    void loadWalletProfile();

    return () => {
      active = false;
    };
  }, [isHolder, ownedHoodies]);

  useEffect(() => {
    if (!isHolder || !selectedTokenId) return;

    const controller = new AbortController();

    async function loadSelectedToken() {
      setTokenLoading(true);
      setSimilarLoading(false);
      setError(null);
      setSimilarHoodies([]);

      try {
        const nextToken = await fetchToken(
          selectedTokenId,
          controller.signal,
        );

        setToken(nextToken);
        setSimilarLoading(true);

        try {
          const similar = await fetchSimilarHoodies(
            nextToken,
            controller.signal,
          );
          setSimilarHoodies(similar);
        } catch (similarError) {
          if (
            similarError instanceof DOMException &&
            similarError.name === "AbortError"
          ) {
            return;
          }

          console.error(similarError);
          setSimilarHoodies([]);
        } finally {
          if (!controller.signal.aborted) {
            setSimilarLoading(false);
          }
        }
      } catch (loadError) {
        if (
          loadError instanceof DOMException &&
          loadError.name === "AbortError"
        ) {
          return;
        }

        setToken(null);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load this Hoodie.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setTokenLoading(false);
        }
      }
    }

    void loadSelectedToken();

    return () => controller.abort();
  }, [isHolder, selectedTokenId]);

  const jumpToToken = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const parsed = Number(searchId);

      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 5999) {
        setError("Enter a token ID between 0 and 5999.");
        return;
      }

      setError(null);
      setSelectedTokenId(String(parsed));
      setSearchId("");
    },
    [searchId],
  );

  const moveToken = useCallback(
    (direction: -1 | 1) => {
      if (!token) return;

      const nextId = Math.min(
        5999,
        Math.max(0, token.token.id + direction),
      );

      setSelectedTokenId(String(nextId));
    },
    [token],
  );

  const downloadPng = useCallback(async () => {
    if (!token || downloadingPng) return;

    setDownloadingPng(true);
    setError(null);

    try {
      await svgToPngDownload(
        absoluteApiUrl(
          token.image.svg,
          `${API_BASE}/images/${token.token.id}.svg`,
        ),
        token.token.id,
      );
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : "Unable to download the PNG.",
      );
    } finally {
      setDownloadingPng(false);
    }
  }, [downloadingPng, token]);

  return (
    <main
      className="min-h-screen bg-[var(--hood-bg)] text-[var(--hood-fg)]"
      style={
        {
          "--hood-bg": darkHood ? "#000000" : "#ccff00",
          "--hood-fg": darkHood ? "#ccff00" : "#000000",
        } as React.CSSProperties
      }
    >
      <SiteHeader />

      <section className="mx-auto max-w-[1500px] px-4 pb-20 pt-20 md:px-6 md:pt-24">
        <div className="section-heading-row border-[var(--hood-fg)]">
          <p>Build 03 / Holder access</p>
          <Link href="/">Back to the Hood</Link>
        </div>

        <div className="mt-6 grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="min-w-0 xl:sticky xl:top-20 xl:self-start">
            <p className="text-[9px] uppercase tracking-[0.18em]">
              Holder tool
            </p>

            <h1 className="mt-3 text-5xl leading-[0.86] tracking-[-0.06em] md:text-6xl">
              HOODIE
              <br />
              EXPLORER
            </h1>

            <p className="mt-4 max-w-md text-sm leading-relaxed opacity-75">
              Know your Hoodie. Explore its traits, Neighborhood Rarity and
              on-chain ink.
            </p>

            {address && isHolder && (
              <form
                onSubmit={jumpToToken}
                className="mt-6 border border-[var(--hood-fg)]"
              >
                <label
                  htmlFor="hoodie-id-search"
                  className="block border-b border-[var(--hood-fg)] px-3 py-2 text-[8px] uppercase tracking-[0.16em] opacity-60"
                >
                  Search ID
                </label>

                <div className="grid grid-cols-[1fr_auto]">
                  <input
                    id="hoodie-id-search"
                    type="number"
                    min="0"
                    max="5999"
                    inputMode="numeric"
                    value={searchId}
                    onChange={(event) => setSearchId(event.target.value)}
                    placeholder="0 — 5999"
                    className="min-w-0 bg-transparent px-3 py-3 text-sm outline-none placeholder:text-[var(--hood-fg)]/35"
                  />
                  <button
                    type="submit"
                    className="border-l border-[var(--hood-fg)] px-4 text-[9px] uppercase tracking-[0.14em]"
                  >
                    Go
                  </button>
                </div>
              </form>
            )}

            {!address ? (
              <div className="mt-6">
                <button
                  type="button"
                  onClick={connect}
                  className="pixel-cta w-full"
                >
                  Connect wallet
                </button>

                <div className="mt-3 border border-[var(--hood-fg)] p-4">
                  <p className="text-[8px] uppercase tracking-[0.16em] opacity-60">
                    Holder access
                  </p>
                  <p className="mt-3 text-sm leading-relaxed">
                    Own an OnChainHoodie to enter the Explorer.
                  </p>
                </div>
              </div>
            ) : ownershipLoading ? (
              <div className="mt-6 border border-[var(--hood-fg)] p-4 text-[9px] uppercase tracking-[0.14em]">
                Reading ownership
              </div>
            ) : ownershipChecked && !isHolder ? (
              <div className="mt-6 border border-[var(--hood-fg)]">
                <div className="bg-[var(--hood-fg)] p-5 text-[var(--hood-bg)]">
                  <p className="text-[8px] uppercase tracking-[0.16em] opacity-65">
                    Access locked
                  </p>
                  <h2 className="mt-4 text-3xl leading-none tracking-[-0.04em]">
                    You&apos;re not in the Hood yet.
                  </h2>
                  <p className="mt-4 text-sm leading-relaxed opacity-75">
                    The Hoodie Explorer is reserved for OnChainHoodies
                    holders.
                  </p>
                </div>

                <div className="grid grid-cols-2 border-t border-[var(--hood-fg)] text-[8px] uppercase tracking-[0.12em]">
                  {[
                    "Neighborhood Rank",
                    "Ink Rank",
                    "Trait Frequencies",
                    "Similar Hoodies",
                  ].map((item) => (
                    <div
                      key={item}
                      className="border-b border-r border-[var(--hood-fg)] p-3 even:border-r-0"
                    >
                      {item}
                    </div>
                  ))}
                </div>

                <a
                  href={siteConfig.openSeaUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="block border-t border-[var(--hood-fg)] px-4 py-3 text-center text-[9px] uppercase tracking-[0.14em] underline underline-offset-4"
                >
                  Get a Hoodie on OpenSea ↗
                </a>
              </div>
            ) : isHolder ? (
              <>
                <div className="mt-6 border border-[var(--hood-fg)]">
                  <button
                    type="button"
                    onClick={() => setPickerOpen((current) => !current)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left text-[10px] uppercase tracking-[0.13em]"
                  >
                    <span>
                      Your Hoodies / {ownedHoodies.length}
                    </span>
                    <span>{pickerOpen ? "−" : "+"}</span>
                  </button>

                  {pickerOpen && (
                    <div className="border-t border-[var(--hood-fg)]">
                      <div className="max-h-[390px] overflow-y-auto overscroll-contain">
                        {ownedHoodies.map((hoodie) => {
                          const isSelected =
                            hoodie.tokenId === selectedTokenId;

                          return (
                            <button
                              key={hoodie.tokenId}
                              type="button"
                              onClick={() => {
                                setSelectedTokenId(hoodie.tokenId);
                                setPickerOpen(false);
                              }}
                              className={`flex w-full items-center gap-2 border-b border-[var(--hood-fg)]/25 p-1.5 text-left last:border-b-0 ${
                                isSelected
                                  ? "bg-[var(--hood-fg)] text-[var(--hood-bg)]"
                                  : ""
                              }`}
                            >
                              <div className="h-10 w-10 shrink-0 overflow-hidden bg-[var(--hood-fg)]">
                                <OwnedArtwork hoodie={hoodie} />
                              </div>

                              <span className="min-w-0 flex-1 truncate text-[8px] uppercase tracking-[0.1em]">
                                {hoodie.name ||
                                  `OnChainHoodies #${hoodie.tokenId}`}
                              </span>

                              <span className="text-[9px]">
                                {isSelected ? "■" : "□"}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => void loadOwnership()}
                  disabled={ownershipLoading}
                  className="mt-2 w-full border border-[var(--hood-fg)] px-3 py-2.5 text-[9px] uppercase tracking-[0.13em] disabled:opacity-40"
                >
                  {ownershipLoading
                    ? "Loading ownership"
                    : "Refresh ownership"}
                </button>

              </>
            ) : null}

            {error && (
              <div className="mt-3 border border-[var(--hood-fg)] bg-[var(--hood-fg)] p-3 text-xs leading-relaxed text-[var(--hood-bg)]">
                {error}
              </div>
            )}

            {ownershipNote && !error && (
              <div className="mt-3 border border-[var(--hood-fg)] p-3 text-[9px] leading-relaxed opacity-65">
                {ownershipNote}
              </div>
            )}
          </aside>

          <div className="min-w-0">
            {!address ? (
              <div className="grid min-h-[680px] place-items-center border border-[var(--hood-fg)] p-6 text-center">
                <div className="max-w-xl">
                  <p className="text-[9px] uppercase tracking-[0.18em] opacity-60">
                    Private neighborhood data room
                  </p>
                  <h2 className="mt-6 text-5xl leading-[0.9] tracking-[-0.06em] md:text-7xl">
                    KNOW YOUR
                    <br />
                    HOODIE.
                  </h2>
                  <p className="mx-auto mt-6 max-w-md text-sm leading-relaxed opacity-75 md:text-base">
                    Connect the wallet holding your OnChainHoodies to unlock
                    trait context, Neighborhood Rarity, ink and nearby
                    Hoodies.
                  </p>
                  <button
                    type="button"
                    onClick={connect}
                    className="pixel-cta mt-8"
                  >
                    Connect wallet
                  </button>
                </div>
              </div>
            ) : ownershipLoading ? (
              <LoadingBlock label="Reading the Hood" />
            ) : ownershipChecked && !isHolder ? (
              <div className="grid min-h-[680px] place-items-center border border-[var(--hood-fg)] bg-[var(--hood-fg)] p-6 text-center text-[var(--hood-bg)]">
                <div className="max-w-xl">
                  <p className="text-[9px] uppercase tracking-[0.18em] opacity-60">
                    Holder access
                  </p>
                  <h2 className="mt-6 text-5xl leading-[0.9] tracking-[-0.06em] md:text-7xl">
                    GET IN
                    <br />
                    THE HOOD.
                  </h2>
                  <p className="mx-auto mt-6 max-w-md text-sm leading-relaxed opacity-75 md:text-base">
                    One Hoodie unlocks the full Explorer for every Hoodie in
                    your connected wallet.
                  </p>
                  <a
                    href={siteConfig.openSeaUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="pixel-cta mt-8 inline-block border-[#ccff00]"
                  >
                    View on OpenSea
                  </a>
                </div>
              </div>
            ) : tokenLoading || !token ? (
              <LoadingBlock label="Loading Hoodie data" />
            ) : (
              <div>
                <div className="mb-3 grid grid-cols-[auto_1fr_auto] border border-[var(--hood-fg)] text-[9px] uppercase tracking-[0.14em]">
                  <button
                    type="button"
                    onClick={() => moveToken(-1)}
                    disabled={token.token.id <= 0}
                    className="border-r border-[var(--hood-fg)] px-4 py-3 disabled:opacity-30"
                  >
                    ← Previous
                  </button>

                  <button
                    type="button"
                    onClick={() => setDarkHood((current) => !current)}
                    className="px-4 py-3 text-center"
                    aria-label="Swap the Hoodie Explorer color theme"
                  >
                    Walk in the Hood · {darkHood ? "Lights on" : "Lights off"}
                  </button>

                  <button
                    type="button"
                    onClick={() => moveToken(1)}
                    disabled={token.token.id >= 5999}
                    className="border-l border-[var(--hood-fg)] px-4 py-3 disabled:opacity-30"
                  >
                    Next →
                  </button>
                </div>

                <div className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(380px,1.05fr)]">
                  <div className="border border-[var(--hood-fg)] bg-[#ccff00]">
                    <div className="aspect-square overflow-hidden">
                      <ApiArtwork
                        src={absoluteApiUrl(
                          token.image.svg,
                          `${API_BASE}/images/${token.token.id}.svg`,
                        )}
                        alt={token.token.name}
                      />
                    </div>
                  </div>

                  <div className="flex min-w-0 flex-col">
                    <div className="border border-[var(--hood-fg)] p-5 md:p-7">
                      <p className="text-3xl uppercase leading-[0.9] tracking-[-0.05em] md:text-5xl">
                        {token.traits.hoodie}
                        <br />
                        Neighborhood
                      </p>

                      <h2 className="mt-8 text-4xl leading-none tracking-[-0.05em] md:text-6xl">
                        OCH #{token.token.id}
                      </h2>

                      <div className="mt-8 grid grid-cols-2 gap-2">
                        <Stat
                          label="Neighborhood Rank"
                          value={formatRank(
                            token.rarity.neighborhood.rank,
                            token.rarity.neighborhood.outOf,
                          )}
                          detail={`Top ${topPercent(
                            token.rarity.neighborhood.rarerThanPercent,
                          )} of ${token.traits.hoodie} Hoodies`}
                        />
                        <Stat
                          label="Collection Rank"
                          value={formatRank(
                            token.rarity.collection.rank,
                            token.rarity.collection.outOf,
                          )}
                          detail={`Top ${topPercent(
                            token.rarity.collection.rarerThanPercent,
                          )} of the Hood`}
                        />
                      </div>
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <Stat
                        label="Ink"
                        value={`${token.ink.blackPixels} black pixels`}
                        detail={`${Math.round(
                          token.ink.canvasCoveragePercent,
                        )}% coverage`}
                        dark
                      />
                      <Stat
                        label="Ink Rank"
                        value={formatRank(
                          token.ink.rank,
                          token.collection.supply,
                        )}
                        detail={`More ink than ${formatPercent(
                          token.ink.moreInkThanPercent,
                        )} of Hoodies`}
                        dark
                      />
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => void downloadPng()}
                        disabled={downloadingPng}
                        className="border border-[var(--hood-fg)] px-4 py-3 text-center text-[9px] uppercase tracking-[0.14em] underline underline-offset-4 disabled:opacity-40"
                      >
                        {downloadingPng ? "Creating PNG" : "Download PNG"}
                      </button>
                      <a
                        href={openSeaTokenUrl(
                          token.collection.contract,
                          token.token.id,
                        )}
                        target="_blank"
                        rel="noreferrer"
                        className="border border-[var(--hood-fg)] px-4 py-3 text-center text-[9px] uppercase tracking-[0.14em] underline underline-offset-4"
                      >
                        View on OpenSea ↗
                      </a>
                    </div>
                  </div>
                </div>

                <section className="mt-12">
                  <div className="section-heading-row border-[var(--hood-fg)]">
                    <p>Traits</p>
                    <p>Inside the {token.traits.hoodie} neighborhood</p>
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    {traitKeys.map((layer) => (
                      <TraitCard
                        key={layer}
                        layer={layer}
                        trait={token.traits[layer]}
                      />
                    ))}
                  </div>
                </section>

                <section className="mt-12">
                  <div className="section-heading-row border-[var(--hood-fg)]">
                    <p>Ink</p>
                    <p>On-chain pixel data</p>
                  </div>

                  <div className="mt-4 grid gap-2 md:grid-cols-[1fr_1fr_1.4fr]">
                    <Stat
                      label="Black pixels"
                      value={token.ink.blackPixels.toLocaleString()}
                      detail={`Out of ${token.ink.canvasPixels.toLocaleString()} canvas pixels`}
                    />
                    <Stat
                      label="Canvas coverage"
                      value={formatPercent(
                        token.ink.canvasCoveragePercent,
                      )}
                      detail="Final visible black pixels"
                    />

                    <div className="border border-[var(--hood-fg)] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[8px] uppercase tracking-[0.16em] opacity-60">
                          Ink position
                        </p>
                        <p className="text-[9px] uppercase tracking-[0.12em]">
                          Rank #{token.ink.rank}
                        </p>
                      </div>

                      <div className="mt-6 h-5 border border-[var(--hood-fg)] p-[2px]">
                        <div
                          className="h-full bg-[var(--hood-fg)]"
                          style={{
                            width: `${Math.max(
                              1,
                              Math.min(
                                100,
                                token.ink.moreInkThanPercent,
                              ),
                            )}%`,
                          }}
                        />
                      </div>

                      <p className="mt-4 text-[9px] uppercase leading-relaxed tracking-[0.12em] opacity-65">
                        More ink than{" "}
                        {formatPercent(token.ink.moreInkThanPercent)} of the
                        collection.
                      </p>
                    </div>
                  </div>
                </section>

                <section className="mt-12">
                  <div className="section-heading-row border-[var(--hood-fg)]">
                    <p>Wallet Inspect</p>
                    <p>The collector behind the Hoodies</p>
                  </div>

                  {walletProfileLoading ? (
                    <div className="mt-4">
                      <LoadingBlock label="Inspecting this wallet" />
                    </div>
                  ) : !walletProfile ? (
                    <div className="mt-4 border border-[var(--hood-fg)] p-5 text-[10px] uppercase tracking-[0.14em] opacity-65">
                      Wallet profile unavailable.
                    </div>
                  ) : null}

                  {walletProfile && (
                    <div className="mt-4 grid gap-2 md:grid-cols-[1.2fr_1fr]">
                      <div className="border border-[var(--hood-fg)] p-4">
                        <p className="text-[8px] uppercase tracking-[0.16em] opacity-60">
                          Neighborhood mix
                        </p>

                        <div className="mt-4 grid grid-cols-2 gap-2">
                          {["Builder", "Collector", "Flipper", "HODLer"].map(
                            (hoodie) => (
                              <div
                                key={hoodie}
                                className="flex items-center justify-between border border-[var(--hood-fg)] px-3 py-3 text-[9px] uppercase tracking-[0.12em]"
                              >
                                <span>{hoodie}</span>
                                <span>
                                  {walletProfile.neighborhoodCounts[hoodie] ?? 0}
                                </span>
                              </div>
                            ),
                          )}
                        </div>
                      </div>

                      <div className="border border-[var(--hood-fg)] p-4">
                        <p className="text-[8px] uppercase tracking-[0.16em] opacity-60">
                          Standout Hoodie
                        </p>

                        {walletProfile.bestRankToken ? (
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedTokenId(
                                String(walletProfile.bestRankToken?.token.id),
                              )
                            }
                            className="mt-4 flex w-full items-center gap-3 text-left"
                          >
                            <div className="h-20 w-20 shrink-0 overflow-hidden border border-[var(--hood-fg)] bg-[#ccff00]">
                              <ApiArtwork
                                src={absoluteApiUrl(
                                  walletProfile.bestRankToken.image.svg,
                                  `${API_BASE}/images/${walletProfile.bestRankToken.token.id}.svg`,
                                )}
                                alt={walletProfile.bestRankToken.token.name}
                              />
                            </div>

                            <div className="min-w-0">
                              <p className="text-2xl leading-none tracking-[-0.04em]">
                                OCH #{walletProfile.bestRankToken.token.id}
                              </p>
                              <p className="mt-2 text-[9px] uppercase tracking-[0.12em] opacity-65">
                                Collection rank #
                                {walletProfile.bestRankToken.rarity.collection.rank.toLocaleString()}
                              </p>
                            </div>
                          </button>
                        ) : (
                          <p className="mt-4 text-sm opacity-65">
                            No standout Hoodie found.
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </section>

                <section className="mt-12">
                  <div className="section-heading-row border-[var(--hood-fg)]">
                    <p>Nearby in the Hood</p>
                    <p>Shared traits + closest ink</p>
                  </div>

                  {similarLoading ? (
                    <div className="mt-4">
                      <LoadingBlock label="Finding nearby Hoodies" />
                    </div>
                  ) : similarHoodies.length === 0 ? (
                    <div className="mt-4 border border-[var(--hood-fg)] p-5 text-[10px] uppercase tracking-[0.14em] opacity-65">
                      No nearby Hoodies found.
                    </div>
                  ) : (
                    <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
                      {similarHoodies.map((hoodie) => (
                        <button
                          key={hoodie.tokenId}
                          type="button"
                          onClick={() => {
                            setSelectedTokenId(String(hoodie.tokenId));
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                          className="border border-[var(--hood-fg)] text-left"
                        >
                          <div className="aspect-square overflow-hidden bg-[var(--hood-fg)]">
                            <ApiArtwork
                              src={absoluteApiUrl(
                                hoodie.image,
                                `${API_BASE}/images/${hoodie.tokenId}.svg`,
                              )}
                              alt={hoodie.name}
                            />
                          </div>

                          <div className="border-t border-[var(--hood-fg)] p-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate text-[9px] uppercase tracking-[0.12em]">
                                #{hoodie.tokenId}
                              </p>
                              <p className="text-[8px] uppercase tracking-[0.1em] opacity-60">
                                {hoodie.sharedTraits} shared
                              </p>
                            </div>

                            <div className="mt-3 grid grid-cols-2 gap-2 text-[8px] uppercase leading-relaxed tracking-[0.1em] opacity-65">
                              <p>
                                Rank #{hoodie.rarity.neighborhood.rank}
                              </p>
                              <p className="text-right">
                                {hoodie.inkDifference === 0
                                  ? "Same ink"
                                  : `±${hoodie.inkDifference} ink`}
                              </p>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </section>

              </div>
            )}
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}