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
  xUsername: string | null;
};

const GREEN = "#ccff00";
const BLACK = "#000000";

const TOTAL_OCH_SUPPLY = 100_000_000;
const CITIZEN_ROUND_PERCENT = 10;
const CITIZEN_ROUND_OCH =
  TOTAL_OCH_SUPPLY * (CITIZEN_ROUND_PERCENT / 100);
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
  if (!hoodie) return "CITIZEN";

  const trait = hoodie.attributes?.find((attribute) => {
    const key = attribute.trait_type?.toLowerCase().trim();
    return key === "hoddie" || key === "hoodie" || key === "archetype";
  });

  return trait?.value?.toUpperCase() || "HOODIE CITIZEN";
}


function shortWallet(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatNumber(value: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits,
  }).format(value);
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

  // Replace this state with the future Passport API response.
  // Hood Talk counts are stored per token so Season 01 can cap each Hoodie at 3.
  const [stats, setStats] = useState<PassportStats>({
    hoodTalkCounts: {},
    pfpStatus: "not_submitted",
    pfpTokenId: null,
    xUsername: null,
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

  const estimatedCitizenOCH =
    hoodieCount > 0
      ? (CITIZEN_ROUND_OCH / ELIGIBLE_HOODIE_ESTIMATE) * hoodieCount
      : 0;

  const hasCitizenReward = hoodieCount > 0;

  const loadHoodies = useCallback(async () => {
    if (!address) {
      setHoodies([]);
      setSelectedTokenId("");
      setStats({ hoodTalkCounts: {}, pfpStatus: "not_submitted", pfpTokenId: null, xUsername: null });
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
      context.fillText("CITIZEN", padding, 150);
      context.fillText("PASSPORT", padding, 238);

      context.font = "24px DepartureMono, monospace";
      context.fillText("GROW THE HOOD", padding, 338);

      const artwork = await loadCanvasImage(
        artworkUrl(selectedHoodie)
      );
      const artX = padding;
      const artY = 420;
      const artSize = 690;

      context.fillStyle = BLACK;
      context.fillRect(artX, artY, artSize, artSize);
      context.drawImage(artwork, artX, artY, artSize, artSize);
      context.strokeStyle = BLACK;
      context.lineWidth = 7;
      context.strokeRect(artX, artY, artSize, artSize);

      context.fillStyle = BLACK;
      context.textAlign = "left";
      context.font = "28px DepartureMono, monospace";
      context.fillText(
        `HOODIE #${selectedHoodie.tokenId}`,
        artX,
        artY + artSize + 24
      );
      context.font = "20px DepartureMono, monospace";
      context.fillText(selectedArchetype, artX, artY + artSize + 62);

      const panelX = 840;
      const panelWidth = size - padding - panelX;
      const rowHeight = 154;
      const rowGap = 18;

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
        context.font = "19px DepartureMono, monospace";
        context.fillText(label.toUpperCase(), panelX + 26, y + 24);

        const fittedSize = fitText(
          context,
          value,
          panelWidth - 52,
          valueSize,
          23
        );
        context.font = `${fittedSize}px DepartureMono, monospace`;
        context.fillText(value.toUpperCase(), panelX + 26, y + 72);
      };

      drawStatRow(
        artY,
        "Citizen Round 01",
        hasCitizenReward ? `${hoodieCount} ELIGIBLE` : "NOT ELIGIBLE",
        40
      );
      drawStatRow(
        artY + (rowHeight + rowGap),
        "Current Hoodie",
        `${selectedHoodTalkCount} / ${HOOD_TALK_CAP_PER_HOODIE}`,
        54
      );
      drawStatRow(
        artY + (rowHeight + rowGap) * 2,
        "Activated Hoodies",
        `${activatedHoodies} / ${hoodieCount}`,
        48
      );
      drawStatRow(
        artY + (rowHeight + rowGap) * 3,
        "Counted Hood Talks",
        `${countedHoodTalks} / ${maximumCountedTalks}`,
        44
      );
      drawStatRow(
        artY + (rowHeight + rowGap) * 4,
        "Verified X PFP",
        "TBA",
        34
      );

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
      context.fillText("EST. CITIZEN ROUND 01", size / 2, footerY + 34);
      context.font = "32px DepartureMono, monospace";
      context.fillText(
        `~${formatNumber(estimatedCitizenOCH)} OCH`,
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
        `onchainhoodies-passport-season-01-${selectedHoodie.tokenId}.png`
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
    estimatedCitizenOCH,
    hasCitizenReward,
    hoodieCount,
    maximumCountedTalks,
    selectedHoodie,
    selectedHoodTalkCount,
    selectedArchetype,
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
              CITIZEN
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
            Every Hoodie automatically qualifies for Citizen Round 01. Season
            01 adds three simple ways to earn Community Fund rewards: give each
            Hoodie a voice, share X posts and represent the Hood with a verified X PFP.
          </p>

          <div className="flex flex-wrap gap-2 text-[9px] uppercase tracking-[0.15em] lg:max-w-[420px] lg:justify-end">
            <StatusPill>10% Citizen round</StatusPill>
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
                    Connected citizen
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
                    Citizen status
                  </p>
                  <h2 className="mt-5 text-4xl leading-none md:text-6xl">
                    NO HOODIE FOUND
                  </h2>
                  <p className="mt-6 max-w-xl text-base leading-relaxed opacity-75">
                    Citizen rewards are connected to Hoodie ownership. Connect a
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
                          01 / Citizen Reward
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
                        Citizen round. No task or engagement is required.
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
                        ~{formatNumber(estimatedCitizenOCH)} OCH
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
                          Coming Soon
                        </span>
                      </div>

                      <p className="mt-12 text-[9px] uppercase tracking-[0.16em] opacity-60">
                        Community participation
                      </p>
                      <h2 className="mt-3 text-4xl leading-none tracking-[-0.04em] md:text-5xl">
                        TWEETS
                      </h2>

                      <div className="mt-8 border border-[#ccff00] p-5">
                        <p className="text-[9px] uppercase tracking-[0.15em] opacity-60">
                          Season 01 flow
                        </p>
                        <p className="mt-3 text-lg leading-relaxed">
                          Verify your wallet with X, submit an X post URL and let the Hood track its engagement for 24 hours.
                        </p>
                      </div>

                      <p className="mt-7 max-w-sm text-sm leading-relaxed opacity-75 md:text-base">
                        The submission page, scoring rules and daily snapshot process will be published soon.
                      </p>
                    </div>

                    <Link
                      href="/community"
                      className="mt-10 text-xs uppercase tracking-[0.18em] underline underline-offset-4"
                    >
                      View X Posts →
                    </Link>
                  </article>

                  <article className="flex min-h-[430px] flex-col justify-between border-b-2 border-r-2 border-[#ccff00] p-6 md:p-8">
                    <div>
                      <div className="flex items-start justify-between gap-4">
                        <p className="text-[10px] uppercase tracking-[0.18em] opacity-60">
                          04 / Verified X PFP
                        </p>
                        <span className="border border-[#ccff00] px-2 py-1 text-[8px] uppercase tracking-[0.14em]">
                          TBA
                        </span>
                      </div>

                      <div className="mt-12 flex justify-center">
                        <div
                          aria-label="Future selected Hoodie profile picture"
                          className="relative aspect-square w-full max-w-[220px] overflow-hidden border-2 border-[#ccff00]"
                        >
                          <span
                            aria-hidden="true"
                            className="absolute left-1/2 top-1/2 h-px w-[142%] -translate-x-1/2 -translate-y-1/2 rotate-45 bg-[#ccff00]"
                          />
                          <span
                            aria-hidden="true"
                            className="absolute left-1/2 top-1/2 h-px w-[142%] -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-[#ccff00]"
                          />
                        </div>
                      </div>

                      <div className="mt-7 text-center">
                        <p className="text-[9px] uppercase tracking-[0.16em] opacity-60">
                          Selected Hoodie
                        </p>
                        <p className="mt-3 text-2xl leading-none tracking-[-0.04em]">
                          TBA
                        </p>
                      </div>

                      <p className="mx-auto mt-7 max-w-sm text-center text-sm leading-relaxed opacity-75 md:text-base">
                        Choose one Hoodie you own to represent the Hood as your X profile picture.
                      </p>
                    </div>
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
                          {selectedIndex + 1} / {hoodieCount}
                        </p>
                      </div>

                      <div className="mt-6 grid gap-5 md:grid-cols-[1.04fr_0.96fr]">
                        <div>
                          <h2 className="text-[clamp(2.5rem,6vw,5rem)] leading-[0.82] tracking-[-0.07em]">
                            CITIZEN
                            <br />
                            PASSPORT
                          </h2>

                          <div className="group relative mt-6 aspect-square overflow-hidden border-2 border-black bg-black">
                            <HoodiePreview hoodie={selectedHoodie} />

                            <button
                              type="button"
                              onClick={selectPreviousHoodie}
                              aria-label="Select previous Hoodie"
                              className="absolute left-0 top-1/2 z-10 flex h-16 w-12 -translate-y-1/2 items-center justify-center border-y-2 border-r-2 border-black bg-[#ccff00] text-3xl transition-colors hover:bg-black hover:text-[#ccff00] md:h-20 md:w-14 md:text-4xl"
                            >
                              ←
                            </button>

                            <button
                              type="button"
                              onClick={selectNextHoodie}
                              aria-label="Select next Hoodie"
                              className="absolute right-0 top-1/2 z-10 flex h-16 w-12 -translate-y-1/2 items-center justify-center border-y-2 border-l-2 border-black bg-[#ccff00] text-3xl transition-colors hover:bg-black hover:text-[#ccff00] md:h-20 md:w-14 md:text-4xl"
                            >
                              →
                            </button>
                          </div>

                          <div className="mt-3 flex items-center justify-between gap-4 text-[9px] uppercase tracking-[0.14em]">
                            <div>
                              <span>Hoodie #{selectedHoodie.tokenId}</span>
                              <span className="ml-3 opacity-60">{selectedArchetype}</span>
                            </div>
                            <span className="opacity-60">
                              Hood Talk {selectedHoodTalkCount} / 3
                            </span>
                          </div>
                        </div>

                        <div className="grid content-start border-l-2 border-t-2 border-black">
                          {[
                            ["Citizen Round 01", `${hoodieCount} eligible`],
                            ["Current Hoodie", `${selectedHoodTalkCount} / 3 talks`],
                            ["Activated Hoodies", `${activatedHoodies} / ${hoodieCount}`],
                            [
                              "Counted Hood Talks",
                              `${countedHoodTalks} / ${maximumCountedTalks}`,
                            ],
                            ["Verified X PFP", "TBA"],
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
                          <p className="opacity-55">Estimated Citizen Round</p>
                          <p className="mt-2 text-[10px] opacity-100">
                            ~{formatNumber(estimatedCitizenOCH)} OCH
                          </p>
                        </div>
                        <div className="sm:text-right">
                          <p className="opacity-55">The Hood Economy</p>
                          <p className="mt-2 text-[10px] opacity-100">$OCH</p>
                        </div>
                      </div>
                    </div>

                    <p className="mt-3 text-center text-[8px] uppercase tracking-[0.13em] opacity-55">
                      Use the arrows to choose the Hoodie. Arrows are not included in the export.
                    </p>

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
            Citizen rewards are automatic for Hoodie holders. Season 01
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