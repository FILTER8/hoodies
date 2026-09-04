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
  source: "journey" | "legacy" | null;
  currentlyTrue: boolean;
  completedAt: number | null;
  transactionHash: string | null;
  talkCount?: number;
  state?: PingState;

  qualification?: {
    qualified?: boolean;
    qualifiedOnchain?: boolean;
    ethIn?: string | null;
    countedAsBee?: boolean | null;
    verificationMode?: string;
    verificationDelay?: string | null;
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

type JourneyStats = {
  totalRecordedCompletions?: number;
  hoodWallet?: { currentlyActive?: number };
  ping?: { claimed?: number; home?: number; away?: number };
  milestones?: {
    hoodWalletActivated?: { historicalCount?: number | null };
    hoodTalkSpoken?: { historicalCount?: number | null };
    pingClaimed?: { historicalCount?: number | null };
  };
};

type Tab = "journey" | "stats";
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
      ? { status: "● SPOKEN ONCHAIN", text: "Your Hoodie has already spoken onchain.", href: "/hoodtalk", cta: "OPEN HOOD TALK" }
      : { status: "○ NOT SPOKEN", text: "Give your Hoodie a permanent voice onchain.", href: "/hoodtalk", cta: "OPEN HOOD TALK" };
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
    milestone.season2
  ) {
    ctx.fillStyle =
      ink;

    ctx.fillRect(
      720,
      520,
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
      548,
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
  const canHoodIt = milestone.completed && journey.hoodWallet.active && !checkedIn;

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
          {!checkedIn && <Link href={t.href} className="mt-3 inline-block text-[10px] uppercase underline underline-offset-4">{t.cta} →</Link>}
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

function StatsPanel({ stats, loading }: { stats: JourneyStats | null; loading: boolean }) {
  if (loading) return <div className="border border-[var(--hood-fg)] p-8 text-center text-[8px] uppercase">Reading Journey stats…</div>;
  if (!stats) return <div className="border border-[var(--hood-fg)] p-8 text-center text-[8px] uppercase">Stats unavailable.</div>;

  const cards = [
    ["Wallets active", stats.hoodWallet?.currentlyActive ?? stats.milestones?.hoodWalletActivated?.historicalCount ?? 0],
    ["Hoodies spoken", stats.milestones?.hoodTalkSpoken?.historicalCount ?? 0],
    ["Ping claimed", stats.ping?.claimed ?? stats.milestones?.pingClaimed?.historicalCount ?? 0],
    ["Ping home", stats.ping?.home ?? 0],
    ["Ping away", stats.ping?.away ?? 0],
    ["Journey check-ins", stats.totalRecordedCompletions ?? 0],
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map(([label, value]) => (
        <div key={String(label)} className="border border-[var(--hood-fg)] p-5">
          <p className="text-[7px] uppercase tracking-[0.15em] opacity-55">{label}</p>
          <p className="mt-3 text-5xl tracking-[-0.05em]">{Number(value).toLocaleString()}</p>
        </div>
      ))}
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
  const [stats, setStats] = useState<JourneyStats | null>(null);
  const [pending, setPending] = useState<PendingMap>({});
  const [ownershipLoading, setOwnershipLoading] = useState(false);
  const [ownershipChecked, setOwnershipChecked] = useState(false);
  const [journeyLoading, setJourneyLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
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

  const loadOwnership = useCallback(async () => {
    if (!address) {
      setOwnedHoodies([]);
      setSelectedTokenId("");
      setJourney(null);
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
      setSelectedTokenId(current => current && unique.some(h => h.tokenId === current) ? current : unique[0]?.tokenId || "");
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

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const response = await fetch(`${API}/v1/journey/stats`, { cache: "no-store" });
      if (!response.ok) throw new Error("Unable to load Journey stats.");
      setStats(await response.json() as JourneyStats);
    } catch (e) {
      console.error(e);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const openStats =
    useCallback(
      () => {
        setTab(
          "stats",
        );

        if (
          !stats &&
          !statsLoading
        ) {
          void loadStats();
        }
      },
      [
        loadStats,
        stats,
        statsLoading,
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

        {!address ? (
          <div className="mt-6 border border-[var(--hood-fg)] p-10 text-center">
            <h2 className="text-4xl tracking-[-0.04em]">START YOUR JOURNEY</h2>
            <p className="mt-4 text-[9px] uppercase opacity-60">Connect the wallet holding your Hoodie.</p>
            <button type="button" onClick={() => void connect()} className="mt-6 bg-[var(--hood-fg)] px-8 py-4 text-[9px] uppercase tracking-[0.15em] text-[var(--hood-bg)]">Connect wallet</button>
            <div className="mt-7">
              <a href={OPENSEA} target="_blank" rel="noreferrer" className="text-[8px] uppercase underline underline-offset-4">Buy secondary on OpenSea →</a>
            </div>
          </div>
        ) : ownershipLoading ? (
          <div className="mt-6 border border-[var(--hood-fg)] p-8 text-center text-[9px] uppercase">Reading Hoodie ownership…</div>
        ) : ownershipChecked && ownedHoodies.length === 0 ? (
          <div className="mt-6 border border-[var(--hood-fg)] p-10 text-center">
            <h2 className="text-4xl">START YOUR JOURNEY</h2>
            <p className="mt-4 text-[9px] uppercase opacity-60">No OnChainHoodie found in this wallet.</p>
          </div>
        ) : (
          <>
            <section className="mt-7">
              <div className="flex items-end justify-between">
                <h2 className="text-3xl tracking-[-0.04em]">YOUR HOODIES</h2>
                <p className="text-[7px] uppercase opacity-50">{ownedHoodies.length} owned</p>
              </div>

              <div className="mt-4 flex gap-3 overflow-x-auto pb-4 [scrollbar-width:thin]">
                {ownedHoodies.map(hoodie => (
                  <HoodieTile
                    key={hoodie.tokenId}
                    hoodie={hoodie}
                    selected={hoodie.tokenId === selectedTokenId}
                    active={activeHoodies[hoodie.tokenId] === true}
                    onSelect={() => {
                      setError(null);
                      setJourney(null);
                      setSelectedTokenId(hoodie.tokenId);
                    }}
                  />
                ))}
              </div>
            </section>

            <section className="mt-10">
              <div className="flex flex-col gap-4 border-b border-[var(--hood-fg)] pb-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-[12px] uppercase tracking-[0.20em] opacity-60">Hoodie #{selectedTokenId}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <h2 className="text-6xl tracking-[-0.06em] md:text-7xl">JOURNEY</h2>
                    {activeHoodies[selectedTokenId] && (
                      <span className="bg-[var(--hood-fg)] px-3 py-2 text-[6px] uppercase tracking-[0.12em] text-[var(--hood-bg)]">● Wallet active</span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 border border-[var(--hood-fg)]">
                  <button type="button" onClick={() => setTab("journey")} className={`px-6 py-3 text-[7px] uppercase tracking-[0.14em] ${tab === "journey" ? "bg-[var(--hood-fg)] text-[var(--hood-bg)]" : ""}`}>Journey</button>
                  <button type="button" onClick={openStats} className={`border-l border-[var(--hood-fg)] px-6 py-3 text-[7px] uppercase tracking-[0.14em] ${tab === "stats" ? "bg-[var(--hood-fg)] text-[var(--hood-bg)]" : ""}`}>Stats</button>
                </div>
              </div>

              {tab === "journey" ? (
                journeyLoading && !journey ? (
                  <div className="mt-4 border border-[var(--hood-fg)] p-8 text-center text-[8px] uppercase">Reading Journey…</div>
                ) : journey ? (
                  <div className="mt-4">
                    <p className="mb-3 text-[12px] uppercase tracking-[0.20em] opacity-70">Already part of the story</p>
                    <div className="space-y-3">
                      {journey.milestones
                        .filter(m => m.recorded || pending[localKey(selectedTokenId, m.key)])
                        .map(m => (
                          <JourneyRow
                            key={m.key}
                            milestone={m}
                            journey={journey}
                            checkedIn
                            checkingIn={
                              false
                            }
                            sharing={
                              sharingKey ===
                              m.key
                            }
                            onHoodIt={() => {}}
                            onShare={item =>
                              void shareMilestone(
                                item,
                              )
                            }
                          />
                        ))}
                    </div>

                    <p className="mb-3 mt-8 text-[12px] uppercase tracking-[0.20em] opacity-70">What&apos;s next?</p>

                    {journey.milestones.some(isSeason2Milestone) && (
                      <div className="mb-4 border border-[var(--hood-fg)] px-4 py-3 text-[9px] uppercase tracking-[0.14em]">
                        Season 2 Builder Actions
                      </div>
                    )}

                    <div className="space-y-3">
                      {journey.milestones
                        .filter(m => !m.recorded && !pending[localKey(selectedTokenId, m.key)])
                        .map(m => (
                          <JourneyRow
                            key={m.key}
                            milestone={m}
                            journey={journey}
                            checkedIn={
                              false
                            }
                            checkingIn={
                              checkingInKey ===
                              m.key
                            }
                            sharing={
                              false
                            }
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
                ) : null
              ) : (
                <div className="mt-4">
                  <StatsPanel stats={stats} loading={statsLoading} />
                </div>
              )}
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
