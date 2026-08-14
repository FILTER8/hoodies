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

type Season01AllocationResponse = {
  ok: boolean;
  season: number;
  status: string;
  snapshot: boolean;
  wallet: string;
  identity: { xUserId: string | null; xUsername: string | null };
  allocation: { walletOCH: string; hoodWalletOCH: string; totalOCH: string };
  walletRewards: {
    hoodTalkActivationOCH: string;
    xOCH: string;
    pfpOCH: string;
    communityVaultOCH: string;
    totalOCH: string;
  };
  hoodies: Array<{
    tokenId: string;
    hoodWallet: string;
    snapshotOwner: string;
    hoodTalk: { count: number; rewardTier: number };
    allocation: { baseOCH: string; hoodTalkBonusOCH: string; totalOCH: string };
  }>;
};

type PassportAccountResponse = {
  wallet?: string | null;
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

function formatOch(value: string | number | null | undefined, maximumFractionDigits = 2) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return "0";

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits,
  }).format(parsed);
}

function normalizePfpStatus(value: unknown): PfpStatus {
  return value === "pending" ||
    value === "verified" ||
    value === "rejected" ||
    value === "revoked"
    ? value
    : "not_submitted";
}

type PassportApiError = Error & {
  status?: number;
};

async function passportApiFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${PASSPORT_API_BASE}${path}`, {
    ...init,
    credentials: "include",
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });

  const data = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };

  if (!response.ok) {
    const error = new Error(
      data.error || `Passport request failed (${response.status})`
    ) as PassportApiError;

    error.status = response.status;
    throw error;
  }

  return data;
}

function passportErrorStatus(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    typeof (error as PassportApiError).status === "number"
  ) {
    return (error as PassportApiError).status;
  }

  return null;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1_000);
}

async function loadCanvasImage(source: string) {
  const image = new window.Image();

  image.decoding = "async";
  image.crossOrigin = "anonymous";

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () =>
      reject(
        new Error(
          "Hoodie artwork could not be loaded for export."
        )
      );

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

    if (context.measureText(text).width <= maxWidth) {
      break;
    }

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
  const { address, connect, getWalletClient } = useWallet();

  const [hoodies, setHoodies] = useState<Hoodie[]>([]);
  const [selectedTokenId, setSelectedTokenId] = useState("");
  const [loadingHoodies, setLoadingHoodies] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [season01, setSeason01] =
    useState<Season01AllocationResponse | null>(null);
  const [loadingSeason01, setLoadingSeason01] = useState(false);
  const [season01NeedsAuth, setSeason01NeedsAuth] = useState(false);
  const [signingPassport, setSigningPassport] = useState(false);

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

  const resetLivePassportStats = useCallback(() => {
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
  }, []);

  const selectedHoodie = useMemo(
    () =>
      hoodies.find(
        (hoodie) => hoodie.tokenId === selectedTokenId
      ) || null,
    [hoodies, selectedTokenId]
  );

  const selectedIndex = useMemo(
    () =>
      hoodies.findIndex(
        (hoodie) => hoodie.tokenId === selectedTokenId
      ),
    [hoodies, selectedTokenId]
  );

  const selectPreviousHoodie = useCallback(() => {
    if (hoodies.length === 0) return;

    const nextIndex =
      selectedIndex <= 0
        ? hoodies.length - 1
        : selectedIndex - 1;

    setSelectedTokenId(hoodies[nextIndex].tokenId);
  }, [hoodies, selectedIndex]);

  const selectNextHoodie = useCallback(() => {
    if (hoodies.length === 0) return;

    const nextIndex =
      selectedIndex < 0 ||
      selectedIndex >= hoodies.length - 1
        ? 0
        : selectedIndex + 1;

    setSelectedTokenId(hoodies[nextIndex].tokenId);
  }, [hoodies, selectedIndex]);

  const hoodieCount = hoodies.length;

  const maximumCountedTalks =
    hoodieCount * HOOD_TALK_CAP_PER_HOODIE;

  const activatedHoodies = useMemo(
    () =>
      hoodies.reduce((total, hoodie) => {
        return (
          total +
          ((stats.hoodTalkCounts[hoodie.tokenId] || 0) > 0
            ? 1
            : 0)
        );
      }, 0),
    [hoodies, stats.hoodTalkCounts]
  );

  const countedHoodTalks = useMemo(
    () =>
      hoodies.reduce((total, hoodie) => {
        const count =
          stats.hoodTalkCounts[hoodie.tokenId] || 0;

        return (
          total +
          Math.min(
            Math.max(count, 0),
            HOOD_TALK_CAP_PER_HOODIE
          )
        );
      }, 0),
    [hoodies, stats.hoodTalkCounts]
  );

  const selectedArchetype =
    hoodieArchetype(selectedHoodie);

  const selectedHoodTalkCount = selectedHoodie
    ? Math.min(
        Math.max(
          stats.hoodTalkCounts[selectedHoodie.tokenId] || 0,
          0
        ),
        HOOD_TALK_CAP_PER_HOODIE
      )
    : 0;

  const isPfpVerified =
    stats.pfpStatus === "verified";

  const pfpStatusLabel = isPfpVerified
    ? "VERIFIED"
    : stats.pfpStatus === "not_submitted"
      ? "NOT VERIFIED"
      : stats.pfpStatus.toUpperCase();

  const pfpExportLabel = isPfpVerified
    ? `VERIFIED #${stats.pfpTokenId || "—"}`
    : pfpStatusLabel;

  const pfpStreakLabel = isPfpVerified
    ? `${formatNumber(stats.pfpStreakDays)} DAY${
        stats.pfpStreakDays === 1 ? "" : "S"
      }`
    : "NO ACTIVE STREAK";

  const pfpExportValue = isPfpVerified
    ? `${pfpExportLabel} · ${pfpStreakLabel} STREAK`
    : pfpStatusLabel;

  const season01HoodTalkOCH = useMemo(() => {
    if (!season01) return "0";

    const activation = safeNumber(
      season01.walletRewards.hoodTalkActivationOCH
    );

    const hoodieBonuses = season01.hoodies.reduce(
      (total, hoodie) =>
        total + safeNumber(hoodie.allocation.hoodTalkBonusOCH),
      0
    );

    return String(activation + hoodieBonuses);
  }, [season01]);

  const season01HoodieBaseOCH = useMemo(() => {
    if (!season01) return "0";

    return String(
      season01.hoodies.reduce(
        (total, hoodie) =>
          total + safeNumber(hoodie.allocation.baseOCH),
        0
      )
    );
  }, [season01]);

  const season01HoodTalkBonusOCH = useMemo(() => {
    if (!season01) return "0";

    return String(
      season01.hoodies.reduce(
        (total, hoodie) =>
          total + safeNumber(hoodie.allocation.hoodTalkBonusOCH),
        0
      )
    );
  }, [season01]);

  const loadHoodies = useCallback(async () => {
    if (!address) {
      setHoodies([]);
      setSelectedTokenId("");

      resetLivePassportStats();
      setSeason01(null);
      setSeason01NeedsAuth(false);
      setLoadingSeason01(false);
      setError(null);
      return;
    }

    setLoadingHoodies(true);
    setError(null);

    // A wallet switch must never keep X/PFP data or allocations
    // from the previously connected wallet on screen.
    resetLivePassportStats();
    setSeason01(null);
    setSeason01NeedsAuth(false);
    setLoadingSeason01(false);

    try {
      const params = new URLSearchParams({
        owner: address,
      });

      const response = await fetch(
        `/api/hoodies?${params.toString()}`,
        {
          cache: "no-store",
        }
      );

      const data =
        (await response.json()) as HoodiesResponse;

      if (!response.ok) {
        throw new Error(
          data.error || "Unable to load your Hoodies."
        );
      }

      const uniqueHoodies = Array.from(
        new Map(
          (data.items || []).map((hoodie) => [
            hoodie.tokenId,
            hoodie,
          ])
        ).values()
      ).sort((left, right) => {
        const a = BigInt(left.tokenId);
        const b = BigInt(right.tokenId);

        return a < b ? -1 : a > b ? 1 : 0;
      });

      setHoodies(uniqueHoodies);

      setSelectedTokenId((current) => {
        if (
          uniqueHoodies.some(
            (hoodie) => hoodie.tokenId === current
          )
        ) {
          return current;
        }

        return uniqueHoodies[0]?.tokenId || "";
      });

      const talkResponse = await fetch(
        "/api/passport/hood-talk",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
          body: JSON.stringify({
            tokenIds: uniqueHoodies.map(
              (hoodie) => hoodie.tokenId
            ),
          }),
        }
      );

      const talkData =
        (await talkResponse.json()) as {
          hoodTalkCounts?: Record<string, number>;
          error?: string;
        };

      if (!talkResponse.ok) {
        throw new Error(
          talkData.error ||
            "Unable to load Hood Talk counts."
        );
      }

      setStats((current) => ({
        ...current,
        hoodTalkCounts:
          talkData.hoodTalkCounts || {},
      }));

      try {
        const passport =
          await passportApiFetch<PassportAccountResponse>(
            "/v1/account"
          );

        if (
          passport.wallet &&
          passport.wallet.toLowerCase() === address.toLowerCase()
        ) {
          const pfpSimilarity =
            passport.pfp?.hoodie_similarity;

          setStats((current) => ({
            ...current,

            xUsername:
              passport.x?.x_username || null,

            xLikes: safeNumber(
              passport.posts?.likes
            ),

            xReplies: safeNumber(
              passport.posts?.replies
            ),

            xReposts: safeNumber(
              passport.posts?.reposts
            ),

            xQuotes: safeNumber(
              passport.posts?.quotes
            ),

            postsEngaged: safeNumber(
              passport.support?.posts_engaged
            ),

            pfpStatus: normalizePfpStatus(
              passport.pfp?.status
            ),

            pfpTokenId:
              passport.pfp?.token_id === null ||
              passport.pfp?.token_id === undefined
                ? null
                : String(passport.pfp.token_id),

            pfpHoodieImageUrl:
              passport.pfp?.hoodie_image_url || null,

            pfpMatchPercentage:
              pfpSimilarity === null ||
              pfpSimilarity === undefined
                ? null
                : Math.max(
                    0,
                    Math.min(
                      100,
                      safeNumber(pfpSimilarity) * 100
                    )
                  ),

            pfpStreakDays: Math.max(
              0,
              Math.floor(
                safeNumber(
                  passport.pfp
                    ?.current_streak_days ??
                    passport.pfp
                      ?.currentStreakDays
                )
              )
            ),
          }));
        }
      } catch {
        // X / live Passport data is optional.
        // Season 01 allocation is loaded independently below.
      }

      setLoadingSeason01(true);

      try {
        const allocation =
          await passportApiFetch<Season01AllocationResponse>(
            "/v1/season/1/allocation"
          );

        if (
          allocation.wallet.toLowerCase() !==
          address.toLowerCase()
        ) {
          throw new Error(
            "Season 01 allocation belongs to another wallet."
          );
        }

        setSeason01(allocation);
        setSeason01NeedsAuth(false);
      } catch (allocationError) {
        setSeason01(null);

        if (passportErrorStatus(allocationError) === 401) {
          setSeason01NeedsAuth(true);
        } else {
          setSeason01NeedsAuth(false);
        }
      } finally {
        setLoadingSeason01(false);
      }

    } catch (loadError) {
      setHoodies([]);
      setSelectedTokenId("");
      setSeason01(null);
      setSeason01NeedsAuth(false);
      setLoadingSeason01(false);

      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load your Passport."
      );
    } finally {
      setLoadingHoodies(false);
    }
  }, [address, resetLivePassportStats]);

  const createPassportSession = useCallback(async () => {
    if (!address) {
      await connect();
      return;
    }

    setSigningPassport(true);
    setError(null);

    try {
      const nonce = await passportApiFetch<{
        message: string;
      }>("/v1/auth/nonce", {
        method: "POST",
        body: JSON.stringify({
          wallet: address,
        }),
      });

      const walletClient =
        await getWalletClient();

      const signature =
        await walletClient.signMessage({
          account: address as `0x${string}`,
          message: nonce.message,
        });

      const session =
        await passportApiFetch<{
          wallet: string;
        }>("/v1/auth/wallet", {
          method: "POST",
          body: JSON.stringify({
            wallet: address,
            signature,
          }),
        });

      if (
        session.wallet.toLowerCase() !==
        address.toLowerCase()
      ) {
        throw new Error(
          "Passport session was created for another wallet."
        );
      }

      setSeason01NeedsAuth(false);

      // Reload all Passport data now that this wallet has
      // its own authenticated session. X is still optional.
      await loadHoodies();
    } catch (sessionError) {
      setError(
        sessionError instanceof Error
          ? sessionError.message
          : "Unable to authenticate this wallet."
      );
    } finally {
      setSigningPassport(false);
    }
  }, [
    address,
    connect,
    getWalletClient,
    loadHoodies,
  ]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadHoodies();
    }, 0);

    return () =>
      window.clearTimeout(timeoutId);
  }, [loadHoodies]);

  const exportPassport = useCallback(async () => {
    if (!address || !selectedHoodie) return;

    setExporting(true);
    setError(null);

    try {
      const size = 1600;
      const padding = 86;

      const canvas =
        document.createElement("canvas");

      canvas.width = size;
      canvas.height = size;

      const context =
        canvas.getContext("2d");

      if (!context) {
        throw new Error(
          "Canvas is not available in this browser."
        );
      }

      context.imageSmoothingEnabled = false;

      context.fillStyle = GREEN;
      context.fillRect(0, 0, size, size);

      context.strokeStyle = BLACK;
      context.lineWidth = 8;
      context.strokeRect(
        24,
        24,
        size - 48,
        size - 48
      );

      context.fillStyle = BLACK;
      context.textBaseline = "top";
      context.textAlign = "left";

      context.font =
        "24px DepartureMono, monospace";

      context.fillText(
        "ONCHAINHOODIES",
        padding,
        72
      );

      context.textAlign = "right";

      context.font =
        "54px DepartureMono, monospace";

      context.fillText(
        "SEASON 01",
        size - padding,
        62
      );

      context.textAlign = "left";

      context.font =
        "92px DepartureMono, monospace";

      context.fillText(
        "HOODIE",
        padding,
        150
      );

      context.fillText(
        "PASSPORT",
        padding,
        238
      );

      context.font =
        "24px DepartureMono, monospace";

      context.fillText(
        "SNAPSHOT COMPLETE",
        padding,
        338
      );

      const artX = padding;
      const artY = 420;
      const artSize = 690;

      context.fillStyle = BLACK;

      context.fillRect(
        artX,
        artY,
        artSize,
        artSize
      );

      if (
        isPfpVerified &&
        stats.pfpHoodieImageUrl
      ) {
        const verifiedArtwork =
          await loadCanvasImage(
            stats.pfpHoodieImageUrl
          );

        context.drawImage(
          verifiedArtwork,
          artX,
          artY,
          artSize,
          artSize
        );
      } else {
        context.strokeStyle = GREEN;
        context.lineWidth = 5;

        context.beginPath();

        context.moveTo(
          artX + 72,
          artY + 72
        );

        context.lineTo(
          artX + artSize - 72,
          artY + artSize - 72
        );

        context.moveTo(
          artX + artSize - 72,
          artY + 72
        );

        context.lineTo(
          artX + 72,
          artY + artSize - 72
        );

        context.stroke();

        context.fillStyle = GREEN;
        context.textAlign = "center";

        context.font =
          "34px DepartureMono, monospace";

        context.fillText(
          "PFP NOT VERIFIED",
          artX + artSize / 2,
          artY + artSize / 2 - 22
        );
      }

      context.strokeStyle = BLACK;
      context.lineWidth = 7;

      context.strokeRect(
        artX,
        artY,
        artSize,
        artSize
      );

      context.fillStyle = BLACK;
      context.textAlign = "left";

      context.font =
        "28px DepartureMono, monospace";

      context.fillText(
        isPfpVerified
          ? `HOODIE #${
              stats.pfpTokenId || "—"
            }`
          : "PFP NOT VERIFIED",
        artX,
        artY + artSize + 24
      );

      context.font =
        "20px DepartureMono, monospace";

      context.fillText(
        isPfpVerified
          ? "VERIFIED HOODIE"
          : "SEASON 01 PASSPORT",
        artX,
        artY + artSize + 62
      );

      const panelX = 840;

      const panelWidth =
        size - padding - panelX;

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

        context.strokeRect(
          panelX,
          y,
          panelWidth,
          rowHeight
        );

        context.fillStyle = BLACK;
        context.textAlign = "left";

        context.font =
          "14px DepartureMono, monospace";

        context.fillText(
          label.toUpperCase(),
          panelX + 20,
          y + 12
        );

        const fittedSize = fitText(
          context,
          value,
          panelWidth - 44,
          valueSize,
          17
        );

        context.font = `${fittedSize}px DepartureMono, monospace`;

        context.fillText(
          value.toUpperCase(),
          panelX + 20,
          y + 35
        );
      };

      drawStatRow(
        artY,
        "Season 01",
        "SNAPSHOT COMPLETE",
        24
      );

      drawStatRow(
        artY + (rowHeight + rowGap),
        "Current Hoodies",
        String(hoodieCount),
        30
      );

      drawStatRow(
        artY + (rowHeight + rowGap) * 2,
        "Activated Hoodies",
        `${activatedHoodies} / ${hoodieCount}`,
        30
      );

      drawStatRow(
        artY + (rowHeight + rowGap) * 3,
        "Counted Hood Talks",
        `${countedHoodTalks} / ${maximumCountedTalks}`,
        28
      );

      drawStatRow(
        artY + (rowHeight + rowGap) * 4,
        "Likes",
        String(stats.xLikes),
        32
      );

      drawStatRow(
        artY + (rowHeight + rowGap) * 5,
        "Comments",
        String(stats.xReplies),
        32
      );

      drawStatRow(
        artY + (rowHeight + rowGap) * 6,
        "Reshares",
        String(stats.xReposts),
        32
      );

      drawStatRow(
        artY + (rowHeight + rowGap) * 7,
        "Quotes",
        String(stats.xQuotes),
        32
      );

      drawStatRow(
        artY + (rowHeight + rowGap) * 8,
        "Verified X PFP",
        pfpExportValue,
        19
      );

      const footerY = 1325;

      context.strokeStyle = BLACK;
      context.lineWidth = 5;

      context.beginPath();

      context.moveTo(
        padding,
        footerY
      );

      context.lineTo(
        size - padding,
        footerY
      );

      context.stroke();

      context.fillStyle = BLACK;
      context.textAlign = "left";

      context.font =
        "19px DepartureMono, monospace";

      context.fillText(
        "WALLET",
        padding,
        footerY + 34
      );

      context.font =
        "32px DepartureMono, monospace";

      context.fillText(
        shortWallet(address),
        padding,
        footerY + 74
      );

      context.textAlign = "center";

      context.font =
        "19px DepartureMono, monospace";

      context.fillText(
        "SEASON 01 ALLOCATION",
        size / 2,
        footerY + 34
      );

      context.font =
        "32px DepartureMono, monospace";

      context.fillText(
        season01
          ? `${formatOch(season01.allocation.totalOCH)} OCH`
          : "UNAVAILABLE",
        size / 2,
        footerY + 74
      );

      context.textAlign = "right";

      context.font =
        "19px DepartureMono, monospace";

      context.fillText(
        "TOKEN LAUNCH",
        size - padding,
        footerY + 34
      );

      context.font =
        "32px DepartureMono, monospace";

      context.fillText(
        "AUG 18",
        size - padding,
        footerY + 74
      );

      context.textAlign = "center";

      context.font =
        "15px DepartureMono, monospace";

      context.fillText(
        "Season 01 snapshot complete. Final allocations are calculated from recorded snapshot data.",
        size / 2,
        1492
      );

      const blob =
        await new Promise<Blob | null>(
          (resolve) =>
            canvas.toBlob(
              resolve,
              "image/png"
            )
        );

      if (!blob) {
        throw new Error(
          "Passport image could not be created."
        );
      }

      downloadBlob(
        blob,
        `onchainhoodies-passport-season-01-snapshot-${
          stats.pfpTokenId ||
          shortWallet(address)
        }.png`
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
    hoodieCount,
    isPfpVerified,
    maximumCountedTalks,
    pfpExportValue,
    selectedHoodie,
    season01,
    stats.pfpHoodieImageUrl,
    stats.pfpTokenId,
    stats.xLikes,
    stats.xReplies,
    stats.xReposts,
    stats.xQuotes,
  ]);

  return (
    <main className="min-h-screen bg-[#ccff00] text-black">
      <SiteHeader />

      {/* =====================================================
          HERO
      ===================================================== */}

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

          <div className="max-w-2xl border-l-2 border-black pl-6 md:pl-9 lg:pb-2">
            <p className="text-[clamp(3.2rem,7vw,7rem)] leading-[0.78] tracking-[-0.08em]">
              SEASON
              <br />
              01
            </p>

            <p className="mt-5 text-sm uppercase tracking-[0.22em] md:text-base">
              Snapshot Complete
            </p>
          </div>
        </div>

        <div className="mt-14 grid gap-8 border-t-2 border-black pt-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <p className="max-w-3xl text-lg leading-relaxed md:text-2xl">
            Season 01 is complete and the snapshot has been taken.
            Your Passport now shows your recorded participation across
            Hoodie ownership, Hood Talk, X contributions and verified
            Hoodie PFP activity.
          </p>

          <div className="flex flex-wrap gap-2 text-[9px] uppercase tracking-[0.15em] lg:max-w-[420px] lg:justify-end">
            <StatusPill>Season 01 Closed</StatusPill>
            <StatusPill>Snapshot Complete</StatusPill>
            <StatusPill>$OCH Launch Aug 18</StatusPill>
            <StatusPill>Season 02 Next</StatusPill>
          </div>
        </div>
      </section>

      {/* =====================================================
          CONNECT
      ===================================================== */}

      {!address ? (
        <section className="border-y-2 border-black bg-black px-6 py-20 text-[#ccff00]">
          <div className="mx-auto max-w-[900px] text-center">
            <p className="text-[10px] uppercase tracking-[0.2em] opacity-70">
              View your Passport
            </p>

            <h2 className="mt-6 text-4xl leading-none tracking-[-0.05em] md:text-7xl">
              CONNECT YOUR WALLET
            </h2>

            <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed opacity-75 md:text-lg">
              Connect your wallet to view your Hoodie Passport and
              recorded Season 01 participation.
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
          {/* =====================================================
              SEASON 01 PASSPORT
          ===================================================== */}

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

                <div className="text-left md:text-right">
                  <p className="text-[9px] uppercase tracking-[0.16em] opacity-60">
                    Season 01
                  </p>

                  <p className="mt-2 text-sm uppercase tracking-[0.14em]">
                    Snapshot Complete
                  </p>
                </div>
              </div>

              {error ? (
                <div className="mt-6 border border-[#ccff00] p-4 text-sm">
                  {error}
                </div>
              ) : null}

              <div className="mt-6 border border-[#ccff00] p-4">
                <p className="text-[9px] uppercase leading-relaxed tracking-[0.14em] opacity-65">
                  Snapshot notice
                </p>

                <p className="mt-2 max-w-4xl text-sm leading-relaxed opacity-80">
                  Season 01 rewards are based on the recorded snapshot.
                  Hoodie balances shown below reflect the wallet&apos;s
                  current holdings and may differ from snapshot ownership.
                </p>
              </div>

              {!loadingHoodies && hoodieCount === 0 ? (
                <div className="mt-12 border-2 border-[#ccff00] p-8 md:p-12">
                  <p className="text-[10px] uppercase tracking-[0.18em] opacity-60">
                    Current Hoodie balance
                  </p>

                  <h2 className="mt-5 text-4xl leading-none md:text-6xl">
                    NO HOODIE FOUND
                  </h2>

                  <p className="mt-6 max-w-xl text-base leading-relaxed opacity-75">
                    This wallet currently holds no OnChainHoodies.
                    Season 01 allocations remain based on the recorded
                    snapshot.
                  </p>
                </div>
              ) : null}

              {loadingHoodies ? (
                <p className="mt-10 text-[9px] uppercase tracking-[0.16em] opacity-60">
                  Loading Passport...
                </p>
              ) : null}

              {hoodieCount > 0 ? (
                <div className="mt-10 grid border-l-2 border-t-2 border-[#ccff00] md:grid-cols-2 xl:grid-cols-4">
                  {/* =================================================
                      01 / HOODIE REWARD
                  ================================================= */}

                  <article className="flex min-h-[430px] flex-col justify-between border-b-2 border-r-2 border-[#ccff00] p-6 md:p-8">
                    <div>
                      <div className="flex items-start justify-between gap-4">
                        <p className="text-[10px] uppercase tracking-[0.18em] opacity-60">
                          01 / Hoodie Reward
                        </p>

                        <span className="border border-[#ccff00] px-2 py-1 text-[8px] uppercase tracking-[0.14em]">
                          Snapshot
                        </span>
                      </div>

                      <h2 className="mt-12 text-5xl leading-none tracking-[-0.05em] md:text-6xl">
                        RECORDED
                      </h2>

                      <p className="mt-6 max-w-sm text-sm leading-relaxed opacity-75 md:text-base">
                        Hoodie Round 01 eligibility was captured at the
                        Season 01 snapshot. Every eligible Hoodie receives
                        an equal Hoodie allocation.
                      </p>

                      <div className="mt-8 grid border-l border-t border-[#ccff00] sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                        <div className="border-b border-r border-[#ccff00] p-4">
                          <p className="text-[8px] uppercase tracking-[0.14em] opacity-60">
                            Current Hoodies
                          </p>

                          <p className="mt-3 text-3xl leading-none">
                            {hoodieCount}
                          </p>
                        </div>

                        <div className="border-b border-r border-[#ccff00] p-4">
                          <p className="text-[8px] uppercase tracking-[0.14em] opacity-60">
                            Round Allocation
                          </p>

                          <p className="mt-3 text-3xl leading-none">
                            10%
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-8 border-t border-[#ccff00] pt-5">
                      <p className="text-[9px] uppercase tracking-[0.15em] opacity-60">
                        Season 01 allocation
                      </p>

                      <p className="mt-2 text-4xl leading-none">
                        {loadingSeason01
                          ? "LOADING"
                          : season01
                            ? `${formatOch(season01.allocation.hoodWalletOCH)} OCH`
                            : "—"}
                      </p>

                      <p className="mt-4 text-xs leading-relaxed opacity-55">
                        Base Hoodie allocation and Hood Talk bonuses are
                        assigned to the snapshot HoodWallets.
                      </p>
                    </div>
                  </article>

                  {/* =================================================
                      02 / HOOD TALK
                  ================================================= */}

                  <article className="flex min-h-[430px] flex-col justify-between border-b-2 border-r-2 border-[#ccff00] p-6 md:p-8">
                    <div>
                      <div className="flex items-start justify-between gap-4">
                        <p className="text-[10px] uppercase tracking-[0.18em] opacity-60">
                          02 / Hood Talk
                        </p>

                        <span className="border border-[#ccff00] px-2 py-1 text-[8px] uppercase tracking-[0.14em]">
                          Season 01 Final
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
                        Season 01 Hood Talk activity has been captured.
                        Hood Talk remains an active on-chain feature of
                        every Hoodie beyond Season 01.
                      </p>
                    </div>

                    <Link
                      href="/hood-talk"
                      className="mt-10 text-xs uppercase tracking-[0.18em] underline underline-offset-4"
                    >
                      Open Hood Talk →
                    </Link>
                  </article>

                  {/* =================================================
                      03 / X POSTS
                  ================================================= */}

                  <article className="flex min-h-[430px] flex-col justify-between border-b-2 border-r-2 border-[#ccff00] p-6 md:p-8">
                    <div>
                      <div className="flex items-start justify-between gap-4">
                        <p className="text-[10px] uppercase tracking-[0.18em] opacity-60">
                          03 / X Posts
                        </p>

                        <span className="border border-[#ccff00] px-2 py-1 text-[8px] uppercase tracking-[0.14em]">
                          Closed
                        </span>
                      </div>

                      <p className="mt-12 text-[9px] uppercase tracking-[0.16em] opacity-60">
                        Season 01 tracked engagement
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
                              {formatNumber(
                                Number(value)
                              )}
                            </p>
                          </div>
                        ))}

                        <div className="col-span-2 border-b border-r border-[#ccff00] p-4">
                          <p className="text-[8px] uppercase tracking-[0.14em] opacity-60">
                            Posts Engaged
                          </p>

                          <p className="mt-3 text-3xl leading-none">
                            {formatNumber(
                              stats.postsEngaged
                            )}
                          </p>
                        </div>
                      </div>

                      <p className="mt-7 max-w-sm text-sm leading-relaxed opacity-75 md:text-base">
                        {stats.xUsername
                          ? `Season 01 participation recorded for @${stats.xUsername}. New X post submissions are closed.`
                          : "Season 01 X post submissions are closed."}
                      </p>
                    </div>

                    <Link
                      href="/community"
                      className="mt-10 text-xs uppercase tracking-[0.18em] underline underline-offset-4"
                    >
                      View Community →
                    </Link>
                  </article>

                  {/* =================================================
                      04 / VERIFIED PFP
                  ================================================= */}

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
                          {isPfpVerified &&
                          stats.pfpHoodieImageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={
                                stats.pfpHoodieImageUrl
                              }
                              alt={`Verified OnChainHoodie #${
                                stats.pfpTokenId || ""
                              }`}
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
                          Live PFP streak
                        </p>

                        <p className="mt-2 text-2xl leading-none tracking-[-0.04em]">
                          {isPfpVerified
                            ? pfpStreakLabel
                            : "—"}
                        </p>
                      </div>

                      <div className="mt-7 text-center">
                        <p className="text-[9px] uppercase tracking-[0.16em] opacity-60">
                          {isPfpVerified
                            ? "Verified Hoodie"
                            : "Hood PFP"}
                        </p>

                        <p className="mt-3 text-2xl leading-none tracking-[-0.04em]">
                          {isPfpVerified
                            ? `HOODIE #${
                                stats.pfpTokenId || "—"
                              }`
                            : pfpStatusLabel}
                        </p>

                        {isPfpVerified &&
                        stats.pfpMatchPercentage !==
                          null ? (
                          <p className="mt-3 text-[9px] uppercase tracking-[0.14em] opacity-60">
                            Pixel match{" "}
                            {formatNumber(
                              stats.pfpMatchPercentage,
                              2
                            )}
                            %
                          </p>
                        ) : null}
                      </div>

                      <p className="mx-auto mt-6 max-w-sm text-center text-sm leading-relaxed opacity-75 md:text-base">
                        {isPfpVerified
                          ? "Your verified Hoodie PFP streak continues to be tracked beyond the Season 01 snapshot."
                          : "Season 01 is complete. PFP verification remains available as part of the ongoing Hoodie identity layer."}
                      </p>
                    </div>

                    <Link
                      href="/community"
                      className="mt-8 text-center text-xs uppercase tracking-[0.18em] underline underline-offset-4"
                    >
                      {isPfpVerified
                        ? "View verification →"
                        : "Verify Hood PFP →"}
                    </Link>
                  </article>
                </div>
              ) : null}
              {season01NeedsAuth ? (
                <div className="mt-10 border-2 border-[#ccff00] p-6 md:p-8">
                  <p className="text-[9px] uppercase tracking-[0.18em] opacity-60">
                    Season 01 Allocation
                  </p>

                  <h2 className="mt-4 text-3xl leading-none tracking-[-0.04em] md:text-5xl">
                    SIGN TO VIEW YOUR ALLOCATION
                  </h2>

                  <p className="mt-5 max-w-2xl text-sm leading-relaxed opacity-70 md:text-base">
                    Your Season 01 allocation is tied to your wallet, not
                    to X. Sign one message to confirm the connected wallet.
                    No X connection or PFP verification is required.
                  </p>

                  <button
                    type="button"
                    onClick={() => void createPassportSession()}
                    disabled={signingPassport}
                    className="mt-7 border-2 border-[#ccff00] px-5 py-3 text-[9px] uppercase tracking-[0.16em] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {signingPassport
                      ? "Signing..."
                      : "Sign wallet to view allocation"}
                  </button>
                </div>
              ) : season01 ? (
                <div className="mt-10 border-2 border-[#ccff00]">
                  <div className="flex flex-col justify-between gap-4 border-b-2 border-[#ccff00] p-6 md:flex-row md:items-end md:p-8">
                    <div>
                      <p className="text-[9px] uppercase tracking-[0.18em] opacity-60">
                        Final Season 01 Allocation
                      </p>

                      <h2 className="mt-4 text-5xl leading-none tracking-[-0.05em] md:text-7xl">
                        {formatOch(season01.allocation.totalOCH)} OCH
                      </h2>
                    </div>

                    <div className="md:text-right">
                      <p className="text-[9px] uppercase tracking-[0.15em] opacity-60">
                        Snapshot Status
                      </p>

                      <p className="mt-2 text-sm uppercase tracking-[0.14em]">
                        Final / Recorded
                      </p>
                    </div>
                  </div>

                  <div className="grid border-l border-t border-[#ccff00] sm:grid-cols-2">
                    <div className="border-b border-r border-[#ccff00] p-5 md:p-6">
                      <p className="text-[8px] uppercase tracking-[0.14em] opacity-60">
                        Your Wallet
                      </p>

                      <p className="mt-3 text-3xl leading-none md:text-4xl">
                        {formatOch(season01.allocation.walletOCH)} OCH
                      </p>
                    </div>

                    <div className="border-b border-r border-[#ccff00] p-5 md:p-6">
                      <p className="text-[8px] uppercase tracking-[0.14em] opacity-60">
                        Your HoodWallets
                      </p>

                      <p className="mt-3 text-3xl leading-none md:text-4xl">
                        {formatOch(season01.allocation.hoodWalletOCH)} OCH
                      </p>
                    </div>
                  </div>

                  <div className="grid border-t border-[#ccff00] lg:grid-cols-2">
                    <div className="border-b border-[#ccff00] lg:border-r">
                      <div className="border-b border-[#ccff00] p-5 md:p-6">
                        <p className="text-[9px] uppercase tracking-[0.15em] opacity-60">
                          Your Wallet Breakdown
                        </p>
                      </div>

                      <div className="grid sm:grid-cols-3">
                        {[
                          [
                            "Hood Talk",
                            season01.walletRewards.hoodTalkActivationOCH,
                          ],
                          [
                            "X Contribution",
                            season01.walletRewards.xOCH,
                          ],
                          [
                            "Verified PFP",
                            season01.walletRewards.pfpOCH,
                          ],
                        ].map(([label, value]) => (
                          <div
                            key={label}
                            className="border-b border-r border-[#ccff00] p-5 md:p-6"
                          >
                            <p className="text-[8px] uppercase tracking-[0.14em] opacity-60">
                              {label}
                            </p>

                            <p className="mt-3 text-2xl leading-none md:text-3xl">
                              {formatOch(value)} OCH
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="border-b border-[#ccff00]">
                      <div className="border-b border-[#ccff00] p-5 md:p-6">
                        <p className="text-[9px] uppercase tracking-[0.15em] opacity-60">
                          Your HoodWallets Breakdown
                        </p>
                      </div>

                      <div className="grid sm:grid-cols-2">
                        {[
                          [
                            "Hoodie Allocation",
                            season01HoodieBaseOCH,
                          ],
                          [
                            "Hood Talk Bonus",
                            season01HoodTalkBonusOCH,
                          ],
                        ].map(([label, value]) => (
                          <div
                            key={label}
                            className="border-b border-r border-[#ccff00] p-5 md:p-6"
                          >
                            <p className="text-[8px] uppercase tracking-[0.14em] opacity-60">
                              {label}
                            </p>

                            <p className="mt-3 text-2xl leading-none md:text-3xl">
                              {formatOch(value)} OCH
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="p-5 text-xs leading-relaxed opacity-60 md:p-6">
                    Your Wallet contains Hood Talk activation rewards,
                    X contribution rewards and Verified PFP rewards.
                    Your HoodWallets contain the Hoodie base allocation
                    plus Hood Talk bonuses assigned directly to each Hoodie wallet.
                  </div>
                </div>
              ) : null}

            </div>
          </section>

          {/* =====================================================
              EXPORT
          ===================================================== */}

          {hoodieCount > 0 ? (
            <section className="px-6 py-20 md:py-28">
              <div className="mx-auto max-w-[1100px]">
                <div className="section-heading-row border-black">
                  <p>05 / Passport Record</p>
                  <p>Season 01 Snapshot</p>
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
                            Season Status
                          </p>

                          <p className="mt-2 text-2xl uppercase tracking-[-0.03em] md:text-4xl">
                            Snapshot Complete
                          </p>
                        </div>

                        <p className="text-[8px] uppercase tracking-[0.14em] opacity-60">
                          Aug 18 / $OCH
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
                            {isPfpVerified &&
                            stats.pfpHoodieImageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={
                                  stats.pfpHoodieImageUrl
                                }
                                alt={`Verified OnChainHoodie #${
                                  stats.pfpTokenId ||
                                  ""
                                }`}
                                className="h-full w-full object-cover [image-rendering:pixelated]"
                              />
                            ) : (
                              <div className="flex h-full flex-col items-center justify-center gap-5 p-8 text-center text-[#ccff00]">
                                <div className="relative h-24 w-24">
                                  <span className="absolute left-1/2 top-1/2 h-px w-[142%] -translate-x-1/2 -translate-y-1/2 rotate-45 bg-[#ccff00]" />

                                  <span className="absolute left-1/2 top-1/2 h-px w-[142%] -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-[#ccff00]" />
                                </div>

                                <p className="text-xs uppercase tracking-[0.16em]">
                                  Season 01 Passport
                                </p>
                              </div>
                            )}
                          </div>

                          <div className="mt-3 flex items-center justify-between gap-4 text-[9px] uppercase tracking-[0.14em]">
                            <span>
                              {isPfpVerified
                                ? `Hoodie #${
                                    stats.pfpTokenId ||
                                    "—"
                                  }`
                                : "PFP not verified"}
                            </span>

                            <span className="opacity-60">
                              {isPfpVerified &&
                              stats.pfpMatchPercentage !==
                                null
                                ? `${formatNumber(
                                    stats.pfpMatchPercentage,
                                    2
                                  )}% match`
                                : "Snapshot complete"}
                            </span>
                          </div>
                        </div>

                        <div className="grid content-start border-l-2 border-t-2 border-black">
                          {[
                            [
                              "Season 01",
                              "Snapshot Complete",
                            ],
                            [
                              "Current Hoodies",
                              String(hoodieCount),
                            ],
                            [
                              "Activated Hoodies",
                              `${activatedHoodies} / ${hoodieCount}`,
                            ],
                            [
                              "Counted Hood Talks",
                              `${countedHoodTalks} / ${maximumCountedTalks}`,
                            ],
                            [
                              "Likes",
                              String(stats.xLikes),
                            ],
                            [
                              "Comments",
                              String(stats.xReplies),
                            ],
                            [
                              "Reshares",
                              String(stats.xReposts),
                            ],
                            [
                              "Quotes",
                              String(stats.xQuotes),
                            ],
                            [
                              "Verified X PFP",
                              pfpExportValue,
                            ],
                          ].map(
                            ([label, value]) => (
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
                            )
                          )}
                        </div>
                      </div>

                      <div className="mt-6 grid gap-4 border-t-2 border-black pt-4 text-[8px] uppercase tracking-[0.14em] sm:grid-cols-3 sm:items-end">
                        <div>
                          <p className="opacity-55">
                            Wallet
                          </p>

                          <p className="mt-2 text-[10px] opacity-100">
                            {shortWallet(address)}
                          </p>
                        </div>

                        <div className="sm:text-center">
                          <p className="opacity-55">
                            Season 01 Allocation
                          </p>

                          <p className="mt-2 text-[10px] opacity-100">
                            {season01
                              ? `${formatOch(season01.allocation.totalOCH)} OCH`
                              : loadingSeason01
                                ? "Loading"
                                : "—"}
                          </p>
                        </div>

                        <div className="sm:text-right">
                          <p className="opacity-55">
                            $OCH Launch
                          </p>

                          <p className="mt-2 text-[10px] opacity-100">
                            Aug 18
                          </p>
                        </div>
                      </div>
                    </div>

                    <p className="mt-3 text-center text-[8px] uppercase leading-relaxed tracking-[0.13em] opacity-55">
                      Final Season 01 allocation shown above is read
                      directly from the recorded snapshot data.
                    </p>

                    <button
                      type="button"
                      onClick={() =>
                        void exportPassport()
                      }
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

      {/* =====================================================
          SEASON 02
      ===================================================== */}

      <section className="border-t-2 border-black bg-black px-6 py-24 text-[#ccff00]">
        <div className="mx-auto max-w-[1440px]">
          <div className="section-heading-row">
            <p>06 / Next Chapter</p>
            <p>Season 02</p>
          </div>

          <div className="mt-12 grid gap-12 lg:grid-cols-[0.7fr_1.3fr] lg:items-end">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] opacity-60">
                Next Season
              </p>

              <h2 className="mt-4 text-[clamp(4rem,9vw,8rem)] leading-[0.78] tracking-[-0.08em]">
                SEASON
                <br />
                02
              </h2>
            </div>

            <div className="border-l-2 border-[#ccff00] pl-6 md:pl-10">
              <p className="max-w-3xl text-xl leading-relaxed md:text-3xl">
                Season 01 helped us learn how the Hood creates,
                participates and grows.
              </p>

              <p className="mt-6 max-w-3xl text-base leading-relaxed opacity-70 md:text-xl">
                Season 02 will introduce new participation mechanics
                and a refined reward system. Details will be announced
                after the $OCH launch.
              </p>

              <div className="mt-8 flex flex-wrap gap-2 text-[9px] uppercase tracking-[0.15em]">
                <span className="border border-[#ccff00] px-3 py-2">
                  New Mechanics
                </span>

                <span className="border border-[#ccff00] px-3 py-2">
                  Refined Rewards
                </span>

                <span className="border border-[#ccff00] px-3 py-2">
                  Coming Next
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================
          FOOTER NOTICE
      ===================================================== */}

      <section className="border-t-2 border-black px-6 py-14">
        <div className="mx-auto max-w-[980px] text-center">
          <p className="text-sm leading-relaxed opacity-70 md:text-base">
            Season 01 snapshot data determines the final Hoodie and
            Community Fund allocations. Allocation and launch
            information will be published on the{" "}
            <Link
              href="/och"
              className="font-bold underline decoration-2 underline-offset-4"
            >
              $OCH page
            </Link>
            . $OCH launches August 18.
          </p>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}