"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { BrowserProvider, Contract } from "ethers";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";
import HoodieSpeakButton from "../../components/HoodieSpeakButton";
import { useWallet } from "../../components/WalletProvider";
import { siteConfig } from "../../lib/config";
import { apiConfig, collectionApiUrl } from "../../lib/api";
import {
  HOOD_TALK_REGISTRY_ABI,
  ROBINHOOD_TESTNET_EXPLORER_URL,
} from "../../lib/hoodTalkRegistry";

const BRAND_URL = "ONCHAINHOODIES.XYZ";

const ROBINHOOD_MAINNET_EXPLORER_URL =
  "https://robinhoodchain.blockscout.com";




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
  error?: string;
};

type TraitDetail = {
  value: string | null;
  state?: "present" | "none" | "suppressed-by-full-hood";
};

type TokenApiResponse = {
  collection: {
    name: string;
    contract: string;
  };
  token: {
    id: number;
    name: string;
  };
  image: {
    svg: string;
  };
  traits: {
    hoodie: string;
    dress: TraitDetail;
    mouth: TraitDetail;
    top: TraitDetail;
    eyes: TraitDetail;
  };
};

type RegistryTalk = {
  quote: string;
  author: string;
  updatedAt: number;
  count: number;
  nextUpdateAt: number;
};

type HoodTalkAuthorization = {
  deadline: string;
  signature: string;
  nextCount: number;
};

type HoodTalkResponse = {
  quote?: string;
  angle?: string;
  authorization?: HoodTalkAuthorization;
  registry?: RegistryTalk;
  error?: string;
};

type RegistryResponse = {
  registry?: RegistryTalk;
  error?: string;
};

type HoodTalkView = "talk" | "feed" | "leaderboard";

type IndexedTalk = {
  sequence: number;
  tokenId: number;
  count: number;
  quote: string;
  author: string;
  updatedAt: number;
  transactionHash: string;
  blockNumber: number;
  logIndex: number;
  image: string;
  token: string;
};

type HoodTalkStats = {
  updatedAt?: string | null;
  totalTalks: number;
  uniqueHoodiesSpoken: number;
  indexedTalks: number;
};

type FeedResponse = {
  updatedAt: string | null;
  total: number;
  limit: number;
  nextBefore: number | null;
  talks: IndexedTalk[];
};

type LeaderboardEntry = {
  rank: number;
  tokenId: number;
  count: number;
  latestQuote: string;
  lastSpokenAt: number;
  transactionHash: string;
  image: string;
  token: string;
};

type LeaderboardResponse = {
  updatedAt: string | null;
  total: number;
  limit: number;
  entries: LeaderboardEntry[];
};

type TokenHistoryResponse = {
  schemaVersion?: string;
  tokenId: number;
  total: number;
  talks: IndexedTalk[];
};

function tokenArtworkFallback(tokenId: string | number) {
  if (apiConfig.isMainnet) {
    return collectionApiUrl(
      `/images/${encodeURIComponent(String(tokenId))}.svg`,
    );
  }

  return `/api/hoodies/image?tokenId=${encodeURIComponent(String(tokenId))}`;
}

function absoluteApiUrl(value: string | undefined, fallback: string) {
  if (!value) return fallback;

  if (
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("data:") ||
    value.startsWith("blob:")
  ) {
    return value;
  }

  if (apiConfig.isMainnet) {
    return collectionApiUrl(value.startsWith("/") ? value : `/${value}`);
  }

  return value.startsWith("/") ? value : fallback;
}

function publicApiUrl(path: string) {
  return collectionApiUrl(path);
}

function openSeaTokenUrl(tokenId: string | number) {
  return `https://opensea.io/assets/robinhood/${siteConfig.collectionAddress}/${tokenId}`;
}

function formatTalkDate(timestamp: number) {
  if (!timestamp) return "—";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp * 1000));
}

function formatRelativeTime(timestamp: number, now: number) {
  if (!timestamp) return "—";
  const difference = Math.max(0, now - timestamp);
  if (difference < 60) return "JUST NOW";
  if (difference < 3600) return `${Math.floor(difference / 60)}M AGO`;
  if (difference < 86400) return `${Math.floor(difference / 3600)}H AGO`;
  return `${Math.floor(difference / 86400)}D AGO`;
}

function formatStat(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: value >= 10000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatCountdown(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  return `${String(hours).padStart(2, "0")}H ${String(minutes).padStart(
    2,
    "0",
  )}M ${String(remainingSeconds).padStart(2, "0")}S`;
}


function formatArchetype(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "hodler") return "HODLER";
  if (normalized === "builder") return "BUILDER";
  if (normalized === "collector") return "COLLECTOR";
  if (normalized === "flipper") return "FLIPPER";
  if (!normalized || normalized === "unknown") return "HOODIE";
  return value.trim().toUpperCase();
}

function normalizeOwnedHoodies(items: OwnedHoodie[]) {
  return Array.from(
    new Map(items.map((item) => [String(item.tokenId), item])).values(),
  ).sort((left, right) => Number(left.tokenId) - Number(right.tokenId));
}


async function fetchToken(tokenId: string, signal?: AbortSignal) {
  const url = apiConfig.isMainnet
    ? collectionApiUrl(`/v1/token/${encodeURIComponent(tokenId)}`)
    : `/api/hoodies/token?${new URLSearchParams({ tokenId }).toString()}`;

  const response = await fetch(url, { cache: "no-store", signal });
  const data = (await response.json()) as TokenApiResponse & { error?: string };

  if (!response.ok) {
    throw new Error(data.error || `Unable to load Hoodie #${tokenId}.`);
  }

  return data;
}

