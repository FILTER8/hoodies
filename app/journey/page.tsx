"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { Contract, Interface, JsonRpcProvider } from "ethers";
import confetti from "canvas-confetti";
import type { Address, Hex } from "viem";
import {
  Wallet,
  CommentText,
  Flag,
  Check,
} from "pixelarticons/react";

import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";
import { useWallet } from "../../components/WalletProvider";
import HoodieIdentityNav from "../../components/HoodieIdentityNav";
import { apiConfig, collectionApiUrl } from "../../lib/api";
import { siteConfig } from "../../lib/config";

const API = "https://api.onchainhoodies.xyz";
const OPENSEA = "https://opensea.io/collection/onchainhoodies-";
const JOURNEY = "0x93513A0e4d0E016ccf296C4c2888b59c06708ea7";
const PING_CONTRACT = "0xc7fe67AC39a6EDD78d5B842c6f42e11Da37eb17D";
const CALL = 0;

const IDS = {
  hoodWalletActivated: "0x239902d75dd4133b2e3c4f65fa01858d6e22407b7ed186aa42966e7f997962cf",
  hoodTalkSpoken: "0xae701161971ede8a03aaa7cf86b28afe5171979b2e6db2e67310b1bbfa90d37b",
  pingClaimed: "0xb08fecf851d41fdd453731545fe282b0e49a7d8efd63cc4b7a66550141a910d4",
  hooneySwap: "0xefd09bd70e8788d1c1b30fa785e6b4441d016d4e4e27b01a4bb4b3768f8c0d41",
  hoodlitaireWon: "0xfacfe3851303ecdff4bc5657ee1306973651205e0da2789aa31ef299a16f21ec",
  hoodieStudioArtwork: "0x6e814e6963127c0d9f4ae95920380e487152783ea6d8fe7c9824f6ee85e8be48",
} as const;

const HOOD_OS_ABI = ["function isActive(uint256 tokenId) view returns (bool)"] as const;
const ERC721_METADATA_ABI = ["function tokenURI(uint256 tokenId) view returns (string)"] as const;
const JOURNEY_IFACE = new Interface([
  "function verifyAndRecord(uint256 tokenId,bytes32 milestoneId)",
]);
const WALLET_EXECUTE_ABI = [{
  type: "function",
  name: "execute",
  stateMutability: "payable",
  inputs: [
    { name: "target", type: "address" },
    { name: "value", type: "uint256" },
    { name: "data", type: "bytes" },
    { name: "operation", type: "uint8" },
  ],
  outputs: [{ name: "result", type: "bytes" }],
}] as const;

type OwnedHoodie = { tokenId: string; name: string; image?: string };
type OwnershipResponse = { items?: OwnedHoodie[]; error?: string };
type PingState = "locked" | "available" | "home" | "away" | "unavailable";

type JourneyMilestone = {
  key: string;
  milestoneId: string;
  app: string;
  action: string;
  title: string;
  name: string;
  description: string;
  href: string;
  cta: string;

  completed: boolean;
  recorded: boolean;

  source:
    | "journey"
    | "legacy"
    | "community"
    | "contract"
    | null;

  currentlyTrue: boolean;

  completedAt:
    number | null;

  transactionHash:
    string | null;

  talkCount?:
    number;

  state?:
    PingState;

  // Season 2 community/build milestones
  season2?:
    boolean;

  completedGames?:
    number;

  verificationMode?:
    string;

  verificationDelay?:
    string | null;

  qualification?: {
    qualified?:
      boolean;

    qualifiedOnchain?:
      boolean;

    verificationMode?:
      string;

    verificationDelay?:
      string | null;

    ethIn?:
      string | null;

    countedAsBee?:
      boolean | null;

    artworkId?:
      string | null;

    artist?:
      string | null;

    approvedBy?:
      string | null;

    addedPixels?:
      string | null;

    ochBurned?:
      string | null;
  };
};

type JourneyResponse = {
  tokenId: number;
  hoodWallet: { address: string | null; active: boolean; everActivated: boolean };
  milestones: JourneyMilestone[];
  hoodTalk: {
    spoken: boolean;
    count: number;
    latest?: {
      quote?: string;
      updatedAt?: number;
      transactionHash?: string;
    } | null;
  };
  ping: {
    tokenId: number;
    claimed: boolean;
    canClaim: boolean;
    owner: string | null;
    hoodWallet: string | null;
    isHome: boolean;
    state: PingState;
  };
};

type LeaderboardEntry = {
  rank: number;
  tokenId: number;
  hoodItCount: number;
  lastCompletedAt: number | null;
  hoodWallet: string | null;
  hoodWalletOpenSea?: string | null;
  image: string;
  token: string;
  journey: string;
  opensea: string;
};

type LeaderboardResponse = {
  schemaVersion: "1.0";
  updatedAt: string | null;
  summary: {
    totalHoodIts: number;
    hoodiesWithHistory: number;
    hooneyHoodIts: number;
    hoodlitaireHoodIts: number;
  };
  limit: number;
  totalRanked: number;
  entries: LeaderboardEntry[];
};

type JourneyMilestoneCatalogItem = {
  key: string;
  milestoneId: string;
  app: string;
  action: string;
  title?: string;
  name: string;
  description: string;
  season2?: boolean;
  recordedCount: number;
  historicalCount: number | null;
};

type JourneyMilestonesResponse = {
  schemaVersion: "1.0";
  registry: string;
  startBlock: number;
  total: number;
  bootstrapComplete: boolean;
  milestones: JourneyMilestoneCatalogItem[];
};

type RankResponse = {
  schemaVersion: "1.0";
  tokenId: number;
  rank: number | null;
  hoodItCount: number;
  lastCompletedAt: number | null;
  hoodWallet: string | null;
  hoodWalletOpenSea?: string | null;
  image: string;
  token: string;
  journey: string;
  opensea: string;
};

type Tab = "journey" | "stats" | "leaderboard";
type PendingMap = Record<string, boolean>;

function err(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null) {
    const e = error as { shortMessage?: string; message?: string; cause?: { shortMessage?: string; message?: string } };
    return e.shortMessage || e.cause?.shortMessage || e.cause?.message || e.message || fallback;
  }
  return fallback;
}

function art(tokenId: string) {
  return apiConfig.isMainnet
    ? collectionApiUrl(`/images/${encodeURIComponent(tokenId)}.svg`)
    : `/api/hoodies/image?tokenId=${encodeURIComponent(tokenId)}`;
}

function openSeaItemUrl(
  tokenId: string | number,
) {
  return `https://opensea.io/item/robinhood/${"0x9ec6c5b9f572a9b02138e553bc5f5882da735f45"}/${tokenId}`;
}

function openSeaWalletUrl(
  hoodWallet: string | null,
) {
  return hoodWallet
    ? `https://opensea.io/${hoodWallet.toLowerCase()}`
    : null;
}

function account<T>(value: T | undefined): T {
  if (!value) throw new Error("Wallet account unavailable.");
  return value;
}

function localKey(tokenId: string, milestoneKey: string) {
  return `${tokenId}:${milestoneKey}`;
}

function storageKey(owner: string) {
  return `och-journey-pending-v1:${owner.toLowerCase()}`;
}

function readPending(owner?: string | null): PendingMap {
  if (!owner || typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(storageKey(owner)) || "{}") as PendingMap;
  } catch {
    return {};
  }
}

function milestoneId(m: JourneyMilestone) {
  if (m.key === "hoodWalletActivated") return IDS.hoodWalletActivated;
  if (m.key === "hoodTalkSpoken") return IDS.hoodTalkSpoken;
  if (m.key === "pingClaimed") return IDS.pingClaimed;
  if (m.key === "hooneySwap") return IDS.hooneySwap;
  if (m.key === "hoodlitaireWon") return IDS.hoodlitaireWon;
  if (m.key === "hoodieStudioArtwork") return IDS.hoodieStudioArtwork;
  return m.milestoneId;
}

function task(m: JourneyMilestone, j: JourneyResponse) {
  if (m.key === "hoodWalletActivated") {
    return j.hoodWallet.active
      ? { status: "● WALLET ACTIVE", text: "Your HoodWallet is active and ready.", href: "/hoodwallet", cta: "OPEN HOODWALLET" }
      : { status: "○ NOT ACTIVATED", text: "Activate your HoodWallet to use your Hoodie onchain.", href: "/hoodwallet", cta: "ACTIVATE HOODWALLET" };
  }
  if (m.key === "hoodTalkSpoken") {
    return m.completed
      ? { status: "● SPOKEN ONCHAIN", text: "Your Hoodie has already spoken onchain.", href: "/hood-talk", cta: "OPEN HOOD TALK" }
      : { status: "○ NOT SPOKEN", text: "Give your Hoodie a permanent voice onchain.", href: "/hood-talk", cta: "OPEN HOOD TALK" };
  }
  if (m.key === "pingClaimed") {
    if (j.ping.state === "home") return { status: "● PING IS HOME", text: `Ping #${j.tokenId} lives inside this HoodWallet.`, href: "/hoodwallet", cta: "OPEN HOODWALLET" };
    if (j.ping.state === "away") return { status: "○ PING IS AWAY", text: `Ping #${j.tokenId} was claimed, but no longer lives here.`, href: "/hoodwallet", cta: "OPEN HOODWALLET" };
    if (j.ping.state === "available") return { status: "○ READY TO CLAIM", text: `Ping #${j.tokenId} is waiting for this Hoodie.`, href: "/hoodwallet", cta: `CLAIM PING #${j.tokenId}` };
    return { status: "○ LOCKED", text: "Activate your HoodWallet first to unlock Ping.", href: "/hoodwallet", cta: "ACTIVATE HOODWALLET" };
  }

  if (m.key === "hooneySwap") {
    if (m.completed) {
      return {
        status: "● SWAPPED IN THE HIVE",
        text: "A qualifying Hooney swap was verified onchain.",
        href: "https://hooney.xyz/",
        cta: "OPEN HOONEY",
      };
    }

    return {
      status: "○ WAITING FOR VERIFICATION",
      text: "Make one Hooney swap of at least 0.005 ETH. Verification can take up to 1 hour.",
      href: "https://hooney.xyz/",
      cta: "OPEN HOONEY",
    };
  }

  if (m.key === "hoodlitaireWon") {
    if (m.completed) {
      return {
        status: "● GAME WON",
        text: "A Hoodlitaire win is recorded onchain and ready for Journey.",
        href: "https://hoodlab.xyz/hoodlitaire",
        cta: "PLAY HOODLITAIRE",
      };
    }

    return {
      status: "○ WIN A GAME",
      text: "Win one game of Hoodlitaire with your Hoodie.",
      href: "https://hoodlab.xyz/hoodlitaire",
      cta: "PLAY HOODLITAIRE",
    };
  }

  if (m.key === "hoodieStudioArtwork") {
    if (m.completed) {
      return {
        status: "● ART CREATED ONCHAIN",
        text: "A HoodieStudio artwork was verified onchain and is ready for Journey.",
        href: "https://hoodiestudio.xyz/",
        cta: "OPEN HOODIESTUDIO",
      };
    }

    return {
      status: "○ CREATE ONCHAIN ART",
      text: "Create an onchain artwork in HoodieStudio. Verification can take up to 1 hour.",
      href: "https://hoodiestudio.xyz/",
      cta: "OPEN HOODIESTUDIO",
    };
  }

  return { status: m.completed ? "● READY" : "○ NOT DONE", text: m.description, href: m.href, cta: m.cta };
}

