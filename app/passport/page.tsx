"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";
import { useWallet } from "../../components/WalletProvider";
import { apiConfig, collectionApiUrl } from "../../lib/api";

type HoodieAttribute = {
  trait_type?: string;
  value?: string;
};

type Hoodie = {
  tokenId: string;
  name: string;
  image: string;
  attributes?: HoodieAttribute[];
};

type PfpStatus =
  | "not_submitted"
  | "pending"
  | "verified"
  | "rejected"
  | "revoked";

type HoodiesResponse = {
  items?: Hoodie[];
  error?: string;
};

type PassportStats = {
  hoodTalkCounts: Record<string, number>;
  pfpStatus: PfpStatus;
  pfpTokenId: string | null;
  pfpHoodieImageUrl: string | null;
  pfpMatchPercentage: number | null;
  pfpStreakDays: number;
  xUsername: string | null;
  xLikes: number;
  xReplies: number;
  xReposts: number;
  xQuotes: number;
  postsEngaged: number;
};

type PassportAccountResponse = {
  x?: {
    x_username?: string | null;
  } | null;
  posts?: {
    likes?: number | string | null;
    replies?: number | string | null;
    reposts?: number | string | null;
    quotes?: number | string | null;
  } | null;
  support?: {
    posts_engaged?: number | string | null;
  } | null;
  pfp?: {
    token_id?: number | string | null;
    hoodie_image_url?: string | null;
    hoodie_similarity?: number | string | null;
    current_streak_days?: number | string | null;
    currentStreakDays?: number | string | null;
    status?: PfpStatus | string | null;
  } | null;
};

const GREEN = "#ccff00";
const BLACK = "#000000";

const PASSPORT_API_BASE =
  process.env.NEXT_PUBLIC_PASSPORT_API_URL ||
  (process.env.NODE_ENV === "development"
    ? "http://localhost:8787"
    : "https://passport-api.onchainhoodies.xyz");

const TOTAL_OCH_SUPPLY = 100_000_000;
const HOODIE_ROUND_PERCENT = 10;
const HOODIE_ROUND_OCH =
  TOTAL_OCH_SUPPLY * (HOODIE_ROUND_PERCENT / 100);
const ELIGIBLE_HOODIE_ESTIMATE = 6_000;
const HOOD_TALK_CAP_PER_HOODIE = 3;

function artworkUrl(hoodie: Hoodie) {
  if (apiConfig.isMainnet) {
    return collectionApiUrl(
      `/images/${encodeURIComponent(hoodie.tokenId)}.svg`
    );
  }

  return (
    hoodie.image ||
    `/api/hoodies/image?tokenId=${encodeURIComponent(hoodie.tokenId)}`
  );
}


function hoodieArchetype(hoodie: Hoodie | null) {
  if (!hoodie) return "HOODIE";

  const trait = hoodie.attributes?.find((attribute) => {
    const key = attribute.trait_type?.toLowerCase().trim();
    return key === "hoddie" || key === "hoodie" || key === "archetype";
  });

  return trait?.value?.toUpperCase() || "HOODIE";
}


function shortWallet(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatNumber(value: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits,
  }).format(value);
}

function safeNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizePfpStatus(value: unknown): PfpStatus {
  return value === "pending" ||
    value === "verified" ||
    value === "rejected" ||
    value === "revoked"
    ? value
    : "not_submitted";
}

async function passportApiFetch<T>(path: string): Promise<T> {
  const response = await fetch(`${PASSPORT_API_BASE}${path}`, {
    credentials: "include",
    cache: "no-store",
    headers: {
      "content-type": "application/json",
    },
  });

  const data = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(data.error || `Passport request failed (${response.status})`);
  }

  return data;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

async function loadCanvasImage(source: string) {
  const image = new window.Image();
  image.decoding = "async";
  image.crossOrigin = "anonymous";

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () =>
      reject(new Error("Hoodie artwork could not be loaded for export."));
    image.src = source;
  });

  return image;
}

function fitText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  startSize: number,
  minimumSize: number
) {
  let size = startSize;

  while (size > minimumSize) {
    context.font = `${size}px DepartureMono, monospace`;
    if (context.measureText(text).width <= maxWidth) break;
    size -= 2;
  }

  return size;
}

function StatusPill({ children }: { children: ReactNode }) {
  return (
    <span className="border border-black px-2 py-1 text-[8px] uppercase tracking-[0.14em]">
      {children}
    </span>
  );
}

function HoodiePreview({ hoodie }: { hoodie: Hoodie }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="flex h-full items-center justify-center bg-black p-4 text-center text-[9px] uppercase tracking-[0.14em] text-[#ccff00]">
        Artwork unavailable
      </div>
    );
  }

  return (
    <Image
      src={artworkUrl(hoodie)}
      alt={hoodie.name || `OnChainHoodie #${hoodie.tokenId}`}
      fill
      unoptimized
      sizes="(max-width: 768px) 100vw, 560px"
      onError={() => setFailed(true)}
      className="image-render-pixel object-cover"
    />
  );
}

