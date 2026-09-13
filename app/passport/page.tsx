"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";
import { useWallet } from "../../components/WalletProvider";
import HoodieIdentityNav from "../../components/HoodieIdentityNav";

const API = "https://api.onchainhoodies.xyz";
const COLLECTION =
  "0x9ec6c5b9f572a9b02138e553bc5f5882da735f45";

type OwnedHoodie = {
  tokenId: string;
  name: string;
  image?: string;
};

type OwnershipResponse = {
  items?: OwnedHoodie[];
  error?: string;
};

type MemoryEvent = {
  type: string;
  source: string;
  tokenId: number;
  transactionHash: string;
  blockNumber: number;
  logIndex: number;
  timestamp: number | null;
  countsAsMemory: boolean;
  title?: string | null;
  detail?: string | null;
  data?: Record<string, unknown>;
};

type MemoryResponse = {
  schemaVersion: "1.0";
  tokenId: number;
  image: string;
  token: string;

  identity: {
    hoodWallet: string | null;
    hoodWalletCreatedAt: number | null;
    activationCount: number;
  };

  summary: {
    totalMemories: number;
    firstMemoryAt: number | null;
    lastMemoryAt: number | null;
    hoodTalks: number;
    hoodIts: number;
    hoodlitaireGames: number;
    hooneySwaps: number;
    pingHome: boolean | null;
    activations: number;
  };

  hoodWallet: {
    address: string | null;
    createdAt: number | null;
    activationCount: number;
    lastActivatedAt: number | null;
  };

  economy: {
    och: {
      token: string;
      currentBalanceWei: string | null;
      currentBalanceIndexed: boolean;
      activationSpendWei: string;
      sentToDeadAddressWei: string;
      sentToTreasuryWei: string;
      activationEconomicActions: number;
      treasury: string;
      deadAddress: string;
    };
  };

  hoodTalk: {
    count: number;
    firstSpokenAt: number | null;
    lastSpokenAt: number | null;
    latestQuote: string | null;
    history: string;
  };

  ping: {
    claimed: boolean;
    tokenId: number;
    home: boolean | null;
    claimedAt: number | null;
    timesLeftHome: number;
    timesReturnedHome: number;
    lastStateChangeAt: number | null;
  };

  hooney: {
    swaps: number;
    beeSwaps: number;
    totalEthInWei: string;
    totalDevFeeWei: string;
    totalHiveFeeWei: string;
    firstSwapAt: number | null;
    lastSwapAt: number | null;
  };

  hoodlitaire: {
    games: number;
    dailyGames: number;
    randomGames: number;
    bestMoves: number | null;
    bestElapsedSeconds: number | null;
    firstPlayedAt: number | null;
    lastPlayedAt: number | null;
  };

  journey: {
    hoodIts: number;
    lastHoodItAt: number | null;
    endpoint: string;
  };

  timeline: {
    total: number;
    semanticMemories: number;
    limit: number;
    events: MemoryEvent[];
  };

  links: {
    memory: string;
    memoryStatus: string;
    journey: string;
    hoodTalkHistory: string;
  };
};


type MemoryLeaderboardEntry = {
  rank: number;
  tokenId: number;
  totalMemories: number;
  hoodTalks: number;
  hoodIts: number;
  hoodlitaireGames: number;
  hooneySwaps: number;
  pingMemories: number;
  pingHome: boolean | null;
  activations: number;
  lastMemoryAt: number | null;
  image: string;
  token: string;
  memory: string;
  passport: string;
};

type MemoryLeaderboardSort =
  | "memories"
  | "talks"
  | "games"
  | "swaps"
  | "hoodIts";

type MemoryLeaderboardResponse = {
  schemaVersion: "1.0";
  updatedAt: string | null;
  complete: boolean;
  indexStatus: "building" | "backfilling" | "caught-up";
  limit: number;
  totalRanked: number;
  entries: MemoryLeaderboardEntry[];
};