function MilestoneVisual({
  milestone,
}: {
  milestone:
    JourneyMilestone;
}) {
  /*
   * Page UI:
   *
   * HoodWallet  -> Pixelarticons Wallet
   * Hood Talk   -> Pixelarticons CommentText
   * Ping        -> our Ping PNG
   * Unknown     -> Pixelarticons Flag fallback
   */
  if (
    milestone.key ===
    "hoodWalletActivated"
  ) {
    return (
      <Wallet
        width={56}
        height={56}
        aria-hidden="true"
      />
    );
  }

  if (
    milestone.key ===
    "hoodTalkSpoken"
  ) {
    return (
      <CommentText
        width={56}
        height={56}
        aria-hidden="true"
      />
    );
  }

  if (
    milestone.key ===
    "pingClaimed"
  ) {
    return (
      <Image
        unoptimized
        src="/journey/ping.png"
        alt="Ping"
        width={64}
        height={64}
        className="h-16 w-16 object-contain"
      />
    );
  }

  if (
    milestone.key ===
    "hooneySwap"
  ) {
    return (
      <Image
        unoptimized
        src="/journey/bee.png"
        alt="Hooney"
        width={64}
        height={64}
        className="h-16 w-16 object-contain"
      />
    );
  }

  if (
    milestone.key ===
    "hoodlitaireWon"
  ) {
    return (
      <Image
        unoptimized
        src="/journey/hoodlitaire.png"
        alt="Hoodlitaire"
        width={64}
        height={64}
        className="h-16 w-16 object-contain"
      />
    );
  }

  if (
  milestone.key ===
  "hoodieStudioArtwork"
) {
  return (
    <Image
      unoptimized
      src="/journey/hoodiestudio.png"
      alt="HoodieStudio"
      width={64}
      height={64}
      className="h-16 w-16 object-contain"
    />
  );
}

  return (
    <Flag
      width={56}
      height={56}
      aria-hidden="true"
    />
  );
}

/*
 * Canvas cannot render React components directly.
 *
 * These files are the exact raw SVG equivalents from
 * the installed pixelarticons package:
 *
 * public/journey/wallet.svg
 * public/journey/comment-text.svg
 * public/journey/check.svg
 *
 * Ping keeps using:
 * public/journey/ping.png
 */
function shareIconSource(
  milestone:
    JourneyMilestone,
) {
  if (
    milestone.key ===
    "hoodWalletActivated"
  ) {
    return "/journey/wallet.svg";
  }

  if (
    milestone.key ===
    "hoodTalkSpoken"
  ) {
    return "/journey/comment-text.svg";
  }

  if (
    milestone.key ===
    "pingClaimed"
  ) {
    return "/journey/ping.png";
  }

  if (
    milestone.key ===
    "hooneySwap"
  ) {
    return "/journey/bee.png";
  }

  if (
    milestone.key ===
    "hoodlitaireWon"
  ) {
    return "/journey/hoodlitaire.png";
  }

  if (
    milestone.key ===
    "hoodieStudioArtwork"
  ) {
    return "/journey/hoodiestudio.png";
  }

  return null;
}

function HoodieArtwork({ hoodie }: { hoodie: OwnedHoodie }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <div className="flex h-full items-center justify-center bg-black text-[7px] text-[#ccff00]">ARTWORK UNAVAILABLE</div>;
  return (
    <Image
      unoptimized
      src={art(hoodie.tokenId)}
      alt={hoodie.name || `OnChainHoodie #${hoodie.tokenId}`}
      width={500}
      height={500}
      onError={() => setFailed(true)}
      className="h-full w-full object-cover"
    />
  );
}

function HoodieTile({ hoodie, selected, active, onSelect }: {
  hoodie: OwnedHoodie;
  selected: boolean;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button type="button" onClick={onSelect} className="w-[160px] shrink-0 text-left md:w-[180px]">
      <div className={`relative border border-[var(--hood-fg)] ${selected ? "outline outline-2 outline-offset-2 outline-[var(--hood-fg)]" : ""}`}>
        {active && <div className="absolute right-2 top-2 z-10 bg-black px-2 py-1 text-[6px] uppercase tracking-[0.12em] text-[#ccff00]">● Wallet active</div>}
        <div className="aspect-square bg-[#ccff00]"><HoodieArtwork hoodie={hoodie} /></div>
        <div className={`border-t border-[var(--hood-fg)] px-3 py-2 ${selected ? "bg-[var(--hood-fg)] text-[var(--hood-bg)]" : ""}`}>
          <p className="text-[6px] uppercase opacity-60">Hoodie</p>
          <p className="mt-1 text-[13px]">#{hoodie.tokenId}</p>
        </div>
      </div>
    </button>
  );
}

function celebrate() {
  /*
   * One clean full-screen celebration.
   * No looping cannons, no repeated bursts.
   */
  void confetti({
    particleCount:
      115,

    spread:
      135,

    startVelocity:
      58,

    gravity:
      0.8,

    scalar:
      1.05,

    ticks:
      190,

    origin: {
      x:
        0.5,

      y:
        0.55,
    },

    colors: [
      "#ccff00",
      "#ff375f",
      "#ff9f0a",
      "#ffd60a",
      "#30d158",
      "#64d2ff",
      "#0a84ff",
      "#bf5af2",
      "#ffffff",
    ],

    disableForReducedMotion:
      true,
  });
}

function decodeBase64Utf8(value: string) {
  const binary =
    window.atob(value);

  const bytes =
    Uint8Array.from(
      binary,
      character =>
        character.charCodeAt(0),
    );

  return new TextDecoder().decode(
    bytes,
  );
}

function decodeJsonDataUri(uri: string) {
  const comma =
    uri.indexOf(",");

  if (
    comma ===
    -1
  ) {
    throw new Error(
      "Invalid tokenURI data URI.",
    );
  }

  const header =
    uri.slice(
      0,
      comma,
    );

  const body =
    uri.slice(
      comma + 1,
    );

  if (
    header.includes(
      ";base64",
    )
  ) {
    return decodeBase64Utf8(
      body,
    );
  }

  return decodeURIComponent(
    body,
  );
}

async function resolveTokenImageFromChain(
  provider:
    JsonRpcProvider,

  contractAddress:
    string,

  tokenId:
    string,
) {
  const contract =
    new Contract(
      contractAddress,
      ERC721_METADATA_ABI,
      provider,
    );

  const tokenUri =
    String(
      await contract.tokenURI(
        BigInt(
          tokenId,
        ),
      ),
    );

  let metadata:
    Record<string, unknown>;

  if (
    tokenUri.startsWith(
      "data:application/json",
    )
  ) {
    metadata =
      JSON.parse(
        decodeJsonDataUri(
          tokenUri,
        ),
      ) as Record<
        string,
        unknown
      >;
  } else {
    const response =
      await fetch(
        tokenUri,
        {
          cache:
            "no-store",
        },
      );

    if (
      !response.ok
    ) {
      throw new Error(
        "Unable to load token metadata.",
      );
    }

    metadata =
      await response.json() as Record<
        string,
        unknown
      >;
  }

  /*
   * Ping metadata uses `image_data` because the artwork
   * itself is fully onchain SVG data.
   *
   * Keep `image` as a fallback for normal ERC-721 metadata.
   */
  const image =
  typeof metadata.image_data === "string"
    ? metadata.image_data
    : typeof metadata.image === "string"
      ? metadata.image
      : null;

if (!image) {
  throw new Error(
    "Token metadata has no image or image_data.",
  );
}

return image;
}

async function loadCanvasImage(
  source:
    string,
) {
  /*
   * Fetch first, then decode through a Blob URL.
   *
   * This handles all artwork types used by Journey:
   * - /journey/wallet.svg
   * - /journey/comment-text.svg
   * - /journey/check.svg
   * - /journey/ping.png
   * - OnChainHoodies SVG URLs
   * - data:image/svg+xml;base64,... from Ping tokenURI()
   * - /api/nft-image?... responses
   */
  const response =
    await fetch(
      source,
      {
        cache:
          "no-store",
      },
    );

  if (
    !response.ok
  ) {
    throw new Error(
      `Unable to load artwork (${response.status}).`,
    );
  }

  const blob =
    await response.blob();

  const objectUrl =
    URL.createObjectURL(
      blob,
    );

  try {
    const image =
      await new Promise<HTMLImageElement>(
        (
          resolve,
          reject,
        ) => {
          const element =
            new window.Image();

          element.onload =
            () => {
              resolve(
                element,
              );
            };

          element.onerror =
            () => {
              reject(
                new Error(
                  "Unable to decode artwork.",
                ),
              );
            };

          element.src =
            objectUrl;
        },
      );

    return image;
  } finally {
    /*
     * Keep the Blob URL alive long enough for drawImage().
     */
    window.setTimeout(
      () => {
        URL.revokeObjectURL(
          objectUrl,
        );
      },
      5000,
    );
  }
}