async function artworkToPngDataUrl(svgUrl: string, size = 1024) {
  const response = await fetch(svgUrl, { cache: "no-store" });
  if (!response.ok) throw new Error("Unable to load Hoodie artwork.");

  const svg = await response.text();
  const blobUrl = URL.createObjectURL(
    new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
  );

  try {
    const artwork = new window.Image();
    artwork.decoding = "sync";

    await new Promise<void>((resolve, reject) => {
      artwork.onload = () => resolve();
      artwork.onerror = () =>
        reject(new Error("Unable to render Hoodie artwork."));
      artwork.src = blobUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable.");

    context.imageSmoothingEnabled = false;
    context.fillStyle = "#ccff00";
    context.fillRect(0, 0, size, size);
    context.drawImage(artwork, 0, 0, size, size);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
) {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (context.measureText(next).width <= maxWidth || !line) {
      line = next;
    } else {
      lines.push(line);
      line = word;
    }
  }

  if (line) lines.push(line);
  return lines;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type FallbackImageProps = {
  preferred: string;
  fallback: string;
  alt: string;
  width: number;
  height: number;
  sizes: string;
  className: string;
  priority?: boolean;
};

function FallbackImage({
  preferred,
  fallback,
  alt,
  width,
  height,
  sizes,
  className,
  priority = false,
}: FallbackImageProps) {
  const [src, setSrc] = useState(preferred);

  return (
    <Image
      loader={passthroughImageLoader}
      unoptimized
      src={src}
      alt={alt}
      width={width}
      height={height}
      sizes={sizes}
      onError={() => {
        if (src !== fallback) setSrc(fallback);
      }}
      className={className}
      priority={priority}
    />
  );
}

function OwnedArtwork({ hoodie }: { hoodie: OwnedHoodie }) {
  const fallback = tokenArtworkFallback(hoodie.tokenId);
  const preferred = absoluteApiUrl(hoodie.image, fallback);

  return (
    <FallbackImage
      key={preferred}
      preferred={preferred}
      fallback={fallback}
      alt={hoodie.name || `OnChainHoodies #${hoodie.tokenId}`}
      width={96}
      height={96}
      sizes="48px"
      className="image-render-pixel h-full w-full object-cover"
    />
  );
}

function HoodieArtwork({
  token,
  priority = false,
}: {
  token: TokenApiResponse;
  priority?: boolean;
}) {
  const fallback = tokenArtworkFallback(token.token.id);
  const preferred = absoluteApiUrl(token.image.svg, fallback);

  return (
    <FallbackImage
      key={preferred}
      preferred={preferred}
      fallback={fallback}
      alt={token.token.name}
      width={1200}
      height={1200}
      sizes="(max-width: 1024px) 100vw, 50vw"
      className="image-render-pixel block h-full w-full object-contain"
      priority={priority}
    />
  );
}


type HistoryListProps = {
  history: TokenHistoryResponse | null;
  loading: boolean;
  explorerUrl: string;
  compact?: boolean;
};

function HistoryList({
  history,
  loading,
  explorerUrl,
  compact = false,
}: HistoryListProps) {
  return (
    <div className="border-l border-t border-[var(--hood-fg)]">
      {loading ? (
        <div className="border-b border-r border-[var(--hood-fg)] p-6 text-[9px] uppercase tracking-[0.16em] opacity-60">
          Reading permanent history
        </div>
      ) : history?.talks?.length ? (
        [...history.talks].reverse().map((talk) => (
          <article
            key={`${talk.transactionHash}-${talk.logIndex}`}
            className={`grid border-b border-r border-[var(--hood-fg)] ${
              compact
                ? "grid-cols-[58px_minmax(0,1fr)]"
                : "md:grid-cols-[80px_minmax(0,1fr)_190px]"
            }`}
          >
            <div className="border-r border-[var(--hood-fg)] p-4 text-lg">
              #{String(talk.count).padStart(2, "0")}
            </div>

            <div className="min-w-0 p-4">
              <p className="text-sm uppercase leading-relaxed tracking-[0.06em]">
                “{talk.quote.replace(/^[“\"]|[”\"]$/g, "")}”
              </p>
              <p className="mt-3 text-[7px] uppercase tracking-[0.12em] opacity-55 md:hidden">
                {formatTalkDate(talk.updatedAt)}
              </p>
            </div>

            {!compact ? (
              <div className="hidden border-l border-[var(--hood-fg)] p-4 md:block">
                <p className="text-[8px] uppercase tracking-[0.12em] opacity-60">
                  {formatTalkDate(talk.updatedAt)}
                </p>
                <a
                  href={`${explorerUrl}/tx/${talk.transactionHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-block text-[8px] uppercase tracking-[0.12em] underline underline-offset-4"
                >
                  Transaction ↗
                </a>
              </div>
            ) : null}
          </article>
        ))
      ) : (
        <div className="border-b border-r border-[var(--hood-fg)] p-6 text-[9px] uppercase tracking-[0.16em] opacity-60">
          No indexed Hood Talks yet
        </div>
      )}
    </div>
  );
}

export default function HoodTalkPage() {
  const { address,connect,ensureRequiredNetwork, getWalletClient } = useWallet();
  const [ownedHoodies, setOwnedHoodies] = useState<OwnedHoodie[]>([]);
  const [selectedTokenId, setSelectedTokenId] = useState("");
  const [token, setToken] = useState<TokenApiResponse | null>(null);
  const [quote, setQuote] = useState("");
  const [registryTalk, setRegistryTalk] = useState<RegistryTalk | null>(null);
  const [authorization, setAuthorization] = useState<HoodTalkAuthorization | null>(null);
  const [committing, setCommitting] = useState(false);
  const [transactionHash, setTransactionHash] = useState<string | null>(null);
  const [ownershipLoading, setOwnershipLoading] = useState(false);
  const [ownershipChecked, setOwnershipChecked] = useState(false);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [talkLoading, setTalkLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [clockNow, setClockNow] = useState(() => Math.floor(Date.now() / 1000));
  const [pickerOpen, setPickerOpen] = useState(true);
  const [darkHood, setDarkHood] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<HoodTalkView>("talk");
  const [stats, setStats] = useState<HoodTalkStats | null>(null);
  const [feed, setFeed] = useState<IndexedTalk[]>([]);
  const [feedNextBefore, setFeedNextBefore] = useState<number | null>(null);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedLoadingMore, setFeedLoadingMore] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [selectedHistory, setSelectedHistory] = useState<TokenHistoryResponse | null>(null);
  const [selectedHistoryLoading, setSelectedHistoryLoading] = useState(false);
  const [detailTokenId, setDetailTokenId] = useState<number | null>(null);
  const [detailHistory, setDetailHistory] = useState<TokenHistoryResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const generationRef = useRef(0);

const activeExplorerUrl = apiConfig.isMainnet
  ? ROBINHOOD_MAINNET_EXPLORER_URL
  : ROBINHOOD_TESTNET_EXPLORER_URL;

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setClockNow(Math.floor(Date.now() / 1000));
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  const isHolder = ownedHoodies.length > 0;

  const loadOwnership = useCallback(async (signal?: AbortSignal) => {
    generationRef.current += 1;

    setRegistryTalk(null);
    setAuthorization(null);
    setTransactionHash(null);

    if (!address) {
      setOwnedHoodies([]);
      setSelectedTokenId("");
      setToken(null);
      setQuote("");
      setRegistryTalk(null);
      setAuthorization(null);
      setTransactionHash(null);
      setOwnershipChecked(false);
      return;
    }

    setOwnershipLoading(true);
    setOwnershipChecked(false);
    setError(null);

    try {
      const response = await fetch(
        `/api/hoodies?${new URLSearchParams({
          owner: address,
          network: apiConfig.isMainnet ? "mainnet" : "testnet",
        }).toString()}`,
        { cache: "no-store", signal },
      );
      const data = (await response.json()) as OwnershipResponse;
      if (!response.ok)
        throw new Error(data.error || "Unable to read ownership.");

      const hoodies = normalizeOwnedHoodies(data.items || []);
      setOwnedHoodies(hoodies);
      setSelectedTokenId((current) =>
        hoodies.some((hoodie) => hoodie.tokenId === current)
          ? current
          : hoodies[0]?.tokenId || "",
      );
    } catch (ownershipError) {
      if (
        ownershipError instanceof DOMException &&
        ownershipError.name === "AbortError"
      ) {
        return;
      }

      setOwnedHoodies([]);
      setSelectedTokenId("");
      setToken(null);
      setQuote("");
      setRegistryTalk(null);
      setAuthorization(null);
      setTransactionHash(null);
      setError(
        ownershipError instanceof Error
          ? ownershipError.message
          : "Unable to read ownership.",
      );
    } finally {
      if (!signal?.aborted) {
        setOwnershipLoading(false);
        setOwnershipChecked(true);
      }
    }
  }, [address]);

  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      void loadOwnership(controller.signal);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [loadOwnership]);

  const loadRegistry = useCallback(async (tokenId: number) => {
    const response = await fetch(
      `/api/hood-talk?${new URLSearchParams({ tokenId: String(tokenId) }).toString()}`,
      { cache: "no-store" },
    );
    const data = (await response.json()) as RegistryResponse;
    if (!response.ok || !data.registry) {
      throw new Error(data.error || "Unable to read the Hood Talk registry.");
    }

    setRegistryTalk(data.registry);
    setQuote(data.registry.quote || "");
    setAuthorization(null);
    setTransactionHash(null);
    return data.registry;
  }, []);

  const generateTalk = useCallback(
    async (nextToken: TokenApiResponse) => {
      if (!address) return;

      const generation = ++generationRef.current;
      setTalkLoading(true);
      setError(null);
      setAuthorization(null);
      setTransactionHash(null);

      try {
        const tokenId = nextToken.token.id;
        const artworkUrl = absoluteApiUrl(
          nextToken.image.svg,
          tokenArtworkFallback(tokenId),
        );
        const imageDataUrl = await artworkToPngDataUrl(artworkUrl, 1024);

        if (imageDataUrl.length > 2_900_000) {
          throw new Error("Hoodie artwork is too large to analyze safely.");
        }

        const response = await fetch("/api/hood-talk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            tokenId,
            imageDataUrl,
            walletAddress: address,
          }),
        });

        const data = (await response.json()) as HoodTalkResponse;

        if (!response.ok || !data.quote) {
          throw new Error(data.error || "Your Hoodie stayed quiet.");
        }

        if (generation === generationRef.current) {
          setQuote(data.quote);
          setAuthorization(data.authorization || null);
          if (data.registry) setRegistryTalk(data.registry);
        }
      } catch (talkError) {
        if (generation === generationRef.current) {
          setQuote(registryTalk?.quote || "");
          setAuthorization(null);
          setError(
            talkError instanceof Error
              ? talkError.message
              : "Your Hoodie stayed quiet.",
          );
        }
      } finally {
        if (generation === generationRef.current) setTalkLoading(false);
      }
    },
    [address, registryTalk?.quote],
  );

  useEffect(() => {
    if (!isHolder || !selectedTokenId) return;

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      setTokenLoading(true);
      setQuote("");
      setError(null);

      void fetchToken(selectedTokenId, controller.signal)
        .then((nextToken) => {
          if (controller.signal.aborted) return;
          setToken(nextToken);
          return loadRegistry(nextToken.token.id);
        })
        .catch((tokenError) => {
          if (
            tokenError instanceof DOMException &&
            tokenError.name === "AbortError"
          ) {
            return;
          }

          if (controller.signal.aborted) return;

          setToken(null);
          setError(
            tokenError instanceof Error
              ? tokenError.message
              : "Unable to load this Hoodie.",
          );
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setTokenLoading(false);
          }
        });
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [isHolder, loadRegistry, selectedTokenId]);


  const loadStats = useCallback(async () => {
    try {
      const response = await fetch(publicApiUrl("/v1/hood-talks/stats"), {
        cache: "no-store",
      });
      const data = (await response.json()) as HoodTalkStats & { error?: string };
      if (!response.ok) throw new Error(data.error || "Unable to load Hood Talk stats.");
      setStats(data);
    } catch {
      setStats(null);
    }
  }, []);

  const loadFeed = useCallback(async (before?: number, append = false) => {
    if (append) {
      setFeedLoadingMore(true);
    } else {
      setFeedLoading(true);
    }
    try {
      const parameters = new URLSearchParams({ limit: "20" });
      if (before) parameters.set("before", String(before));
      const response = await fetch(
        publicApiUrl(`/v1/hood-talks?${parameters.toString()}`),
        { cache: "no-store" },
      );
      const data = (await response.json()) as FeedResponse & { error?: string };
      if (!response.ok) throw new Error(data.error || "Unable to load the live feed.");
      setFeed((current) => append ? [...current, ...(data.talks || [])] : data.talks || []);
      setFeedNextBefore(data.nextBefore ?? null);
    } catch (feedError) {
      if (!append) setFeed([]);
      setError(feedError instanceof Error ? feedError.message : "Unable to load the live feed.");
    } finally {
      setFeedLoading(false);
      setFeedLoadingMore(false);
    }
  }, []);

  const loadLeaderboard = useCallback(async () => {
    setLeaderboardLoading(true);
    try {
      const response = await fetch(
        publicApiUrl("/v1/hood-talks/leaderboard?limit=100"),
        { cache: "no-store" },
      );
      const data = (await response.json()) as LeaderboardResponse & { error?: string };
      if (!response.ok) throw new Error(data.error || "Unable to load the leaderboard.");
      setLeaderboard(data.entries || []);
    } catch (leaderboardError) {
      setLeaderboard([]);
      setError(leaderboardError instanceof Error ? leaderboardError.message : "Unable to load the leaderboard.");
    } finally {
      setLeaderboardLoading(false);
    }
  }, []);

  const fetchHistory = useCallback(async (tokenId: string | number) => {
    const response = await fetch(
      publicApiUrl(`/v1/token/${encodeURIComponent(String(tokenId))}/hood-talk/history`),
      { cache: "no-store" },
    );
    const data = (await response.json()) as TokenHistoryResponse & { error?: string };
    if (!response.ok) throw new Error(data.error || `Unable to load Hoodie #${tokenId} history.`);
    return data;
  }, []);

  const openHistory = useCallback(async (tokenId: number) => {
    setDetailTokenId(tokenId);
    setDetailHistory(null);
    setDetailLoading(true);
    setError(null);
    try {
      setDetailHistory(await fetchHistory(tokenId));
    } catch (historyError) {
      setError(historyError instanceof Error ? historyError.message : "Unable to load Hoodie history.");
    } finally {
      setDetailLoading(false);
    }
  }, [fetchHistory]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadStats();
      void loadFeed();
      void loadLeaderboard();
    });
  }, [loadFeed, loadLeaderboard, loadStats]);

  useEffect(() => {
    if (view !== "leaderboard") return;
    queueMicrotask(() => void loadLeaderboard());
  }, [loadLeaderboard, view]);

  useEffect(() => {
    let active = true;

    queueMicrotask(() => {
      if (!active) return;

      if (!selectedTokenId) {
        setSelectedHistory(null);
        setSelectedHistoryLoading(false);
        return;
      }

      setSelectedHistoryLoading(true);

      void fetchHistory(selectedTokenId)
        .then((history) => {
          if (active) setSelectedHistory(history);
        })
        .catch(() => {
          if (active) setSelectedHistory(null);
        })
        .finally(() => {
          if (active) setSelectedHistoryLoading(false);
        });
    });

    return () => {
      active = false;
    };
  }, [fetchHistory, selectedTokenId]);

  const commitHoodTalk = useCallback(async () => {
  if (!token || !quote || !authorization || committing) return;

  setCommitting(true);
  setError(null);

  try {
    await ensureRequiredNetwork();

    const walletClient = await getWalletClient();

    const registryAddress = apiConfig.isMainnet
      ? process.env.NEXT_PUBLIC_HOOD_TALK_REGISTRY_MAINNET_ADDRESS
      : process.env.NEXT_PUBLIC_HOOD_TALK_REGISTRY_TESTNET_ADDRESS;

    if (!registryAddress) {
      throw new Error(
        apiConfig.isMainnet
          ? "NEXT_PUBLIC_HOOD_TALK_REGISTRY_MAINNET_ADDRESS is not configured."
          : "NEXT_PUBLIC_HOOD_TALK_REGISTRY_TESTNET_ADDRESS is not configured.",
      );
    }

    const provider = new BrowserProvider(
      walletClient.transport as ConstructorParameters<
        typeof BrowserProvider
      >[0],
    );

    const signer = await provider.getSigner();
    const signerAddress = await signer.getAddress();

    if (
      !address ||
      signerAddress.toLowerCase() !== address.toLowerCase()
    ) {
      throw new Error(
        "The active wallet does not match the connected holder wallet.",
      );
    }

    const registry = new Contract(
      registryAddress,
      HOOD_TALK_REGISTRY_ABI,
      signer,
    );

    const transaction = await registry.setHoodTalk(
      BigInt(token.token.id),
      quote,
      BigInt(authorization.deadline),
      authorization.signature,
    );

    await transaction.wait();
    await loadRegistry(token.token.id);

    setTransactionHash(transaction.hash);
  } catch (commitError) {
    setError(
      commitError instanceof Error
        ? commitError.message
        : "Unable to set this Hood Talk on-chain.",
    );
  } finally {
    setCommitting(false);
  }
}, [
  address,
  authorization,
  committing,
  ensureRequiredNetwork,
  getWalletClient,
  loadRegistry,
  quote,
  token,
]);

const exportCard = useCallback(async () => {
  if (!token || !quote || exporting) return;

  setExporting(true);
  setError(null);

  try {
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }

    const width = 2400;
    const height = 1200;
    const artSize = 1200;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas is unavailable.");
    }

    const exportBackground = darkHood ? "#000000" : "#ccff00";
    const exportForeground = darkHood ? "#ccff00" : "#000000";

    context.imageSmoothingEnabled = false;

    // Card background only.
    context.fillStyle = exportBackground;
    context.fillRect(0, 0, width, height);

    // Load and draw the original Hoodie artwork without changing its colors.
    const artworkUrl = absoluteApiUrl(
      token.image.svg,
      tokenArtworkFallback(token.token.id),
    );

    const response = await fetch(artworkUrl, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("Unable to load Hoodie artwork.");
    }

    const svg = await response.text();

    const blobUrl = URL.createObjectURL(
      new Blob([svg], {
        type: "image/svg+xml;charset=utf-8",
      }),
    );

    try {
      const artwork = new window.Image();
      artwork.decoding = "sync";

      await new Promise<void>((resolve, reject) => {
        artwork.onload = () => resolve();
        artwork.onerror = () =>
          reject(new Error("Unable to render Hoodie."));
        artwork.src = blobUrl;
      });

      context.drawImage(artwork, 0, 0, artSize, artSize);
    } finally {
      URL.revokeObjectURL(blobUrl);
    }

    // Quote.
    context.fillStyle = exportForeground;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = "92px DepartureMono, monospace";

    const cleanQuote = quote.replace(/^[“"]|[”"]$/g, "").trim();
    const lines = wrapText(context, `“${cleanQuote}”`, 760);
    const lineHeight = 122;
    const startY =
      height / 2 - ((lines.length - 1) * lineHeight) / 2;

    lines.forEach((line, index) => {
      context.fillText(
        line.toUpperCase(),
        1800,
        startY + index * lineHeight,
      );
    });

    // Archetype and token ID.
    context.textAlign = "left";
    context.textBaseline = "middle";
    context.font = "30px DepartureMono, monospace";

    context.fillText(
      `${formatArchetype(token.traits.hoodie)} / #${String(
        token.token.id,
      ).padStart(4, "0")}`,
      1240,
      64,
    );

    // Hood Talk count.
    context.font = "28px DepartureMono, monospace";

    context.fillText(
      `HOOD TALK #${
        authorization?.nextCount ?? registryTalk?.count ?? 0
      }`,
      1240,
      height - 56,
    );

    // Brand.
    context.textAlign = "right";
    context.font = "20px DepartureMono, monospace";

    context.fillText(
      BRAND_URL.toLowerCase(),
      width - 80,
      height - 56,
    );

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) {
          resolve(result);
        } else {
          reject(new Error("Unable to export the card."));
        }
      }, "image/png");
    });

    downloadBlob(
      blob,
      `onchainhoodies-${token.token.id}-hood-talk${
        darkHood ? "-dark" : ""
      }.png`,
    );
  } catch (exportError) {
    setError(
      exportError instanceof Error
        ? exportError.message
        : "Unable to export card.",
    );
  } finally {
    setExporting(false);
  }
}, [
  authorization,
  darkHood,
  exporting,
  quote,
  registryTalk,
  token,
]);

  const cooldownSeconds = Math.max(
    0,
    (registryTalk?.nextUpdateAt || 0) - clockNow,
  );
  const cooldownActive = cooldownSeconds > 0;
  const isPreview = Boolean(authorization);

  const mostActive = leaderboard[0] || null;
  const latestTalk = feed[0] || null;



  return (
    <main
      className="min-h-screen bg-[var(--hood-bg)] text-[var(--hood-fg)]"
      style={
        {
          "--hood-bg": darkHood ? "#000000" : "#ccff00",
          "--hood-fg": darkHood ? "#ccff00" : "#000000",
        } as CSSProperties
      }
    >
      <SiteHeader />

      <section className="mx-auto max-w-[1700px] px-4 pb-16 pt-20 md:px-6 md:pt-24">
        <div className="section-heading-row border-[var(--hood-fg)]">
          <p>Build 04 / Permanent voices</p>
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => setDarkHood((current) => !current)} className="uppercase">
              {darkHood ? "Lights on" : "Lights off"}
            </button>
            <Link href="/">Back to the Hood</Link>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-6 border-b-2 border-[var(--hood-fg)] pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[9px] uppercase tracking-[0.18em] opacity-60">Every Hoodie has a permanent voice</p>
            <h1 className="mt-4 text-[clamp(3.5rem,9vw,8rem)] leading-[0.8] tracking-[-0.075em]">
              HOOD<br />TALK.
            </h1>
          </div>
          <div className="flex flex-wrap border-2 border-[var(--hood-fg)]">
            {([[
              "talk", "Hood Talk"
            ], ["feed", "Live Feed"], ["leaderboard", "Leaderboard"]] as const).map(([item, label]) => (
              <button
                key={item}
                type="button"
                onClick={() => setView(item)}
                className={`border-r-2 border-[var(--hood-fg)] px-4 py-3 text-[9px] uppercase tracking-[0.14em] last:border-r-0 sm:px-6 ${view === item ? "bg-[var(--hood-fg)] text-[var(--hood-bg)]" : ""}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <section className="mt-5 grid border-l-2 border-t-2 border-[var(--hood-fg)] sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Total Hood Talks", stats?.totalTalks],
            ["Hoodies Spoken", stats?.uniqueHoodiesSpoken],
            ["Most Active", mostActive ? `#${mostActive.tokenId} / ${mostActive.count}` : null],
            ["Latest Talk", latestTalk ? formatRelativeTime(latestTalk.updatedAt, clockNow) : null],
          ].map(([label, value]) => (
            <div key={String(label)} className="border-b-2 border-r-2 border-[var(--hood-fg)] p-4 sm:p-5">
              <p className="text-[8px] uppercase tracking-[0.16em] opacity-55">{label}</p>
              <p className="mt-3 text-3xl leading-none tracking-[-0.04em] md:text-4xl">
                {typeof value === "number" ? formatStat(value) : value || "—"}
              </p>
            </div>
          ))}
        </section>

        {view === "talk" ? (
          !address ? (
            <div className="mt-8 grid min-h-[58vh] place-items-center border border-[var(--hood-fg)] p-6 text-center">
              <div className="max-w-2xl">
                <p className="text-[9px] uppercase tracking-[0.18em] opacity-60">Holder tool</p>
                <h2 className="mt-6 text-5xl leading-[0.86] tracking-[-0.07em] md:text-7xl">LET YOUR<br />HOODIE TALK.</h2>
                <p className="mx-auto mt-6 max-w-md text-sm leading-relaxed opacity-70">Connect the wallet holding your OnChainHoodies. The Live Feed and Leaderboard remain public.</p>
                <button type="button" onClick={connect} className="pixel-cta mt-8">Connect wallet</button>
              </div>
            </div>
          ) : ownershipLoading ? (
            <div className="mt-8 grid min-h-[58vh] place-items-center border border-[var(--hood-fg)] text-[10px] uppercase tracking-[0.18em]">Reading your Hoodies</div>
          ) : ownershipChecked && !isHolder ? (
            <div className="mt-8 grid min-h-[58vh] place-items-center border border-[var(--hood-fg)] bg-[var(--hood-fg)] p-6 text-center text-[var(--hood-bg)]">
              <div className="max-w-xl">
                <p className="text-[9px] uppercase tracking-[0.18em] opacity-60">Holder access</p>
                <h2 className="mt-6 text-5xl leading-[0.86] tracking-[-0.07em] md:text-7xl">NOT IN<br />THE HOOD.</h2>
                <a href={siteConfig.openSeaUrl} target="_blank" rel="noreferrer" className="pixel-cta mt-8 inline-block border-[var(--hood-bg)]">Get a Hoodie</a>
              </div>
            </div>
          ) : (
            <div className="mt-8 grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
              <aside className="min-w-0 xl:sticky xl:top-20 xl:self-start">
                <p className="text-[9px] uppercase tracking-[0.18em]">Holder tool</p>
                <h2 className="mt-3 text-5xl leading-[0.86] tracking-[-0.06em] md:text-6xl">YOUR<br />HOODIES</h2>
                <p className="mt-4 text-sm leading-relaxed opacity-70">Select a Hoodie to read its current voice and complete permanent history.</p>
                <div className="mt-6 border border-[var(--hood-fg)]">
                  <button type="button" onClick={() => setPickerOpen((current) => !current)} className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left text-[10px] uppercase tracking-[0.13em]">
                    <span>Your Hoodies / {ownedHoodies.length}</span><span>{pickerOpen ? "−" : "+"}</span>
                  </button>
                  {pickerOpen ? (
                    <div className="border-t border-[var(--hood-fg)]"><div className="max-h-[390px] overflow-y-auto overscroll-contain">
                      {ownedHoodies.map((hoodie) => {
                        const selected = hoodie.tokenId === selectedTokenId;
                        return <button key={hoodie.tokenId} type="button" onClick={() => setSelectedTokenId(hoodie.tokenId)} className={`flex w-full items-center gap-2 border-b border-[var(--hood-fg)]/20 p-1.5 text-left last:border-b-0 ${selected ? "bg-[var(--hood-fg)] text-[var(--hood-bg)]" : ""}`}>
                          <div className="h-12 w-12 shrink-0 overflow-hidden bg-[#ccff00]"><OwnedArtwork hoodie={hoodie} /></div>
                          <span className="min-w-0 flex-1 truncate text-[8px] uppercase tracking-[0.1em]">{hoodie.name || `OnChainHoodies #${hoodie.tokenId}`}</span>
                          <span className="text-[9px]">{selected ? "■" : "□"}</span>
                        </button>;
                      })}
                    </div></div>
                  ) : null}
                </div>
                <button type="button" onClick={() => void loadOwnership()} disabled={ownershipLoading} className="mt-2 w-full border border-[var(--hood-fg)] px-3 py-2.5 text-[9px] uppercase tracking-[0.13em] disabled:opacity-40">{ownershipLoading ? "Reading ownership" : "Refresh ownership"}</button>
              </aside>

              <div className="min-w-0">
                <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                  <div className="flex items-center justify-between gap-3 border border-[var(--hood-fg)] px-4 py-3 text-[9px] uppercase tracking-[0.15em]"><span>{isPreview ? "New talk preview" : "Current on-chain talk"}</span><span>{token ? `#${String(token.token.id).padStart(4, "0")}` : "Loading"}</span></div>
                  <div className="min-w-[210px] border border-[var(--hood-fg)] bg-[var(--hood-fg)] px-5 py-3 text-[var(--hood-bg)]">
                    <p className="text-[8px] uppercase tracking-[0.16em] opacity-60">Hood Talks</p>
                    <p className="mt-1 text-3xl leading-none tracking-[-0.05em]">{isPreview && authorization ? `${registryTalk?.count ?? 0} > ${authorization.nextCount}` : registryTalk?.count ?? 0}</p>
                    <p className="mt-2 text-[7px] uppercase tracking-[0.12em] opacity-60">{isPreview ? "Pending on-chain update" : "Permanent character history"}</p>
                  </div>
                </div>

                <section className="overflow-hidden border border-[var(--hood-fg)]"><div className="grid lg:grid-cols-2">
                  <div className="aspect-square overflow-hidden border-b border-[var(--hood-fg)] bg-[#ccff00] lg:border-b-0 lg:border-r">{token ? <HoodieArtwork token={token} priority /> : null}</div>
                  <div className="relative flex aspect-square min-w-0 flex-col justify-center px-6 py-14 text-center md:px-12 lg:px-14">
                    <div className="absolute left-5 top-5 text-[9px] uppercase tracking-[0.17em] opacity-60 md:left-7 md:top-7">{token ? `${formatArchetype(token.traits.hoodie)} / #${String(token.token.id).padStart(4, "0")}` : "Visual personality"}</div>
                    {tokenLoading || talkLoading ? <div><p className="text-[10px] uppercase tracking-[0.18em] opacity-55">{tokenLoading ? "Meeting your Hoodie" : "Reading the Hood"}</p><div className="mx-auto mt-6 h-[2px] w-40 overflow-hidden bg-[var(--hood-fg)]/20"><div className="h-full w-1/2 animate-pulse bg-[var(--hood-fg)]" /></div></div> : quote ? <div className="mx-auto flex max-w-4xl flex-col items-center"><blockquote className="text-[clamp(1.65rem,3.3vw,4.6rem)] uppercase leading-[1.08] tracking-[0.07em]">“{quote.replace(/^[“\"]|[”\"]$/g, "")}”</blockquote><HoodieSpeakButton text={quote} archetype={token?.traits.hoodie} mouth={token?.traits.mouth.value} className="mt-8" /></div> : <p className="text-xl uppercase tracking-[0.1em] opacity-55">Your Hoodie stayed quiet.</p>}
                    <div className="absolute bottom-5 left-5 right-5 flex items-center justify-between gap-3 text-[8px] uppercase tracking-[0.14em] md:bottom-7 md:left-7 md:right-7"><span>{isPreview && authorization ? `Next Hood Talk #${authorization.nextCount}` : `Hood Talk #${registryTalk?.count ?? 0}`}</span><span className="text-[7px] tracking-[0.1em] opacity-70">{BRAND_URL.toLowerCase()}</span></div>
                  </div>
                </div></section>

                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <button type="button" onClick={() => token && void generateTalk(token)} disabled={!token || tokenLoading || talkLoading || committing || cooldownActive} className="border border-[var(--hood-fg)] px-4 py-4 text-[10px] uppercase tracking-[0.16em] disabled:opacity-40">{talkLoading ? "Listening" : cooldownActive ? `Next talk in ${formatCountdown(cooldownSeconds)}` : registryTalk?.quote ? "Generate new talk" : "Let Hoodie talk"}</button>
                  <button type="button" onClick={() => void exportCard()} disabled={!token || !quote || exporting || talkLoading || committing} className="border border-[var(--hood-fg)] px-4 py-4 text-[10px] uppercase tracking-[0.16em] disabled:opacity-40">{exporting ? "Creating card" : "Export Hood Talk"}</button>
                  <button type="button" onClick={() => void commitHoodTalk()} disabled={!token || !quote || !authorization || talkLoading || committing || cooldownActive} className="bg-[var(--hood-fg)] px-4 py-4 text-[10px] uppercase tracking-[0.16em] text-[var(--hood-bg)] disabled:opacity-40">{committing ? "Setting on-chain" : authorization ? "Set on-chain" : "Generate first"}</button>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[8px] uppercase leading-relaxed tracking-[0.12em] opacity-60"><span>{registryTalk ? `Hood Talk #${registryTalk.count}${isPreview ? ` → #${authorization?.nextCount}` : ""}` : "Reading registry"}</span>{transactionHash ? <a href={`${activeExplorerUrl}/tx/${transactionHash}`} target="_blank" rel="noreferrer" className="underline">Transaction ↗</a> : null}</div>

                <section className="mt-10">
                  <div className="flex flex-col gap-3 border-b-2 border-[var(--hood-fg)] pb-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[9px] uppercase tracking-[0.16em] opacity-60">Permanent history</p><h3 className="mt-2 text-3xl leading-none">HOODIE #{selectedTokenId || "—"}</h3></div>{selectedTokenId ? <a href={openSeaTokenUrl(selectedTokenId)} target="_blank" rel="noreferrer" className="text-[9px] uppercase tracking-[0.14em] underline underline-offset-4">OpenSea ↗</a> : null}</div>
                  <div className="mt-4"><HistoryList history={selectedHistory} loading={selectedHistoryLoading} explorerUrl={activeExplorerUrl} /></div>
                </section>
              </div>
            </div>
          )
        ) : view === "feed" ? (
          <section className="py-10 md:py-14">
            <div className="flex flex-col gap-4 border-b-2 border-[var(--hood-fg)] pb-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[9px] uppercase tracking-[0.18em] opacity-60">Newest first</p><h2 className="mt-3 text-5xl leading-none tracking-[-0.05em] md:text-7xl">LIVE FEED</h2></div><button type="button" onClick={() => void loadFeed()} disabled={feedLoading} className="border border-[var(--hood-fg)] px-4 py-3 text-[9px] uppercase tracking-[0.14em] disabled:opacity-40">Refresh feed</button></div>
            {feedLoading ? <p className="mt-8 text-[9px] uppercase tracking-[0.15em] opacity-60">Reading the Hood...</p> : <div className="mt-8 grid gap-4 lg:grid-cols-2">
              {feed.map((talk) => <article key={`${talk.transactionHash}-${talk.logIndex}`} className="grid overflow-hidden border-2 border-[var(--hood-fg)] sm:grid-cols-[180px_minmax(0,1fr)]">
                <button type="button" onClick={() => void openHistory(talk.tokenId)} className="aspect-square overflow-hidden border-b-2 border-[var(--hood-fg)] bg-[#ccff00] sm:border-b-0 sm:border-r-2"><FallbackImage preferred={talk.image} fallback={tokenArtworkFallback(talk.tokenId)} alt={`OnChainHoodie #${talk.tokenId}`} width={400} height={400} sizes="180px" className="image-render-pixel h-full w-full object-contain" /></button>
                <div className="flex min-w-0 flex-col justify-between p-5"><div><div className="flex items-center justify-between gap-3"><button type="button" onClick={() => void openHistory(talk.tokenId)} className="text-sm uppercase tracking-[0.12em] underline underline-offset-4">Hoodie #{talk.tokenId}</button><span className="text-[8px] uppercase tracking-[0.12em] opacity-55">Talk #{talk.count}</span></div><blockquote className="mt-6 text-xl uppercase leading-relaxed tracking-[0.06em] md:text-2xl">“{talk.quote.replace(/^[“\"]|[”\"]$/g, "")}”</blockquote></div><div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-[8px] uppercase tracking-[0.12em]"><span className="opacity-55">{formatRelativeTime(talk.updatedAt, clockNow)}</span><div className="flex gap-4"><button type="button" onClick={() => void openHistory(talk.tokenId)} className="underline underline-offset-4">View history</button><a href={openSeaTokenUrl(talk.tokenId)} target="_blank" rel="noreferrer" className="underline underline-offset-4">OpenSea ↗</a></div></div></div>
              </article>)}
            </div>}
            {feedNextBefore ? <div className="mt-8 flex justify-center"><button type="button" onClick={() => void loadFeed(feedNextBefore, true)} disabled={feedLoadingMore} className="border-2 border-[var(--hood-fg)] px-6 py-4 text-[10px] uppercase tracking-[0.15em] disabled:opacity-40">{feedLoadingMore ? "Loading" : "Load more"}</button></div> : null}
          </section>
        ) : (
          <section className="py-10 md:py-14">
            <div className="border-b-2 border-[var(--hood-fg)] pb-5"><p className="text-[9px] uppercase tracking-[0.18em] opacity-60">Most permanent voices</p><h2 className="mt-3 text-5xl leading-none tracking-[-0.05em] md:text-7xl">LEADERBOARD</h2></div>
            {leaderboardLoading ? <p className="mt-8 text-[9px] uppercase tracking-[0.15em] opacity-60">Building the ranking...</p> : leaderboard.length ? <div className="mt-8 border-l-2 border-t-2 border-[var(--hood-fg)]">
              <div className="hidden grid-cols-[80px_minmax(280px,1.4fr)_130px_160px_190px] border-b-2 border-r-2 border-[var(--hood-fg)] bg-[var(--hood-fg)] text-[var(--hood-bg)] lg:grid">{["Rank", "Hoodie", "Talks", "Last spoke", "Actions"].map((label) => <div key={label} className="border-r border-[var(--hood-bg)] p-3 text-[8px] uppercase tracking-[0.14em] last:border-r-0">{label}</div>)}</div>
              {leaderboard.map((entry) => <article key={entry.tokenId} className="grid grid-cols-[58px_minmax(0,1fr)_70px] border-b-2 border-r-2 border-[var(--hood-fg)] lg:grid-cols-[80px_minmax(280px,1.4fr)_130px_160px_190px]">
                <div className="flex items-center justify-center border-r-2 border-[var(--hood-fg)] p-3 text-lg">#{String(entry.rank).padStart(2, "0")}</div>
                <button type="button" onClick={() => void openHistory(entry.tokenId)} className="flex min-w-0 items-center gap-3 border-r-2 border-[var(--hood-fg)] p-3 text-left"><div className="h-14 w-14 shrink-0 overflow-hidden bg-[#ccff00]"><FallbackImage preferred={entry.image} fallback={tokenArtworkFallback(entry.tokenId)} alt={`OnChainHoodie #${entry.tokenId}`} width={112} height={112} sizes="56px" className="image-render-pixel h-full w-full object-contain" /></div><div className="min-w-0"><p className="text-sm uppercase tracking-[0.1em]">Hoodie #{entry.tokenId}</p><p className="mt-2 hidden truncate text-[7px] uppercase tracking-[0.1em] opacity-55 sm:block">“{entry.latestQuote.replace(/^[“\"]|[”\"]$/g, "")}”</p></div></button>
                <div className="flex flex-col justify-center p-3 text-right lg:border-r-2 lg:border-[var(--hood-fg)] lg:text-left"><p className="text-[7px] uppercase tracking-[0.1em] opacity-55 lg:hidden">Talks</p><p className="mt-1 text-xl leading-none lg:mt-0">{entry.count}</p></div>
                <div className="hidden items-center border-r-2 border-[var(--hood-fg)] p-3 text-[9px] uppercase tracking-[0.12em] lg:flex">{formatRelativeTime(entry.lastSpokenAt, clockNow)}</div>
                <div className="hidden items-center gap-4 p-3 text-[8px] uppercase tracking-[0.12em] lg:flex"><button type="button" onClick={() => void openHistory(entry.tokenId)} className="underline underline-offset-4">View talks</button><a href={openSeaTokenUrl(entry.tokenId)} target="_blank" rel="noreferrer" className="underline underline-offset-4">OpenSea ↗</a></div>
              </article>)}
            </div> : <div className="mt-8 border-2 border-[var(--hood-fg)] p-8 text-center text-[9px] uppercase tracking-[0.15em] opacity-60">The leaderboard is being created by the next hourly indexer run.</div>}
          </section>
        )}

        {detailTokenId !== null ? (
          <div className="fixed inset-0 z-[100] overflow-y-auto bg-black/80 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={`Hoodie #${detailTokenId} Hood Talk history`}>
            <div className="mx-auto max-w-5xl border-2 border-[var(--hood-fg)] bg-[var(--hood-bg)] text-[var(--hood-fg)]">
              <div className="flex items-center justify-between gap-4 border-b-2 border-[var(--hood-fg)] p-4 sm:p-5"><div><p className="text-[8px] uppercase tracking-[0.14em] opacity-55">Permanent history</p><h3 className="mt-2 text-3xl leading-none sm:text-4xl">HOODIE #{detailTokenId}</h3></div><button type="button" onClick={() => { setDetailTokenId(null); setDetailHistory(null); }} className="border border-[var(--hood-fg)] px-4 py-3 text-[9px] uppercase tracking-[0.14em]">Close</button></div>
              <div className="grid md:grid-cols-[260px_minmax(0,1fr)]"><div className="border-b-2 border-[var(--hood-fg)] p-4 md:border-b-0 md:border-r-2"><div className="aspect-square overflow-hidden bg-[#ccff00]"><FallbackImage preferred={tokenArtworkFallback(detailTokenId)} fallback={tokenArtworkFallback(detailTokenId)} alt={`OnChainHoodie #${detailTokenId}`} width={520} height={520} sizes="260px" className="image-render-pixel h-full w-full object-contain" /></div><div className="mt-3 grid gap-2"><a href={openSeaTokenUrl(detailTokenId)} target="_blank" rel="noreferrer" className="border border-[var(--hood-fg)] px-3 py-3 text-center text-[9px] uppercase tracking-[0.14em]">OpenSea ↗</a>{ownedHoodies.some((hoodie) => hoodie.tokenId === String(detailTokenId)) ? <button type="button" onClick={() => { setSelectedTokenId(String(detailTokenId)); setView("talk"); setDetailTokenId(null); }} className="border border-[var(--hood-fg)] px-3 py-3 text-[9px] uppercase tracking-[0.14em]">Open in Hood Talk</button> : null}</div></div><div className="max-h-[75vh] overflow-y-auto p-4 sm:p-5"><div className="mb-4 flex items-center justify-between text-[9px] uppercase tracking-[0.14em]"><span>All Hood Talks</span><span>{detailHistory?.total ?? 0}</span></div><HistoryList history={detailHistory} loading={detailLoading} explorerUrl={activeExplorerUrl} compact /></div></div>
            </div>
          </div>
        ) : null}

        {error ? <div className="mt-5 border border-[var(--hood-fg)] bg-[var(--hood-fg)] p-3 text-xs text-[var(--hood-bg)]">{error}</div> : null}
      </section>

      <SiteFooter />
    </main>
  );
}