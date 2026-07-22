"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserProvider, Contract } from "ethers";
import SiteHeader from "../../../components/SiteHeader";
import SiteFooter from "../../../components/SiteFooter";
import { useWallet } from "../../../components/WalletProvider";
import { siteConfig } from "../../../lib/config";
import {
  collectionApiUrl,
  hoodTalkApiUrl,
} from "../../../lib/api";
import { HOOD_TALK_REGISTRY_ABI } from "../../../lib/hoodTalkRegistry";

const BRAND_NAME = "ONCHAINHOODIES";
const BRAND_URL = "ONCHAINHOODIES.XYZ";

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

  return collectionApiUrl(value.startsWith("/") ? value : `/${value}`);
}


function formatArchetype(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "hodler") return "HODLER";
  if (normalized === "builder") return "BUILDER";
  if (normalized === "collector") return "COLLECTOR";
  if (normalized === "flipper") return "FLIPPER";
  return value.trim().toUpperCase();
}

function normalizeOwnedHoodies(items: OwnedHoodie[]) {
  return Array.from(
    new Map(items.map((item) => [String(item.tokenId), item])).values(),
  ).sort((left, right) => Number(left.tokenId) - Number(right.tokenId));
}

async function fetchToken(
  tokenId: string,
  signal?: AbortSignal,
) {
  const response = await fetch(
    `/api/hoodies/token?${new URLSearchParams({
      tokenId,
    }).toString()}`,
    {
      cache: "no-store",
      signal,
    },
  );

  const data =
    (await response.json()) as
      | TokenApiResponse
      | { error?: string };

  if (!response.ok) {
    throw new Error(
      "error" in data && data.error
        ? data.error
        : `Unable to load Hoodie #${tokenId}.`,
    );
  }

  return data as TokenApiResponse;
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

function OwnedArtwork({ hoodie }: { hoodie: OwnedHoodie }) {
  const src =
    hoodie.image ||
    collectionApiUrl(`/images/${encodeURIComponent(hoodie.tokenId)}.svg`);

  return (
    <Image
      loader={passthroughImageLoader}
      unoptimized
      src={src}
      alt={hoodie.name || `OnChainHoodies #${hoodie.tokenId}`}
      width={96}
      height={96}
      sizes="48px"
      className="image-render-pixel h-full w-full object-cover"
    />
  );
}

export default function HoodTalkPage() {
  const {
    address,
    connect,
    ensureRequiredNetwork,
    switchingNetwork,
  } = useWallet();
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
  const [pickerOpen, setPickerOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const talkHistoryRef = useRef<Record<string, TalkHistory>>({});
  const generationRef = useRef(0);

  const [currentUnixTime, setCurrentUnixTime] = useState<number | null>(null);

  useEffect(() => {
    talkHistoryRef.current = {};
    generationRef.current += 1;

    const timeoutId = window.setTimeout(() => {
      setRegistryTalk(null);
      setAuthorization(null);
      setTransactionHash(null);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [address]);

  useEffect(() => {
    const updateCurrentTime = () => {
      setCurrentUnixTime(Math.floor(Date.now() / 1000));
    };

    const timeoutId = window.setTimeout(updateCurrentTime, 0);
    const intervalId = window.setInterval(updateCurrentTime, 1000);

    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, []);

  const isHolder = ownedHoodies.length > 0;

  const loadOwnership = useCallback(async (signal?: AbortSignal) => {
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
        collectionApiUrl(
          `/api/hoodies?${new URLSearchParams({
            owner: address,
          }).toString()}`,
        ),
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
      hoodTalkApiUrl(
        `/api/hood-talk?${new URLSearchParams({
          tokenId: String(tokenId),
        }).toString()}`,
      ),
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
          collectionApiUrl(`/images/${nextToken.token.id}.svg`),
        );
        const imageDataUrl = await artworkToPngDataUrl(artworkUrl);

        const historyKey = String(nextToken.token.id);
        const history = talkHistoryRef.current[historyKey] || {
          quotes: [],
          angles: [],
        };

        const response = await fetch(hoodTalkApiUrl(), {
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
      await ensureRequiredNetwork();

      const registryAddress = siteConfig.hoodTalkRegistryAddress;
      if (!registryAddress) {
        throw new Error(
          `The Hood Talk registry address is not configured for ${siteConfig.network}.`,
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
    address,
    authorization,
    committing,
    ensureRequiredNetwork,
    loadRegistry,
    quote,
    token,
  ]);

  const exportCard = useCallback(async () => {
    if (!token || !quote || exporting) return;
    setExporting(true);
    setError(null);

    try {
      if (document.fonts?.ready) await document.fonts.ready;

      const width = 2400;
      const height = 1200;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas is unavailable.");

      context.imageSmoothingEnabled = false;
      context.fillStyle = "#ccff00";
      context.fillRect(0, 0, width, height);

      const artworkUrl = absoluteApiUrl(
        token.image.svg,
        collectionApiUrl(`/images/${token.token.id}.svg`),
      );
      const response = await fetch(artworkUrl, { cache: "no-store" });
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
          artwork.onerror = () => reject(new Error("Unable to render Hoodie."));
          artwork.src = blobUrl;
        });

        const artSize = 1200;
        context.drawImage(artwork, 0, 0, artSize, artSize);
      } finally {
        URL.revokeObjectURL(blobUrl);
      }

      context.fillStyle = "#000000";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.font = "64px DepartureMono, monospace";

      const cleanQuote = quote.replace(/^[“\"]|[”\"]$/g, "").trim();
      const lines = wrapText(context, `“${cleanQuote}”`, 980);
      const lineHeight = 92;
      const startY = height / 2 - ((lines.length - 1) * lineHeight) / 2;
      lines.forEach((line, index) => {
        context.fillText(line.toUpperCase(), 1800, startY + index * lineHeight);
      });

      context.textAlign = "left";
      context.font = "30px DepartureMono, monospace";
      context.fillText(
        `${formatArchetype(token.traits.hoodie)} / #${String(token.token.id).padStart(4, "0")}`,
        1240,
        64,
      );
      context.fillText(
        `${BRAND_NAME} #${String(token.token.id).padStart(4, "0")}`,
        1240,
        height - 56,
      );

      context.textAlign = "right";
      context.fillText(BRAND_URL, width - 80, height - 56);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((result) => {
          if (result) resolve(result);
          else reject(new Error("Unable to export the card."));
        }, "image/png");
      });

      downloadBlob(blob, `onchainhoodies-${token.token.id}-hood-talk.png`);
    } catch (exportError) {
      setError(
        exportError instanceof Error
          ? exportError.message
          : "Unable to export card.",
      );
    } finally {
      setExporting(false);
    }
  }, [exporting, quote, token]);

  const cooldownActive = Boolean(
    currentUnixTime !== null &&
      registryTalk?.nextUpdateAt &&
      registryTalk.nextUpdateAt > currentUnixTime,
  );
  const isPreview = Boolean(authorization);
  const explorerBaseUrl = siteConfig.explorerUrl.replace(/\/$/, "");
  const registryExplorerUrl = siteConfig.hoodTalkRegistryAddress
    ? `${explorerBaseUrl}/address/${siteConfig.hoodTalkRegistryAddress}`
    : explorerBaseUrl;

  return (
    <main className="min-h-screen bg-[#ccff00] text-black">
      <SiteHeader />

      <section className="mx-auto max-w-[1700px] px-4 pb-16 pt-20 md:px-6 md:pt-24">
        <div className="section-heading-row border-black">
          <p>Build 04 / Holder access</p>
          <Link href="/">Back to the Hood</Link>
        </div>

        {!address ? (
          <div className="grid min-h-[72vh] place-items-center border border-black p-6 text-center">
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
          <div className="grid min-h-[72vh] place-items-center border border-black text-[10px] uppercase tracking-[0.18em]">
            Reading your Hoodies
          </div>
        ) : ownershipChecked && !isHolder ? (
          <div className="grid min-h-[72vh] place-items-center border border-black bg-black p-6 text-center text-[#ccff00]">
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
                className="pixel-cta mt-8 inline-block border-[#ccff00]"
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

              <div className="mt-6 border border-black">
                <button
                  type="button"
                  onClick={() => setPickerOpen((current) => !current)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left text-[10px] uppercase tracking-[0.13em]"
                >
                  <span>Your Hoodies / {ownedHoodies.length}</span>
                  <span>{pickerOpen ? "−" : "+"}</span>
                </button>

                {pickerOpen && (
                  <div className="border-t border-black">
                    <div className="max-h-[390px] overflow-y-auto overscroll-contain">
                      {ownedHoodies.map((hoodie) => {
                        const isSelected = hoodie.tokenId === selectedTokenId;

                        return (
                          <button
                            key={hoodie.tokenId}
                            type="button"
                            onClick={() => setSelectedTokenId(hoodie.tokenId)}
                            className={`flex w-full items-center gap-2 border-b border-black/20 p-1.5 text-left last:border-b-0 ${
                              isSelected ? "bg-black text-[#ccff00]" : ""
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
                className="mt-2 w-full border border-black px-3 py-2.5 text-[9px] uppercase tracking-[0.13em] disabled:opacity-40"
              >
                {ownershipLoading ? "Reading ownership" : "Refresh ownership"}
              </button>
            </aside>

            <div className="min-w-0">
              <div className="mb-3 flex items-center justify-between gap-3 border-b border-black pb-3 text-[9px] uppercase tracking-[0.15em]">
                <span>{isPreview ? "New talk preview" : "Current on-chain talk"}</span>
                <span>
                  {token
                    ? `#${String(token.token.id).padStart(4, "0")}`
                    : "Loading"}
                </span>
              </div>

              <section className="overflow-hidden border border-black">
                <div className="grid lg:grid-cols-2">
                  <div className="aspect-square overflow-hidden border-b border-black bg-[#ccff00] lg:border-b-0 lg:border-r">
                    {token ? (
                      <Image
                        loader={passthroughImageLoader}
                        unoptimized
                        src={absoluteApiUrl(
                          token.image.svg,
                          collectionApiUrl(`/images/${token.token.id}.svg`),
                        )}
                        alt={token.token.name}
                        width={1200}
                        height={1200}
                        sizes="(max-width: 1024px) 100vw, 50vw"
                        className="image-render-pixel block h-full w-full object-contain"
                        priority
                      />
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
                        <div className="mx-auto mt-6 h-[2px] w-40 overflow-hidden bg-black/20">
                          <div className="h-full w-1/2 animate-pulse bg-black" />
                        </div>
                      </div>
                    ) : quote ? (
                      <blockquote className="mx-auto max-w-4xl text-[clamp(1.65rem,3.3vw,4.6rem)] uppercase leading-[1.08] tracking-[0.07em]">
                        “{quote.replace(/^[“\"]|[”\"]$/g, "")}”
                      </blockquote>
                    ) : (
                      <p className="text-xl uppercase tracking-[0.1em] opacity-55">
                        Your Hoodie stayed quiet.
                      </p>
                    )}

                    <div className="absolute bottom-5 left-5 right-5 flex items-center justify-between gap-3 text-[8px] uppercase tracking-[0.14em] md:bottom-7 md:left-7 md:right-7">
                      <span>
                        {token
                          ? `${BRAND_NAME} #${String(token.token.id).padStart(4, "0")}`
                          : "ONCHAINHOODIES"}
                      </span>
                      <span>{BRAND_URL}</span>
                    </div>
                  </div>
                </div>
              </section>

              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <button
                  type="button"
                  onClick={() => token && void generateTalk(token)}
                  disabled={!token || tokenLoading || talkLoading || committing || cooldownActive}
                  className="border border-black px-4 py-4 text-[10px] uppercase tracking-[0.16em] disabled:opacity-40"
                >
                  {talkLoading
                    ? "Listening"
                    : cooldownActive
                      ? "Hoodie resting"
                      : registryTalk?.quote
                        ? "Generate new talk"
                        : "Let Hoodie talk"}
                </button>

                <button
                  type="button"
                  onClick={() => void exportCard()}
                  disabled={!token || !quote || exporting || talkLoading || committing}
                  className="border border-black px-4 py-4 text-[10px] uppercase tracking-[0.16em] disabled:opacity-40"
                >
                  {exporting ? "Creating card" : "Export Hood Talk"}
                </button>

                <button
                  type="button"
                  onClick={() => void commitHoodTalk()}
                  disabled={!token || !quote || !authorization || talkLoading || committing || switchingNetwork || cooldownActive}
                  className="bg-black px-4 py-4 text-[10px] uppercase tracking-[0.16em] text-[#ccff00] disabled:opacity-40"
                >
                  {committing || switchingNetwork
                    ? "Setting on-chain"
                    : authorization
                      ? "Set on-chain"
                      : "Generate first"}
                </button>

                <a
                  href={registryExplorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="border border-black px-4 py-4 text-center text-[10px] uppercase tracking-[0.16em]"
                >
                  View registry ↗
                </a>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[8px] uppercase leading-relaxed tracking-[0.12em] opacity-60">
                <span>
                  {registryTalk
                    ? `Hood Talk #${registryTalk.count}${isPreview ? ` → #${authorization?.nextCount}` : ""}`
                    : "Reading registry"}
                </span>
                {transactionHash ? (
                  <a
                    href={`${explorerBaseUrl}/tx/${transactionHash}`}
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
          <div className="mt-3 border border-black bg-black p-3 text-xs text-[#ccff00]">
            {error}
          </div>
        )}
      </section>

      <SiteFooter />
    </main>
  );
}