function wrapCanvasText(
  ctx:
    CanvasRenderingContext2D,

  text:
    string,

  x:
    number,

  y:
    number,

  maxWidth:
    number,

  lineHeight:
    number,

  maxLines:
    number,
) {
  const words =
    text.trim().split(
      /\s+/,
    );

  const lines:
    string[] =
    [];

  let line =
    "";

  for (
    const word of words
  ) {
    const test =
      line
        ? `${line} ${word}`
        : word;

    if (
      ctx.measureText(
        test,
      ).width >
        maxWidth &&
      line
    ) {
      lines.push(
        line,
      );

      line =
        word;

      if (
        lines.length ===
        maxLines - 1
      ) {
        break;
      }
    } else {
      line =
        test;
    }
  }

  if (
    line &&
    lines.length <
      maxLines
  ) {
    lines.push(
      line,
    );
  }

  lines.forEach(
    (
      current,
      index,
    ) => {
      ctx.fillText(
        current,
        x,
        y +
          index *
            lineHeight,
      );
    },
  );
}

async function makeShareCard({
  tokenId,
  milestone,
  journey,
  provider,
}: {
  tokenId:
    string;

  milestone:
    JourneyMilestone;

  journey:
    JourneyResponse;

  provider:
    JsonRpcProvider;
}) {
  await document.fonts.ready;

  const canvas =
    document.createElement(
      "canvas",
    );

  canvas.width =
    1200;

  canvas.height =
    1200;

  const ctx =
    canvas.getContext(
      "2d",
    );

  if (
    !ctx
  ) {
    throw new Error(
      "Canvas unavailable.",
    );
  }

  const ink =
    "#ccff00";

  const background =
    "#000000";

  const font =
    getComputedStyle(
      document.body,
    ).fontFamily ||
    "monospace";

  const shareTitle =
    (
      milestone.title?.trim() ||
      milestone.name?.trim() ||
      milestone.app?.replaceAll(
        "_",
        " ",
      ).trim() ||
      "JOURNEY"
    ).toUpperCase();

  ctx.fillStyle =
    background;

  ctx.fillRect(
    0,
    0,
    1200,
    1200,
  );

  ctx.strokeStyle =
    ink;

  ctx.lineWidth =
    8;

  ctx.strokeRect(
    36,
    36,
    1128,
    1128,
  );

  /*
   * HOOD IT is the brand statement.
   *
   * We intentionally removed the duplicate
   * ONCHAINHOODIES label from the top.
   */
  ctx.fillStyle =
    ink;

  ctx.font =
    `700 142px ${font}`;

  ctx.fillText(
    "HOOD IT",
    70,
    215,
  );

  try {
    const journeyIcon = await loadCanvasImage(
      "https://unpkg.com/pixelarticons@latest/svg/flag.svg",
    );
    ctx.drawImage(journeyIcon, 1072, 78, 56, 56);
  } catch (iconError) {
    console.debug("Journey export icon unavailable.", iconError);
  }

  /*
   * Use the exact same icon language as the page.
   *
   * The page uses React Pixelarticons.
   * The generated PNG uses the matching raw SVG files.
   */
  const milestoneIconSource =
    shareIconSource(
      milestone,
    );

  if (
    milestoneIconSource
  ) {
    const milestoneIcon =
      await loadCanvasImage(
        milestoneIconSource,
      );

    ctx.drawImage(
      milestoneIcon,
      910,
      82,
      180,
      180,
    );
  }

  ctx.font =
    `700 38px ${font}`;

  ctx.fillText(
    shareTitle,
    74,
    320,
  );

  /*
   * Main artwork.
   *
   * HoodWallet + Hood Talk:
   *   Hoodie artwork.
   *
   * Ping:
   *   the ACTUAL matching Ping NFT artwork from
   *   Ping.tokenURI(tokenId) over RPC.
   */
  let mainArtworkSource =
    art(
      tokenId,
    );

  if (
    milestone.key ===
    "pingClaimed"
  ) {
    const onchainImage =
      await resolveTokenImageFromChain(
        provider,
        PING_CONTRACT,
        String(
          journey.ping.tokenId ||
          tokenId,
        ),
      );

    /*
     * Ping is fully onchain and normally returns:
     *
     * data:image/svg+xml;base64,...
     *
     * Load that directly through loadCanvasImage().
     * For a normal remote URL, use the existing image proxy.
     */
    mainArtworkSource =
      onchainImage.startsWith(
        "data:image/",
      )
        ? onchainImage
        : `/api/nft-image?url=${encodeURIComponent(
            onchainImage,
          )}`;
  }

  const mainArtwork =
    await loadCanvasImage(
      mainArtworkSource,
    );

  ctx.fillStyle =
    ink;

  ctx.fillRect(
    72,
    390,
    590,
    590,
  );

  ctx.drawImage(
    mainArtwork,
    72,
    390,
    590,
    590,
  );

  /*
   * Identity belongs directly under the artwork.
   */
  ctx.font =
    `700 28px ${font}`;

  ctx.fillText(
    `ONCHAINHOODIES #${tokenId}`,
    72,
    1035,
  );

  /*
   * Exact Pixelarticons checkmark.
   * Same icon family as the Journey page.
   */
  const checkIcon =
    await loadCanvasImage(
      "/journey/check.svg",
    );

  ctx.drawImage(
    checkIcon,
    720,
    430,
    52,
    52,
  );

  ctx.font =
    `700 28px ${font}`;

  ctx.fillText(
    "IN JOURNEY",
    790,
    468,
  );

  /*
   * Personal copy is milestone-specific.
   */
  let personalCopy =
    "A NEW CHAPTER ONCHAIN.";

  if (
    milestone.key ===
    "hoodWalletActivated"
  ) {
    personalCopy =
      "MY HOODIE HAS ITS OWN WALLET.";
  }

  if (
    milestone.key ===
    "pingClaimed"
  ) {
    personalCopy =
      journey.ping.state ===
        "home"
        ? "PING IS HOME."
        : "PING JOINED MY HOODIE'S JOURNEY.";
  }

  if (
    milestone.key ===
    "hoodTalkSpoken"
  ) {
    const quote =
      journey.hoodTalk.latest?.quote?.trim();

    personalCopy =
      quote
        ? `“${quote}”`
        : "MY HOODIE SPOKE ONCHAIN.";
  }

  if (
    milestone.key ===
    "hooneySwap"
  ) {
    personalCopy =
      "SWAPPED IN THE HIVE.";
  }

  if (
    milestone.key ===
    "hoodlitaireWon"
  ) {
    personalCopy =
      "WON HOODLITAIRE.";
  }

  if (
    milestone.key ===
    "hoodieStudioArtwork"
  ) {
    personalCopy =
      "CREATED ONCHAIN ART.";
  }

if (
  milestone.season2
) {
  ctx.fillStyle =
    ink;

  ctx.fillRect(
    720,
    900,
    350,
    42,
  );

  ctx.fillStyle =
    background;

  ctx.font =
    `700 18px ${font}`;

  ctx.fillText(
    "SEASON 2 BUILDER ACTION",
    735,
    928,
  );

  ctx.fillStyle =
    ink;
}

  ctx.font =
    `700 38px ${font}`;

  wrapCanvasText(
    ctx,
    personalCopy,
    720,
    585,
    410,
    52,
    7,
  );

  ctx.font =
    `400 20px ${font}`;

  ctx.fillText(
    "ROBINHOOD CHAIN",
    720,
    1018,
  );

  const blob =
    await new Promise<Blob>(
      (
        resolve,
        reject,
      ) => {
        canvas.toBlob(
          result =>
            result
              ? resolve(
                  result,
                )
              : reject(
                  new Error(
                    "PNG render failed.",
                  ),
                ),
          "image/png",
        );
      },
    );

  return {
    url:
      URL.createObjectURL(
        blob,
      ),

    filename:
      `hood-it-${tokenId}-${milestone.key}.png`,
  };
}