export default function PassportPage() {
  const { address, connect } = useWallet();
  const [hoodies, setHoodies] = useState<Hoodie[]>([]);
  const [selectedTokenId, setSelectedTokenId] = useState("");
  const [loadingHoodies, setLoadingHoodies] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hood Talk counts are stored per token so Season 01 can cap each Hoodie at 3.
  const [stats, setStats] = useState<PassportStats>({
    hoodTalkCounts: {},
    pfpStatus: "not_submitted",
    pfpTokenId: null,
    pfpHoodieImageUrl: null,
    pfpMatchPercentage: null,
    pfpStreakDays: 0,
    xUsername: null,
    xLikes: 0,
    xReplies: 0,
    xReposts: 0,
    xQuotes: 0,
    postsEngaged: 0,
  });

  const selectedHoodie = useMemo(
    () => hoodies.find((hoodie) => hoodie.tokenId === selectedTokenId) || null,
    [hoodies, selectedTokenId]
  );

  const selectedIndex = useMemo(
    () => hoodies.findIndex((hoodie) => hoodie.tokenId === selectedTokenId),
    [hoodies, selectedTokenId]
  );

  const selectPreviousHoodie = useCallback(() => {
    if (hoodies.length === 0) return;
    const nextIndex = selectedIndex <= 0 ? hoodies.length - 1 : selectedIndex - 1;
    setSelectedTokenId(hoodies[nextIndex].tokenId);
  }, [hoodies, selectedIndex]);

  const selectNextHoodie = useCallback(() => {
    if (hoodies.length === 0) return;
    const nextIndex =
      selectedIndex < 0 || selectedIndex >= hoodies.length - 1
        ? 0
        : selectedIndex + 1;
    setSelectedTokenId(hoodies[nextIndex].tokenId);
  }, [hoodies, selectedIndex]);

  const hoodieCount = hoodies.length;
  const maximumCountedTalks = hoodieCount * HOOD_TALK_CAP_PER_HOODIE;

  const activatedHoodies = useMemo(
    () =>
      hoodies.reduce((total, hoodie) => {
        return total + ((stats.hoodTalkCounts[hoodie.tokenId] || 0) > 0 ? 1 : 0);
      }, 0),
    [hoodies, stats.hoodTalkCounts]
  );

  const countedHoodTalks = useMemo(
    () =>
      hoodies.reduce((total, hoodie) => {
        const count = stats.hoodTalkCounts[hoodie.tokenId] || 0;
        return total + Math.min(Math.max(count, 0), HOOD_TALK_CAP_PER_HOODIE);
      }, 0),
    [hoodies, stats.hoodTalkCounts]
  );

  const selectedArchetype = hoodieArchetype(selectedHoodie);
  const selectedHoodTalkCount = selectedHoodie
    ? Math.min(
        Math.max(stats.hoodTalkCounts[selectedHoodie.tokenId] || 0, 0),
        HOOD_TALK_CAP_PER_HOODIE
      )
    : 0;

  const estimatedHoodieOCH =
    hoodieCount > 0
      ? (HOODIE_ROUND_OCH / ELIGIBLE_HOODIE_ESTIMATE) * hoodieCount
      : 0;

  const hasHoodieReward = hoodieCount > 0;
  const isPfpVerified = stats.pfpStatus === "verified";
  const pfpStatusLabel = isPfpVerified
    ? "VERIFIED"
    : stats.pfpStatus === "not_submitted"
      ? "NOT VERIFIED"
      : stats.pfpStatus.toUpperCase();
  const pfpExportLabel = isPfpVerified
    ? `VERIFIED #${stats.pfpTokenId || "—"}`
    : pfpStatusLabel;
  const pfpStreakLabel = isPfpVerified
    ? `${formatNumber(stats.pfpStreakDays)} DAY${stats.pfpStreakDays === 1 ? "" : "S"}`
    : "NO ACTIVE STREAK";
  const pfpExportValue = isPfpVerified
    ? `${pfpExportLabel} · ${pfpStreakLabel} STREAK`
    : pfpStatusLabel;

  const loadHoodies = useCallback(async () => {
    if (!address) {
      setHoodies([]);
      setSelectedTokenId("");
      setStats({
        hoodTalkCounts: {},
        pfpStatus: "not_submitted",
        pfpTokenId: null,
        pfpHoodieImageUrl: null,
        pfpMatchPercentage: null,
        pfpStreakDays: 0,
        xUsername: null,
        xLikes: 0,
        xReplies: 0,
        xReposts: 0,
        xQuotes: 0,
        postsEngaged: 0,
      });
      setError(null);
      return;
    }

    setLoadingHoodies(true);
    setError(null);

    try {
      const params = new URLSearchParams({ owner: address });
      const response = await fetch(`/api/hoodies?${params.toString()}`, {
        cache: "no-store",
      });
      const data = (await response.json()) as HoodiesResponse;

      if (!response.ok) {
        throw new Error(data.error || "Unable to load your Hoodies.");
      }

      const uniqueHoodies = Array.from(
        new Map((data.items || []).map((hoodie) => [hoodie.tokenId, hoodie])).values()
      ).sort((left, right) => {
        const a = BigInt(left.tokenId);
        const b = BigInt(right.tokenId);
        return a < b ? -1 : a > b ? 1 : 0;
      });

      setHoodies(uniqueHoodies);
      setSelectedTokenId((current) => {
        if (uniqueHoodies.some((hoodie) => hoodie.tokenId === current)) {
          return current;
        }
        return uniqueHoodies[0]?.tokenId || "";
      });

      const talkResponse = await fetch("/api/passport/hood-talk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          tokenIds: uniqueHoodies.map((hoodie) => hoodie.tokenId),
        }),
      });

      const talkData = (await talkResponse.json()) as {
        hoodTalkCounts?: Record<string, number>;
        error?: string;
      };

      if (!talkResponse.ok) {
        throw new Error(talkData.error || "Unable to load Hood Talk counts.");
      }

      setStats((current) => ({
        ...current,
        hoodTalkCounts: talkData.hoodTalkCounts || {},
      }));

      // The Community Passport API uses the authenticated wallet session.
      // If no session exists yet, the on-chain Passport still loads normally
      // and the user can sign in on /community to activate X statistics.
      try {
        const passport = await passportApiFetch<PassportAccountResponse>(
          "/v1/account"
        );
        const pfpSimilarity = passport.pfp?.hoodie_similarity;

        setStats((current) => ({
          ...current,
          xUsername: passport.x?.x_username || null,
          xLikes: safeNumber(passport.posts?.likes),
          xReplies: safeNumber(passport.posts?.replies),
          xReposts: safeNumber(passport.posts?.reposts),
          xQuotes: safeNumber(passport.posts?.quotes),
          postsEngaged: safeNumber(passport.support?.posts_engaged),
          pfpStatus: normalizePfpStatus(passport.pfp?.status),
          pfpTokenId:
            passport.pfp?.token_id === null ||
            passport.pfp?.token_id === undefined
              ? null
              : String(passport.pfp.token_id),
          pfpHoodieImageUrl: passport.pfp?.hoodie_image_url || null,
          pfpMatchPercentage:
            pfpSimilarity === null || pfpSimilarity === undefined
              ? null
              : Math.max(0, Math.min(100, safeNumber(pfpSimilarity) * 100)),
          pfpStreakDays: Math.max(
            0,
            Math.floor(
              safeNumber(
                passport.pfp?.current_streak_days ??
                  passport.pfp?.currentStreakDays
              )
            )
          ),
        }));
      } catch {
        // No Passport session yet. The Community page handles wallet signing.
      }
    } catch (loadError) {
      setHoodies([]);
      setSelectedTokenId("");
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load your Passport."
      );
    } finally {
      setLoadingHoodies(false);
    }
  }, [address]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadHoodies();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadHoodies]);

  const exportPassport = useCallback(async () => {
    if (!address || !selectedHoodie) return;

    setExporting(true);
    setError(null);

    try {
      const size = 1600;
      const padding = 86;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;

      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas is not available in this browser.");

      context.imageSmoothingEnabled = false;
      context.fillStyle = GREEN;
      context.fillRect(0, 0, size, size);

      context.strokeStyle = BLACK;
      context.lineWidth = 8;
      context.strokeRect(24, 24, size - 48, size - 48);

      context.fillStyle = BLACK;
      context.textBaseline = "top";
      context.textAlign = "left";
      context.font = "24px DepartureMono, monospace";
      context.fillText("ONCHAINHOODIES", padding, 72);

      context.textAlign = "right";
      context.font = "54px DepartureMono, monospace";
      context.fillText("SEASON 01", size - padding, 62);

      context.textAlign = "left";
      context.font = "92px DepartureMono, monospace";
      context.fillText("HOODIE", padding, 150);
      context.fillText("PASSPORT", padding, 238);

      context.font = "24px DepartureMono, monospace";
      context.fillText("GROW THE HOOD", padding, 338);

      const artX = padding;
      const artY = 420;
      const artSize = 690;

      context.fillStyle = BLACK;
      context.fillRect(artX, artY, artSize, artSize);

      if (isPfpVerified && stats.pfpHoodieImageUrl) {
        const verifiedArtwork = await loadCanvasImage(stats.pfpHoodieImageUrl);
        context.drawImage(verifiedArtwork, artX, artY, artSize, artSize);
      } else {
        context.strokeStyle = GREEN;
        context.lineWidth = 5;
        context.beginPath();
        context.moveTo(artX + 72, artY + 72);
        context.lineTo(artX + artSize - 72, artY + artSize - 72);
        context.moveTo(artX + artSize - 72, artY + 72);
        context.lineTo(artX + 72, artY + artSize - 72);
        context.stroke();

        context.fillStyle = GREEN;
        context.textAlign = "center";
        context.font = "34px DepartureMono, monospace";
        context.fillText("VERIFY YOUR X PFP", artX + artSize / 2, artY + artSize / 2 - 22);
      }

      context.strokeStyle = BLACK;
      context.lineWidth = 7;
      context.strokeRect(artX, artY, artSize, artSize);

      context.fillStyle = BLACK;
      context.textAlign = "left";
      context.font = "28px DepartureMono, monospace";
      context.fillText(
        isPfpVerified ? `HOODIE #${stats.pfpTokenId || "—"}` : "PFP NOT VERIFIED",
        artX,
        artY + artSize + 24
      );
      context.font = "20px DepartureMono, monospace";
      context.fillText(
        isPfpVerified ? "VERIFIED HOODIE" : "IMAGE UNLOCKS AFTER VERIFICATION",
        artX,
        artY + artSize + 62
      );

      const panelX = 840;
      const panelWidth = size - padding - panelX;
      const rowHeight = 72;
      const rowGap = 10;

      const drawStatRow = (
        y: number,
        label: string,
        value: string,
        valueSize = 42
      ) => {
        context.strokeStyle = BLACK;
        context.lineWidth = 5;
        context.strokeRect(panelX, y, panelWidth, rowHeight);

        context.fillStyle = BLACK;
        context.textAlign = "left";
        context.font = "14px DepartureMono, monospace";
        context.fillText(label.toUpperCase(), panelX + 20, y + 12);

        const fittedSize = fitText(
          context,
          value,
          panelWidth - 44,
          valueSize,
          17
        );
        context.font = `${fittedSize}px DepartureMono, monospace`;
        context.fillText(value.toUpperCase(), panelX + 20, y + 35);
      };

      drawStatRow(artY, "Hoodie Round 01", hasHoodieReward ? `${hoodieCount} ELIGIBLE` : "NOT ELIGIBLE", 28);
      drawStatRow(artY + (rowHeight + rowGap), "Activated Hoodies", `${activatedHoodies} / ${hoodieCount}`, 30);
      drawStatRow(artY + (rowHeight + rowGap) * 2, "Counted Hood Talks", `${countedHoodTalks} / ${maximumCountedTalks}`, 28);
      drawStatRow(artY + (rowHeight + rowGap) * 3, "Likes", String(stats.xLikes), 32);
      drawStatRow(artY + (rowHeight + rowGap) * 4, "Comments", String(stats.xReplies), 32);
      drawStatRow(artY + (rowHeight + rowGap) * 5, "Reshares", String(stats.xReposts), 32);
      drawStatRow(artY + (rowHeight + rowGap) * 6, "Quotes", String(stats.xQuotes), 32);
      drawStatRow(artY + (rowHeight + rowGap) * 7, "Posts Engaged", String(stats.postsEngaged), 32);
      drawStatRow(artY + (rowHeight + rowGap) * 8, "Verified X PFP", pfpExportValue, 19);

      const footerY = 1325;
      context.strokeStyle = BLACK;
      context.lineWidth = 5;
      context.beginPath();
      context.moveTo(padding, footerY);
      context.lineTo(size - padding, footerY);
      context.stroke();

      context.fillStyle = BLACK;
      context.textAlign = "left";
      context.font = "19px DepartureMono, monospace";
      context.fillText("WALLET", padding, footerY + 34);
      context.font = "32px DepartureMono, monospace";
      context.fillText(shortWallet(address), padding, footerY + 74);

      context.textAlign = "center";
      context.font = "19px DepartureMono, monospace";
      context.fillText("EST. HOODIE ROUND 01", size / 2, footerY + 34);
      context.font = "32px DepartureMono, monospace";
      context.fillText(
        `~${formatNumber(estimatedHoodieOCH)} OCH`,
        size / 2,
        footerY + 74
      );

      context.textAlign = "right";
      context.font = "19px DepartureMono, monospace";
      context.fillText("THE HOOD ECONOMY", size - padding, footerY + 34);
      context.font = "32px DepartureMono, monospace";
      context.fillText("$OCH", size - padding, footerY + 74);

      context.textAlign = "center";
      context.font = "15px DepartureMono, monospace";
      context.fillText(
        "Estimate based on 6,000 eligible Hoodies. Final snapshot may differ.",
        size / 2,
        1492
      );

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png")
      );

      if (!blob) throw new Error("Passport image could not be created.");

      downloadBlob(
        blob,
        `onchainhoodies-hoodie-passport-season-01-${stats.pfpTokenId || shortWallet(address)}.png`
      );
    } catch (exportError) {
      setError(
        exportError instanceof Error
          ? exportError.message
          : "Passport export failed."
      );
    } finally {
      setExporting(false);
    }
  }, [
    activatedHoodies,
    address,
    countedHoodTalks,
    estimatedHoodieOCH,
    hasHoodieReward,
    hoodieCount,
    maximumCountedTalks,
    selectedHoodie,
    selectedHoodTalkCount,
    selectedArchetype,
    stats.xLikes,
    stats.xReplies,
    stats.xReposts,
    stats.xQuotes,
    stats.postsEngaged,
    pfpExportValue,
  ]);

  return (
    <main className="min-h-screen bg-[#ccff00] text-black">
      <SiteHeader />

      <section className="mx-auto max-w-[1440px] px-6 pb-16 pt-32 md:pb-24 md:pt-40">
        <div className="grid gap-12 lg:grid-cols-[0.92fr_1.08fr] lg:items-end">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em]">
              The Hood Economy
            </p>

            <h1 className="mt-7 text-[clamp(4rem,10vw,9rem)] leading-[0.78] tracking-[-0.08em]">
              HOODIE
              <br />
              PASSPORT
            </h1>
          </div>

          <div className="max-w-2xl border-l-2 border-black pl-6 lg:pb-2 md:pl-9">
            <p className="text-[clamp(3.2rem,7vw,7rem)] leading-[0.78] tracking-[-0.08em]">
              SEASON
              <br />
              01
            </p>
            <p className="mt-5 text-sm uppercase tracking-[0.22em] md:text-base">
              Grow the Hood
            </p>
          </div>
        </div>

        <div className="mt-14 grid gap-8 border-t-2 border-black pt-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <p className="max-w-3xl text-lg leading-relaxed md:text-2xl">
            Every Hoodie automatically qualifies for Hoodie Round 01. Season
            01 adds three simple ways to earn Community Fund rewards: give each
            Hoodie a voice, share X posts and represent the Hood with a verified X PFP.
          </p>

          <div className="flex flex-wrap gap-2 text-[9px] uppercase tracking-[0.15em] lg:max-w-[420px] lg:justify-end">
            <StatusPill>10% Hoodie round</StatusPill>
            <StatusPill>Hood Talk 1–3 per Hoodie</StatusPill>
            <StatusPill>X posts tracked 24H</StatusPill>
            <StatusPill>Hood PFP</StatusPill>
          </div>
        </div>
      </section>

      {!address ? (
        <section className="border-y-2 border-black bg-black px-6 py-20 text-[#ccff00]">
          <div className="mx-auto max-w-[900px] text-center">
            <p className="text-[10px] uppercase tracking-[0.2em] opacity-70">
              Open your Passport
            </p>
            <h2 className="mt-6 text-4xl leading-none tracking-[-0.05em] md:text-7xl">
              CONNECT YOUR WALLET
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed opacity-75 md:text-lg">
              We use your wallet to find your Hoodies and calculate your Season
              01 eligibility. No claim or transaction is required.
            </p>
            <button
              type="button"
              onClick={connect}
              className="pixel-cta mt-9 border-[#ccff00] bg-[#ccff00] text-black"
            >
              Connect wallet
            </button>
          </div>
        </section>
      ) : (
        <>
          <section className="border-y-2 border-black bg-black px-6 py-16 text-[#ccff00] md:py-20">
            <div className="mx-auto max-w-[1440px]">
              <div className="flex flex-col justify-between gap-5 border-b border-[#ccff00] pb-5 md:flex-row md:items-end">
                <div>
                  <p className="text-[9px] uppercase tracking-[0.18em] opacity-60">
                    Connected holder
                  </p>
                  <p className="mt-2 text-lg md:text-2xl">
                    {shortWallet(address)}
                  </p>
                </div>

                <p className="text-[9px] uppercase tracking-[0.16em] opacity-60">
                  {loadingHoodies
                    ? "Loading Hoodies..."
                    : `${hoodieCount} Hoodie${hoodieCount === 1 ? "" : "s"} found`}
                </p>
              </div>

              {error ? (
                <div className="mt-6 border border-[#ccff00] p-4 text-sm">
                  {error}
                </div>
              ) : null}

              {!loadingHoodies && hoodieCount === 0 ? (
                <div className="mt-12 border-2 border-[#ccff00] p-8 md:p-12">
                  <p className="text-[10px] uppercase tracking-[0.18em] opacity-60">
                    Hoodie status
                  </p>
                  <h2 className="mt-5 text-4xl leading-none md:text-6xl">
                    NO HOODIE FOUND
                  </h2>
                  <p className="mt-6 max-w-xl text-base leading-relaxed opacity-75">
                    Hoodie rewards are connected to Hoodie ownership. Connect a
                    wallet holding at least one OnChainHoodie.
                  </p>
                </div>
              ) : null}

              {hoodieCount > 0 ? (
                <div className="mt-10 grid border-l-2 border-t-2 border-[#ccff00] md:grid-cols-2 xl:grid-cols-4">
                  <article className="flex min-h-[430px] flex-col justify-between border-b-2 border-r-2 border-[#ccff00] p-6 md:p-8">
                    <div>
                      <div className="flex items-start justify-between gap-4">
                        <p className="text-[10px] uppercase tracking-[0.18em] opacity-60">
                          01 / Hoodie Reward
                        </p>
                        <span className="border border-[#ccff00] px-2 py-1 text-[8px] uppercase tracking-[0.14em]">
                          Automatic
                        </span>
                      </div>

                      <h2 className="mt-12 text-5xl leading-none tracking-[-0.05em] md:text-6xl">
                        ELIGIBLE
                      </h2>

                      <p className="mt-6 max-w-sm text-sm leading-relaxed opacity-75 md:text-base">
                        Every Hoodie receives an equal share of the first 10%
                        Hoodie round. No task or engagement is required.
                      </p>

                      <div className="mt-8 grid border-l border-t border-[#ccff00] sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                        <div className="border-b border-r border-[#ccff00] p-4">
                          <p className="text-[8px] uppercase tracking-[0.14em] opacity-60">
                            Eligible Hoodies
                          </p>
                          <p className="mt-3 text-3xl leading-none">
                            {hoodieCount}
                          </p>
                        </div>
                        <div className="border-b border-r border-[#ccff00] p-4">
                          <p className="text-[8px] uppercase tracking-[0.14em] opacity-60">
                            Round allocation
                          </p>
                          <p className="mt-3 text-3xl leading-none">10%</p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-8 border-t border-[#ccff00] pt-5">
                      <p className="text-[9px] uppercase tracking-[0.15em] opacity-60">
                        Estimated allocation
                      </p>
                      <p className="mt-2 text-4xl leading-none">
                        ~{formatNumber(estimatedHoodieOCH)} OCH
                      </p>

                    </div>
                  </article>

                  <article className="flex min-h-[430px] flex-col justify-between border-b-2 border-r-2 border-[#ccff00] p-6 md:p-8">
                    <div>
                      <div className="flex items-start justify-between gap-4">
                        <p className="text-[10px] uppercase tracking-[0.18em] opacity-60">
                          02 / Hood Talk
                        </p>
                        <span className="border border-[#ccff00] px-2 py-1 text-[8px] uppercase tracking-[0.14em]">
                          1–3 per Hoodie
                        </span>
                      </div>

                      <div className="mt-12">
                        <p className="text-[9px] uppercase tracking-[0.15em] opacity-60">
                          Activated Hoodies
                        </p>
                        <div className="mt-3 flex items-end justify-between gap-4">
                          <h2 className="text-5xl leading-none tracking-[-0.05em] md:text-6xl">
                            {activatedHoodies} / {hoodieCount}
                          </h2>
                        </div>
                      </div>

                      <div className="mt-8 border-t border-[#ccff00] pt-6">
                        <p className="text-[9px] uppercase tracking-[0.15em] opacity-60">
                          Counted Hood Talks
                        </p>
                        <p className="mt-3 text-4xl leading-none tracking-[-0.04em] md:text-5xl">
                          {countedHoodTalks} / {maximumCountedTalks}
                        </p>
                      </div>

                      <p className="mt-7 max-w-sm text-sm leading-relaxed opacity-75 md:text-base">
                        A Hoodie begins earning after its first Hood Talk. You
                        can create more, but Season 01 counts a maximum of three
                        talks for each Hoodie.
                      </p>
                    </div>

                    <Link
                      href="/hood-talk"
                      className="mt-10 text-xs uppercase tracking-[0.18em] underline underline-offset-4"
                    >
                      Open Hood Talk →
                    </Link>
                  </article>

                  <article className="flex min-h-[430px] flex-col justify-between border-b-2 border-r-2 border-[#ccff00] p-6 md:p-8">
                    <div>
                      <div className="flex items-start justify-between gap-4">
                        <p className="text-[10px] uppercase tracking-[0.18em] opacity-60">
                          03 / X Posts
                        </p>
                        <span className="border border-[#ccff00] px-2 py-1 text-[8px] uppercase tracking-[0.14em]">
                          Track 24H
                        </span>
                      </div>

                      <p className="mt-12 text-[9px] uppercase tracking-[0.16em] opacity-60">
                        Tracked engagement
                      </p>

                      <div className="mt-5 grid grid-cols-2 border-l border-t border-[#ccff00]">
                        {[
                          ["Likes", stats.xLikes],
                          ["Comments", stats.xReplies],
                          ["Reshares", stats.xReposts],
                          ["Quotes", stats.xQuotes],
                        ].map(([label, value]) => (
                          <div
                            key={String(label)}
                            className="border-b border-r border-[#ccff00] p-4"
                          >
                            <p className="text-[8px] uppercase tracking-[0.14em] opacity-60">
                              {label}
                            </p>
                            <p className="mt-3 text-3xl leading-none">
                              {formatNumber(Number(value))}
                            </p>
                          </div>
                        ))}

                        <div className="col-span-2 border-b border-r border-[#ccff00] p-4">
                          <p className="text-[8px] uppercase tracking-[0.14em] opacity-60">
                            Posts Engaged
                          </p>
                          <p className="mt-3 text-3xl leading-none">
                            {formatNumber(stats.postsEngaged)}
                          </p>
                        </div>
                      </div>

                      <p className="mt-7 max-w-sm text-sm leading-relaxed opacity-75 md:text-base">
                          {stats.xUsername
                          ? `Connected as @${stats.xUsername}. Each submitted post is tracked for 24 hours, including community engagement and interactions.`
                          : "Connect and verify X on the Community page to submit posts and track participation."}
                      </p>
                    </div>

                    <Link
                      href="/community"
                      className="mt-10 text-xs uppercase tracking-[0.18em] underline underline-offset-4"
                    >
                      Open Community →
                    </Link>
                  </article>

                  <article className="flex min-h-[430px] flex-col justify-between border-b-2 border-r-2 border-[#ccff00] p-6 md:p-8">
                    <div>
                      <div className="flex items-start justify-between gap-4">
                        <p className="text-[10px] uppercase tracking-[0.18em] opacity-60">
                          04 / Verified X PFP
                        </p>
                        <span className="border border-[#ccff00] px-2 py-1 text-[8px] uppercase tracking-[0.14em]">
                          {pfpStatusLabel}
                        </span>
                      </div>

                      <div className="mt-10 flex justify-center">
                        <div className="relative aspect-square w-full max-w-[220px] overflow-hidden border-2 border-[#ccff00] bg-[#ccff00]">
                          {isPfpVerified && stats.pfpHoodieImageUrl ? (
                            // The image comes from the Passport API record and is
                            // intentionally rendered without Next image optimization.
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={stats.pfpHoodieImageUrl}
                              alt={`Verified OnChainHoodie #${stats.pfpTokenId || ""}`}
                              className="h-full w-full object-cover [image-rendering:pixelated]"
                            />
                          ) : (
                            <>
                              <span
                                aria-hidden="true"
                                className="absolute left-1/2 top-1/2 h-px w-[142%] -translate-x-1/2 -translate-y-1/2 rotate-45 bg-black"
                              />
                              <span
                                aria-hidden="true"
                                className="absolute left-1/2 top-1/2 h-px w-[142%] -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-black"
                              />
                            </>
                          )}
                        </div>
                      </div>

                      <div className="mx-auto mt-4 w-full max-w-[220px] border-2 border-[#ccff00] p-3 text-center">
                        <p className="text-[8px] uppercase tracking-[0.14em] opacity-60">
                          Streak
                        </p>
                        <p className="mt-2 text-2xl leading-none tracking-[-0.04em]">
                          {isPfpVerified ? pfpStreakLabel : "—"}
                        </p>
                      </div>

                      <div className="mt-7 text-center">
                        <p className="text-[9px] uppercase tracking-[0.16em] opacity-60">
                          {isPfpVerified ? "Verified Hoodie" : "Hood PFP"}
                        </p>
                        <p className="mt-3 text-2xl leading-none tracking-[-0.04em]">
                          {isPfpVerified
                            ? `HOODIE #${stats.pfpTokenId || "—"}`
                            : pfpStatusLabel}
                        </p>
                        {isPfpVerified && stats.pfpMatchPercentage !== null ? (
                          <p className="mt-3 text-[9px] uppercase tracking-[0.14em] opacity-60">
                            Pixel match {formatNumber(stats.pfpMatchPercentage, 2)}%
                          </p>
                        ) : null}
                      </div>

                      <p className="mx-auto mt-6 max-w-sm text-center text-sm leading-relaxed opacity-75 md:text-base">
                        {isPfpVerified
                          ? "Your connected X profile is representing the Hood with a verified OnChainHoodie."
                          : "Use an owned Hoodie as your X profile picture and verify it instantly on the Community page."}
                      </p>
                    </div>

                    <Link
                      href="/community"
                      className="mt-8 text-center text-xs uppercase tracking-[0.18em] underline underline-offset-4"
                    >
                      {isPfpVerified ? "View verification →" : "Verify Hood PFP →"}
                    </Link>
                  </article>
                </div>
              ) : null}
            </div>
          </section>

          {hoodieCount > 0 ? (
            <section className="px-6 py-20 md:py-28">
              <div className="mx-auto max-w-[1100px]">
                <div className="section-heading-row border-black">
                  <p>05 / Export</p>
                  <p>Share your Season 01 Passport</p>
                </div>

                {selectedHoodie ? (
                  <div className="mt-12">
                    <div className="border-2 border-black bg-[#ccff00] p-4 sm:p-6 md:p-8">
                      <div className="flex items-start justify-between gap-4 border-b-2 border-black pb-4 text-[8px] uppercase tracking-[0.15em] md:text-[10px]">
                        <span>OnChainHoodies</span>
                        <span className="text-base tracking-[-0.02em] md:text-xl">
                          Season 01
                        </span>
                      </div>

                      <div className="mt-5 flex items-end justify-between gap-4 border-b-2 border-black pb-5">
                        <div>
                          <p className="text-[8px] uppercase tracking-[0.17em] opacity-60">
                            Season focus
                          </p>
                          <p className="mt-2 text-2xl uppercase tracking-[-0.03em] md:text-4xl">
                            Grow the Hood
                          </p>
                        </div>
                        <p className="text-[8px] uppercase tracking-[0.14em] opacity-60">
                          {isPfpVerified ? "Verified image unlocked" : "Image locked"}
                        </p>
                      </div>

                      <div className="mt-6 grid gap-5 md:grid-cols-[1.04fr_0.96fr]">
                        <div>
                          <h2 className="text-[clamp(2.5rem,6vw,5rem)] leading-[0.82] tracking-[-0.07em]">
                            HOODIE
                            <br />
                            PASSPORT
                          </h2>

                          <div className="relative mt-6 aspect-square overflow-hidden border-2 border-black bg-black">
                            {isPfpVerified && stats.pfpHoodieImageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={stats.pfpHoodieImageUrl}
                                alt={`Verified OnChainHoodie #${stats.pfpTokenId || ""}`}
                                className="h-full w-full object-cover [image-rendering:pixelated]"
                              />
                            ) : (
                              <div className="flex h-full flex-col items-center justify-center gap-5 p-8 text-center text-[#ccff00]">
                                <div className="relative h-24 w-24">
                                  <span className="absolute left-1/2 top-1/2 h-px w-[142%] -translate-x-1/2 -translate-y-1/2 rotate-45 bg-[#ccff00]" />
                                  <span className="absolute left-1/2 top-1/2 h-px w-[142%] -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-[#ccff00]" />
                                </div>
                                <p className="text-xs uppercase tracking-[0.16em]">
                                  Verify your Hoodie PFP to unlock your Passport image
                                </p>
                              </div>
                            )}
                          </div>

                          <div className="mt-3 flex items-center justify-between gap-4 text-[9px] uppercase tracking-[0.14em]">
                            <span>
                              {isPfpVerified
                                ? `Hoodie #${stats.pfpTokenId || "—"}`
                                : "PFP not verified"}
                            </span>
                            <span className="opacity-60">
                              {isPfpVerified && stats.pfpMatchPercentage !== null
                                ? `${formatNumber(stats.pfpMatchPercentage, 2)}% match`
                                : "Image locked"}
                            </span>
                          </div>
                        </div>

                        <div className="grid content-start border-l-2 border-t-2 border-black">
                          {[
                            ["Hoodie Round 01", `${hoodieCount} eligible`],
                            ["Activated Hoodies", `${activatedHoodies} / ${hoodieCount}`],
                            ["Counted Hood Talks", `${countedHoodTalks} / ${maximumCountedTalks}`],
                            ["Likes", String(stats.xLikes)],
                            ["Comments", String(stats.xReplies)],
                            ["Reshares", String(stats.xReposts)],
                            ["Quotes", String(stats.xQuotes)],
                            ["Posts Engaged", String(stats.postsEngaged)],
                            ["Verified X PFP", pfpExportValue],
                          ].map(([label, value]) => (
                            <div
                              key={label}
                              className="border-b-2 border-r-2 border-black p-4 md:min-h-[102px] md:p-5"
                            >
                              <p className="text-[8px] uppercase tracking-[0.15em] opacity-60">
                                {label}
                              </p>
                              <p className="mt-3 break-words text-xl leading-none tracking-[-0.04em] md:text-2xl">
                                {value}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="mt-6 grid gap-4 border-t-2 border-black pt-4 text-[8px] uppercase tracking-[0.14em] sm:grid-cols-3 sm:items-end">
                        <div>
                          <p className="opacity-55">Wallet</p>
                          <p className="mt-2 text-[10px] opacity-100">
                            {shortWallet(address)}
                          </p>
                        </div>
                        <div className="sm:text-center">
                          <p className="opacity-55">Estimated Hoodie Round</p>
                          <p className="mt-2 text-[10px] opacity-100">
                            ~{formatNumber(estimatedHoodieOCH)} OCH
                          </p>
                        </div>
                        <div className="sm:text-right">
                          <p className="opacity-55">The Hood Economy</p>
                          <p className="mt-2 text-[10px] opacity-100">$OCH</p>
                        </div>
                      </div>
                    </div>

                    {!isPfpVerified ? (
                      <p className="mt-3 text-center text-[8px] uppercase tracking-[0.13em] opacity-55">
                        Your Hoodie image appears after your X PFP is verified.
                      </p>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => void exportPassport()}
                      disabled={exporting}
                      className="pixel-cta pixel-cta-dark mt-5 w-full disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {exporting
                        ? "Creating Passport..."
                        : "Export Season 01 Passport PNG"}
                    </button>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}
        </>
      )}

      <section className="border-t-2 border-black px-6 py-14">
        <div className="mx-auto max-w-[980px] text-center">
          <p className="text-sm leading-relaxed opacity-70 md:text-base">
            Hoodie rewards are automatic for Hoodie holders. Season 01
            participation rewards come from the Community Fund. Final reward
            amounts, allocations and claim information are published on the{" "}
            <Link
              href="/och"
              className="font-bold underline decoration-2 underline-offset-4"
            >
              $OCH page
            </Link>
            .
          </p>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}