type JourneyLite = {
  hoodWallet?: {
    address?: string | null;
    active?: boolean;
    everActivated?: boolean;
  };
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getString(
  object: UnknownRecord | null,
  keys: string[],
): string | null {
  if (!object) return null;

  for (const key of keys) {
    const value = object[key];

    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return null;
}

function nestedRecord(
  object: UnknownRecord | null,
  key: string,
): UnknownRecord | null {
  if (!object) return null;
  return isRecord(object[key]) ? object[key] as UnknownRecord : null;
}

function getNumber(
  object: UnknownRecord | null,
  key: string,
): number | null {
  if (!object) return null;
  const value = object[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function traitRecord(
  tokenData: UnknownRecord | null,
  key: string,
): UnknownRecord | null {
  const traits = nestedRecord(tokenData, "traits");
  return traits && isRecord(traits[key]) ? traits[key] as UnknownRecord : null;
}

function prettyTrait(value: string | null) {
  if (!value) return "—";
  return value
    .replaceAll("-", " ")
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

function shortAddress(
  address: string | null | undefined,
) {
  if (!address) return "—";

  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function openSeaItemUrl(
  tokenId: string | number,
) {
  return `https://opensea.io/item/robinhood/${COLLECTION}/${tokenId}`;
}

function openSeaWalletUrl(
  wallet: string | null | undefined,
) {
  return wallet
    ? `https://opensea.io/${wallet.toLowerCase()}`
    : null;
}

function art(
  tokenId: string | number,
) {
  return `${API}/images/${tokenId}.svg`;
}

function asDate(
  timestamp: number | null | undefined,
) {
  if (
    timestamp === null ||
    timestamp === undefined
  ) {
    return null;
  }

  const date =
    new Date(
      timestamp < 1_000_000_000_000
        ? timestamp * 1000
        : timestamp,
    );

  return Number.isNaN(
    date.getTime(),
  )
    ? null
    : date;
}

function dateLabel(
  timestamp: number | null | undefined,
) {
  const date =
    asDate(timestamp);

  if (!date) return "ONCHAIN";

  return new Intl.DateTimeFormat(
    "en",
    {
      month: "short",
      day: "2-digit",
    },
  )
    .format(date)
    .toUpperCase();
}

function fullDateLabel(
  timestamp: number | null | undefined,
) {
  const date =
    asDate(timestamp);

  if (!date) return "—";

  return new Intl.DateTimeFormat(
    "en",
    {
      year: "numeric",
      month: "short",
      day: "numeric",
    },
  ).format(date);
}

function secondsLabel(
  value: number | null | undefined,
) {
  if (
    value === null ||
    value === undefined
  ) {
    return "—";
  }

  const minutes =
    Math.floor(
      value / 60,
    );

  const seconds =
    Math.floor(
      value % 60,
    );

  return `${minutes}:${String(
    seconds,
  ).padStart(2, "0")}`;
}

function tokenAmount(
  wei: string | null | undefined,
  maximumFractionDigits = 2,
) {
  if (!wei) return "0";

  try {
    const value =
      Number(
        BigInt(wei),
      ) / 1e18;

    return new Intl.NumberFormat(
      "en",
      {
        maximumFractionDigits,
      },
    ).format(value);
  } catch {
    return "0";
  }
}

function eventCategory(
  event: MemoryEvent,
) {
  const type =
    event.type.toUpperCase();

  if (
    type.includes(
      "HOODLITAIRE",
    )
  ) {
    return "PLAY";
  }

  if (
    type.includes(
      "HOONEY",
    )
  ) {
    return "ECOSYSTEM";
  }

  if (
    type.includes(
      "PING",
    )
  ) {
    return "COMPANION";
  }

  if (
    type.includes(
      "TALK",
    )
  ) {
    return "VOICE";
  }

  if (
    type.includes(
      "JOURNEY",
    )
  ) {
    return "JOURNEY";
  }

  if (
    type.includes(
      "ACTIVATED",
    )
  ) {
    return "ECONOMY";
  }

  return "IDENTITY";
}

function eventTitle(
  event: MemoryEvent,
) {
  return (
    event.title?.trim() ||
    event.type
      .replaceAll(
        "_",
        " ",
      )
      .trim()
  );
}

function eventDetail(
  event: MemoryEvent,
) {
  if (
    event.detail?.trim()
  ) {
    return event.detail;
  }

  const data =
    event.data || {};

  if (
    typeof data.moves ===
    "number"
  ) {
    const elapsed =
      typeof data.elapsedSeconds ===
      "number"
        ? ` · ${secondsLabel(
            data.elapsedSeconds,
          )}`
        : "";

    return `${data.moves} moves${elapsed}`;
  }

  if (
    typeof data.ethInWei ===
    "string"
  ) {
    return `${tokenAmount(
      data.ethInWei,
      4,
    )} ETH`;
  }

  return "Recorded onchain";
}

function characterAge(
  firstMemoryAt:
    number | null,
) {
  const first =
    asDate(
      firstMemoryAt,
    );

  if (!first) {
    return "BUILDING";
  }

  const days =
    Math.max(
      1,
      Math.floor(
        (
          Date.now() -
          first.getTime()
        ) /
          86_400_000,
      ),
    );

  return `${days}D`;
}

function saveObjectUrl(
  url: string,
  filename: string,
) {
  const anchor =
    document.createElement(
      "a",
    );

  anchor.href =
    url;

  anchor.download =
    filename;

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
        url,
      );
    },
    1500,
  );
}

async function loadCanvasImage(
  source: string,
) {
  const response =
    await fetch(
      source,
      {
        cache:
          "no-store",
      },
    );

  if (!response.ok) {
    throw new Error(
      "Unable to load Hoodie artwork.",
    );
  }

  const blob =
    await response.blob();

  const objectUrl =
    URL.createObjectURL(
      blob,
    );

  try {
    return await new Promise<HTMLImageElement>(
      (
        resolve,
        reject,
      ) => {
        const image =
          new window.Image();

        image.onload =
          () =>
            resolve(
              image,
            );

        image.onerror =
          () =>
            reject(
              new Error(
                "Unable to decode Hoodie artwork.",
              ),
            );

        image.src =
          objectUrl;
      },
    );
  } finally {
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

function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: string | number;
  note: string;
}) {
  return (
    <div className="border-b border-r border-[#ccff00] p-3 md:p-4">
      <p className="text-[8px] uppercase tracking-[0.16em] opacity-55">
        {label}
      </p>

      <p className="mt-2 text-3xl leading-none tracking-[-0.05em]">
        {value}
      </p>

      <p className="mt-2 text-[7px] uppercase tracking-[0.12em] opacity-50">
        {note}
      </p>
    </div>
  );
}

function OwnedHoodieTile({
  hoodie,
  selected,
  active,
  onSelect,
}: {
  hoodie: OwnedHoodie;
  selected: boolean;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={
        onSelect
      }
      className="w-[82px] shrink-0 text-left md:w-[92px]"
    >
      <div
        className={`border-2 border-black ${
          selected
            ? "outline outline-2 outline-offset-2 outline-black"
            : ""
        }`}
      >
        <div className="relative aspect-square overflow-hidden bg-black">
          <Image
            unoptimized
            src={art(hoodie.tokenId)}
            alt={
              hoodie.name ||
              `Hoodie #${hoodie.tokenId}`
            }
            width={92}
            height={92}
            className="image-render-pixel h-full w-full object-cover"
          />

          {active ? (
            <span className="absolute bottom-1 left-1 border border-black bg-[#ccff00] px-1.5 py-1 text-[6px] uppercase leading-none tracking-[0.08em] text-black">
              Wallet Active
            </span>
          ) : null}
        </div>

        <div
          className={`border-t-2 border-black px-3 py-2 ${
            selected
              ? "bg-black text-[#ccff00]"
              : ""
          }`}
        >
          <p className="text-[7px] uppercase tracking-[0.12em] opacity-55">
            Hoodie
          </p>

          <p className="mt-1 text-[11px]">
            #{hoodie.tokenId}
          </p>
        </div>
      </div>
    </button>
  );
}

function MemoryLeaderboardPanel({
  data,
  loading,
  sortBy,
  onSortChange,
  onOpen,
}: {
  data: MemoryLeaderboardResponse | null;
  loading: boolean;
  sortBy: MemoryLeaderboardSort;
  onSortChange: (sort: MemoryLeaderboardSort) => void;
  onOpen: (tokenId: number) => void;
}) {
  if (loading && !data) {
    return (
      <div className="border-2 border-black p-10 text-center text-[10px] uppercase tracking-[0.15em]">
        Reading Hoodie activity…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="border-2 border-black p-10 text-center text-[10px] uppercase tracking-[0.15em]">
        Activity leaderboard unavailable.
      </div>
    );
  }

  const metricFor = (entry: MemoryLeaderboardEntry) => {
    if (sortBy === "talks") return entry.hoodTalks;
    if (sortBy === "games") return entry.hoodlitaireGames;
    if (sortBy === "swaps") return entry.hooneySwaps;
    if (sortBy === "hoodIts") return entry.hoodIts;
    return entry.totalMemories;
  };

  const rows = [...data.entries].sort(
    (left, right) =>
      metricFor(right) - metricFor(left) ||
      (right.lastMemoryAt || 0) - (left.lastMemoryAt || 0) ||
      left.tokenId - right.tokenId,
  );

  const filters: Array<{ key: MemoryLeaderboardSort; label: string }> = [
    { key: "memories", label: "Memories" },
    { key: "talks", label: "Talks" },
    { key: "games", label: "Games" },
    { key: "swaps", label: "Swaps" },
    { key: "hoodIts", label: "Hood Its" },
  ];

  return (
    <div>
      <div className="flex flex-col gap-4 border-b-2 border-black pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[9px] uppercase tracking-[0.18em] opacity-55">
            Hoodie Memory / Public
          </p>
          <h2 className="mt-2 text-[clamp(3rem,7vw,6rem)] leading-[0.82] tracking-[-0.07em]">
            MOST ACTIVE
            <br />
            HOODIES
          </h2>
        </div>

        <div className="max-w-md">
          <p className="text-sm leading-relaxed opacity-65">
            Ranked by meaningful Hoodie memories: voice, games, ecosystem
            actions, companion history, activations and Journey moments.
          </p>

          <p className="mt-4 text-[clamp(1.5rem,3vw,2.8rem)] leading-none tracking-[-0.045em]">
            {new Intl.NumberFormat("en").format(data.totalRanked)} Hoodies with history
          </p>
          <p className="mt-3 text-[8px] uppercase tracking-[0.12em] opacity-45">
            {data.complete
              ? "Memory index caught up"
              : "Historical backfill still running"}
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {filters.map(filter => (
          <button
            key={filter.key}
            type="button"
            onClick={() => onSortChange(filter.key)}
            className={`border-2 border-black px-4 py-3 text-[10px] uppercase tracking-[0.12em] ${
              sortBy === filter.key ? "bg-black text-[#ccff00]" : ""
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className="mt-5 border-l-2 border-t-2 border-black">
        <div className="hidden grid-cols-[72px_86px_minmax(150px,1fr)_110px_repeat(4,92px)] border-b-2 border-r-2 border-black px-4 py-3 text-[7px] uppercase tracking-[0.14em] opacity-55 lg:grid">
          <span>Rank</span>
          <span>Hoodie</span>
          <span>Identity</span>
          <span>Memories</span>
          <span>Talks</span>
          <span>Games</span>
          <span>Swaps</span>
          <span>Hood Its</span>
        </div>

        {rows.map((entry, index) => (
          <button
            key={entry.tokenId}
            type="button"
            onClick={() => onOpen(entry.tokenId)}
            className="grid w-full grid-cols-[52px_64px_minmax(0,1fr)_72px] items-center gap-3 border-b-2 border-r-2 border-black p-3 text-left transition-colors hover:bg-black hover:text-[#ccff00] lg:grid-cols-[72px_86px_minmax(150px,1fr)_110px_repeat(4,92px)] lg:px-4"
          >
            <span className="text-xl md:text-2xl">
              #{index + 1}
            </span>

            <Image
              unoptimized
              src={entry.image || art(entry.tokenId)}
              alt={`Hoodie #${entry.tokenId}`}
              width={64}
              height={64}
              className="image-render-pixel aspect-square border border-current object-cover"
            />

            <div className="min-w-0">
              <p className="text-base uppercase md:text-lg">
                Hoodie #{entry.tokenId}
              </p>
              <p className="mt-1 hidden text-[7px] uppercase tracking-[0.1em] opacity-50 sm:block">
                Open Passport →
              </p>
            </div>

            <div>
              <p className="text-2xl leading-none md:text-3xl">
                {entry.totalMemories}
              </p>
              <p className="mt-1 text-[7px] uppercase tracking-[0.1em] opacity-50">
                Memories
              </p>
            </div>

            <div className="hidden lg:block">
              <p className="text-lg">{entry.hoodTalks}</p>
              <p className="mt-1 text-[7px] uppercase opacity-45">Talks</p>
            </div>

            <div className="hidden lg:block">
              <p className="text-lg">{entry.hoodlitaireGames}</p>
              <p className="mt-1 text-[7px] uppercase opacity-45">Games</p>
            </div>

            <div className="hidden lg:block">
              <p className="text-lg">{entry.hooneySwaps}</p>
              <p className="mt-1 text-[7px] uppercase opacity-45">Swaps</p>
            </div>

            <div className="hidden lg:block">
              <p className="text-lg">{entry.hoodIts}</p>
              <p className="mt-1 text-[7px] uppercase opacity-45">Hood Its</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

async function makePassportPng({
  memory,
  artwork,
  archetype,
  traits,
  active,
}: {
  memory: MemoryResponse;
  artwork: string;
  archetype: string;
  traits: Array<{ label: string; value: string }>;
  active: boolean | null;
}) {
  await document.fonts.ready;

  const canvas = document.createElement("canvas");
  const exportScale = 2;
  canvas.width = 960 * exportScale;
  canvas.height = 720 * exportScale;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable.");
  ctx.scale(exportScale, exportScale);

  const ink = "#ccff00";
  const background = "#000000";
  const font = getComputedStyle(document.body).fontFamily || "monospace";
  const tokenId = memory.tokenId;

  ctx.fillStyle = background;
  ctx.fillRect(0, 0, 960, 720);

  ctx.strokeStyle = ink;
  ctx.lineWidth = 5;
  ctx.strokeRect(24, 24, 912, 672);

  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(480, 24);
  ctx.lineTo(480, 696);
  ctx.stroke();

  ctx.fillStyle = ink;
  ctx.font = `700 18px ${font}`;
  ctx.fillText("ONCHAINHOODIES / HOODIE PASSPORT", 46, 62);

  try {
    const passportIcon = await loadCanvasImage(
      "https://unpkg.com/pixelarticons@latest/svg/book-open.svg",
    );
    ctx.drawImage(passportIcon, 842, 38, 36, 36);
  } catch (iconError) {
    console.debug("Passport export icon unavailable.", iconError);
  }

  ctx.textAlign = "right";
  ctx.font = `700 30px ${font}`;
  ctx.fillText(`#${tokenId}`, 910, 66);
  ctx.textAlign = "left";

  const image = await loadCanvasImage(artwork);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, 48, 102, 250, 250);
  ctx.strokeRect(48, 102, 250, 250);

  ctx.font = `400 11px ${font}`;
  ctx.fillText("ARCHETYPE", 322, 118);
  ctx.font = `700 24px ${font}`;
  ctx.fillText(archetype.toUpperCase(), 322, 148);

  ctx.font = `400 11px ${font}`;
  ctx.fillText("STATUS", 322, 188);
  ctx.font = `700 18px ${font}`;
  ctx.fillText(
    active === true ? "ACTIVE" : active === false ? "INACTIVE" : "INDEXED",
    322,
    214,
  );


  ctx.font = `400 11px ${font}`;
  ctx.fillText("TRAITS", 48, 392);

  traits.slice(0, 4).forEach((trait, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = 48 + column * 205;
    const y = 420 + row * 74;

    ctx.strokeRect(x, y, 185, 58);
    ctx.font = `400 9px ${font}`;
    ctx.fillText(trait.label.toUpperCase(), x + 10, y + 17);
    ctx.font = `700 13px ${font}`;
    ctx.fillText(trait.value.toUpperCase().slice(0, 20), x + 10, y + 40);
  });

  ctx.font = `400 10px ${font}`;
  ctx.fillText("FULLY ONCHAIN · CC0", 48, 650);

  ctx.font = `400 11px ${font}`;
  ctx.fillText("CHARACTER HISTORY", 516, 112);
  ctx.font = `700 44px ${font}`;
  ctx.fillText(String(memory.summary.totalMemories), 516, 164);
  ctx.font = `400 10px ${font}`;
  ctx.fillText("MEMORIES", 590, 162);

  const stats = [
    ["HOOD ITS", memory.summary.hoodIts],
    ["HOOD TALKS", memory.summary.hoodTalks],
    ["GAMES", memory.hoodlitaire.games],
    ["HIVE SWAPS", memory.hooney.swaps],
    [
      "PING",
      memory.ping.home === true
        ? "HOME"
        : memory.ping.home === false
          ? "AWAY"
          : memory.ping.claimed
            ? "CLAIMED"
            : "—",
    ],
    ["ACTIVATIONS", memory.hoodWallet.activationCount],
  ] as const;

  stats.forEach(([label, value], index) => {
    const column = index % 3;
    const row = Math.floor(index / 3);
    const x = 516 + column * 132;
    const y = 194 + row * 84;

    ctx.strokeRect(x, y, 120, 68);
    ctx.font = `400 8px ${font}`;
    ctx.fillText(label, x + 8, y + 17);
    ctx.font = `700 22px ${font}`;
    ctx.fillText(String(value), x + 8, y + 49);
  });

  ctx.font = `400 10px ${font}`;
  ctx.fillText("LATEST HOOD TALK", 516, 390);

  const hoodTalkPhrase = memory.hoodTalk.latestQuote?.trim();
  ctx.font = `700 18px ${font}`;

  const talkText = hoodTalkPhrase
    ? `“${hoodTalkPhrase}”`
    : "THIS HOODIE HAS NOT SPOKEN ONCHAIN YET.";

  const maxTalkWidth = 375;
  const talkWords = talkText.split(" ");
  const talkLines: string[] = [];
  let talkLine = "";

  for (const word of talkWords) {
    const candidate = talkLine ? `${talkLine} ${word}` : word;
    if (ctx.measureText(candidate).width > maxTalkWidth && talkLine) {
      talkLines.push(talkLine);
      talkLine = word;
    } else {
      talkLine = candidate;
    }
  }

  if (talkLine) talkLines.push(talkLine);

  talkLines.slice(0, 3).forEach((line, index) => {
    ctx.fillText(line, 516, 422 + index * 26);
  });

  ctx.font = `400 10px ${font}`;
  ctx.fillText("RECENT HISTORY", 516, 520);

  memory.timeline.events
    .filter(event => event.countsAsMemory)
    .slice(0, 2)
    .forEach((event, index) => {
      const x = index === 0 ? 516 : 716;

      ctx.font = `400 9px ${font}`;
      ctx.fillText(dateLabel(event.timestamp), x, 548);

      ctx.font = `700 13px ${font}`;
      ctx.fillText(
        eventTitle(event).toUpperCase().slice(0, 22),
        x,
        570,
      );

      ctx.font = `400 9px ${font}`;
      ctx.fillText(
        eventDetail(event).toUpperCase().slice(0, 30),
        x,
        589,
      );
    });

  ctx.font = `400 9px ${font}`;
  ctx.fillText("ONCHAINHOODIES · ROBINHOOD CHAIN", 516, 650);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      result =>
        result
          ? resolve(result)
          : reject(new Error("Passport PNG render failed.")),
      "image/png",
    );
  });

  return {
    url: URL.createObjectURL(blob),
    filename: `hoodie-${tokenId}-passport.png`,
  };
}


export default function PassportPage() {
  const {
    address,
    connect,
  } =
    useWallet();

  const [
    tokenInput,
    setTokenInput,
  ] =
    useState("");

  const [
    selectedTokenId,
    setSelectedTokenId,
  ] =
    useState("");

  const [
    ownedHoodies,
    setOwnedHoodies,
  ] =
    useState<
      OwnedHoodie[]
    >([]);

  const [
    activeOwnedHoodies,
    setActiveOwnedHoodies,
  ] = useState<Record<string, boolean>>({});

  const [
    ownershipLoading,
    setOwnershipLoading,
  ] =
    useState(
      false,
    );

  const [
    ownershipChecked,
    setOwnershipChecked,
  ] =
    useState(
      false,
    );

  const [
    memory,
    setMemory,
  ] =
    useState<MemoryResponse | null>(
      null,
    );

  const [
    tokenData,
    setTokenData,
  ] =
    useState<UnknownRecord | null>(
      null,
    );

  const [
    journeyState,
    setJourneyState,
  ] =
    useState<JourneyLite | null>(
      null,
    );

  const [
    passportLoading,
    setPassportLoading,
  ] =
    useState(
      false,
    );

  const [
    exporting,
    setExporting,
  ] =
    useState(
      false,
    );

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null,
    );


  const [
    view,
    setView,
  ] =
    useState<
      "passport" |
      "leaderboard"
    >(
      "passport",
    );

  const [
    memoryLeaderboard,
    setMemoryLeaderboard,
  ] =
    useState<MemoryLeaderboardResponse | null>(
      null,
    );

  const [
    leaderboardLoading,
    setLeaderboardLoading,
  ] =
    useState(
      false,
    );

  const [
    leaderboardSort,
    setLeaderboardSort,
  ] =
    useState<MemoryLeaderboardSort>(
      "memories",
    );

  const loadPassport =
    useCallback(
      async (
        rawTokenId:
          string,
      ) => {
        setView(
          "passport",
        );

        const tokenId =
          Number(
            rawTokenId,
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

        setPassportLoading(
          true,
        );

        setError(
          null,
        );

        try {
          const [
            memoryResponse,
            tokenResponse,
            journeyResponse,
          ] =
            await Promise.all([
              fetch(
                `${API}/v1/token/${tokenId}/memory?limit=100`,
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
                `${API}/v1/token/${tokenId}`,
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
                `${API}/v1/token/${tokenId}/journey`,
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
            !memoryResponse.ok
          ) {
            throw new Error(
              `Memory API returned ${memoryResponse.status}.`,
            );
          }

          const memoryPayload =
            await memoryResponse.json() as MemoryResponse;

          const tokenPayload =
            tokenResponse.ok
              ? (
                  await tokenResponse.json()
                ) as UnknownRecord
              : null;

          const journeyPayload =
            journeyResponse.ok
              ? (
                  await journeyResponse.json()
                ) as JourneyLite
              : null;

          setMemory(
            memoryPayload,
          );

          setTokenData(
            tokenPayload,
          );

          setJourneyState(
            journeyPayload,
          );

          setSelectedTokenId(
            String(
              tokenId,
            ),
          );

          setTokenInput(
            String(
              tokenId,
            ),
          );

          if (
            typeof window !==
            "undefined"
          ) {
            const url =
              new URL(
                window.location.href,
              );

            url.searchParams.set(
              "hoodie",
              String(
                tokenId,
              ),
            );

            window.history.replaceState(
              {},
              "",
              `${url.pathname}?${url.searchParams.toString()}`,
            );
          }
        } catch (
          cause
        ) {
          console.error(
            cause,
          );

          setError(
            cause instanceof Error
              ? cause.message
              : "Unable to load Hoodie Passport.",
          );
        } finally {
          setPassportLoading(
            false,
          );
        }
      },
      [],
    );

  useEffect(
    () => {
      if (
        typeof window ===
        "undefined"
      ) {
        return;
      }

      const params =
        new URLSearchParams(
          window.location.search,
        );

      const hoodie =
        params.get(
          "hoodie",
        );

      if (
        !hoodie ||
        !/^\d+$/.test(
          hoodie,
        )
      ) {
        return;
      }

      const timeoutId =
        window.setTimeout(
          () => {
            void loadPassport(
              hoodie,
            );
          },
          0,
        );

      return () => {
        window.clearTimeout(
          timeoutId,
        );
      };
    },
    [
      loadPassport,
    ],
  );

  useEffect(
    () => {
      let cancelled =
        false;

      async function loadOwnership() {
        if (
          !address
        ) {
          if (
            !cancelled
          ) {
            setOwnedHoodies(
              [],
            );
            setActiveOwnedHoodies({});

            setOwnershipChecked(
              false,
            );
          }

          return;
        }

        setOwnershipLoading(
          true,
        );

        setOwnershipChecked(
          false,
        );

        try {
          const response =
            await fetch(
              `/api/hoodies?${new URLSearchParams(
                {
                  owner:
                    address,
                },
              )}`,
              {
                cache:
                  "no-store",
              },
            );

          const payload =
            await response.json() as OwnershipResponse;

          if (
            !response.ok
          ) {
            throw new Error(
              payload.error ||
              "Unable to load Hoodie ownership.",
            );
          }

          const unique =
            Array.from(
              new Map(
                (
                  payload.items ||
                  []
                ).map(
                  hoodie => [
                    String(
                      hoodie.tokenId,
                    ),
                    {
                      ...hoodie,
                      tokenId:
                        String(
                          hoodie.tokenId,
                        ),
                    },
                  ],
                ),
              ).values(),
            ).sort(
              (
                left,
                right,
              ) =>
                BigInt(
                  left.tokenId,
                ) <
                BigInt(
                  right.tokenId,
                )
                  ? -1
                  : 1,
            );

          if (
            cancelled
          ) {
            return;
          }

          setOwnedHoodies(
            unique,
          );

          const activeEntries = await Promise.all(
            unique.map(async hoodie => {
              try {
                const response = await fetch(
                  `${API}/v1/token/${hoodie.tokenId}/journey`,
                  { cache: "no-store" },
                );
                if (!response.ok) return [hoodie.tokenId, false] as const;
                const payload = await response.json() as {
                  hoodWallet?: { active?: boolean };
                };
                return [
                  hoodie.tokenId,
                  payload.hoodWallet?.active === true,
                ] as const;
              } catch {
                return [hoodie.tokenId, false] as const;
              }
            }),
          );

          if (!cancelled) {
            setActiveOwnedHoodies(Object.fromEntries(activeEntries));
          }

          setOwnershipChecked(
            true,
          );

          if (
            unique.length &&
            !selectedTokenId
          ) {
            void loadPassport(
              unique[0].tokenId,
            );
          }
        } catch (
          cause
        ) {
          console.error(
            cause,
          );

          if (
            !cancelled
          ) {
            setOwnedHoodies(
              [],
            );

            setOwnershipChecked(
              true,
            );

            setError(
              cause instanceof Error
                ? cause.message
                : "Unable to load your Hoodies.",
            );
          }
        } finally {
          if (
            !cancelled
          ) {
            setOwnershipLoading(
              false,
            );
          }
        }
      }

      void loadOwnership();

      return () => {
        cancelled =
          true;
      };
    },
    [
      address,
      loadPassport,
      selectedTokenId,
    ],
  );

  const loadMemoryLeaderboard =
    useCallback(
      async () => {
        setView(
          "leaderboard",
        );

        if (
          memoryLeaderboard
        ) {
          return;
        }

        setLeaderboardLoading(
          true,
        );

        setError(
          null,
        );

        try {
          const response =
            await fetch(
              `${API}/v1/memory/leaderboard?limit=20`,
              {
                cache:
                  "no-store",
                headers: {
                  accept:
                    "application/json",
                },
              },
            );

          if (
            !response.ok
          ) {
            throw new Error(
              `Memory leaderboard returned ${response.status}.`,
            );
          }

          setMemoryLeaderboard(
            await response.json() as MemoryLeaderboardResponse,
          );
        } catch (
          cause
        ) {
          console.error(
            cause,
          );

          setError(
            cause instanceof Error
              ? cause.message
              : "Unable to load Hoodie Memory leaderboard.",
          );
        } finally {
          setLeaderboardLoading(
            false,
          );
        }
      },
      [
        memoryLeaderboard,
      ],
    );

  const identity =
    useMemo(
      () => {
        if (!memory) return null;

        const tokenId = memory.tokenId;
        const token = nestedRecord(tokenData, "token");
        const imageData = nestedRecord(tokenData, "image");
        const traits = nestedRecord(tokenData, "traits");

        const tokenName =
          getString(token, ["name"]) ||
          `OnChainHoodies #${tokenId}`;

        const image =
          getString(imageData, ["svg"]) ||
          memory.image ||
          art(tokenId);

        const archetype =
          getString(traits, ["hoodie", "Hoodie"]) ||
          "HOODIE";

        const hoodWallet =
          journeyState?.hoodWallet?.address ||
          memory.hoodWallet.address ||
          memory.identity.hoodWallet;

        const active =
          typeof journeyState?.hoodWallet?.active === "boolean"
            ? journeyState.hoodWallet.active
            : null;

        const traitKeys = [
          ["Dress", "dress"],
          ["Mouth", "mouth"],
          ["Top", "top"],
          ["Eyes", "eyes"],
          ["Accessory", "accessory"],
          ["Beard", "beard"],
          ["Jersey", "jersey"],
        ] as const;

        const traitList = traitKeys
          .map(([label, key]) => {
            const record = traitRecord(tokenData, key);
            if (!record) return null;
            return {
              label,
              value: prettyTrait(getString(record, ["value"])),
              tier: getString(record, ["tier"]) || "—",
              collectionPercent: getNumber(record, "collectionPercent"),
            };
          })
          .filter(Boolean) as Array<{
            label: string;
            value: string;
            tier: string;
            collectionPercent: number | null;
          }>;

        return {
          tokenId,
          tokenName,
          image,
          archetype,
          hoodWallet,
          active,
          traits: traitList,
        };
      },
      [journeyState, memory, tokenData],
    );

  const semanticTimeline =
    useMemo(
      () =>
        (
          memory
            ?.timeline
            .events ||
          []
        ).filter(
          event =>
            event.countsAsMemory,
        ),
      [
        memory,
      ],
    );

  const exportPassport =
    useCallback(
      async () => {
        if (
          !memory ||
          !identity
        ) {
          return;
        }

        try {
          setExporting(
            true,
          );

          setError(
            null,
          );

          const card =
            await makePassportPng({
              memory,
              artwork:
                identity.image,
              archetype:
                identity.archetype,
              traits:
                identity.traits.map(
                  trait => ({
                    label:
                      trait.label,
                    value:
                      trait.value,
                  }),
                ),
              active:
                identity.active,
            });

          saveObjectUrl(
            card.url,
            card.filename,
          );
        } catch (
          cause
        ) {
          console.error(
            cause,
          );

          setError(
            cause instanceof Error
              ? cause.message
              : "Passport export failed.",
          );
        } finally {
          setExporting(
            false,
          );
        }
      },
      [
        identity,
        memory,
      ],
    );


  const walletOpenSea =
    openSeaWalletUrl(
      identity?.hoodWallet,
    );


  const openJourney =
    useCallback(
      (tokenId: number) => {
        if (typeof window === "undefined") return;
        window.location.href = `/journey?hoodie=${tokenId}`;
      },
      [],
    );

  const openHoodWallet =
    useCallback(
      (tokenId: number) => {
        if (typeof window === "undefined") return;
        window.location.href = `/hoodwallet?hoodie=${tokenId}`;
      },
      [],
    );

  return (
    <main className="min-h-screen bg-[#ccff00] text-black">
      <SiteHeader />

      {/* =====================================================
          PUBLIC PASSPORT PICKER
      ===================================================== */}
      <section className="mx-auto max-w-[1440px] px-6 pb-10 pt-32 md:pt-40">
        <div className="flex flex-col gap-5 border-b-2 border-black pb-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[9px] uppercase tracking-[0.2em]">
              OnChainHoodies / Identity
            </p>

            <h1 className="mt-3 text-[clamp(3.4rem,7vw,6.5rem)] leading-[0.82] tracking-[-0.075em]">
              HOODIE PASSPORT
            </h1>
          </div>

          <div className="grid w-full grid-cols-2 border-2 border-black xl:w-auto">
            <button
              type="button"
              onClick={() => setView("passport")}
              className={`px-4 py-3 text-[9px] uppercase tracking-[0.12em] ${
                view === "passport" ? "bg-black text-[#ccff00]" : ""
              }`}
            >
              Passport
            </button>

            <button
              type="button"
              onClick={() => void loadMemoryLeaderboard()}
              className={`border-l-2 border-black px-4 py-3 text-[9px] uppercase tracking-[0.12em] ${
                view === "leaderboard" ? "bg-black text-[#ccff00]" : ""
              }`}
            >
              Leaderboard
            </button>

          </div>
        </div>

        <HoodieIdentityNav
          tokenId={selectedTokenId || tokenInput}
          active="passport"
          className="mt-5"
        />

        {view === "passport" ? (
          <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-xl">
              <p className="text-sm leading-relaxed opacity-65">
                Connect your wallet to choose one of your Hoodies, or enter any
                Hoodie ID to open its public identity.
              </p>
            </div>

            <div className="w-full max-w-[520px]">
              <p className="mb-3 text-[9px] uppercase tracking-[0.18em] opacity-55">
                Explore any Hoodie
              </p>

              <form
                className="flex border-2 border-black"
                onSubmit={event => {
                  event.preventDefault();
                  void loadPassport(tokenInput);
                }}
              >
                <input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={tokenInput}
                  onChange={event =>
                    setTokenInput(event.target.value.replace(/\D/g, ""))
                  }
                  placeholder="ENTER HOODIE ID"
                  aria-label="Enter Hoodie ID"
                  className="min-h-[58px] min-w-0 flex-1 bg-transparent px-4 text-[13px] uppercase outline-none placeholder:text-black placeholder:opacity-40"
                />

                <button
                  type="submit"
                  disabled={passportLoading || !tokenInput}
                  className="min-h-[58px] border-l-2 border-black bg-black px-6 text-[9px] uppercase tracking-[0.15em] text-[#ccff00] disabled:cursor-wait disabled:opacity-50"
                >
                  {passportLoading ? "Reading…" : "Open Passport"}
                </button>
              </form>

              <div className="mt-3 flex items-center justify-between gap-4">
                <p className="text-[8px] uppercase leading-relaxed tracking-[0.12em] opacity-55">
                  Every Passport is public.
                </p>

                {!address ? (
                  <button
                    type="button"
                    onClick={() => void connect()}
                    className="text-[8px] uppercase tracking-[0.14em] underline underline-offset-4"
                  >
                    Connect to see yours →
                  </button>
                ) : (
                  <p className="text-[8px] uppercase tracking-[0.14em]">
                    Wallet connected
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {/* =====================================================
            OWNED HOODIES
        ===================================================== */}
        {view === "passport" && address ? (
          <div className="mt-7">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-[9px] uppercase tracking-[0.18em] opacity-55">
                  Your characters
                </p>

                <h2 className="mt-1 text-2xl tracking-[-0.04em]">
                  YOUR HOODIES
                </h2>
              </div>

              <p className="text-[8px] uppercase tracking-[0.13em] opacity-50">
                {ownershipLoading
                  ? "Reading wallet…"
                  : `${ownedHoodies.length} owned`}
              </p>
            </div>

            {ownershipLoading ? (
              <div className="mt-4 border-2 border-black p-5 text-[9px] uppercase tracking-[0.14em]">
                Reading Hoodie ownership…
              </div>
            ) : ownershipChecked &&
              !ownedHoodies.length ? (
              <div className="mt-4 border-2 border-black p-5 text-[9px] uppercase tracking-[0.14em]">
                No OnChainHoodies found in this wallet.
              </div>
            ) : (
              <div className="mt-4 flex gap-2 overflow-x-auto pb-4 [scrollbar-width:thin]">
                {ownedHoodies.map(
                  hoodie => (
                    <OwnedHoodieTile
                      key={
                        hoodie.tokenId
                      }
                      hoodie={
                        hoodie
                      }
                      selected={
                        hoodie.tokenId ===
                        selectedTokenId
                      }
                      active={activeOwnedHoodies[hoodie.tokenId] === true}
                      onSelect={
                        () =>
                          void loadPassport(
                            hoodie.tokenId,
                          )
                      }
                    />
                  ),
                )}
              </div>
            )}
          </div>
        ) : null}
      </section>

      {error ? (
        <div className="mx-auto max-w-[1440px] px-6 pb-6">
          <div className="border-2 border-black bg-black p-4 text-[10px] uppercase leading-relaxed tracking-[0.12em] text-[#ccff00]">
            {error}
          </div>
        </div>
      ) : null}

{view === "leaderboard" ? (
        <section className="mx-auto max-w-[1440px] px-6 pb-24 pt-3">
          <MemoryLeaderboardPanel
            data={memoryLeaderboard}
            loading={leaderboardLoading}
            sortBy={leaderboardSort}
            onSortChange={setLeaderboardSort}
            onOpen={tokenId => {
              void loadPassport(String(tokenId));
            }}
          />
        </section>
      ) : null}

      {view === "passport" &&
      !memory &&
      !passportLoading ? (
        <section className="mx-auto max-w-[1440px] px-6 pb-24 pt-6">
          <div className="grid min-h-[320px] place-items-center border-2 border-black p-10 text-center">
            <div>
              <p className="text-[clamp(2.5rem,6vw,5rem)] leading-[0.86] tracking-[-0.06em]">
                EVERY HOODIE
                <br />
                BUILDS A HISTORY.
              </p>

              <p className="mx-auto mt-6 max-w-lg text-sm leading-relaxed opacity-60">
                Connect your wallet to choose one of your Hoodies, or enter any
                Hoodie ID to read its public Passport.
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {view === "passport" &&
      passportLoading &&
      !memory ? (
        <section className="mx-auto max-w-[1440px] px-6 pb-24">
          <div className="border-2 border-black p-10 text-center text-[10px] uppercase tracking-[0.16em]">
            Building Hoodie identity…
          </div>
        </section>
      ) : null}

      {view === "passport" &&
      memory &&
      identity ? (
        <>
          {/* =====================================================
              CHARACTER IDENTITY + MEMORY
          ===================================================== */}
          <section className="mx-auto max-w-[1440px] px-6 pb-20 pt-4">
            <div className="flex flex-col gap-4 border-y-2 border-black py-5 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-[9px] uppercase tracking-[0.18em] opacity-55">
                  Character loaded
                </p>
                <p className="mt-2 text-5xl leading-none tracking-[-0.055em] md:text-7xl">
                  #{identity.tokenId}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void exportPassport()}
                  disabled={exporting}
                  className="pixel-cta pixel-cta-dark disabled:cursor-wait disabled:opacity-50"
                >
                  {exporting ? "Generating PNG…" : "Export Passport PNG"}
                </button>
              </div>
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-[0.48fr_1.52fr] lg:items-start">
              <a
                href={openSeaItemUrl(identity.tokenId)}
                target="_blank"
                rel="noreferrer"
                className="self-start border-2 border-black bg-black"
              >
                <Image
                  unoptimized
                  src={identity.image}
                  alt={identity.tokenName}
                  width={600}
                  height={600}
                  className="image-render-pixel aspect-square w-full object-cover"
                />
              </a>

              <div>
                <div className="grid grid-cols-2 border-l-2 border-t-2 border-black md:grid-cols-4">
                  {[
                    ["Hoodie", `#${identity.tokenId}`],
                    ["Archetype", identity.archetype],
                    ["HoodWallet", identity.active === true ? "ACTIVE" : identity.active === false ? "INACTIVE" : identity.hoodWallet ? "CREATED" : "—"],
                    ["Memories", memory.summary.totalMemories],
                  ].map(([label, value]) => (
                    <div key={label} className="border-b-2 border-r-2 border-black p-3 md:p-4">
                      <p className="text-[8px] uppercase tracking-[0.16em] opacity-55">{label}</p>
                      <p className="mt-2 text-lg uppercase md:text-xl">{value}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-4">
                  <div>
                    <div className="flex items-end justify-between border-b-2 border-black pb-3">
                      <div>
                        <p className="text-[8px] uppercase tracking-[0.16em] opacity-50">
                          Onchain appearance
                        </p>
                        <h2 className="mt-2 text-3xl tracking-[-0.04em]">
                          TRAITS
                        </h2>
                      </div>
                      <p className="text-[8px] uppercase tracking-[0.12em] opacity-45">
                        Fully onchain
                      </p>
                    </div>

                    <div className="grid grid-cols-2 border-l border-t border-black sm:grid-cols-4">
                      {identity.traits.length ? (
                        identity.traits.map(trait => (
                          <div
                            key={trait.label}
                            className="min-h-[92px] border-b border-r border-black p-3"
                          >
                            <p className="text-[7px] uppercase tracking-[0.14em] opacity-45">
                              {trait.label}
                            </p>
                            <p className="mt-2 text-[13px] uppercase leading-tight">
                              {trait.value}
                            </p>
                            <p className="mt-2 text-[7px] uppercase tracking-[0.1em] opacity-50">
                              {trait.tier}
                              {trait.collectionPercent !== null
                                ? ` · ${trait.collectionPercent}%`
                                : ""}
                            </p>
                          </div>
                        ))
                      ) : (
                        <div className="col-span-full border-b border-r border-black p-4 text-[9px] uppercase opacity-50">
                          Trait data unavailable.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 border-2 border-black bg-black p-4 text-[#ccff00] md:p-5">
                    <div className="flex flex-col gap-2 border-b border-[#ccff00] pb-3 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <p className="text-[8px] uppercase tracking-[0.16em] opacity-55">
                          Character history
                        </p>
                        <p className="mt-1 text-4xl leading-none tracking-[-0.06em] md:text-5xl">
                          {memory.summary.totalMemories}
                        </p>
                      </div>
                      <p className="text-[9px] uppercase tracking-[0.12em]">
                        Memories
                      </p>
                    </div>

                    <div className="mt-3 grid grid-cols-2 border-l border-t border-[#ccff00] md:grid-cols-3">
                      <Stat label="Hood Its" value={memory.summary.hoodIts} note="Journey" />
                      <Stat label="Hood Talks" value={memory.summary.hoodTalks} note="Voice" />
                      <Stat
                        label="Games"
                        value={memory.hoodlitaire.games}
                        note={
                          memory.hoodlitaire.bestMoves === null
                            ? "Hoodlitaire"
                            : `Best · ${memory.hoodlitaire.bestMoves} moves`
                        }
                      />
                      <Stat
                        label="Hive Swaps"
                        value={memory.hooney.swaps}
                        note={`${tokenAmount(memory.hooney.totalEthInWei, 4)} ETH in`}
                      />
                      <Stat
                        label="Ping"
                        value={
                          memory.ping.home === true
                            ? "HOME"
                            : memory.ping.home === false
                              ? "AWAY"
                              : memory.ping.claimed
                                ? "CLAIMED"
                                : "—"
                        }
                        note="Companion"
                      />
                      <Stat
                        label="Activations"
                        value={memory.hoodWallet.activationCount}
                        note={`${tokenAmount(
                          memory.economy.och.activationSpendWei,
                          0,
                        )} OCH spent`}
                      />
                    </div>

                    <div className="mt-4">
                      <p className="text-[8px] uppercase tracking-[0.14em] opacity-50">
                        Latest voice
                      </p>
                      <p className="mt-2 text-xs leading-relaxed md:text-sm">
                        {memory.hoodTalk.latestQuote
                          ? `“${memory.hoodTalk.latestQuote}”`
                          : "This Hoodie has not spoken onchain yet."}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t-2 border-black pt-3">
                  <div className="flex flex-wrap gap-2 text-[8px] uppercase tracking-[0.12em]">
                    <span className="border border-black px-3 py-2">
                      First memory · {fullDateLabel(memory.summary.firstMemoryAt)}
                    </span>
                    <span className="border border-black px-3 py-2">
                      Character age · {characterAge(memory.summary.firstMemoryAt)}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-x-5 gap-y-2 text-[8px] uppercase tracking-[0.12em]">
                    <a href={openSeaItemUrl(identity.tokenId)} target="_blank" rel="noreferrer" className="underline underline-offset-4">
                      Hoodie on OpenSea →
                    </a>
                    {walletOpenSea ? (
                      <a href={walletOpenSea} target="_blank" rel="noreferrer" className="underline underline-offset-4">
                        HoodWallet {shortAddress(identity.hoodWallet)} →
                      </a>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* =====================================================
              TIMELINE
          ===================================================== */}
          <section className="bg-black px-6 py-20 text-[#ccff00] md:py-24">
            <div className="mx-auto max-w-[1440px]">
              <div className="section-heading-row">
                <p>
                  02 / Timeline
                </p>

                <p>
                  The Hoodie remembers
                </p>
              </div>

              <div className="mt-12 grid gap-10 lg:grid-cols-[0.62fr_1.38fr]">
                <div>
                  <h2 className="text-[clamp(4rem,7vw,7rem)] leading-[0.8] tracking-[-0.07em]">
                    A LIFE
                    <br />
                    ONCHAIN.
                  </h2>

                  <p className="mt-7 max-w-md text-base leading-relaxed opacity-65">
                    Games, speech, companion movements, ecosystem actions and
                    Journey achievements become a readable biography of the
                    character.
                  </p>

                  <div className="mt-7 border border-[#ccff00] p-4">
                    <p className="text-[8px] uppercase tracking-[0.14em] opacity-50">
                      Indexed timeline
                    </p>

                    <p className="mt-2 text-3xl">
                      {
                        memory.timeline
                          .total
                      }
                    </p>

                    <p className="mt-2 text-[8px] uppercase tracking-[0.12em] opacity-50">
                      {
                        memory.timeline
                          .semanticMemories
                      }{" "}
                      semantic memories
                    </p>
                  </div>
                </div>

                <div className="border-t-2 border-[#ccff00]">
                  {semanticTimeline.length ? (
                    semanticTimeline.map(
                      (
                        event,
                        index,
                      ) => (
                        <div
                          key={`${event.transactionHash}-${event.logIndex}-${index}`}
                          className="grid gap-3 border-b-2 border-[#ccff00] py-5 sm:grid-cols-[90px_120px_minmax(0,1fr)_auto] sm:items-center"
                        >
                          <p className="text-[9px] uppercase tracking-[0.12em] opacity-55">
                            {dateLabel(
                              event.timestamp,
                            )}
                          </p>

                          <p className="text-[8px] uppercase tracking-[0.12em] opacity-45">
                            {eventCategory(
                              event,
                            )}
                          </p>

                          <div className="min-w-0">
                            <p className="text-sm uppercase tracking-[0.06em]">
                              {eventTitle(
                                event,
                              )}
                            </p>

                            <p className="mt-1 break-words text-xs leading-relaxed opacity-55">
                              {eventDetail(
                                event,
                              )}
                            </p>
                          </div>

                          <a
                            href={`https://robinhoodchain.blockscout.com/tx/${event.transactionHash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[8px] uppercase underline underline-offset-4 opacity-55 hover:opacity-100"
                          >
                            TX ↗
                          </a>
                        </div>
                      ),
                    )
                  ) : (
                    <div className="border-b-2 border-[#ccff00] py-10">
                      <p className="text-sm uppercase tracking-[0.08em]">
                        This timeline is still being indexed.
                      </p>

                      <p className="mt-3 max-w-xl text-xs leading-relaxed opacity-55">
                        Hoodie Memory is building the historical record from
                        on-chain sources. New memories will appear here as the
                        index catches up.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* =====================================================
              PASSPORT / IDENTITY THESIS
          ===================================================== */}
          <section className="px-6 py-20 md:py-24">
            <div className="mx-auto max-w-[1440px]">
              <div className="section-heading-row border-black">
                <p>
                  03 / Passport
                </p>

                <p>
                  Portable character identity
                </p>
              </div>

              <div className="mt-12 grid gap-10 lg:grid-cols-[0.75fr_1.25fr] lg:items-end">
                <div>
                  <p className="text-[9px] uppercase tracking-[0.18em] opacity-50">
                    One Hoodie. One history.
                  </p>

                  <h2 className="mt-5 text-[clamp(4rem,7vw,7rem)] leading-[0.8] tracking-[-0.07em]">
                    A LIVING
                    <br />
                    IDENTITY.
                  </h2>
                </div>

                <div className="border-l-2 border-black pl-7 md:pl-10">
                  <p className="max-w-3xl text-2xl leading-relaxed md:text-4xl">
                    The Passport turns every meaningful on-chain action into part
                    of the Hoodie&apos;s identity.
                  </p>

                  <p className="mt-6 max-w-3xl text-base leading-relaxed opacity-65 md:text-xl">
                    Its traits are where the character begins. Its wallet, voice,
                    companion, play and achievements add new chapters over time.
                    Seasons expand the story while the Hoodie carries its history forward.
                  </p>

                  <div className="mt-8 flex flex-wrap gap-2 text-[8px] uppercase tracking-[0.14em]">
                    <span className="border border-black px-3 py-2">
                      Identity
                    </span>

                    <span className="border border-black px-3 py-2">
                      Memory
                    </span>

                    <span className="border border-black px-3 py-2">
                      Voice
                    </span>

                    <span className="border border-black px-3 py-2">
                      Companion
                    </span>

                    <span className="border border-black px-3 py-2">
                      Journey
                    </span>

                    <span className="border border-black px-3 py-2">
                      Future Agents
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-12 flex flex-wrap gap-3">
                <Link
                  href={`/journey?hoodie=${identity.tokenId}`}
                  className="pixel-cta pixel-cta-dark"
                >
                  Open Journey →
                </Link>

                <Link
                  href={`/hoodwallet?hoodie=${identity.tokenId}`}
                  className="pixel-cta"
                >
                  Open HoodWallet →
                </Link>

                <button
                  type="button"
                  onClick={
                    () =>
                      void exportPassport()
                  }
                  disabled={
                    exporting
                  }
                  className="pixel-cta disabled:cursor-wait disabled:opacity-50"
                >
                  Export identity →
                </button>
              </div>
            </div>
          </section>
        </>
      ) : null}

      <SiteFooter />
    </main>
  );
}
