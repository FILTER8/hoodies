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
  ROBINHOOD_TESTNET_CHAIN_HEX,
  ROBINHOOD_TESTNET_EXPLORER_URL,
  ROBINHOOD_TESTNET_RPC_URL,
} from "../../lib/hoodTalkRegistry";

const BRAND_URL = "ONCHAINHOODIES.XYZ";

const ROBINHOOD_MAINNET_CHAIN_HEX = "0x1237";
const ROBINHOOD_MAINNET_RPC_URL = "https://rpc.mainnet.chain.robinhood.com";
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

type TalkHistory = {
  quotes: string[];
  angles: string[];
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

export default function HoodTalkPage() {
  const { address, connect } = useWallet();
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
  const talkHistoryRef = useRef<Record<string, TalkHistory>>({});
  const generationRef = useRef(0);

  const activeChainHex = apiConfig.isMainnet
    ? ROBINHOOD_MAINNET_CHAIN_HEX
    : ROBINHOOD_TESTNET_CHAIN_HEX;
  const activeRpcUrl = apiConfig.isMainnet
    ? ROBINHOOD_MAINNET_RPC_URL
    : ROBINHOOD_TESTNET_RPC_URL;
  const activeExplorerUrl = apiConfig.isMainnet
    ? ROBINHOOD_MAINNET_EXPLORER_URL
    : ROBINHOOD_TESTNET_EXPLORER_URL;
  const activeChainName = apiConfig.isMainnet
    ? "Robinhood Chain"
    : "Robinhood Chain Testnet";

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setClockNow(Math.floor(Date.now() / 1000));
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  const isHolder = ownedHoodies.length > 0;

  const loadOwnership = useCallback(async (signal?: AbortSignal) => {
    talkHistoryRef.current = {};
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
        const artworkUrl = absoluteApiUrl(
          nextToken.image.svg,
          tokenArtworkFallback(nextToken.token.id),
        );
        const imageDataUrl = await artworkToPngDataUrl(artworkUrl);

        const historyKey = String(nextToken.token.id);
        const history = talkHistoryRef.current[historyKey] || {
          quotes: [],
          angles: [],
        };

        const response = await fetch("/api/hood-talk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tokenId: nextToken.token.id,
            walletAddress: address,
            imageDataUrl,
            previousQuotes: history.quotes,
            previousAngles: history.angles,
          }),
        });

        const data = (await response.json()) as HoodTalkResponse;
        if (!response.ok || !data.quote) {
          throw new Error(data.error || "This Hoodie has not spoken on-chain yet.");
        }

        if (generation === generationRef.current) {
          setQuote(data.quote);
          setAuthorization(data.authorization || null);
          if (data.registry) setRegistryTalk(data.registry);
          const currentHistory = talkHistoryRef.current[historyKey] || {
            quotes: [],
            angles: [],
          };

          talkHistoryRef.current = {
            ...talkHistoryRef.current,
            [historyKey]: {
              quotes: [...currentHistory.quotes, data.quote].slice(-8),
              angles: data.angle
                ? [...currentHistory.angles, data.angle].slice(-8)
                : currentHistory.angles,
            },
          };
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

  const commitHoodTalk = useCallback(async () => {
    if (!token || !quote || !authorization || committing) return;
    if (!window.ethereum) {
      setError("No browser wallet was found.");
      return;
    }

    setCommitting(true);
    setError(null);

    try {
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: activeChainHex }],
        });
      } catch (switchError) {
        const code = (switchError as { code?: number }).code;
        if (code !== 4902) throw switchError;

        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: activeChainHex,
              chainName: activeChainName,
              nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
              rpcUrls: [activeRpcUrl],
              blockExplorerUrls: [activeExplorerUrl],
            },
          ],
        });
      }

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

      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const signerAddress = await signer.getAddress();
      if (!address || signerAddress.toLowerCase() !== address.toLowerCase()) {
        throw new Error("The active wallet does not match the connected holder wallet.");
      }

      const registry = new Contract(registryAddress, HOOD_TALK_REGISTRY_ABI, signer);
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
    activeChainHex,
    activeChainName,
    activeExplorerUrl,
    activeRpcUrl,
    address,
    authorization,
    committing,
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
    context.font = "64px DepartureMono, monospace";

    const cleanQuote = quote.replace(/^[“"]|[”"]$/g, "").trim();
    const lines = wrapText(context, `“${cleanQuote}”`, 980);
    const lineHeight = 92;
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
          <p>Build 04 / Holder access</p>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setDarkHood((current) => !current)}
              className="uppercase"
            >
              {darkHood ? "Lights on" : "Lights off"}
            </button>

            <Link href="/">Back to the Hood</Link>
          </div>
        </div>

        {!address ? (
          <div className="grid min-h-[72vh] place-items-center border border-[var(--hood-fg)] p-6 text-center">
            <div className="max-w-2xl">
              <p className="text-[9px] uppercase tracking-[0.18em] opacity-60">
                Visual personality
              </p>
              <h1 className="mt-6 text-6xl leading-[0.86] tracking-[-0.07em] md:text-8xl">
                LET YOUR
                <br />
                HOODIE TALK.
              </h1>
              <p className="mx-auto mt-6 max-w-md text-sm leading-relaxed opacity-70 md:text-base">
                Connect the wallet holding your OnChainHoodies.
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
          <div className="grid min-h-[72vh] place-items-center border border-[var(--hood-fg)] text-[10px] uppercase tracking-[0.18em]">
            Reading your Hoodies
          </div>
        ) : ownershipChecked && !isHolder ? (
          <div className="grid min-h-[72vh] place-items-center border border-[var(--hood-fg)] bg-[var(--hood-fg)] p-6 text-center text-[var(--hood-bg)]">
            <div className="max-w-xl">
              <p className="text-[9px] uppercase tracking-[0.18em] opacity-60">
                Holder access
              </p>
              <h1 className="mt-6 text-6xl leading-[0.86] tracking-[-0.07em] md:text-8xl">
                NOT IN
                <br />
                THE HOOD.
              </h1>
              <a
                href={siteConfig.openSeaUrl}
                target="_blank"
                rel="noreferrer"
                className="pixel-cta mt-8 inline-block border-[var(--hood-bg)]"
              >
                Get a Hoodie
              </a>
            </div>
          </div>
        ) : (
          <div className="mt-5 grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
            <aside className="min-w-0 xl:sticky xl:top-20 xl:self-start">
              <p className="text-[9px] uppercase tracking-[0.18em]">
                Holder tool
              </p>
              <h1 className="mt-3 text-5xl leading-[0.86] tracking-[-0.06em] md:text-6xl">
                HOOD
                <br />
                TALK
              </h1>
              <p className="mt-4 text-sm leading-relaxed opacity-70">
                Every Hoodie has a voice. Its image and traits shape the
                character. The market only enters when it has something worth saying.
              </p>

              <div className="mt-6 border border-[var(--hood-fg)]">
                <button
                  type="button"
                  onClick={() => setPickerOpen((current) => !current)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left text-[10px] uppercase tracking-[0.13em]"
                >
                  <span>Your Hoodies / {ownedHoodies.length}</span>
                  <span>{pickerOpen ? "−" : "+"}</span>
                </button>

                {pickerOpen && (
                  <div className="border-t border-[var(--hood-fg)]">
                    <div className="max-h-[390px] overflow-y-auto overscroll-contain">
                      {ownedHoodies.map((hoodie) => {
                        const isSelected = hoodie.tokenId === selectedTokenId;

                        return (
                          <button
                            key={hoodie.tokenId}
                            type="button"
                            onClick={() => setSelectedTokenId(hoodie.tokenId)}
                            className={`flex w-full items-center gap-2 border-b border-[var(--hood-fg)]/20 p-1.5 text-left last:border-b-0 ${
                              isSelected ? "bg-[var(--hood-fg)] text-[var(--hood-bg)]" : ""
                            }`}
                          >
                            <div className="h-12 w-12 shrink-0 overflow-hidden bg-[#ccff00]">
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
                {ownershipLoading ? "Reading ownership" : "Refresh ownership"}
              </button>
            </aside>

            <div className="min-w-0">
              <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                <div className="flex items-center justify-between gap-3 border border-[var(--hood-fg)] px-4 py-3 text-[9px] uppercase tracking-[0.15em]">
                  <span>
                    {isPreview ? "New talk preview" : "Current on-chain talk"}
                  </span>
                  <span>
                    {token
                      ? `#${String(token.token.id).padStart(4, "0")}`
                      : "Loading"}
                  </span>
                </div>

                <div className="min-w-[210px] border border-[var(--hood-fg)] bg-[var(--hood-fg)] px-5 py-3 text-[var(--hood-bg)]">
                  <p className="text-[8px] uppercase tracking-[0.16em] opacity-60">
                    Hood Talks
                  </p>
                  <p className="mt-1 text-3xl leading-none tracking-[-0.05em]">
                    {isPreview && authorization
                      ? `${registryTalk?.count ?? 0} > ${authorization.nextCount}`
                      : registryTalk?.count ?? 0}
                  </p>
                  {isPreview && authorization ? (
                    <p className="mt-2 text-[7px] uppercase tracking-[0.12em] opacity-60">
                      Pending on-chain update
                    </p>
                  ) : (
                    <p className="mt-2 text-[7px] uppercase tracking-[0.12em] opacity-60">
                      Permanent character history
                    </p>
                  )}
                </div>
              </div>

              <section className="overflow-hidden border border-[var(--hood-fg)]">
                <div className="grid lg:grid-cols-2">
                  <div className="aspect-square overflow-hidden border-b border-[var(--hood-fg)] bg-[#ccff00] lg:border-b-0 lg:border-r">
                    {token ? (
                      <HoodieArtwork token={token} priority />
                    ) : null}
                  </div>

                  <div className="relative flex aspect-square min-w-0 flex-col justify-center px-6 py-14 text-center md:px-12 lg:px-14">
                    <div className="absolute left-5 top-5 text-[9px] uppercase tracking-[0.17em] opacity-60 md:left-7 md:top-7">
                      {token
                        ? `${formatArchetype(token.traits.hoodie)} / #${String(token.token.id).padStart(4, "0")}`
                        : "Visual personality"}
                    </div>

                    {tokenLoading || talkLoading ? (
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.18em] opacity-55">
                          {tokenLoading
                            ? "Meeting your Hoodie"
                            : "Reading the Hood"}
                        </p>
                        <div className="mx-auto mt-6 h-[2px] w-40 overflow-hidden bg-[var(--hood-fg)]/20">
                          <div className="h-full w-1/2 animate-pulse bg-[var(--hood-fg)]" />
                        </div>
                      </div>
                    ) : quote ? (
                      <div className="mx-auto flex max-w-4xl flex-col items-center">
                        <blockquote className="text-[clamp(1.65rem,3.3vw,4.6rem)] uppercase leading-[1.08] tracking-[0.07em]">
                          “{quote.replace(/^[“\"]|[”\"]$/g, "")}”
                        </blockquote>

                        <HoodieSpeakButton
                              text={quote}
                              archetype={token?.traits.hoodie}
                              mouth={token?.traits.mouth.value}
                          className="mt-8"
                        />
                      </div>
                    ) : (
                      <p className="text-xl uppercase tracking-[0.1em] opacity-55">
                        Your Hoodie stayed quiet.
                      </p>
                    )}

                    <div className="absolute bottom-5 left-5 right-5 flex items-center justify-between gap-3 text-[8px] uppercase tracking-[0.14em] md:bottom-7 md:left-7 md:right-7">
                      <span>
                        {isPreview && authorization
                          ? `Next Hood Talk #${authorization.nextCount}`
                          : `Hood Talk #${registryTalk?.count ?? 0}`}
                      </span>
                      <span className="text-[7px] tracking-[0.1em] opacity-70">
                        {BRAND_URL.toLowerCase()}
                      </span>
                    </div>
                  </div>
                </div>
              </section>

              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => token && void generateTalk(token)}
                  disabled={!token || tokenLoading || talkLoading || committing || cooldownActive}
                  className="border border-[var(--hood-fg)] px-4 py-4 text-[10px] uppercase tracking-[0.16em] disabled:opacity-40"
                >
                  {talkLoading
                    ? "Listening"
                    : cooldownActive
                      ? `Next talk in ${formatCountdown(cooldownSeconds)}`
                      : registryTalk?.quote
                        ? "Generate new talk"
                        : "Let Hoodie talk"}
                </button>

                <button
                  type="button"
                  onClick={() => void exportCard()}
                  disabled={!token || !quote || exporting || talkLoading || committing}
                  className="border border-[var(--hood-fg)] px-4 py-4 text-[10px] uppercase tracking-[0.16em] disabled:opacity-40"
                >
                  {exporting ? "Creating card" : "Export Hood Talk"}
                </button>

                <button
                  type="button"
                  onClick={() => void commitHoodTalk()}
                  disabled={!token || !quote || !authorization || talkLoading || committing || cooldownActive}
                  className="bg-[var(--hood-fg)] px-4 py-4 text-[10px] uppercase tracking-[0.16em] text-[var(--hood-bg)] disabled:opacity-40"
                >
                  {committing ? "Setting on-chain" : authorization ? "Set on-chain" : "Generate first"}
                </button>

              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[8px] uppercase leading-relaxed tracking-[0.12em] opacity-60">
                <span>
                  {registryTalk
                    ? `Hood Talk #${registryTalk.count}${isPreview ? ` → #${authorization?.nextCount}` : ""}`
                    : "Reading registry"}
                </span>
                {transactionHash ? (
                  <a
                    href={`${activeExplorerUrl}/tx/${transactionHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    Transaction ↗
                  </a>
                ) : null}
              </div>

              <p className="mt-3 text-[8px] uppercase leading-relaxed tracking-[0.12em] opacity-55">
                Export / 2400 × 1200 PNG
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-3 border border-[var(--hood-fg)] bg-[var(--hood-fg)] p-3 text-xs text-[var(--hood-bg)]">
            {error}
          </div>
        )}
      </section>

      <SiteFooter />
    </main>
  );
}