function JourneyRow({
  milestone,
  journey,
  checkedIn,
  checkingIn,
  sharing,
  canManage,
  onHoodIt,
  onShare,
}: {
  milestone:
    JourneyMilestone;

  journey:
    JourneyResponse;

  checkedIn:
    boolean;

  checkingIn:
    boolean;

  sharing:
    boolean;

  canManage:
    boolean;

  onHoodIt:
    (
      m:
        JourneyMilestone,
    ) => void;

  onShare:
    (
      m:
        JourneyMilestone,
    ) => void;
}) {
  const t = task(milestone, journey);
  const canHoodIt =
    canManage &&
    milestone.completed &&
    journey.hoodWallet.active &&
    !checkedIn;

  return (
    <article className={`border border-[var(--hood-fg)] transition-colors ${checkedIn ? "bg-[var(--hood-fg)] text-[var(--hood-bg)]" : ""}`}>
      <div className="grid gap-5 p-5 md:grid-cols-[84px_220px_minmax(0,1fr)_185px] md:items-center">
        <div
          className={`flex h-[80px] w-[80px] items-center justify-center border ${
            checkedIn
              ? "border-[var(--hood-bg)]"
              : "border-[var(--hood-fg)]"
          }`}
        >
         <MilestoneVisual
  milestone={
    milestone
  }
/>
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] opacity-65">
            {milestone.app?.replaceAll("_", " ") || "OCH"}
          </p>

          <h3 className="mt-2 text-[32px] uppercase leading-none tracking-[-0.045em]">
            {milestone.title || milestone.name || milestone.app || "Journey"}
          </h3>
        </div>

        <div>
          <div className="flex items-center gap-2 text-[18px] uppercase tracking-[0.035em]">
            {checkedIn ? (
              <>
                <Check
                  width={24}
                  height={24}
                  aria-hidden="true"
                  className="shrink-0"
                />
                <span>ALREADY PART OF THE STORY</span>
              </>
            ) : (
              <span>{t.status}</span>
            )}
          </div>

          <p className="mt-3 max-w-xl text-[16px] uppercase leading-relaxed opacity-90">
  {checkedIn
    ? `${milestone.name} is in Hoodie #${journey.tokenId}'s Journey.`
    : t.text}
</p>
          {!checkedIn && (
            t.href.startsWith("http") ? (
              <a
                href={t.href}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block text-[10px] uppercase underline underline-offset-4"
              >
                {t.cta} →
              </a>
            ) : (
              <Link
                href={t.href}
                className="mt-3 inline-block text-[10px] uppercase underline underline-offset-4"
              >
                {t.cta} →
              </Link>
            )
          )}
        </div>
        <div className="md:text-right">
          {checkedIn ? (
            <button
              type="button"

              disabled={
                sharing
              }

              onClick={() =>
                onShare(
                  milestone,
                )
              }

              className="min-h-[48px] w-full border border-[var(--hood-bg)] px-4 text-[9px] uppercase tracking-[0.18em] transition-opacity hover:opacity-70 disabled:cursor-wait disabled:opacity-50 md:w-[165px]"
            >
              {sharing
                ? "Generating…"
                : "Save PNG"}
            </button>
          ) : (
            <button
              type="button"
              disabled={!canHoodIt || checkingIn}
              onClick={() => onHoodIt(milestone)}
              className={`min-h-[48px] w-full border px-4 text-[9px] uppercase tracking-[0.18em] md:w-[165px] ${canHoodIt ? "border-[var(--hood-fg)] bg-[var(--hood-fg)] text-[var(--hood-bg)]" : "border-[var(--hood-fg)] opacity-25"} disabled:cursor-not-allowed`}
            >
              {checkingIn ? "Hooding it…" : canHoodIt ? "Hood it" : milestone.completed && !journey.hoodWallet.active ? "Activate first" : "Hood it"}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}



function isSeason2Milestone(
  milestone: JourneyMilestone,
) {
  return milestone.season2 === true;
}

function Season2Panel({
  visible,
}: {
  visible: boolean;
}) {
  if (!visible) return null;

  return (
    <div className="mt-10 border border-[var(--hood-fg)] bg-[var(--hood-fg)] p-5 md:p-6 text-[var(--hood-bg)]">
      <p className="text-[10px] uppercase tracking-[0.16em]">
        Season 2
      </p>

      <h3 className="mt-3 text-5xl uppercase tracking-[-0.05em]">
        Play through the Hood
      </h3>

      <p className="mt-4 max-w-xl text-[11px] uppercase leading-relaxed">
        Hoodies collect.
        Builders create.
      </p>

      <div className="mt-8 grid gap-8 text-[14px] uppercase leading-relaxed md:grid-cols-3">
        <div>
          <p className="text-[18px]">10% $OCH</p>
          <p className="mt-1">
            → Every Hoodie
          </p>
          <p className="mt-1 opacity-70">
            Automatic allocation
          </p>
        </div>

        <div>
          <p className="text-[18px]">10% $OCH</p>
          <p className="mt-1">
            → Ecosystem growth
          </p>
          <p className="mt-1 opacity-70">
            HOOD IT
          </p>
        </div>

        <div>
          <p className="text-[22px]">5% $OCH</p>
          <p className="mt-1">
            → Community & X
          </p>
          <p className="mt-1 opacity-70">
            In cooperation with HoodX
            <br />
            Tag @onchainhoodies
          </p>
        </div>
      </div>
    </div>
  );
}

function shortAddress(
  address:
    string | null,
) {
  if (!address) {
    return "HOODWALLET UNKNOWN";
  }

  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function saveObjectUrl(
  url: string,
  filename: string,
) {
  const anchor =
    document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(
    () => URL.revokeObjectURL(url),
    1500,
  );
}

function statsChartRows(
  milestones: JourneyMilestonesResponse | null,
) {
  if (!milestones) return [];

  return milestones.milestones.map(
    milestone => ({
      key: milestone.key,
      label:
        milestone.title ||
        milestone.name ||
        milestone.app.replaceAll("_", " "),
      value: milestone.recordedCount || 0,
      season2: milestone.season2 === true,
    }),
  );
}

function JourneyStatsChart({
  milestones,
}: {
  milestones: JourneyMilestonesResponse | null;
}) {
  const rows = statsChartRows(milestones);
  const maximum = Math.max(
    1,
    ...rows.map(row => row.value),
  );

  if (!rows.length) {
    return (
      <div className="grid min-h-[360px] place-items-center border border-[var(--hood-fg)] p-8 text-center">
        <p className="text-[11px] uppercase tracking-[0.14em] opacity-60">
          Milestone activity is loading…
        </p>
      </div>
    );
  }

  const width = 1000;
  const height = Math.max(390, rows.length * 66 + 95);
  const left = 220;
  const right = 70;
  const top = 38;
  const bottom = 46;
  const chartWidth = width - left - right;
  const rowHeight = (height - top - bottom) / rows.length;

  return (
    <div className="border border-[var(--hood-fg)] p-3 md:p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[9px] uppercase tracking-[0.16em] opacity-55">
            Journey activity
          </p>
          <p className="mt-2 text-2xl uppercase tracking-[-0.04em]">
            Hood Its by milestone
          </p>
        </div>

        <p className="text-[8px] uppercase tracking-[0.13em] opacity-50">
          Recorded onchain
        </p>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Journey Hood Its by milestone"
        className="h-auto w-full overflow-visible"
      >
        {[0, 0.25, 0.5, 0.75, 1].map(step => {
          const x = left + chartWidth * step;
          const axisValue = Math.round(maximum * step);

          return (
            <g key={step}>
              <line
                x1={x}
                x2={x}
                y1={top}
                y2={height - bottom}
                stroke="currentColor"
                strokeOpacity="0.14"
                strokeWidth="1"
              />
              <text
                x={x}
                y={height - 15}
                textAnchor="middle"
                fill="currentColor"
                fillOpacity="0.5"
                fontSize="12"
              >
                {axisValue}
              </text>
            </g>
          );
        })}

        {rows.map((row, index) => {
          const y = top + index * rowHeight;
          const barY = y + rowHeight * 0.24;
          const barHeight = rowHeight * 0.48;
          const barWidth =
            row.value === 0
              ? 2
              : Math.max(
                  3,
                  (row.value / maximum) * chartWidth,
                );

          return (
            <g key={row.key}>
              <text
                x={left - 18}
                y={barY + barHeight / 2 + 5}
                textAnchor="end"
                fill="currentColor"
                fontSize="14"
              >
                {row.label.toUpperCase()}
              </text>

              <rect
                x={left}
                y={barY}
                width={barWidth}
                height={barHeight}
                fill="currentColor"
              />

              <text
                x={Math.min(
                  left + barWidth + 12,
                  width - 35,
                )}
                y={barY + barHeight / 2 + 5}
                fill="currentColor"
                fontSize="14"
              >
                {row.value}
              </text>

              {row.season2 ? (
                <text
                  x={left - 18}
                  y={barY + barHeight / 2 + 22}
                  textAnchor="end"
                  fill="currentColor"
                  fillOpacity="0.5"
                  fontSize="9"
                >
                  SEASON 2
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

async function makeStatsExport({
  leaderboard,
  milestones,
}: {
  leaderboard: LeaderboardResponse;
  milestones: JourneyMilestonesResponse | null;
}) {
  await document.fonts.ready;

  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 1200;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable.");

  const background = "#000000";
  const ink = "#ccff00";
  const font =
    getComputedStyle(document.body).fontFamily ||
    "monospace";

  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = ink;
  ctx.lineWidth = 8;
  ctx.strokeRect(36, 36, 1128, 1128);

  ctx.fillStyle = ink;
  ctx.font = `700 100px ${font}`;
  ctx.fillText("HOOD IT", 72, 165);

  ctx.font = `700 38px ${font}`;
  ctx.fillText("JOURNEY STATS", 76, 225);

  const cards = [
    ["TOTAL HOOD ITS", leaderboard.summary.totalHoodIts],
    ["HOODIES WITH HISTORY", leaderboard.summary.hoodiesWithHistory],
    ["HOONEY", leaderboard.summary.hooneyHoodIts],
    ["HOODLITAIRE", leaderboard.summary.hoodlitaireHoodIts],
  ] as const;

  cards.forEach(([label, value], index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = 76 + column * 520;
    const y = 300 + row * 175;

    ctx.strokeStyle = ink;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, 470, 140);

    ctx.fillStyle = ink;
    ctx.font = `400 18px ${font}`;
    ctx.fillText(label, x + 24, y + 34);

    ctx.font = `700 62px ${font}`;
    ctx.fillText(
      Number(value).toLocaleString(),
      x + 24,
      y + 108,
    );
  });

  const rows = statsChartRows(milestones);
  const maximum = Math.max(
    1,
    ...rows.map(row => row.value),
  );

  ctx.font = `700 26px ${font}`;
  ctx.fillText("HOOD ITS BY MILESTONE", 76, 705);

  rows.forEach((row, index) => {
    const y = 760 + index * 62;
    const maxBarWidth = 570;
    const barWidth =
      row.value === 0
        ? 2
        : Math.max(
            3,
            (row.value / maximum) * maxBarWidth,
          );

    ctx.font = `400 17px ${font}`;
    ctx.fillText(
      row.label.toUpperCase(),
      76,
      y + 20,
    );

    ctx.fillRect(
      390,
      y,
      barWidth,
      28,
    );

    ctx.font = `700 18px ${font}`;
    ctx.fillText(
      String(row.value),
      Math.min(985, 410 + barWidth),
      y + 21,
    );
  });

  ctx.font = `400 18px ${font}`;
  ctx.fillText(
    "ONCHAINHOODIES · ROBINHOOD CHAIN",
    76,
    1110,
  );

  const blob = await new Promise<Blob>(
    (resolve, reject) => {
      canvas.toBlob(
        result =>
          result
            ? resolve(result)
            : reject(
                new Error(
                  "Stats PNG render failed.",
                ),
              ),
        "image/png",
      );
    },
  );

  return {
    url: URL.createObjectURL(blob),
    filename: "onchainhoodies-journey-stats.png",
  };
}

async function makeLeaderboardExport(
  leaderboard: LeaderboardResponse,
) {
  await document.fonts.ready;

  const topTen =
    leaderboard.entries.slice(0, 10);

  const canvas =
    document.createElement("canvas");

  canvas.width = 1200;
  canvas.height = 1500;

  const ctx =
    canvas.getContext("2d");

  if (!ctx) {
    throw new Error(
      "Canvas unavailable.",
    );
  }

  const background = "#000000";
  const ink = "#ccff00";
  const font =
    getComputedStyle(document.body).fontFamily ||
    "monospace";

  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = ink;
  ctx.lineWidth = 8;
  ctx.strokeRect(36, 36, 1128, 1428);

  ctx.fillStyle = ink;
  ctx.font = `700 94px ${font}`;
  ctx.fillText("HOOD IT", 72, 155);

  ctx.font = `700 36px ${font}`;
  ctx.fillText("TOP 10 · JOURNEY LEADERBOARD", 76, 215);

  ctx.font = `400 18px ${font}`;
  ctx.fillText(
    `${leaderboard.summary.totalHoodIts} HOOD ITS · ${leaderboard.summary.hoodiesWithHistory} HOODIES WITH HISTORY`,
    76,
    258,
  );

  for (
    let index = 0;
    index < topTen.length;
    index += 1
  ) {
    const entry = topTen[index];
    const y = 310 + index * 108;

    ctx.strokeStyle = ink;
    ctx.lineWidth = 1;
    ctx.strokeRect(
      72,
      y,
      1056,
      92,
    );

    ctx.fillStyle = ink;
    ctx.font = `700 34px ${font}`;
    ctx.fillText(
      `#${entry.rank}`,
      92,
      y + 57,
    );

    try {
      const artwork =
        await loadCanvasImage(
          entry.image,
        );

      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        artwork,
        190,
        y + 10,
        72,
        72,
      );
    } catch {
      ctx.strokeRect(
        190,
        y + 10,
        72,
        72,
      );
    }

    ctx.font = `700 24px ${font}`;
    ctx.fillText(
      `HOODIE #${entry.tokenId}`,
      292,
      y + 42,
    );

    ctx.font = `400 15px ${font}`;
    ctx.fillText(
      entry.hoodWallet
        ? shortAddress(entry.hoodWallet)
        : "HOODWALLET UNKNOWN",
      292,
      y + 68,
    );

    ctx.font = `700 34px ${font}`;
    ctx.textAlign = "right";
    ctx.fillText(
      String(entry.hoodItCount),
      1084,
      y + 47,
    );

    ctx.font = `400 13px ${font}`;
    ctx.fillText(
      entry.hoodItCount === 1
        ? "HOOD IT"
        : "HOOD ITS",
      1084,
      y + 70,
    );

    ctx.textAlign = "left";
  }

  ctx.font = `400 18px ${font}`;
  ctx.fillText(
    "ONCHAINHOODIES · ROBINHOOD CHAIN",
    76,
    1410,
  );

  const blob =
    await new Promise<Blob>(
      (resolve, reject) => {
        canvas.toBlob(
          result =>
            result
              ? resolve(result)
              : reject(
                  new Error(
                    "Leaderboard PNG render failed.",
                  ),
                ),
          "image/png",
        );
      },
    );

  return {
    url: URL.createObjectURL(blob),
    filename: "onchainhoodies-journey-top-10.png",
  };
}

function StatsPanel({
  leaderboard,
  milestones,
  loading,
  exporting,
  onExport,
}: {
  leaderboard: LeaderboardResponse | null;
  milestones: JourneyMilestonesResponse | null;
  loading: boolean;
  exporting: boolean;
  onExport: () => void;
}) {
  if (
    loading &&
    !leaderboard
  ) {
    return (
      <div className="border border-[var(--hood-fg)] p-10 text-center text-[12px] uppercase tracking-[0.14em]">
        Reading Journey stats…
      </div>
    );
  }

  if (!leaderboard) {
    return (
      <div className="border border-[var(--hood-fg)] p-10 text-center text-[12px] uppercase tracking-[0.14em]">
        Journey stats unavailable.
      </div>
    );
  }

  const cards = [
    [
      "Total Hood Its",
      leaderboard.summary.totalHoodIts,
    ],
    [
      "Hoodies With History",
      leaderboard.summary.hoodiesWithHistory,
    ],
    [
      "Hooney",
      leaderboard.summary.hooneyHoodIts,
    ],
    [
      "Hoodlitaire",
      leaderboard.summary.hoodlitaireHoodIts,
    ],
  ] as const;

  return (
    <div>
      <div className="flex flex-col gap-4 border-b border-[var(--hood-fg)] pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[12px] uppercase tracking-[0.18em] opacity-60">
            Onchain activity
          </p>

          <h3 className="mt-2 text-4xl uppercase tracking-[-0.05em] md:text-5xl">
            Journey Stats
          </h3>
        </div>

        <button
          type="button"
          onClick={onExport}
          disabled={exporting}
          className="min-h-[48px] border border-[var(--hood-fg)] px-5 text-[9px] uppercase tracking-[0.14em] hover:bg-[var(--hood-fg)] hover:text-[var(--hood-bg)] disabled:cursor-wait disabled:opacity-50"
        >
          {exporting
            ? "Generating PNG…"
            : "Export stats PNG"}
        </button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {cards.map(
          ([
            label,
            value,
          ]) => (
            <div
              key={label}
              className="border border-[var(--hood-fg)] p-6"
            >
              <p className="text-[11px] uppercase tracking-[0.16em] opacity-65">
                {label}
              </p>

              <p className="mt-4 text-6xl leading-none tracking-[-0.06em] md:text-7xl">
                {Number(
                  value,
                ).toLocaleString()}
              </p>
            </div>
          ),
        )}
      </div>

      <div className="mt-4">
        <JourneyStatsChart
          milestones={milestones}
        />
      </div>
    </div>
  );
}

function LeaderboardPanel({
  leaderboard,
  loading,
  searchValue,
  onSearchValueChange,
  onSearch,
  searching,
  searchResult,
  selectedTokenId,
  exporting,
  onExport,
}: {
  leaderboard:
    LeaderboardResponse | null;

  loading:
    boolean;

  searchValue:
    string;

  onSearchValueChange:
    (value: string) => void;

  onSearch:
    () => void;

  searching:
    boolean;

  searchResult:
    RankResponse | null;

  selectedTokenId:
    string;

  exporting:
    boolean;

  onExport:
    () => void;
}) {
  if (
    loading &&
    !leaderboard
  ) {
    return (
      <div className="border border-[var(--hood-fg)] p-10 text-center text-[12px] uppercase tracking-[0.14em]">
        Reading leaderboard…
      </div>
    );
  }

  if (!leaderboard) {
    return (
      <div className="border border-[var(--hood-fg)] p-10 text-center text-[12px] uppercase tracking-[0.14em]">
        Leaderboard unavailable.
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-4 border-b border-[var(--hood-fg)] pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[12px] uppercase tracking-[0.18em] opacity-60">
            Onchain ranking
          </p>

          <h3 className="mt-2 text-4xl uppercase tracking-[-0.05em] md:text-5xl">
            Hood It Leaderboard
          </h3>
        </div>

        <div className="flex w-full max-w-[620px] flex-col gap-2 sm:flex-row">
          <form
            className="flex min-w-0 flex-1"
            onSubmit={event => {
              event.preventDefault();
              onSearch();
            }}
          >
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            value={searchValue}
            onChange={event =>
              onSearchValueChange(
                event.target.value.replace(
                  /\D/g,
                  "",
                ),
              )
            }
            placeholder="SEARCH HOODIE #"
            aria-label="Search Hoodie ID"
            className="min-h-[52px] min-w-0 flex-1 border border-r-0 border-[var(--hood-fg)] bg-transparent px-4 text-[13px] uppercase outline-none placeholder:text-[var(--hood-fg)] placeholder:opacity-45"
          />

          <button
            type="submit"
            disabled={
              searching ||
              !searchValue
            }
            className="min-h-[52px] border border-[var(--hood-fg)] bg-[var(--hood-fg)] px-5 text-[10px] uppercase tracking-[0.14em] text-[var(--hood-bg)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {searching
              ? "Searching…"
              : "Find"}
          </button>
          </form>

          <button
            type="button"
            onClick={onExport}
            disabled={exporting || leaderboard.entries.length === 0}
            className="min-h-[52px] border border-[var(--hood-fg)] px-5 text-[9px] uppercase tracking-[0.14em] hover:bg-[var(--hood-fg)] hover:text-[var(--hood-bg)] disabled:cursor-wait disabled:opacity-40"
          >
            {exporting
              ? "Generating…"
              : "Export Top 10 PNG"}
          </button>
        </div>
      </div>

      {searchResult && (
        <div className="mt-4 border-2 border-[var(--hood-fg)]">
          <div className="border-b border-[var(--hood-fg)] bg-[var(--hood-fg)] px-4 py-3 text-[var(--hood-bg)]">
            <p className="text-[10px] uppercase tracking-[0.16em]">
              Hoodie search
            </p>
          </div>

          <div className="grid gap-5 p-4 sm:grid-cols-[112px_minmax(0,1fr)_auto] sm:items-center">
            <a
              href={openSeaItemUrl(
                searchResult.tokenId,
              )}
              target="_blank"
              rel="noreferrer"
              className="block aspect-square w-[112px] border border-[var(--hood-fg)] bg-[#ccff00]"
            >
              <Image
                unoptimized
                src={searchResult.image}
                alt={`OnChainHoodie #${searchResult.tokenId}`}
                width={112}
                height={112}
                className="h-full w-full object-cover"
              />
            </a>

            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] opacity-60">
                {searchResult.rank
                  ? `Rank #${searchResult.rank}`
                  : "No rank yet"}
              </p>

              <a
                href={openSeaItemUrl(
                  searchResult.tokenId,
                )}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-3xl uppercase tracking-[-0.04em] underline-offset-4 hover:underline"
              >
                Hoodie #{searchResult.tokenId}
              </a>

              <p className="mt-3 text-[13px] uppercase">
                {searchResult.hoodItCount}{" "}
                {searchResult.hoodItCount === 1
                  ? "Hood It"
                  : "Hood Its"}
              </p>

              {searchResult.hoodWallet && (
                <a
                  href={
                    searchResult.hoodWalletOpenSea ||
                    openSeaWalletUrl(
                      searchResult.hoodWallet,
                    ) ||
                    "#"
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-[10px] uppercase tracking-[0.08em] underline underline-offset-4 opacity-70"
                  title={searchResult.hoodWallet}
                >
                  {shortAddress(
                    searchResult.hoodWallet,
                  )}
                </a>
              )}
            </div>

            {searchResult.hoodWallet ? (
              <a
                href={openSeaWalletUrl(
                  searchResult.hoodWallet,
                ) || "#"}
                target="_blank"
                rel="noreferrer"
                className="border border-[var(--hood-fg)] px-5 py-4 text-center text-[9px] uppercase tracking-[0.14em] hover:bg-[var(--hood-fg)] hover:text-[var(--hood-bg)]"
              >
                HoodWallet on OpenSea →
              </a>
            ) : (
              <span className="border border-[var(--hood-fg)] px-5 py-4 text-center text-[9px] uppercase tracking-[0.14em] opacity-40">
                HoodWallet unavailable
              </span>
            )}
          </div>
        </div>
      )}

      <div className="mt-4 border border-[var(--hood-fg)]">
        <div className="hidden grid-cols-[70px_88px_minmax(0,1fr)_150px_180px] border-b border-[var(--hood-fg)] px-4 py-3 text-[9px] uppercase tracking-[0.14em] opacity-60 md:grid">
          <span>Rank</span>
          <span>Hoodie</span>
          <span>Identity</span>
          <span>Hood Its</span>
          <span className="text-right">HoodWallet</span>
        </div>

        {leaderboard.entries.map(
          entry => {
            const selected =
              String(
                entry.tokenId,
              ) ===
              selectedTokenId;

            const hoodWalletUrl =
              entry.hoodWalletOpenSea ||
              openSeaWalletUrl(
                entry.hoodWallet,
              );

            return (
              <div
                key={entry.tokenId}
                className={`grid gap-4 border-b border-[var(--hood-fg)] p-4 last:border-b-0 md:grid-cols-[70px_88px_minmax(0,1fr)_150px_180px] md:items-center ${
                  selected
                    ? "bg-[var(--hood-fg)] text-[var(--hood-bg)]"
                    : ""
                }`}
              >
                <div className="text-4xl leading-none tracking-[-0.05em]">
                  #{entry.rank}
                </div>

                <a
                  href={openSeaItemUrl(
                    entry.tokenId,
                  )}
                  target="_blank"
                  rel="noreferrer"
                  className={`block aspect-square w-[88px] border ${
                    selected
                      ? "border-[var(--hood-bg)]"
                      : "border-[var(--hood-fg)]"
                  } bg-[#ccff00]`}
                >
                  <Image
                    unoptimized
                    src={entry.image}
                    alt={`OnChainHoodie #${entry.tokenId}`}
                    width={88}
                    height={88}
                    className="h-full w-full object-cover"
                  />
                </a>

                <div>
                  <a
                    href={openSeaItemUrl(
                      entry.tokenId,
                    )}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[24px] uppercase tracking-[-0.035em] underline-offset-4 hover:underline"
                  >
                    Hoodie #{entry.tokenId}
                  </a>

                  {selected && (
                    <p className="mt-2 text-[9px] uppercase tracking-[0.14em]">
                      Your selected Hoodie
                    </p>
                  )}
                </div>

                <div>
                  <p className="text-4xl leading-none tracking-[-0.05em]">
                    {entry.hoodItCount}
                  </p>

                  <p className="mt-2 text-[9px] uppercase tracking-[0.14em] opacity-65">
                    {entry.hoodItCount === 1
                      ? "Hood It"
                      : "Hood Its"}
                  </p>
                </div>

                <div className="md:text-right">
                  {hoodWalletUrl ? (
                    <>
                      <a
                        href={hoodWalletUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] uppercase tracking-[0.06em] underline underline-offset-4"
                        title={entry.hoodWallet || undefined}
                      >
                        {shortAddress(
                          entry.hoodWallet,
                        )}
                      </a>

                      <div>
                        <a
                          href={hoodWalletUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-3 inline-block text-[9px] uppercase underline underline-offset-4"
                        >
                          HoodWallet on OpenSea →
                        </a>
                      </div>
                    </>
                  ) : (
                    <p className="text-[10px] uppercase opacity-40">
                      HoodWallet unknown
                    </p>
                  )}
                </div>
              </div>
            );
          },
        )}

        {!leaderboard.entries.length && (
          <div className="p-10 text-center text-[12px] uppercase tracking-[0.14em]">
            No Hood Its recorded yet.
          </div>
        )}
      </div>
    </div>
  );
}

export default function JourneyPage() {
  const { address, connect, ensureRequiredNetwork, getWalletClient } = useWallet();

  const [darkHood, setDarkHood] = useState(true);
  const [tab, setTab] = useState<Tab>("journey");
  const [ownedHoodies, setOwnedHoodies] = useState<OwnedHoodie[]>([]);
  const [activeHoodies, setActiveHoodies] = useState<Record<string, boolean>>({});
  const [selectedTokenId, setSelectedTokenId] = useState("");
  const [journey, setJourney] = useState<JourneyResponse | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardResponse | null>(null);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [milestoneCatalog, setMilestoneCatalog] =
    useState<JourneyMilestonesResponse | null>(null);
  const [statsExporting, setStatsExporting] = useState(false);
  const [leaderboardExporting, setLeaderboardExporting] = useState(false);
  const [leaderboardSearch, setLeaderboardSearch] = useState("");
  const [leaderboardSearchResult, setLeaderboardSearchResult] = useState<RankResponse | null>(null);
  const [leaderboardSearching, setLeaderboardSearching] = useState(false);
  const [pending, setPending] = useState<PendingMap>({});
  const [ownershipLoading, setOwnershipLoading] = useState(false);
  const [ownershipChecked, setOwnershipChecked] = useState(false);
  const [journeyLoading, setJourneyLoading] = useState(false);
  const [checkingInKey, setCheckingInKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sharingKey, setSharingKey] = useState<string | null>(null);

  const provider = useMemo(() => {
    if (!siteConfig.rpcUrl) return null;
    return new JsonRpcProvider(siteConfig.rpcUrl, Number(siteConfig.chainId), { staticNetwork: true });
  }, []);

  useEffect(() => {
    let cancelled =
      false;

    queueMicrotask(
      () => {
        if (
          !cancelled
        ) {
          setPending(
            readPending(
              address,
            ),
          );
        }
      },
    );

    return () => {
      cancelled =
        true;
    };
  }, [address]);

  const updatePending = useCallback((fn: (current: PendingMap) => PendingMap) => {
    setPending(current => {
      const next = fn(current);
      if (address && typeof window !== "undefined") {
        try {
          const key = storageKey(address);
          if (Object.keys(next).length) localStorage.setItem(key, JSON.stringify(next));
          else localStorage.removeItem(key);
        } catch {}
      }
      return next;
    });
  }, [address]);

  const loadActiveBadges = useCallback(async (hoodies: OwnedHoodie[]) => {
    if (!provider || !hoodies.length) return;
    const hoodOS = new Contract(siteConfig.hoodOSAddress, HOOD_OS_ABI, provider);
    const result: Record<string, boolean> = {};

    for (let start = 0; start < hoodies.length; start += 10) {
      const chunk = hoodies.slice(start, start + 10);
      const states = await Promise.all(chunk.map(async hoodie => {
        try {
          return [hoodie.tokenId, Boolean(await hoodOS.isActive(BigInt(hoodie.tokenId)))] as const;
        } catch {
          return [hoodie.tokenId, false] as const;
        }
      }));
      states.forEach(([id, active]) => { result[id] = active; });
    }

    setActiveHoodies(result);
  }, [provider]);

useEffect(() => {
  if (typeof window === "undefined") {
    return;
  }

  const params =
    new URLSearchParams(
      window.location.search,
    );

  const hoodie =
    params.get("hoodie");

  if (!hoodie) {
    return;
  }

  const id =
    Number(hoodie);

  if (
    !Number.isInteger(id) ||
    id < 0 ||
    id > 5999
  ) {
    return;
  }

  const timeoutId =
    window.setTimeout(
      () => {
        setSelectedTokenId(
          String(id),
        );
      },
      0,
    );

  return () => {
    window.clearTimeout(
      timeoutId,
    );
  };
}, []);

  useEffect(() => {
    if (!selectedTokenId || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("hoodie", selectedTokenId);
    window.history.replaceState({}, "", `${url.pathname}?${url.searchParams.toString()}`);
  }, [selectedTokenId]);

  const loadOwnership = useCallback(async () => {
    if (!address) {
      setOwnedHoodies([]);
      setActiveHoodies({});
      setOwnershipChecked(false);
      return;
    }

    setOwnershipLoading(true);
    setOwnershipChecked(false);
    setError(null);

    try {
      const response = await fetch(`/api/hoodies?${new URLSearchParams({ owner: address })}`, { cache: "no-store" });
      const payload = await response.json() as OwnershipResponse;
      if (!response.ok) throw new Error(payload.error || "Unable to load Hoodie ownership.");

      const unique = Array.from(new Map((payload.items || []).map(hoodie => [
        String(hoodie.tokenId),
        { ...hoodie, tokenId: String(hoodie.tokenId) },
      ])).values()).sort((a, b) => BigInt(a.tokenId) < BigInt(b.tokenId) ? -1 : 1);

      setOwnedHoodies(unique);
      setSelectedTokenId(current => current || unique[0]?.tokenId || "");
      void loadActiveBadges(unique);
    } catch (e) {
      setOwnedHoodies([]);
      setJourney(null);
      setError(err(e, "Unable to load Hoodie ownership."));
    } finally {
      setOwnershipLoading(false);
      setOwnershipChecked(true);
    }
  }, [address, loadActiveBadges]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) void loadOwnership(); });
    return () => { cancelled = true; };
  }, [loadOwnership]);

  const loadJourney = useCallback(async (tokenIdInput?: string) => {
    const tokenId = tokenIdInput || selectedTokenId;
    if (!tokenId) return;

    setJourneyLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API}/v1/token/${encodeURIComponent(tokenId)}/journey`, {
        cache: "no-store",
        headers: { accept: "application/json" },
      });
      const payload = await response.json() as JourneyResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error || `Unable to load Hoodie #${tokenId} Journey.`);

      updatePending(current => {
        const next = { ...current };
        let changed = false;
        payload.milestones.forEach(m => {
          if (m.recorded) {
            const key = localKey(tokenId, m.key);
            if (next[key]) {
              delete next[key];
              changed = true;
            }
          }
        });
        return changed ? next : current;
      });

      setJourney(payload);
      setActiveHoodies(current => ({ ...current, [tokenId]: payload.hoodWallet.active }));
    } catch (e) {
      setJourney(null);
      setError(err(e, `Unable to load Hoodie #${tokenId} Journey.`));
    } finally {
      setJourneyLoading(false);
    }
  }, [selectedTokenId, updatePending]);

  useEffect(() => {
    if (!selectedTokenId) return;
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) void loadJourney(selectedTokenId); });
    return () => { cancelled = true; };
  }, [selectedTokenId, loadJourney]);

  const loadLeaderboard =
    useCallback(
      async () => {
        setLeaderboardLoading(
          true,
        );

        try {
          const [
            leaderboardResponse,
            milestonesResponse,
          ] =
            await Promise.all([
              fetch(
                `${API}/v1/journey/leaderboard?limit=20`,
                {
                  cache:
                    "no-store",
                  headers: {
                    accept:
                      "application/json",
                  },
                },
              ),
              fetch(
                `${API}/v1/journey/milestones`,
                {
                  cache:
                    "no-store",
                  headers: {
                    accept:
                      "application/json",
                  },
                },
              ),
            ]);

          if (
            !leaderboardResponse.ok
          ) {
            throw new Error(
              "Unable to load Journey leaderboard.",
            );
          }

          const leaderboardPayload =
            await leaderboardResponse.json() as LeaderboardResponse;

          setLeaderboard(
            leaderboardPayload,
          );

          if (
            milestonesResponse.ok
          ) {
            setMilestoneCatalog(
              await milestonesResponse.json() as JourneyMilestonesResponse,
            );
          }
        } catch (e) {
          console.error(e);

          setError(
            err(
              e,
              "Unable to load Journey leaderboard.",
            ),
          );
        } finally {
          setLeaderboardLoading(
            false,
          );
        }
      },
      [],
    );

  const openLeaderboard =
    useCallback(
      () => {
        setTab(
          "leaderboard",
        );

        if (
          !leaderboard &&
          !leaderboardLoading
        ) {
          void loadLeaderboard();
        }
      },
      [
        leaderboard,
        leaderboardLoading,
        loadLeaderboard,
      ],
    );

  const openStats =
    useCallback(
      () => {
        setTab(
          "stats",
        );

        if (
          !leaderboard &&
          !leaderboardLoading
        ) {
          void loadLeaderboard();
        }
      },
      [
        leaderboard,
        leaderboardLoading,
        loadLeaderboard,
      ],
    );

  const searchLeaderboard =
    useCallback(
      async () => {
        const tokenId =
          Number(
            leaderboardSearch,
          );

        if (
          !Number.isInteger(
            tokenId,
          ) ||
          tokenId <
            0 ||
          tokenId >
            5999
        ) {
          setError(
            "Enter a Hoodie ID between 0 and 5999.",
          );

          return;
        }

        setLeaderboardSearching(
          true,
        );

        setError(
          null,
        );

        try {
          const response =
            await fetch(
              `${API}/v1/journey/rank/${tokenId}`,
              {
                cache:
                  "no-store",
                headers: {
                  accept:
                    "application/json",
                },
              },
            );

          const payload =
            await response.json() as RankResponse & {
              error?:
                string;
            };

          if (
            !response.ok
          ) {
            throw new Error(
              payload.error ||
              `Unable to find Hoodie #${tokenId}.`,
            );
          }

          setLeaderboardSearchResult(
            payload,
          );
        } catch (e) {
          setLeaderboardSearchResult(
            null,
          );

          setError(
            err(
              e,
              "Unable to search the leaderboard.",
            ),
          );
        } finally {
          setLeaderboardSearching(
            false,
          );
        }
      },
      [
        leaderboardSearch,
      ],
    );

  const exportStats =
    useCallback(
      async () => {
        if (!leaderboard) return;

        try {
          setStatsExporting(true);
          setError(null);

          const card =
            await makeStatsExport({
              leaderboard,
              milestones:
                milestoneCatalog,
            });

          saveObjectUrl(
            card.url,
            card.filename,
          );
        } catch (exportError) {
          setError(
            err(
              exportError,
              "Unable to export Journey stats.",
            ),
          );
        } finally {
          setStatsExporting(false);
        }
      },
      [
        leaderboard,
        milestoneCatalog,
      ],
    );

  const exportLeaderboard =
    useCallback(
      async () => {
        if (!leaderboard) return;

        try {
          setLeaderboardExporting(true);
          setError(null);

          const card =
            await makeLeaderboardExport(
              leaderboard,
            );

          saveObjectUrl(
            card.url,
            card.filename,
          );
        } catch (exportError) {
          setError(
            err(
              exportError,
              "Unable to export the Journey leaderboard.",
            ),
          );
        } finally {
          setLeaderboardExporting(false);
        }
      },
      [
        leaderboard,
      ],
    );

  const waitForHash = useCallback(async (hash: string) => {
    if (!provider) throw new Error("RPC provider unavailable.");
    const receipt = await provider.waitForTransaction(hash, 1);
    if (!receipt || receipt.status !== 1) throw new Error("Transaction reverted.");
  }, [provider]);

  const hoodIt = useCallback(async (milestone: JourneyMilestone) => {
    if (!journey?.hoodWallet.address) return;

    const key = localKey(String(journey.tokenId), milestone.key);
    if (milestone.recorded || pending[key]) return;
    if (!milestone.completed) return setError("Complete the action first.");
    if (!journey.hoodWallet.active) return setError("Activate this HoodWallet before you Hood It.");

    try {
      setError(null);
      setCheckingInKey(milestone.key);

      await ensureRequiredNetwork();
      const walletClient = await getWalletClient();
      const data = JOURNEY_IFACE.encodeFunctionData("verifyAndRecord", [
        BigInt(journey.tokenId),
        milestoneId(milestone),
      ]) as Hex;

      const hash = await walletClient.writeContract({
        chain: null,
        address: journey.hoodWallet.address as Address,
        abi: WALLET_EXECUTE_ABI,
        functionName: "execute",
        args: [JOURNEY as Address, BigInt(0), data, CALL],
        value: BigInt(0),
        account: account(walletClient.account),
      });

      await waitForHash(hash);

      // Instant state: no waiting for the hourly indexer.
      updatePending(current => ({ ...current, [key]: true }));
      celebrate();

      // Reconcile with the API; pending state remains until recorded=true.
      window.setTimeout(() => void loadJourney(String(journey.tokenId)), 3000);
    } catch (e) {
      setError(err(e, "HOOD IT transaction failed."));
    } finally {
      setCheckingInKey(null);
    }
  }, [
    ensureRequiredNetwork,
    getWalletClient,
    journey,
    loadJourney,
    pending,
    updatePending,
    waitForHash,
  ]);

  const shareMilestone =
    useCallback(
      async (
        milestone:
          JourneyMilestone,
      ) => {
        if (
          !selectedTokenId
        ) {
          return;
        }

        try {
          setError(
            null,
          );

          setSharingKey(
            milestone.key,
          );

          /*
           * Generate the card only when SHARE is pressed.
           * No modal and no persistent object URL.
           */
          if (
            !journey ||
            !provider
          ) {
            throw new Error(
              "Journey data is not ready yet.",
            );
          }

          const card =
            await makeShareCard({
              tokenId:
                selectedTokenId,

              milestone,

              journey,

              provider,
            });

          /*
           * Direct PNG save.
           * No macOS / iOS share sheet.
           */
          const anchor =
            document.createElement(
              "a",
            );

          anchor.href =
            card.url;

          anchor.download =
            card.filename;

          anchor.style.display =
            "none";

          document.body.appendChild(
            anchor,
          );

          anchor.click();

          anchor.remove();

          window.setTimeout(
            () => {
              URL.revokeObjectURL(
                card.url,
              );
            },
            1500,
          );
        } catch (
          shareError
        ) {
          console.error(
            shareError,
          );

          setError(
            err(
              shareError,
              "Unable to create the HOOD IT card.",
            ),
          );
        } finally {
          setSharingKey(
            null,
          );
        }
      },
      [
        journey,
        provider,
        selectedTokenId,
      ],
    );

  const selectedHoodItCount =
    useMemo(
      () => {
        if (!journey) {
          return 0;
        }

        return journey.milestones.filter(
          milestone =>
            milestone.recorded ||
            pending[
              localKey(
                String(
                  journey.tokenId,
                ),
                milestone.key,
              )
            ],
        ).length;
      },
      [
        journey,
        pending,
      ],
    );

  return (
    <main
      className="min-h-screen bg-[var(--hood-bg)] text-[var(--hood-fg)]"
      style={{
        "--hood-bg": darkHood ? "#000000" : "#ccff00",
        "--hood-fg": darkHood ? "#ccff00" : "#000000",
      } as CSSProperties}
    >
      <SiteHeader />

      <section className="mx-auto max-w-[1400px] px-4 pb-24 pt-20 md:px-6 md:pt-24">
        <div className="flex items-center justify-between border-b border-[var(--hood-fg)] pb-3">
          <p className="text-[9px] uppercase tracking-[0.16em]">OnChainHoodies / Hoodie Journey</p>
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => setDarkHood(v => !v)} className="text-[9px] uppercase">
              {darkHood ? "Lights on" : "Lights off"}
            </button>
            <Link href="/" className="text-[9px] uppercase">Back</Link>
          </div>
        </div>

        <div className="border-b border-[var(--hood-fg)] py-7">
          <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_760px] lg:items-end">
            <div>
              <h1 className="text-5xl leading-none tracking-[-0.055em] md:text-7xl">HOODIE JOURNEY</h1>
              <p className="mt-4 max-w-xl text-sm leading-relaxed opacity-70">
                Every Hoodie builds a history. See where yours has been — and choose where it goes next.
              </p>
            </div>

            <div className="grid gap-6 sm:grid-cols-3">
              {[
                [
                  "1",
                  "Pick your Hoodie",
                  "Choose who you want to explore.",
                ],

                [
                  "2",
                  "See its history",
                  "Discover what it has already done.",
                ],

                [
                  "3",
                  "Hood it onchain",
                  "Add it to the Hoodie’s Journey.",
                ],
              ].map(
                (
                  [
                    n,
                    title,
                    copy,
                  ],
                ) => (
                  <div
                    key={
                      n
                    }
                    className="grid grid-cols-[68px_minmax(0,1fr)] items-center gap-4"
                  >
                    <div className="flex h-[68px] w-[68px] items-center justify-center bg-[var(--hood-fg)] text-[24px] leading-none text-[var(--hood-bg)]">
                      {
                        n
                      }
                    </div>

                    <div>
                      <p className="text-[15px] uppercase leading-none tracking-[0.025em] md:text-[17px]">
                        {
                          title
                        }
                      </p>

                      <p className="mt-3 max-w-[220px] text-[8px] uppercase leading-relaxed opacity-55">
                        {
                          copy
                        }
                      </p>
                    </div>
                  </div>
                ),
              )}
            </div>
          </div>
        </div>

        <HoodieIdentityNav
          tokenId={selectedTokenId}
          active="journey"
          className="mt-5"
        />

        <div className="mt-6 flex flex-col gap-4 border-b border-[var(--hood-fg)] pb-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] opacity-55">
              Explore the Journey
            </p>
            <p className="mt-2 max-w-xl text-[11px] uppercase leading-relaxed opacity-70">
              Journey requires your Hoodie. Stats and leaderboard are public.
            </p>
          </div>

          <div className="grid grid-cols-3 border border-[var(--hood-fg)]">
            <button
              type="button"
              onClick={() => setTab("journey")}
              className={`px-5 py-3 text-[9px] uppercase tracking-[0.14em] ${
                tab === "journey"
                  ? "bg-[var(--hood-fg)] text-[var(--hood-bg)]"
                  : ""
              }`}
            >
              Journey
            </button>

            <button
              type="button"
              onClick={openStats}
              className={`border-l border-[var(--hood-fg)] px-5 py-3 text-[9px] uppercase tracking-[0.14em] ${
                tab === "stats"
                  ? "bg-[var(--hood-fg)] text-[var(--hood-bg)]"
                  : ""
              }`}
            >
              Stats
            </button>

            <button
              type="button"
              onClick={openLeaderboard}
              className={`border-l border-[var(--hood-fg)] px-5 py-3 text-[9px] uppercase tracking-[0.14em] ${
                tab === "leaderboard"
                  ? "bg-[var(--hood-fg)] text-[var(--hood-bg)]"
                  : ""
              }`}
            >
              Leaderboard
            </button>
          </div>
        </div>

        {tab === "stats" ? (
          <div className="mt-5">
            <StatsPanel
              leaderboard={leaderboard}
              milestones={milestoneCatalog}
              loading={leaderboardLoading}
              exporting={statsExporting}
              onExport={() => void exportStats()}
            />
          </div>
        ) : tab === "leaderboard" ? (
          <div className="mt-5">
            <LeaderboardPanel
              leaderboard={leaderboard}
              loading={leaderboardLoading}
              searchValue={leaderboardSearch}
              onSearchValueChange={value => {
                setLeaderboardSearch(value);
                setLeaderboardSearchResult(null);
              }}
              onSearch={() => void searchLeaderboard()}
              searching={leaderboardSearching}
              searchResult={leaderboardSearchResult}
              selectedTokenId={selectedTokenId}
              exporting={leaderboardExporting}
              onExport={() => void exportLeaderboard()}
            />
          </div>
        ) : !address && !selectedTokenId ? (
          <div className="mt-6 border border-[var(--hood-fg)] p-10 text-center">
            <h2 className="text-4xl tracking-[-0.04em]">
              START YOUR JOURNEY
            </h2>

            <p className="mt-4 text-[9px] uppercase opacity-60">
              Connect the wallet holding your Hoodie.
            </p>

            <button
              type="button"
              onClick={() => void connect()}
              className="mt-6 bg-[var(--hood-fg)] px-8 py-4 text-[9px] uppercase tracking-[0.15em] text-[var(--hood-bg)]"
            >
              Connect wallet
            </button>

            <div className="mt-7">
              <a
                href={OPENSEA}
                target="_blank"
                rel="noreferrer"
                className="text-[8px] uppercase underline underline-offset-4"
              >
                Buy secondary on OpenSea →
              </a>
            </div>
          </div>
        ) : ownershipLoading ? (
          <div className="mt-6 border border-[var(--hood-fg)] p-8 text-center text-[9px] uppercase">
            Reading Hoodie ownership…
          </div>
        ) : address && ownershipChecked && ownedHoodies.length === 0 && !selectedTokenId ? (
          <div className="mt-6 border border-[var(--hood-fg)] p-10 text-center">
            <h2 className="text-4xl">
              START YOUR JOURNEY
            </h2>

            <p className="mt-4 text-[9px] uppercase opacity-60">
              No OnChainHoodie found in this wallet.
            </p>
          </div>
        ) : (
          <>
            {address && (
            <section className="mt-7">
              <div className="flex items-end justify-between">
                <h2 className="text-3xl tracking-[-0.04em]">
                  YOUR HOODIES
                </h2>

                <p className="text-[7px] uppercase opacity-50">
                  {ownedHoodies.length} owned
                </p>
              </div>

              <div className="mt-4 flex gap-3 overflow-x-auto pb-4 [scrollbar-width:thin]">
                {ownedHoodies.map(hoodie => (
                  <HoodieTile
                    key={hoodie.tokenId}
                    hoodie={hoodie}
                    selected={
                      hoodie.tokenId ===
                      selectedTokenId
                    }
                    active={
                      activeHoodies[
                        hoodie.tokenId
                      ] === true
                    }
                    onSelect={() => {
                      setError(null);
                      setJourney(null);
                      setSelectedTokenId(
                        hoodie.tokenId,
                      );
                    }}
                  />
                ))}
              </div>
            </section>
            )}

            <section className="mt-10">
              <div className="flex flex-col gap-4 border-b border-[var(--hood-fg)] pb-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-[12px] uppercase tracking-[0.20em] opacity-60">
                    Hoodie #{selectedTokenId}
                  </p>

                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <h2 className="text-6xl tracking-[-0.06em] md:text-7xl">
                      JOURNEY
                    </h2>

                    <span className="border border-[var(--hood-fg)] px-3 py-2 text-[10px] uppercase tracking-[0.12em]">
                      Hood It {selectedHoodItCount}
                    </span>

                    {activeHoodies[selectedTokenId] && (
                      <span className="bg-[var(--hood-fg)] px-3 py-2 text-[8px] uppercase tracking-[0.12em] text-[var(--hood-bg)]">
                        ● Wallet active
                      </span>
                    )}

                    {!address || !ownedHoodies.some(hoodie => hoodie.tokenId === selectedTokenId) ? (
                      <span className="border border-[var(--hood-fg)] px-3 py-2 text-[8px] uppercase tracking-[0.12em] opacity-60">
                        Public view
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              {journeyLoading && !journey ? (
                <div className="mt-4 border border-[var(--hood-fg)] p-8 text-center text-[8px] uppercase">
                  Reading Journey…
                </div>
              ) : journey ? (
                <div className="mt-4">
                  <p className="mb-3 text-[12px] uppercase tracking-[0.20em] opacity-70">
                    Already part of the story
                  </p>

                  <div className="space-y-3">
                    {journey.milestones
                      .filter(
                        m =>
                          m.recorded ||
                          pending[
                            localKey(
                              selectedTokenId,
                              m.key,
                            )
                          ],
                      )
                      .map(m => (
                        <JourneyRow
                          key={m.key}
                          milestone={m}
                          journey={journey}
                          checkedIn
                          checkingIn={false}
                          sharing={
                            sharingKey === m.key
                          }
                          canManage={Boolean(
                            address &&
                            ownedHoodies.some(hoodie => hoodie.tokenId === selectedTokenId)
                          )}
                          onHoodIt={() => {}}
                          onShare={item =>
                            void shareMilestone(
                              item,
                            )
                          }
                        />
                      ))}
                  </div>

                  <p className="mb-3 mt-8 text-[12px] uppercase tracking-[0.20em] opacity-70">
                    What&apos;s next?
                  </p>

                  {journey.milestones.some(
                    isSeason2Milestone,
                  ) && (
                    <div className="mb-4 border border-[var(--hood-fg)] px-4 py-3 text-[9px] uppercase tracking-[0.14em]">
                      Season 2 Builder Actions
                    </div>
                  )}

                  <div className="space-y-3">
                    {journey.milestones
                      .filter(
                        m =>
                          !m.recorded &&
                          !pending[
                            localKey(
                              selectedTokenId,
                              m.key,
                            )
                          ],
                      )
                      .map(m => (
                        <JourneyRow
                          key={m.key}
                          milestone={m}
                          journey={journey}
                          checkedIn={false}
                          checkingIn={
                            checkingInKey ===
                            m.key
                          }
                          sharing={false}
                          canManage={Boolean(
                            address &&
                            ownedHoodies.some(hoodie => hoodie.tokenId === selectedTokenId)
                          )}
                          onHoodIt={item =>
                            void hoodIt(
                              item,
                            )
                          }
                          onShare={() => {}}
                        />
                      ))}
                  </div>

                  <Season2Panel
                    visible={
                      journey.milestones.some(
                        isSeason2Milestone,
                      )
                    }
                  />
                </div>
              ) : null}
            </section>
          </>
        )}

        {error && (
          <div className="mt-5 border border-[var(--hood-fg)] bg-[var(--hood-fg)] p-4 text-[var(--hood-bg)]">
            <p className="text-[8px] uppercase leading-relaxed">{error}</p>
          </div>
        )}
      </section>

      <SiteFooter />
    </main>
  );
}
