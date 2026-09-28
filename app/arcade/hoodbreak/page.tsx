"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  BrowserProvider,
  Contract,
  Interface,
  JsonRpcProvider,
  parseUnits,
  type Eip1193Provider,
} from "ethers";

import SiteHeader from "../../../components/SiteHeader";
import SiteFooter from "../../../components/SiteFooter";
import { useWallet } from "../../../components/WalletProvider";
import { siteConfig } from "../../../lib/config";

const GREEN = "#ccff00";
const BLACK = "#000000";

const W = 120;
const H = 120;

const GAME_AREA_SIZE = 60;
const GAME_AREA_X = 30;
const GAME_AREA_Y = 10;

const BASE_PADDLE_W = 15;
const BUILDER_PADDLE_W = 20;
const PADDLE_H = 1;
const PADDLE_Y = 117;

const BASE_LIVES = 3;
const HODLER_LIVES = 4;
const FLIPPER_SPEED = 1.15;

// Temporary arcade power-ups.
const SPEED_BALL_MULTIPLIER = 1.3;
const SPEED_PADDLE_MULTIPLIER = 1.2;
const SPEED_DURATION_MS = 12_000;
const LASER_DURATION_MS = 8_000;
const PICKUP_FALL_SPEED = 22;
const DROP_EVERY_N_BRICKS = 6;
const LASER_SPEED = 90;
const LASER_COOLDOWN_MS = 180;
const BREAK_OCH_THRESHOLD = 5_000;
const MAX_SELECTED_LEVELS = 8;

const DEMO_IDS = {
  hoodie: "125",
  ping: "1",
  studio: "488",
  frame: "120",
} as const;

const HOOD_OS_ABI = [
  "function hoodInfo(uint256 tokenId) view returns (" +
    "tuple(" +
      "uint256 tokenId," +
      "address owner," +
      "address wallet," +
      "bool walletDeployed," +
      "bool active," +
      "address activationOwner," +
      "uint64 activatedAt," +
      "uint256 walletState," +
      "uint256 nativeBalance," +
      "uint256 paymentTokenBalance" +
    ") info" +
  ")",
] as const;

const PING_OWNER_ABI = [
  "function ownerOf(uint256 tokenId) view returns (address)",
] as const;

const OCH_DECIMALS =
  BigInt("1000000000000000000");

const HOOD_BREAK_SCORES_ADDRESS =
  "0xd520fD747949dd9C670d05f561aC3EEcFBb0ea16";

const HOOD_BREAK_OWNER =
  "0xC7c165bA3fCf9244A45977D4809202b1DC803941";

const ROBINHOOD_CHAIN_ID = BigInt(4663);
const ROBINHOOD_CHAIN_HEX = "0x1237";
const TX_EXPLORER_BASE =
  "https://robinhoodchain.blockscout.com/tx/";

const HOOD_WALLET_EXECUTE_ABI = [
  "function execute(address target,uint256 value,bytes data,uint8 operation) payable returns (bytes result)",
] as const;

const OCH_WRITE_ABI = [
  "function approve(address spender,uint256 amount) returns (bool)",
  "function allowance(address owner,address spender) view returns (uint256)",
] as const;

const HOOD_BREAK_ABI = [
  "function owner() view returns (address)",
  "function submitScore(uint256 hoodieId,uint256 pingId,uint256 frameId,uint256 artId,uint32 elapsedMs,uint32 bricks,bytes32 runId,uint256 deadline,bytes signature)",
  "function fullHoodCompleted(uint256 hoodieId) view returns (bool)",
  "function completedRuns(uint256 hoodieId) view returns (uint256)",
  "function bestFullHood(uint256 hoodieId) view returns (uint32 elapsedMs,uint32 bricks,uint64 submittedAt,uint256 pingId,uint256 frameId,uint256 artId,bytes32 runId,bool exists)",
  "function tournamentCount() view returns (uint256)",
  "function activeTournamentId() view returns (uint256)",
  "function tournamentActive() view returns (bool)",
  "function tournaments(uint256 tournamentId) view returns (uint64 startedAt,uint64 endsAt,uint64 settledAt,uint256 prize,uint256 leaderHoodieId,uint32 bestElapsedMs,uint32 bestBricks,bytes32 bestRunId,bool hasLeader,bool settled)",
  "function startTournament(uint256 prize)",
  "function settleTournament()",
] as const;

const HOOD_BREAK_INTERFACE =
  new Interface(HOOD_BREAK_ABI);

const FONT_SPACING = 2;

// 3x5 in-game typeface supplied for Hood Break.
const FONT_3X5: Record<string, string[]> = {
  "0": [
    "xxx",
    "x x",
    "x x",
    "x x",
    "xxx"
  ],
  "1": [
    " x ",
    "xx ",
    " x ",
    " x ",
    " x "
  ],
  "2": [
    "xxx",
    "  x",
    "xxx",
    "x  ",
    "xxx"
  ],
  "3": [
    "xxx",
    "  x",
    "xxx",
    "  x",
    "xxx"
  ],
  "4": [
    "x x",
    "x x",
    "xxx",
    "  x",
    "  x"
  ],
  "5": [
    "xxx",
    "x  ",
    "xxx",
    "  x",
    "xx "
  ],
  "6": [
    "xxx",
    "x  ",
    "xxx",
    "x x",
    "xxx"
  ],
  "7": [
    "xxx",
    "  x",
    "  x",
    "  x",
    "  x"
  ],
  "8": [
    "xxx",
    "x x",
    "xxx",
    "x x",
    "xxx"
  ],
  "9": [
    "xxx",
    "x x",
    "xxx",
    "  x",
    "  x"
  ],
  "A": [
    "xxx",
    "x x",
    "xxx",
    "x x",
    "x x"
  ],
  "B": [
    "xxx",
    "x x",
    "xx ",
    "x x",
    "xxx"
  ],
  "C": [
    "xxx",
    "x  ",
    "x  ",
    "x  ",
    "xxx"
  ],
  "D": [
    "xx ",
    "x x",
    "x x",
    "x x",
    "xx "
  ],
  "E": [
    "xxx",
    "x  ",
    "xxx",
    "x  ",
    "xxx"
  ],
  "F": [
    "xxx",
    "x  ",
    "xxx",
    "x  ",
    "x  "
  ],
  "G": [
    "xxx",
    "x  ",
    "x x",
    "x x",
    "xxx"
  ],
  "H": [
    "x x",
    "x x",
    "xxx",
    "x x",
    "x x"
  ],
  "I": [
    "xxx",
    " x ",
    " x ",
    " x ",
    "xxx"
  ],
  "J": [
    "xxx",
    " x ",
    " x ",
    " x ",
    "xx "
  ],
  "K": [
    "x x",
    "x x",
    "xx ",
    "x x",
    "x x"
  ],
  "L": [
    "x  ",
    "x  ",
    "x  ",
    "x  ",
    "xxx"
  ],
  "M": [
    "x x",
    "xxx",
    "xxx",
    "x x",
    "x x"
  ],
  "N": [
    "xxx",
    "x x",
    "x x",
    "x x",
    "x x"
  ],
  "O": [
    "xxx",
    "x x",
    "x x",
    "x x",
    "xxx"
  ],
  "P": [
    "xxx",
    "x x",
    "xxx",
    "x  ",
    "x  "
  ],
  "Q": [
    " x ",
    "x x",
    "x x",
    "xxx",
    " xx"
  ],
  "R": [
    "xxx",
    "x x",
    "xx ",
    "x x",
    "x x"
  ],
  "S": [
    "xxx",
    "x  ",
    "xxx",
    "  x",
    "xxx"
  ],
  "T": [
    "xxx",
    " x ",
    " x ",
    " x ",
    " x "
  ],
  "U": [
    "x x",
    "x x",
    "x x",
    "x x",
    "xxx"
  ],
  "V": [
    "x x",
    "x x",
    "x x",
    "x x",
    " x "
  ],
  "W": [
    "x x",
    "x x",
    "xxx",
    "xxx",
    "x x"
  ],
  "X": [
    "x x",
    "x x",
    " x ",
    "x x",
    "x x"
  ],
  "Y": [
    "x x",
    "x x",
    " x ",
    " x ",
    " x "
  ],
  "Z": [
    "xxx",
    "  x",
    " x ",
    "x  ",
    "xxx"
  ],
  "a": [
    "   ",
    "   ",
    " xx",
    "x x",
    "xxx"
  ],
  "b": [
    "x  ",
    "x  ",
    "xxx",
    "x x",
    "xxx"
  ],
  "c": [
    "   ",
    "   ",
    "xxx",
    "x  ",
    "xxx"
  ],
  "d": [
    "  x",
    "  x",
    "xxx",
    "x x",
    "xxx"
  ],
  "e": [
    "   ",
    "   ",
    "xxx",
    "xxx",
    " xx"
  ],
  "f": [
    " xx",
    "x  ",
    "xxx",
    "x  ",
    "x  "
  ],
  "g": [
    "   ",
    "   ",
    "xxx",
    "x x",
    "xxx",
    "  x",
    "xxx"
  ],
  "h": [
    "x  ",
    "x  ",
    "xxx",
    "x x",
    "x x"
  ],
  "i": [
    "   ",
    " x ",
    "   ",
    " x ",
    " x "
  ],
  "j": [
    "   ",
    " x ",
    "   ",
    " x ",
    " x ",
    "xx "
  ],
  "k": [
    "x  ",
    "x  ",
    "x x",
    "xx ",
    "x x"
  ],
  "l": [
    " x ",
    " x ",
    " x ",
    " x ",
    " x "
  ],
  "m": [
    "   ",
    "   ",
    "xxx",
    "xxx",
    "x x"
  ],
  "n": [
    "   ",
    "   ",
    "xxx",
    "x x",
    "x x"
  ],
  "o": [
    "   ",
    "   ",
    "xxx",
    "x x",
    "xxx"
  ],
  "p": [
    "   ",
    "   ",
    "xxx",
    "x x",
    "xxx",
    "x  ",
    "x  "
  ],
  "q": [
    "   ",
    "   ",
    "xxx",
    "x x",
    "xxx",
    "  x",
    "  x"
  ],
  "r": [
    "   ",
    "   ",
    "xxx",
    "x  ",
    "x  "
  ],
  "s": [
    "   ",
    "   ",
    " xx",
    " x ",
    "xx "
  ],
  "t": [
    " x ",
    " x ",
    "xxx",
    " x ",
    " xx"
  ],
  "u": [
    "   ",
    "   ",
    "x x",
    "x x",
    "xxx"
  ],
  "v": [
    "   ",
    "   ",
    "x x",
    "x x",
    " x "
  ],
  "w": [
    "   ",
    "   ",
    "x x",
    "xxx",
    "xxx"
  ],
  "x": [
    "   ",
    "   ",
    "x x",
    " x ",
    "x x"
  ],
  "y": [
    "   ",
    "   ",
    "x x",
    "x x",
    " xx",
    " x ",
    "x  "
  ],
  "z": [
    "   ",
    "   ",
    "xx ",
    " x ",
    " xx"
  ],
  " ": [
    " "
  ],
  ",": [
    " ",
    " ",
    " ",
    " ",
    "x",
    "x"
  ],
  ".": [
    " ",
    " ",
    " ",
    " ",
    "x"
  ],
  "!": [
    "x",
    "x",
    "x",
    " ",
    "x"
  ],
  "?": [
    "xxx",
    "  x",
    " x ",
    "   ",
    " x "
  ],
  "&": [
    " x ",
    "x x",
    " x ",
    "x x",
    " xx"
  ],
  "(": [
    " x ",
    "x  ",
    "x  ",
    "x  ",
    " x "
  ],
  ")": [
    " x ",
    "  x",
    "  x",
    "  x",
    " x "
  ],
  "'": [
    " x ",
    " x "
  ],
  "+": [
    "   ",
    " x ",
    "xxx",
    " x ",
    "   "
  ],
  "-": [
    "   ",
    "   ",
    "xxx",
    "   ",
    "   "
  ],
  "_": [
    "   ",
    "   ",
    "   ",
    "   ",
    "xxx"
  ],
  "=": [
    "   ",
    "xxx",
    "   ",
    "xxx",
    "   "
  ],
  "*": [
    "   ",
    "x x",
    " x ",
    "x x",
    "   "
  ],
  "/": [
    "  x",
    "  x",
    " x ",
    "x  ",
    "x  "
  ],
  "\\": [
    "x  ",
    "x  ",
    " x ",
    "  x",
    "  x"
  ],
  "[": [
    "xx ",
    "x  ",
    "x  ",
    "x  ",
    "xx "
  ],
  "]": [
    " xx",
    "  x",
    "  x",
    "  x",
    " xx"
  ],
  "<": [
    "   ",
    " x ",
    "x  ",
    " x ",
    "   "
  ],
  ">": [
    "   ",
    " x ",
    "  x",
    " x ",
    "   "
  ],
  "$": [
    " xx",
    "xx ",
    " xx",
    "xx ",
    " x "
  ],
  "%": [
    "x x",
    "  x",
    " x ",
    "x  ",
    "x x"
  ],
  ":": [
    " ",
    " ",
    "x",
    " ",
    "x"
  ],
  ";": [
    " ",
    " ",
    "x",
    " ",
    "x",
    "x"
  ],
  "\"": [
    "x x",
    "x x"
  ],
  "#": [
    " x x ",
    "xxxxx",
    " x x ",
    "xxxxx",
    " x x "
  ],
  "^": [
    " x ",
    "x x"
  ],
  "{": [
    " xx",
    " x ",
    "x  ",
    " x ",
    " xx"
  ],
  "}": [
    "xx ",
    " x ",
    "  x",
    " x ",
    "xx "
  ],
  "|": [
    " x ",
    " x ",
    " x ",
    " x ",
    " x "
  ],
  "`": [
    "x  ",
    " x "
  ],
  "~": [
    "   ",
    "   ",
    " xx",
    "xx ",
    "   "
  ],
  "@": [
    " xx ",
    "x  x",
    "  xx",
    " x x",
    " xxx"
  ]
};

type Archetype =
  | "Builder"
  | "Collector"
  | "Flipper"
  | "HODLer"
  | string
  | null;

type AssetKind =
  | "hoodie"
  | "ping"
  | "studio"
  | "hoodframe";

type SpriteData = {
  format: string;
  width: number;
  height: number;
  gameScale?: number;
  anchor: {
    x: number;
    y: number;
  };
  visiblePixelCount: number;
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
  } | null;
  pixels: string[];
};

type HoodieResponse = {
  tokenId: string;
  name: string;
  archetype: Archetype;
  sprite: SpriteData;
  error?: string;
};

type PingResponse = {
  tokenId: string;
  name: string;
  owner: string;
  sprite: SpriteData;
  error?: string;
};

type StudioResponse = {
  tokenId: string;
  name: string;
  owner: string;
  canvas?: {
    canvasId?: number | null;
    permanentPixels?: number | null;
  };
  sprite: SpriteData;
  error?: string;
};

type HoodFrameResponse = {
  tokenId: string;
  name: string;
  owner: string;
  hoodie?: {
    originHoodie?: number | null;
    sealedByHoodie?: number | null;
  };
  sprite: SpriteData;
  error?: string;
};

type PlayableAsset = {
  kind: AssetKind;
  tokenId: string;
  name: string;
  archetype: Archetype;
  sprite: SpriteData;
};

type OwnedHoodie = {
  tokenId: string;
  name: string;
};

type OwnershipResponse = {
  items?: OwnedHoodie[];
  error?: string;
};

type InventoryNft = {
  contract: string;
  tokenId: string;
  name?: string;
};

type InventoryResponse = {
  nfts?: InventoryNft[];
  error?: string;
};

type SetupMode =
  | "demo"
  | "loading"
  | "hoodie-select"
  | "asset-select"
  | "game";

type CompletedFullHoodRun = {
  hoodieId: string;
  pingId: string;
  frameId: string;
  artId: string;
  elapsedMs: number;
  bricks: number;
  fullHood: boolean;
  submitted: boolean;
};

type SignedRunResponse = {
  signature?: string;
  runId?: string;
  deadline?: string;
  error?: string;
};

type TournamentView = {
  count: string;
  activeId: string;
  active: boolean;
  startedAt: number;
  endsAt: number;
  prizeWei: string;
  leaderHoodieId: string;
  bestElapsedMs: number;
  bestBricks: number;
  hasLeader: boolean;
  settled: boolean;
};

type GamePhase =
  | "start"
  | "playing"
  | "between-lives"
  | "select-ready"
  | "select"
  | "stage-intro"
  | "run-clear"
  | "game-over";

type Ball = {
  x: number;
  y: number;
  vx: number;
  vy: number;
};

type SelectorBlock = {
  asset: PlayableAsset;
  x: number;
  y: number;
};

type PickupKind =
  | "speed"
  | "multi"
  | "laser"
  | "life";

type Pickup = {
  kind: PickupKind;
  x: number;
  y: number;
  size: number;
};

type LaserShot = {
  x: number;
  y: number;
};

type GameStatus = {
  phase: GamePhase;
  label: string;
  level: number;
  totalLevels: number;
  lives: number;
  bricks: number;
  currentAsset: string;
  breakAvailable: boolean;
};

const FALLBACK_HOODIE: PlayableAsset = {
  kind: "hoodie",
  tokenId: "125",
  name: "OnChainHoodies #125",
  archetype: "Collector",
  sprite: {
    format: "1bit-row-map",
    width: 20,
    height: 20,
    gameScale: 3,
    anchor: {
      x: 10,
      y: 10,
    },
    visiblePixelCount: 101,
    bounds: {
      minX: 3,
      minY: 3,
      maxX: 16,
      maxY: 19,
      width: 14,
      height: 17,
    },
    pixels: [
      "00000000000000000000",
      "00000000000000000000",
      "00000000000000000000",
      "00000011111111000000",
      "00010111101011101000",
      "00001111010101110000",
      "00001111111111110000",
      "00001110000001110000",
      "00000100000000100000",
      "00000101010101100000",
      "00000100100010100000",
      "00000110000000100000",
      "00000011111111100000",
      "00000001110001100000",
      "00000000110101100000",
      "00000000111111000000",
      "00000000100010000000",
      "00000011100011100000",
      "00001100011100010000",
      "00001000000000010000",
    ],
  },
};

function normalizeArchetype(
  value: Archetype
) {
  const normalized =
    String(value ?? "")
      .trim()
      .toLowerCase();

  if (
    normalized === "builder"
  ) {
    return "Builder";
  }

  if (
    normalized === "collector"
  ) {
    return "Collector";
  }

  if (
    normalized === "flipper"
  ) {
    return "Flipper";
  }

  if (
    normalized === "hodler"
  ) {
    return "HODLer";
  }

  return value || "Unknown";
}

function archetypePower(
  value: Archetype
) {
  const archetype =
    normalizeArchetype(value);

  if (
    archetype === "Builder"
  ) {
    return "WIDE PADDLE";
  }

  if (
    archetype === "Collector"
  ) {
    return "MULTI BALL";
  }

  if (
    archetype === "Flipper"
  ) {
    return "FAST BALL";
  }

  if (
    archetype === "HODLer"
  ) {
    return "EXTRA LIFE";
  }

  return "STANDARD";
}

function assetLabel(
  kind: AssetKind
) {
  if (
    kind === "hoodie"
  ) {
    return "HOODIE";
  }

  if (
    kind === "ping"
  ) {
    return "PING";
  }

  if (
    kind === "studio"
  ) {
    return "STUDIO";
  }

  return "FRAME";
}

function sameAddress(
  a?: string | null,
  b?: string | null,
) {
  return (
    !!a &&
    !!b &&
    a.toLowerCase() === b.toLowerCase()
  );
}

function arcadeRouteFor(
  kind: AssetKind,
  tokenId: string,
) {
  if (kind === "hoodie") {
    return `/api/arcade/hoodie/${encodeURIComponent(tokenId)}`;
  }

  if (kind === "ping") {
    return `/api/arcade/ping/${encodeURIComponent(tokenId)}`;
  }

  if (kind === "studio") {
    return `/api/arcade/studio/${encodeURIComponent(tokenId)}`;
  }

  return `/api/arcade/hoodframe/${encodeURIComponent(tokenId)}`;
}

function supportedKindForContract(
  contract: string,
): AssetKind | null {
  if (sameAddress(contract, siteConfig.pingAddress)) {
    return "ping";
  }

  if (sameAddress(contract, siteConfig.hoodieArtAddress)) {
    return "studio";
  }

  if (sameAddress(contract, siteConfig.hoodFrameAddress)) {
    return "hoodframe";
  }

  return null;
}

function shuffle<T>(
  input: T[]
) {
  const copy = [
    ...input,
  ];

  for (
    let i =
      copy.length - 1;
    i > 0;
    i -= 1
  ) {
    const j =
      Math.floor(
        Math.random() *
          (i + 1)
      );

    [
      copy[i],
      copy[j],
    ] = [
      copy[j],
      copy[i],
    ];
  }

  return copy;
}

function browserEthereum() {
  if (typeof window === "undefined") {
    return null;
  }

  return (
    window as typeof window & {
      ethereum?: Eip1193Provider;
    }
  ).ethereum ?? null;
}

function formatRunTime(
  elapsedMs: number
) {
  const totalTenths =
    Math.floor(
      elapsedMs / 100
    );

  const tenths =
    totalTenths % 10;

  const totalSeconds =
    Math.floor(
      totalTenths / 10
    );

  const minutes =
    Math.floor(
      totalSeconds / 60
    );

  const seconds =
    totalSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${tenths}`;
}

export default function HoodBreakPage() {
  const {
    address,
    connect,
  } = useWallet();

  const canvasRef =
    useRef<HTMLCanvasElement | null>(
      null
    );

  const leftButtonRef =
    useRef<HTMLButtonElement | null>(
      null
    );

  const rightButtonRef =
    useRef<HTMLButtonElement | null>(
      null
    );

  const launchButtonRef =
    useRef<HTMLButtonElement | null>(
      null
    );

  const breakButtonRef =
    useRef<HTMLButtonElement | null>(
      null
    );

  const provider =
    useMemo(() => {
      if (!siteConfig.rpcUrl) {
        return null;
      }

      return new JsonRpcProvider(
        siteConfig.rpcUrl,
        Number(siteConfig.chainId),
        {
          staticNetwork: true,
        },
      );
    }, []);

  const [
    setupMode,
    setSetupMode,
  ] =
    useState<SetupMode>(
      address
        ? "loading"
        : "demo"
    );

  const [
    ownedHoodies,
    setOwnedHoodies,
  ] =
    useState<PlayableAsset[]>([]);

  const [
    selectedHoodie,
    setSelectedHoodie,
  ] =
    useState<PlayableAsset | null>(
      null
    );

  const [
    availableAssets,
    setAvailableAssets,
  ] =
    useState<PlayableAsset[]>([]);

  const [
    selectedAssetKeys,
    setSelectedAssetKeys,
  ] =
    useState<Set<string>>(
      new Set()
    );

  const [
    setupPage,
    setSetupPage,
  ] =
    useState(0);

  const [
    assets,
    setAssets,
  ] =
    useState<PlayableAsset[]>([
      FALLBACK_HOODIE,
    ]);

  const [
    ochBalance,
    setOchBalance,
  ] =
    useState("5000");

  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const [
    loadError,
    setLoadError,
  ] =
    useState<string | null>(
      null
    );

  const [
    runRevision,
    setRunRevision,
  ] =
    useState(0);

  const [
    selectedHoodWalletAddress,
    setSelectedHoodWalletAddress,
  ] =
    useState<string | null>(
      null
    );

  const [
    completedRun,
    setCompletedRun,
  ] =
    useState<CompletedFullHoodRun | null>(
      null
    );

  const [
    scoreSubmitting,
    setScoreSubmitting,
  ] =
    useState(false);

  const [
    scoreTxHash,
    setScoreTxHash,
  ] =
    useState<string | null>(
      null
    );

  const [
    onchainMessage,
    setOnchainMessage,
  ] =
    useState<string | null>(
      null
    );

  const [
    tournament,
    setTournament,
  ] =
    useState<TournamentView | null>(
      null
    );

  const [
    tournamentNow,
    setTournamentNow,
  ] = useState(0);

  const [
    tournamentPrize,
    setTournamentPrize,
  ] =
    useState("50");

  const [
    tournamentBusy,
    setTournamentBusy,
  ] =
    useState(false);

  const [
    tournamentTxHash,
    setTournamentTxHash,
  ] =
    useState<string | null>(
      null
    );

  const [
    status,
    setStatus,
  ] =
    useState<GameStatus>({
      phase: "start",
      label: "Ready",
      level: 1,
      totalLevels: 1,
      lives: 3,
      bricks:
        FALLBACK_HOODIE
          .sprite
          .visiblePixelCount,
      currentAsset:
        "HOODIE",
      breakAvailable:
        true,
    });

  const hoodieAsset =
    useMemo(
      () =>
        assets.find(
          (asset) =>
            asset.kind ===
            "hoodie"
        ) ??
        FALLBACK_HOODIE,
      [assets]
    );

  const breakUnlocked =
    Number(ochBalance) >=
    BREAK_OCH_THRESHOLD;

  const selectedFullHoodReady =
    useMemo(() => {
      const selected =
        availableAssets.filter(
          (asset) =>
            selectedAssetKeys.has(
              `${asset.kind}:${asset.tokenId}`
            )
        );

      return (
        selected.some(
          (asset) =>
            asset.kind === "ping"
        ) &&
        selected.some(
          (asset) =>
            asset.kind === "hoodframe"
        ) &&
        selected.some(
          (asset) =>
            asset.kind === "studio"
        )
      );
    }, [
      availableAssets,
      selectedAssetKeys,
    ]);

  const connectedIsContractOwner =
    !!address &&
    sameAddress(
      address,
      HOOD_BREAK_OWNER
    );

  const assetKey =
    useCallback(
      (
        asset:
          PlayableAsset
      ) =>
        `${asset.kind}:${asset.tokenId}`,
      []
    );

  const loadArcadeAsset =
    useCallback(
      async (
        kind: AssetKind,
        tokenId: string,
        archetype: Archetype = null,
      ): Promise<PlayableAsset> => {
        const response =
          await fetch(
            arcadeRouteFor(
              kind,
              tokenId
            ),
            {
              cache:
                "no-store",
            }
          );

        const data =
          (await response.json()) as
            | HoodieResponse
            | PingResponse
            | StudioResponse
            | HoodFrameResponse;

        if (!response.ok) {
          throw new Error(
            "error" in data &&
            data.error
              ? data.error
              : `Unable to load ${assetLabel(kind)} #${tokenId}.`
          );
        }

        const resolvedArchetype =
          kind === "hoodie"
            ? (
                data as HoodieResponse
              ).archetype
            : archetype;

        return {
          kind,
          tokenId:
            String(
              data.tokenId
            ),
          name:
            data.name,
          archetype:
            resolvedArchetype,
          sprite: {
            ...data.sprite,
            gameScale:
              data.sprite.gameScale ??
              (
                kind === "ping"
                  ? 2
                  : kind === "hoodframe"
                    ? 5
                    : 3
              ),
          },
        };
      },
      []
    );

  const loadDemo =
    useCallback(
      async () => {
        setLoading(true);
        setLoadError(null);

        try {
          const hoodie =
            await loadArcadeAsset(
              "hoodie",
              DEMO_IDS.hoodie
            );

          const [
            ping,
            studio,
            frame,
          ] =
            await Promise.all([
              loadArcadeAsset(
                "ping",
                DEMO_IDS.ping,
                hoodie.archetype
              ),
              loadArcadeAsset(
                "studio",
                DEMO_IDS.studio,
                hoodie.archetype
              ),
              loadArcadeAsset(
                "hoodframe",
                DEMO_IDS.frame,
                hoodie.archetype
              ),
            ]);

          setAssets([
            hoodie,
            ping,
            studio,
            frame,
          ]);

          setOchBalance(
            "5000"
          );

          setRunRevision(
            (value) =>
              value + 1
          );

          setSetupMode(
            "game"
          );
        } catch (error) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Unable to load demo run."
          );
        } finally {
          setLoading(false);
        }
      },
      [
        loadArcadeAsset,
      ]
    );

  const loadWalletHoodies =
    useCallback(
      async () => {
        if (!address) {
          return;
        }

        setSetupMode(
          "loading"
        );
        setLoading(true);
        setLoadError(null);

        try {
          const params =
            new URLSearchParams({
              owner:
                address,
            });

          const response =
            await fetch(
              `/api/hoodies?${params.toString()}`,
              {
                cache:
                  "no-store",
              }
            );

          const payload =
            (await response.json()) as
              OwnershipResponse;

          if (!response.ok) {
            throw new Error(
              payload.error ||
                "Unable to load Hoodie ownership."
            );
          }

          const ids =
            Array.from(
              new Set(
                (
                  payload.items ||
                  []
                ).map(
                  (item) =>
                    String(
                      item.tokenId
                    )
                )
              )
            );

          const loaded =
            await Promise.allSettled(
              ids.map(
                (tokenId) =>
                  loadArcadeAsset(
                    "hoodie",
                    tokenId
                  )
              )
            );

          const hoodies =
            loaded
              .filter(
                (
                  result
                ): result is PromiseFulfilledResult<PlayableAsset> =>
                  result.status ===
                  "fulfilled"
              )
              .map(
                (result) =>
                  result.value
              );

          setOwnedHoodies(
            hoodies
          );

          setSelectedHoodie(
            null
          );

          setAvailableAssets(
            []
          );

          setSelectedAssetKeys(
            new Set()
          );

          setSetupPage(0);

          setSetupMode(
            hoodies.length > 0
              ? "hoodie-select"
              : "demo"
          );

          if (
            hoodies.length === 0
          ) {
            await loadDemo();
          }
        } catch (error) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Unable to load wallet Hoodies."
          );

          await loadDemo();
        } finally {
          setLoading(false);
        }
      },
      [
        address,
        loadArcadeAsset,
        loadDemo,
      ]
    );

  const loadHoodWalletAssets =
    useCallback(
      async (
        hoodie:
          PlayableAsset
      ) => {
        if (!provider) {
          throw new Error(
            "RPC provider unavailable."
          );
        }

        setSetupMode(
          "loading"
        );
        setLoading(true);
        setLoadError(null);

        try {
          const hoodOS =
            new Contract(
              siteConfig.hoodOSAddress,
              HOOD_OS_ABI,
              provider
            );

          const info =
            await hoodOS.hoodInfo(
              BigInt(
                hoodie.tokenId
              )
            );

          const walletAddress =
            String(
              info.wallet
            );

          setSelectedHoodWalletAddress(
            walletAddress
          );

          const walletOchBalance =
            BigInt(
              info.paymentTokenBalance
            );

          setOchBalance(
            (
              walletOchBalance /
              OCH_DECIMALS
            ).toString()
          );

          const params =
            new URLSearchParams({
              address:
                walletAddress,
            });

          const response =
            await fetch(
              `/api/hoodwallet/assets?${params.toString()}`,
              {
                cache:
                  "no-store",
                headers: {
                  accept:
                    "application/json",
                },
              }
            );

          const payload =
            (await response.json()) as
              InventoryResponse;

          if (!response.ok) {
            throw new Error(
              payload.error ||
                "Unable to load HoodWallet inventory."
            );
          }

          const inventoryNfts =
            [
              ...(
                payload.nfts ||
                []
              ),
            ];

          /*
           * Match HoodWallet's existing direct Ping ownership fallback.
           * Ping #N normally belongs to HoodWallet #N, and the indexer may
           * occasionally lag. This ensures the selected Hoodie can still
           * see its Ping in Hood Break when ownership is already on-chain.
           */
          try {
            const ping =
              new Contract(
                siteConfig.pingAddress,
                PING_OWNER_ABI,
                provider
              );

            const pingOwner =
              String(
                await ping.ownerOf(
                  BigInt(
                    hoodie.tokenId
                  )
                )
              );

            const alreadyPresent =
              inventoryNfts.some(
                (nft) =>
                  sameAddress(
                    nft.contract,
                    siteConfig.pingAddress
                  ) &&
                  String(
                    nft.tokenId
                  ) ===
                    hoodie.tokenId
              );

            if (
              sameAddress(
                pingOwner,
                walletAddress
              ) &&
              !alreadyPresent
            ) {
              inventoryNfts.unshift({
                contract:
                  siteConfig.pingAddress,
                tokenId:
                  hoodie.tokenId,
                name:
                  `Ping #${hoodie.tokenId}`,
              });
            }
          } catch {
            // The inventory route remains the primary source.
          }

          const supported =
            inventoryNfts
              .map(
                (nft) => ({
                  nft,
                  kind:
                    supportedKindForContract(
                      nft.contract
                    ),
                })
              )
              .filter(
                (
                  item
                ): item is {
                  nft: InventoryNft;
                  kind:
                    | "ping"
                    | "studio"
                    | "hoodframe";
                } =>
                  item.kind !==
                  null &&
                  item.kind !==
                  "hoodie"
              );

          const loaded =
            await Promise.allSettled(
              supported.map(
                ({
                  nft,
                  kind,
                }) =>
                  loadArcadeAsset(
                    kind,
                    String(
                      nft.tokenId
                    ),
                    hoodie.archetype
                  )
              )
            );

          const playable =
            loaded
              .filter(
                (
                  result
                ): result is PromiseFulfilledResult<PlayableAsset> =>
                  result.status ===
                  "fulfilled"
              )
              .map(
                (result) =>
                  result.value
              );

          setSelectedHoodie(
            hoodie
          );

          setAvailableAssets(
            playable
          );

          setSelectedAssetKeys(
            new Set()
          );

          setSetupPage(0);

          setSetupMode(
            "asset-select"
          );
        } finally {
          setLoading(false);
        }
      },
      [
        loadArcadeAsset,
        provider,
      ]
    );

  const startSelectedRun =
    useCallback(
      () => {
        if (!selectedHoodie) {
          return;
        }

        const selected =
          availableAssets.filter(
            (asset) =>
              selectedAssetKeys.has(
                assetKey(
                  asset
                )
              )
          );

        setAssets([
          selectedHoodie,
          ...selected,
        ]);

        setCompletedRun(
          null
        );
        setScoreTxHash(
          null
        );
        setOnchainMessage(
          null
        );

        setRunRevision(
          (value) =>
            value + 1
        );

        setSetupMode(
          "game"
        );
      },
      [
        assetKey,
        availableAssets,
        selectedAssetKeys,
        selectedHoodie,
      ]
    );

  const refreshTournament =
    useCallback(
      async () => {
        if (!provider) {
          return;
        }

        try {
          const contract =
            new Contract(
              HOOD_BREAK_SCORES_ADDRESS,
              HOOD_BREAK_ABI,
              provider
            );

          const [
            countRaw,
            activeRaw,
            activeIdRaw,
          ] =
            await Promise.all([
              contract.tournamentCount(),
              contract.tournamentActive(),
              contract.activeTournamentId(),
            ]);

          const count =
            BigInt(
              countRaw
            );

          const activeId =
            BigInt(
              activeIdRaw
            );

          const view: TournamentView = {
            count:
              count.toString(),
            activeId:
              activeId.toString(),
            active:
              Boolean(
                activeRaw
              ),
            startedAt:
              0,
            endsAt:
              0,
            prizeWei:
              "0",
            leaderHoodieId:
              "0",
            bestElapsedMs:
              0,
            bestBricks:
              0,
            hasLeader:
              false,
            settled:
              false,
          };

          const readId =
            activeId !==
            BigInt(0)
              ? activeId
              : count;

          if (
            readId !==
            BigInt(0)
          ) {
            const t =
              await contract.tournaments(
                readId
              );

            view.startedAt =
              Number(
                t.startedAt
              );
            view.endsAt =
              Number(
                t.endsAt
              );
            view.prizeWei =
              BigInt(
                t.prize
              ).toString();
            view.leaderHoodieId =
              BigInt(
                t.leaderHoodieId
              ).toString();
            view.bestElapsedMs =
              Number(
                t.bestElapsedMs
              );
            view.bestBricks =
              Number(
                t.bestBricks
              );
            view.hasLeader =
              Boolean(
                t.hasLeader
              );
            view.settled =
              Boolean(
                t.settled
              );
          }

          setTournament(
            view
          );
        } catch (error) {
          console.error(
            "Unable to read Hood Break tournament",
            error
          );
        }
      },
      [
        provider,
      ]
    );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshTournament();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [
    refreshTournament,
  ]);

  useEffect(() => {
    const updateTime = () => setTournamentNow(Date.now());
    const timer = window.setInterval(updateTime, 1000);
    updateTime();
    return () => window.clearInterval(timer);
  }, []);

  async function getWriteSigner() {
    const ethereum =
      browserEthereum();

    if (!ethereum) {
      throw new Error(
        "No browser wallet found."
      );
    }

    const browserProvider =
      new BrowserProvider(
        ethereum
      );

    const network =
      await browserProvider.getNetwork();

    if (
      network.chainId !==
      ROBINHOOD_CHAIN_ID
    ) {
      await ethereum.request({
        method:
          "wallet_switchEthereumChain",
        params: [
          {
            chainId:
              ROBINHOOD_CHAIN_HEX,
          },
        ],
      });
    }

    return browserProvider.getSigner();
  }

  async function submitCompletedScore() {
    if (
      !completedRun ||
      !completedRun.fullHood
    ) {
      setOnchainMessage(
        "Complete a FULL HOOD run first."
      );
      return;
    }

    if (
      !selectedHoodWalletAddress
    ) {
      setOnchainMessage(
        "No HoodWallet resolved for this Hoodie."
      );
      return;
    }

    setScoreSubmitting(
      true
    );
    setOnchainMessage(
      "Requesting verified run signature..."
    );

    try {
      const proofResponse =
        await fetch(
          "/api/arcade/hood-break/sign",
          {
            method:
              "POST",
            headers: {
              "content-type":
                "application/json",
            },
            body:
              JSON.stringify({
                hoodieId:
                  completedRun.hoodieId,
                pingId:
                  completedRun.pingId,
                frameId:
                  completedRun.frameId,
                artId:
                  completedRun.artId,
                elapsedMs:
                  completedRun.elapsedMs,
                bricks:
                  completedRun.bricks,
              }),
          }
        );

      const proof =
        (await proofResponse.json()) as
          SignedRunResponse;

      if (
        !proofResponse.ok ||
        !proof.signature ||
        !proof.runId ||
        !proof.deadline
      ) {
        throw new Error(
          proof.error ||
            "Verifier did not return a valid proof."
        );
      }

      const signer =
        await getWriteSigner();

      const signerAddress =
        await signer.getAddress();

      if (
        address &&
        !sameAddress(
          signerAddress,
          address
        )
      ) {
        throw new Error(
          "Connected wallet changed. Reconnect and try again."
        );
      }

      const calldata =
        HOOD_BREAK_INTERFACE.encodeFunctionData(
          "submitScore",
          [
            BigInt(
              completedRun.hoodieId
            ),
            BigInt(
              completedRun.pingId
            ),
            BigInt(
              completedRun.frameId
            ),
            BigInt(
              completedRun.artId
            ),
            completedRun.elapsedMs,
            completedRun.bricks,
            proof.runId,
            BigInt(
              proof.deadline
            ),
            proof.signature,
          ]
        );

      const hoodWallet =
        new Contract(
          selectedHoodWalletAddress,
          HOOD_WALLET_EXECUTE_ABI,
          signer
        );

      setOnchainMessage(
        "Confirm HoodWallet transaction..."
      );

      const tx =
        await hoodWallet.execute(
          HOOD_BREAK_SCORES_ADDRESS,
          0,
          calldata,
          0
        );

      setScoreTxHash(
        tx.hash
      );

      setOnchainMessage(
        "Score transaction submitted..."
      );

      await tx.wait();

      setCompletedRun(
        (
          current
        ) =>
          current
            ? {
                ...current,
                submitted:
                  true,
              }
            : current
      );

      setOnchainMessage(
        "Leaderboard score recorded. FULL HOOD is now eligible to Hood It."
      );

      await refreshTournament();
    } catch (error) {
      setOnchainMessage(
        error instanceof Error
          ? error.message
          : "Score submission failed."
      );
    } finally {
      setScoreSubmitting(
        false
      );
    }
  }

  async function startTournament() {
    if (
      !connectedIsContractOwner
    ) {
      setOnchainMessage(
        "Only the HoodBreak contract owner can start a tournament."
      );
      return;
    }

    const prize =
      tournamentPrize.trim();

    if (
      !prize ||
      Number(prize) <=
        0
    ) {
      setOnchainMessage(
        "Enter an OCH prize greater than zero."
      );
      return;
    }

    setTournamentBusy(
      true
    );
    setOnchainMessage(
      "Preparing tournament..."
    );

    try {
      const signer =
        await getWriteSigner();

      const amount =
        parseUnits(
          prize,
          18
        );

      const ownerAddress =
        await signer.getAddress();

      const och =
        new Contract(
          siteConfig.ochAddress,
          OCH_WRITE_ABI,
          signer
        );

      const allowance =
        BigInt(
          await och.allowance(
            ownerAddress,
            HOOD_BREAK_SCORES_ADDRESS
          )
        );

      if (
        allowance <
        amount
      ) {
        setOnchainMessage(
          `Approve ${prize} OCH for the tournament...`
        );

        const approveTx =
          await och.approve(
            HOOD_BREAK_SCORES_ADDRESS,
            amount
          );

        setTournamentTxHash(
          approveTx.hash
        );

        await approveTx.wait();
      }

      const scores =
        new Contract(
          HOOD_BREAK_SCORES_ADDRESS,
          HOOD_BREAK_ABI,
          signer
        );

      setOnchainMessage(
        "Confirm tournament start..."
      );

      const startTx =
        await scores.startTournament(
          amount
        );

      setTournamentTxHash(
        startTx.hash
      );

      await startTx.wait();

      setOnchainMessage(
        `48-hour tournament started with ${prize} OCH.`
      );

      await refreshTournament();
    } catch (error) {
      setOnchainMessage(
        error instanceof Error
          ? error.message
          : "Tournament start failed."
      );
    } finally {
      setTournamentBusy(
        false
      );
    }
  }

  async function settleTournament() {
    setTournamentBusy(
      true
    );
    setOnchainMessage(
      "Preparing settlement..."
    );

    try {
      const signer =
        await getWriteSigner();

      const scores =
        new Contract(
          HOOD_BREAK_SCORES_ADDRESS,
          HOOD_BREAK_ABI,
          signer
        );

      const tx =
        await scores.settleTournament();

      setTournamentTxHash(
        tx.hash
      );

      setOnchainMessage(
        "Tournament settlement submitted..."
      );

      await tx.wait();

      setOnchainMessage(
        "Tournament settled."
      );

      await refreshTournament();
    } catch (error) {
      setOnchainMessage(
        error instanceof Error
          ? error.message
          : "Tournament settlement failed."
      );
    } finally {
      setTournamentBusy(
        false
      );
    }
  }

  useEffect(() => {
    const timer =
      window.setTimeout(
        () => {
          if (address) {
            void loadWalletHoodies();
          } else {
            void loadDemo();
          }
        },
        0
      );

    return () => {
      window.clearTimeout(
        timer
      );
    };
  }, [
    address,
    loadDemo,
    loadWalletHoodies,
  ]);

  /*
   * Native 120x120 setup UI.
   *
   * The same 3x5 bitmap typeface used by the game is used here too.
   * Selection is arcade-native: move the small paddle and fire a 1px
   * setup laser at a Hoodie / level preview. Pointer selection remains as
   * a convenient fallback, but the laser is the primary controller path.
   */
  useEffect(() => {
    if (
      setupMode === "game"
    ) {
      return;
    }

    const canvas =
      canvasRef.current;

    const leftButton =
      leftButtonRef.current;

    const rightButton =
      rightButtonRef.current;

    const launchButton =
      launchButtonRef.current;

    if (
      !canvas ||
      !leftButton ||
      !rightButton ||
      !launchButton
    ) {
      return;
    }

    const context =
      canvas.getContext(
        "2d"
      );

    if (!context) {
      return;
    }

    const setupCanvas =
      canvas;

    const setupContext =
      context;

    const leftControl =
      leftButton;

    const rightControl =
      rightButton;

    const launchControl =
      launchButton;

    setupContext.imageSmoothingEnabled =
      false;

    const SETUP_PADDLE_W = 15;
    const SETUP_PADDLE_Y = 117;
    const SETUP_LASER_SPEED = 92;

    let paddleX =
      Math.floor(
        (W - SETUP_PADDLE_W) / 2
      );

    let laser:
      | {
          x: number;
          y: number;
        }
      | null =
      null;

    let animationFrameId = 0;
    let lastFrame = performance.now();

    const keys = {
      left: false,
      right: false,
    };

    function glyphForSetup(
      character: string
    ) {
      return (
        FONT_3X5[
          character
        ] ??
        FONT_3X5[
          character.toUpperCase()
        ] ??
        FONT_3X5[" "]
      );
    }

    function setupTextWidth(
      value: string,
      scale = 1
    ) {
      const characters =
        Array.from(
          value
        );

      if (
        characters.length === 0
      ) {
        return 0;
      }

      let width = 0;

      characters.forEach(
        (
          character,
          index
        ) => {
          const glyph =
            glyphForSetup(
              character
            );

          const glyphWidth =
            Math.max(
              ...glyph.map(
                (row) =>
                  row.length
              )
            );

          width +=
            glyphWidth *
            scale;

          if (
            index <
            characters.length - 1
          ) {
            width +=
              FONT_SPACING *
              scale;
          }
        }
      );

      return width;
    }

    function drawText(
      textValue: string,
      x: number,
      y: number,
      scale = 1,
      align:
        | "left"
        | "center"
        | "right" =
        "left"
    ) {
      const value =
        textValue.toUpperCase();

      const width =
        setupTextWidth(
          value,
          scale
        );

      let cursorX = x;

      if (
        align === "center"
      ) {
        cursorX -=
          Math.floor(
            width / 2
          );
      }

      if (
        align === "right"
      ) {
        cursorX -= width;
      }

      setupContext.fillStyle =
        GREEN;

      for (
        const character of
        Array.from(value)
      ) {
        const glyph =
          glyphForSetup(
            character
          );

        const glyphWidth =
          Math.max(
            ...glyph.map(
              (row) =>
                row.length
            )
          );

        glyph.forEach(
          (
            row,
            rowIndex
          ) => {
            Array.from(
              row
            ).forEach(
              (
                pixel,
                columnIndex
              ) => {
                if (
                  pixel !== "x"
                ) {
                  return;
                }

                setupContext.fillRect(
                  cursorX +
                    columnIndex *
                      scale,
                  y +
                    rowIndex *
                      scale,
                  scale,
                  scale
                );
              }
            );
          }
        );

        cursorX +=
          (glyphWidth +
            FONT_SPACING) *
          scale;
      }
    }

    const drawSpritePreview =
      (
        asset:
          PlayableAsset,
        centerX:
          number,
        centerY:
          number,
        selected:
          boolean
      ) => {
        const maxSize =
          asset.sprite.width ===
          30
            ? 27
            : 24;

        const scale =
          Math.max(
            1,
            Math.floor(
              maxSize /
                Math.max(
                  asset.sprite.width,
                  asset.sprite.height
                )
            )
          );

        const width =
          asset.sprite.width *
          scale;

        const height =
          asset.sprite.height *
          scale;

        const startX =
          Math.round(
            centerX -
              width / 2
          );

        const startY =
          Math.round(
            centerY -
              height / 2
          );

        setupContext.fillStyle =
          GREEN;

        asset.sprite.pixels.forEach(
          (
            row,
            y
          ) => {
            Array.from(
              row
            ).forEach(
              (
                pixel,
                x
              ) => {
                if (
                  pixel !== "1"
                ) {
                  return;
                }

                setupContext.fillRect(
                  startX +
                    x *
                      scale,
                  startY +
                    y *
                      scale,
                  scale,
                  scale
                );
              }
            );
          }
        );

        if (selected) {
          setupContext.strokeStyle =
            GREEN;

          setupContext.lineWidth =
            1;

          setupContext.strokeRect(
            centerX - 15,
            centerY - 15,
            30,
            30
          );
        }
      };

    const pageSize = 6;

    const source =
      setupMode ===
      "hoodie-select"
        ? ownedHoodies
        : availableAssets;

    const maxPage =
      Math.max(
        0,
        Math.ceil(
          source.length /
            pageSize
        ) - 1
      );

    const page =
      Math.min(
        setupPage,
        maxPage
      );

    const visible =
      source.slice(
        page * pageSize,
        page * pageSize +
          pageSize
      );

    const slots = [
      { x: 20, y: 31 },
      { x: 60, y: 31 },
      { x: 100, y: 31 },
      { x: 20, y: 68 },
      { x: 60, y: 68 },
      { x: 100, y: 68 },
    ];

    function toggleOrOpenAsset(
      asset:
        PlayableAsset
    ) {
      if (
        setupMode ===
        "hoodie-select"
      ) {
        void loadHoodWalletAssets(
          asset
        ).catch(
          (
            error
          ) => {
            setLoadError(
              error instanceof Error
                ? error.message
                : "Unable to load HoodWallet."
            );

            setSetupMode(
              "hoodie-select"
            );
          }
        );

        return;
      }

      const key =
        assetKey(
          asset
        );

      setSelectedAssetKeys(
        (
          current
        ) => {
          const next =
            new Set(
              current
            );

          if (
            next.has(key)
          ) {
            next.delete(key);
            return next;
          }

          if (
            next.size >=
            MAX_SELECTED_LEVELS
          ) {
            return current;
          }

          next.add(key);
          return next;
        }
      );
    }

    function hitPreview(
      x: number,
      y: number
    ) {
      const index =
        slots.findIndex(
          (
            slot
          ) =>
            Math.abs(
              x - slot.x
            ) <= 16 &&
            Math.abs(
              y - slot.y
            ) <= 16
        );

      if (
        index < 0
      ) {
        return false;
      }

      const asset =
        visible[index];

      if (!asset) {
        return false;
      }

      toggleOrOpenAsset(
        asset
      );

      return true;
    }

    function fireSetupLaser() {
      if (
        setupMode ===
          "loading" ||
        laser
      ) {
        return;
      }

      laser = {
        x:
          paddleX +
          Math.floor(
            SETUP_PADDLE_W / 2
          ),
        y:
          SETUP_PADDLE_Y - 1,
      };
    }

    function update(
      deltaTime: number
    ) {
      const paddleSpeed =
        68;

      if (keys.left) {
        paddleX -=
          paddleSpeed *
          deltaTime;
      }

      if (keys.right) {
        paddleX +=
          paddleSpeed *
          deltaTime;
      }

      paddleX =
        Math.max(
          0,
          Math.min(
            W -
              SETUP_PADDLE_W,
            paddleX
          )
        );

      if (!laser) {
        return;
      }

      laser.y -=
        SETUP_LASER_SPEED *
        deltaTime;

      if (
        hitPreview(
          laser.x,
          laser.y
        )
      ) {
        laser = null;
        return;
      }

      if (
        laser.y < 8
      ) {
        laser = null;
      }
    }

    function drawSetup() {
      setupContext.fillStyle =
        BLACK;

      setupContext.fillRect(
        0,
        0,
        W,
        H
      );

      if (
        setupMode ===
        "loading"
      ) {
        drawText(
          "LOADING",
          W / 2,
          56,
          1,
          "center"
        );

        return;
      }

      if (
        setupMode ===
        "hoodie-select"
      ) {
        drawText(
          "SELECT HOODIE",
          W / 2,
          3,
          1,
          "center"
        );
      } else {
        drawText(
          `LEVELS ${selectedAssetKeys.size}/${MAX_SELECTED_LEVELS}`,
          W / 2,
          3,
          1,
          "center"
        );
      }

      visible.forEach(
        (
          asset,
          index
        ) => {
          const slot =
            slots[index];

          if (!slot) {
            return;
          }

          const selected =
            setupMode ===
              "asset-select" &&
            selectedAssetKeys.has(
              assetKey(
                asset
              )
            );

          drawSpritePreview(
            asset,
            slot.x,
            slot.y,
            selected
          );

          drawText(
            `#${asset.tokenId}`,
            slot.x,
            slot.y + 16,
            1,
            "center"
          );
        }
      );

      if (page > 0) {
        drawText(
          "<",
          3,
          98
        );
      }

      if (
        page < maxPage
      ) {
        drawText(
          ">",
          117,
          98,
          1,
          "right"
        );
      }

      drawText(
        `${page + 1}/${maxPage + 1}`,
        W / 2,
        98,
        1,
        "center"
      );

      if (
        setupMode ===
        "asset-select"
      ) {
        drawText(
          "TAP START",
          W / 2,
          106,
          1,
          "center"
        );
      } else {
        drawText(
          "FIRE TO SELECT",
          W / 2,
          106,
          1,
          "center"
        );
      }

      setupContext.fillStyle =
        GREEN;

      setupContext.fillRect(
        Math.round(
          paddleX
        ),
        SETUP_PADDLE_Y,
        SETUP_PADDLE_W,
        1
      );

      if (laser) {
        setupContext.fillRect(
          Math.round(
            laser.x
          ),
          Math.round(
            laser.y
          ),
          1,
          2
        );
      }
    }

    function frame(
      now: number
    ) {
      const deltaTime =
        Math.min(
          (now - lastFrame) /
            1000,
          1 / 30
        );

      lastFrame = now;

      update(
        deltaTime
      );

      drawSetup();

      animationFrameId =
        requestAnimationFrame(
          frame
        );
    }

    function setKey(
      key: string,
      value: boolean
    ) {
      const lower =
        key.toLowerCase();

      if (
        key ===
          "ArrowLeft" ||
        lower === "a"
      ) {
        keys.left = value;
      }

      if (
        key ===
          "ArrowRight" ||
        lower === "d"
      ) {
        keys.right = value;
      }
    }

    function handleKeyDown(
      event:
        KeyboardEvent
    ) {
      if (
        [
          "ArrowLeft",
          "ArrowRight",
          " ",
        ].includes(
          event.key
        )
      ) {
        event.preventDefault();
      }

      setKey(
        event.key,
        true
      );

      if (
        event.code ===
          "Space" &&
        !event.repeat
      ) {
        fireSetupLaser();
      }

      if (
        event.key ===
          "Enter" &&
        setupMode ===
          "asset-select"
      ) {
        startSelectedRun();
      }
    }

    function handleKeyUp(
      event:
        KeyboardEvent
    ) {
      setKey(
        event.key,
        false
      );
    }

    function bindHold(
      button:
        HTMLButtonElement,
      side:
        "left" | "right"
    ) {
      const down =
        (
          event:
            PointerEvent
        ) => {
          event.preventDefault();
          keys[side] = true;
          button.setPointerCapture(
            event.pointerId
          );
        };

      const up =
        (
          event:
            PointerEvent
        ) => {
          event.preventDefault();
          keys[side] = false;

          if (
            button.hasPointerCapture(
              event.pointerId
            )
          ) {
            button.releasePointerCapture(
              event.pointerId
            );
          }
        };

      button.addEventListener(
        "pointerdown",
        down
      );

      button.addEventListener(
        "pointerup",
        up
      );

      button.addEventListener(
        "pointercancel",
        up
      );

      return () => {
        button.removeEventListener(
          "pointerdown",
          down
        );

        button.removeEventListener(
          "pointerup",
          up
        );

        button.removeEventListener(
          "pointercancel",
          up
        );
      };
    }

    const unbindLeft =
      bindHold(
        leftControl,
        "left"
      );

    const unbindRight =
      bindHold(
        rightControl,
        "right"
      );

    function handleLaunch(
      event:
        PointerEvent
    ) {
      event.preventDefault();
      fireSetupLaser();
    }

    function handleSetupPointer(
      event:
        PointerEvent
    ) {
      const rect =
        setupCanvas.getBoundingClientRect();

      const x =
        ((event.clientX -
          rect.left) /
          rect.width) *
        W;

      const y =
        ((event.clientY -
          rect.top) /
          rect.height) *
        H;

      if (
        y >= 94 &&
        x < 24 &&
        page > 0
      ) {
        setSetupPage(
          page - 1
        );
        return;
      }

      if (
        y >= 94 &&
        x > 96 &&
        page < maxPage
      ) {
        setSetupPage(
          page + 1
        );
        return;
      }

      if (
        setupMode ===
          "asset-select" &&
        y >= 102 &&
        y <= 114 &&
        x >= 35 &&
        x <= 85
      ) {
        startSelectedRun();
        return;
      }

      hitPreview(
        x,
        y
      );
    }

    window.addEventListener(
      "keydown",
      handleKeyDown,
      {
        passive: false,
      }
    );

    window.addEventListener(
      "keyup",
      handleKeyUp
    );

    launchControl.addEventListener(
      "pointerdown",
      handleLaunch
    );

    setupCanvas.addEventListener(
      "pointerdown",
      handleSetupPointer
    );

    animationFrameId =
      requestAnimationFrame(
        frame
      );

    return () => {
      cancelAnimationFrame(
        animationFrameId
      );

      window.removeEventListener(
        "keydown",
        handleKeyDown
      );

      window.removeEventListener(
        "keyup",
        handleKeyUp
      );

      launchControl.removeEventListener(
        "pointerdown",
        handleLaunch
      );

      setupCanvas.removeEventListener(
        "pointerdown",
        handleSetupPointer
      );

      unbindLeft();
      unbindRight();
    };
  }, [
    assetKey,
    availableAssets,
    loadHoodWalletAssets,
    ownedHoodies,
    selectedAssetKeys,
    setupMode,
    setupPage,
    startSelectedRun,
  ]);

  useEffect(() => {
    if (
      setupMode !== "game"
    ) {
      return;
    }

    const canvas =
      canvasRef.current;

    const leftButton =
      leftButtonRef.current;

    const rightButton =
      rightButtonRef.current;

    const launchButton =
      launchButtonRef.current;

    const breakButton =
      breakButtonRef.current;

    if (
      !canvas ||
      !leftButton ||
      !rightButton ||
      !launchButton ||
      !breakButton
    ) {
      return;
    }

    const context =
      canvas.getContext(
        "2d"
      );

    if (!context) {
      return;
    }

    const gameCanvas =
      canvas;

    const gameContext =
      context;

    const leftControl =
      leftButton;

    const rightControl =
      rightButton;

    const launchControl =
      launchButton;

    gameContext.imageSmoothingEnabled =
      false;

    const runAssets =
      assets.length > 0
        ? assets
        : [
            FALLBACK_HOODIE,
          ];

    const hoodie =
      runAssets.find(
        (asset) =>
          asset.kind ===
          "hoodie"
      ) ??
      FALLBACK_HOODIE;

    const secondaryAssets =
      runAssets.filter(
        (asset) =>
          asset.kind !==
          "hoodie"
      );

    const totalLevels =
      1 +
      secondaryAssets.length;

    const archetype =
      normalizeArchetype(
        hoodie.archetype
      );

    const paddleWidth =
      archetype ===
      "Builder"
        ? BUILDER_PADDLE_W
        : BASE_PADDLE_W;

    const startingLives =
      archetype ===
      "HODLer"
        ? HODLER_LIVES
        : BASE_LIVES;

    const speedMultiplier =
      archetype ===
      "Flipper"
        ? FLIPPER_SPEED
        : 1;

    let currentAsset =
      hoodie;

    let remainingAssets =
      shuffle(
        secondaryAssets
      );

    let completedLevels =
      0;

    let phase: GamePhase =
      "start";

    let bricks:
      boolean[][] = [];

    let remainingBricks =
      0;

    let lives =
      startingLives;

    let paddleX =
      Math.floor(
        (W -
          paddleWidth) /
          2
      );

    let balls:
      Ball[] = [];

    let selectorBlocks:
      SelectorBlock[] = [];

    let selectorShots:
      LaserShot[] = [];

    let pickups: Pickup[] = [];

    let laserShots: LaserShot[] = [];

    let destroyedSinceDrop = 0;
    let totalDestroyedBricks = 0;
    let lifeRecoveredThisRun = false;

    let dropDeck: Array<PickupKind | null> = [];

    let speedUntil = 0;

    let laserUntil = 0;

    let lastLaserAt = 0;

    let pickupRevealText = "";
    let pickupRevealUntil = 0;

    const breakEligible =
      Number(ochBalance) >= BREAK_OCH_THRESHOLD;

    let breakCharges =
      breakEligible ? 1 : 0;

    let animationFrameId =
      0;

    let lastTime =
      performance.now();

    let draggingCanvas =
      false;

    let timerStartedAt:
      number | null =
      null;

    let finalElapsedMs =
      0;

    let introUntil =
      0;

    const keys = {
      left: false,
      right: false,
    };

    let audioContext:
      AudioContext | null =
      null;

    function currentLevelNumber() {
      return Math.min(
        completedLevels + 1,
        totalLevels
      );
    }

    function publishStatus(
      label?: string
    ) {
      setStatus({
        phase,
        label:
          label ??
          phase,
        level:
          currentLevelNumber(),
        totalLevels,
        lives,
        bricks:
          phase ===
            "select" ||
          phase ===
            "select-ready"
            ? selectorBlocks.length
            : remainingBricks,
        currentAsset:
          phase ===
            "select" ||
          phase ===
            "select-ready"
            ? "SELECT"
            : assetLabel(
                currentAsset.kind
              ),
        breakAvailable:
          breakCharges > 0,
      });
    }

    function ensureAudio() {
      if (
        !audioContext
      ) {
        const AudioContextClass =
          window.AudioContext ||
          (
            window as typeof window & {
              webkitAudioContext?: typeof AudioContext;
            }
          ).webkitAudioContext;

        if (
          AudioContextClass
        ) {
          audioContext =
            new AudioContextClass();
        }
      }

      if (
        audioContext?.state ===
        "suspended"
      ) {
        void audioContext.resume();
      }
    }

    function beep(
      frequency =
        440,
      duration =
        0.03,
      type:
        OscillatorType =
        "square",
      volume =
        0.035
    ) {
      ensureAudio();

      if (
        !audioContext
      ) {
        return;
      }

      const oscillator =
        audioContext.createOscillator();

      const gain =
        audioContext.createGain();

      oscillator.type =
        type;

      oscillator.frequency.value =
        frequency;

      gain.gain.value =
        volume;

      oscillator.connect(
        gain
      );

      gain.connect(
        audioContext.destination
      );

      const now =
        audioContext.currentTime;

      gain.gain.setValueAtTime(
        volume,
        now
      );

      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        now +
          duration
      );

      oscillator.start(
        now
      );

      oscillator.stop(
        now +
          duration
      );
    }

    function glyphFor(
      character:
        string
    ) {
      return (
        FONT_3X5[
          character
        ] ??
        FONT_3X5[" "]
      );
    }

    function bitmapTextWidth(
      text: string,
      scale = 1
    ) {
      const characters =
        Array.from(
          text
        );

      if (
        !characters.length
      ) {
        return 0;
      }

      let width =
        0;

      characters.forEach(
        (
          character,
          index
        ) => {
          const glyph =
            glyphFor(
              character
            );

          const glyphWidth =
            Math.max(
              ...glyph.map(
                (row) =>
                  row.length
              )
            );

          width +=
            glyphWidth *
            scale;

          if (
            index <
            characters.length -
              1
          ) {
            width +=
              FONT_SPACING *
              scale;
          }
        }
      );

      return width;
    }

    function drawBitmapText(
      text: string,
      x: number,
      y: number,
      scale = 1,
      align:
        | "left"
        | "center"
        | "right" =
        "left"
    ) {
      const value =
        text.toUpperCase();

      const width =
        bitmapTextWidth(
          value,
          scale
        );

      let cursorX =
        x;

      if (
        align ===
        "center"
      ) {
        cursorX -=
          Math.floor(
            width / 2
          );
      }

      if (
        align ===
        "right"
      ) {
        cursorX -=
          width;
      }

      gameContext.fillStyle =
        GREEN;

      for (
        const character of
        Array.from(
          value
        )
      ) {
        const glyph =
          glyphFor(
            character
          );

        const glyphWidth =
          Math.max(
            ...glyph.map(
              (row) =>
                row.length
            )
          );

        glyph.forEach(
          (
            row,
            rowIndex
          ) => {
            Array.from(
              row
            ).forEach(
              (
                pixel,
                columnIndex
              ) => {
                if (
                  pixel !==
                  "x"
                ) {
                  return;
                }

                gameContext.fillRect(
                  cursorX +
                    columnIndex *
                      scale,
                  y +
                    rowIndex *
                      scale,
                  scale,
                  scale
                );
              }
            );
          }
        );

        cursorX +=
          (glyphWidth +
            FONT_SPACING) *
          scale;
      }
    }

    function spriteScaleFor(
      asset:
        PlayableAsset
    ) {
      return (
        asset.sprite
          .gameScale ??
        Math.max(
          1,
          Math.floor(
            GAME_AREA_SIZE /
              Math.max(
                asset.sprite
                  .width,
                asset.sprite
                  .height
              )
          )
        )
      );
    }

    function spriteGeometry(
      asset:
        PlayableAsset
    ) {
      const scale =
        spriteScaleFor(
          asset
        );

      const width =
        asset.sprite
          .width *
        scale;

      const height =
        asset.sprite
          .height *
        scale;

      return {
        scale,
        x:
          GAME_AREA_X +
          Math.floor(
            (GAME_AREA_SIZE -
              width) /
              2
          ),
        y:
          GAME_AREA_Y +
          Math.floor(
            (GAME_AREA_SIZE -
              height) /
              2
          ),
      };
    }

    function loadCurrentStageBricks() {
      bricks =
        currentAsset.sprite.pixels.map(
          (row) =>
            row
              .split("")
              .map(
                (value) =>
                  value ===
                  "1"
              )
        );

      remainingBricks =
        bricks
          .flat()
          .filter(
            Boolean
          ).length;

      pickups = [];
      laserShots = [];
      destroyedSinceDrop = 0;
      speedUntil = 0;
      laserUntil = 0;
      pickupRevealText = "";
      pickupRevealUntil = 0;

      const baseDeck: Array<PickupKind | null> = [
        "speed",
        null,
        null,
        "multi",
        null,
        "laser",
        null,
        null,
        null,
        "life",
        null,
        null,
      ];

      // Collector always gets MULTI as the first real drop.
      dropDeck =
        archetype === "Collector"
          ? ["multi", ...shuffle(baseDeck.filter((item) => item !== "multi"))]
          : shuffle(baseDeck);
    }

    function createServeBall(): Ball {
      return {
        x:
          paddleX +
          Math.floor(
            paddleWidth /
              2
          ),
        y:
          PADDLE_Y -
          2,
        vx:
          0.55 *
          speedMultiplier,
        vy:
          -0.72 *
          speedMultiplier,
      };
    }

    function resetBallToPaddle() {
      paddleX =
        Math.floor(
          (W -
            paddleWidth) /
            2
        );

      balls = [
        createServeBall(),
      ];
    }

    function currentElapsedMs(
      now =
        performance.now()
    ) {
      if (
        timerStartedAt ===
        null
      ) {
        return finalElapsedMs;
      }

      if (
        phase ===
          "run-clear" ||
        phase ===
          "game-over"
      ) {
        return finalElapsedMs;
      }

      return Math.max(
        0,
        now -
          timerStartedAt
      );
    }

    function formatHudTime(
      milliseconds:
        number
    ) {
      const totalSeconds =
        Math.floor(
          milliseconds /
            1000
        );

      const minutes =
        Math.floor(
          totalSeconds /
            60
        );

      const seconds =
        totalSeconds %
        60;

      return `${String(
        minutes
      ).padStart(
        2,
        "0"
      )}:${String(
        seconds
      ).padStart(
        2,
        "0"
      )}`;
    }

    function formatFinalTime(
      milliseconds:
        number
    ) {
      const totalTenths =
        Math.floor(
          milliseconds /
            100
        );

      const tenths =
        totalTenths %
        10;

      const totalSeconds =
        Math.floor(
          totalTenths /
            10
        );

      const minutes =
        Math.floor(
          totalSeconds /
            60
        );

      const seconds =
        totalSeconds %
        60;

      return `${String(
        minutes
      ).padStart(
        2,
        "0"
      )}:${String(
        seconds
      ).padStart(
        2,
        "0"
      )}.${tenths}`;
    }

    function createSelectorBlocks() {
      const slots =
        shuffle([
          { x: 18, y: 30 },
          { x: 45, y: 24 },
          { x: 73, y: 28 },
          { x: 101, y: 34 },
          { x: 29, y: 58 },
          { x: 57, y: 54 },
          { x: 86, y: 61 },
          { x: 59, y: 82 },
        ]);

      const shuffledAssets =
        shuffle(
          remainingAssets
        );

      selectorBlocks =
        shuffledAssets.map(
          (
            asset,
            index
          ) => ({
            asset,
            x:
              slots[
                index
              ]?.x ??
              60,
            y:
              slots[
                index
              ]?.y ??
              50,
          })
        );
    }

    function resetRun() {
      currentAsset =
        hoodie;

      remainingAssets =
        shuffle(
          secondaryAssets
        );

      completedLevels =
        0;

      lives =
        startingLives;

      timerStartedAt =
        null;

      finalElapsedMs =
        0;

      totalDestroyedBricks =
        0;

      lifeRecoveredThisRun =
        false;

      breakCharges =
        breakEligible ? 1 : 0;

      phase =
        "start";

      selectorBlocks =
        [];

      selectorShots =
        [];

      loadCurrentStageBricks();
      resetBallToPaddle();
      publishStatus(
        "Ready"
      );
    }

    function startRunOrContinue() {
      ensureAudio();

      if (
        phase ===
          "run-clear" ||
        phase ===
          "game-over"
      ) {
        resetRun();
      }

      if (
        phase ===
        "start"
      ) {
        setCompletedRun(
          null
        );
        setScoreTxHash(
          null
        );

        timerStartedAt =
          performance.now();

        phase =
          "playing";

        publishStatus(
          "Playing"
        );

        return;
      }

      if (
        phase ===
        "between-lives"
      ) {
        phase =
          "playing";

        publishStatus(
          "Playing"
        );

        return;
      }

      if (
        phase ===
        "select-ready"
      ) {
        phase =
          "select";

        publishStatus(
          "Select"
        );
      }
    }

    function activateMultiball() {
      const source = balls[0];
      if (!source) return;

      const baseSpeed = Math.max(0.75, Math.hypot(source.vx, source.vy));
      const direction = source.vx >= 0 ? 1 : -1;

      balls.push(
        { x: source.x, y: source.y, vx: -0.72 * baseSpeed, vy: -0.72 * baseSpeed },
        { x: source.x, y: source.y, vx: 0.72 * baseSpeed * direction, vy: -0.72 * baseSpeed }
      );

      beep(680, 0.04);
      window.setTimeout(() => beep(880, 0.05), 45);
    }

    function activatePickup(kind: PickupKind) {
      const now = performance.now();

      pickupRevealText =
        kind === "speed"
          ? "SPEED"
          : kind === "multi"
            ? "MULTI"
            : kind === "laser"
              ? "LASER"
              : "LIFE";

      pickupRevealUntil = now + 650;

      if (kind === "speed") {
        speedUntil = now + SPEED_DURATION_MS;
        beep(760, 0.04);
        return;
      }

      if (kind === "multi") {
        activateMultiball();
        return;
      }

      if (kind === "life") {
        if (
          lives < startingLives &&
          !lifeRecoveredThisRun
        ) {
          lives = Math.min(
            startingLives,
            lives + 1
          );

          lifeRecoveredThisRun = true;

          publishStatus(
            "Extra life"
          );

          beep(660, 0.05);
          window.setTimeout(
            () => beep(980, 0.08),
            55
          );
        }

        return;
      }

      laserUntil = now + LASER_DURATION_MS;
      beep(940, 0.04);
    }

    function fireLaser() {
      const now = performance.now();
      if (phase !== "playing" || now >= laserUntil) return;
      if (now - lastLaserAt < LASER_COOLDOWN_MS) return;

      lastLaserAt = now;
      laserShots.push({
        x: paddleX + paddleWidth / 2,
        y: PADDLE_Y - 1,
      });
      beep(1040, 0.018);
    }

    function activateBreak() {
      if (phase !== "playing" || breakCharges <= 0) return;
      breakCharges -= 1;
      remainingBricks = 0;
      bricks = bricks.map((row) => row.map(() => false));
      pickups = [];
      laserShots = [];
      beep(260, 0.06);
      window.setTimeout(() => beep(1040, 0.1), 55);
      finishCurrentStage();
    }

    function enterSelectRoom() {
      phase =
        "select";

      createSelectorBlocks();

      // Stage selection is a selector, not gameplay.
      // No ball is active here, so the player can never lose a life.
      balls = [];
      selectorShots = [];
      paddleX =
        Math.floor(
          (W -
            paddleWidth) /
            2
        );

      publishStatus(
        "Select"
      );

      beep(
        420,
        0.04
      );
    }

    function finishCurrentStage() {
      completedLevels +=
        1;

      beep(
        740,
        0.05
      );

      window.setTimeout(
        () =>
          beep(
            980,
            0.08
          ),
        55
      );

      if (
        remainingAssets.length ===
        0
      ) {
        if (
          timerStartedAt !==
          null
        ) {
          finalElapsedMs =
            performance.now() -
            timerStartedAt;
        }

        timerStartedAt =
          null;

        const scorePing =
          runAssets.find(
            (asset) =>
              asset.kind ===
              "ping"
          );

        const scoreFrame =
          runAssets.find(
            (asset) =>
              asset.kind ===
              "hoodframe"
          );

        const scoreArt =
          runAssets.find(
            (asset) =>
              asset.kind ===
              "studio"
          );

        const fullHood =
          !!scorePing &&
          !!scoreFrame &&
          !!scoreArt;

        setCompletedRun({
          hoodieId:
            hoodie.tokenId,
          pingId:
            scorePing?.tokenId ??
            "0",
          frameId:
            scoreFrame?.tokenId ??
            "0",
          artId:
            scoreArt?.tokenId ??
            "0",
          elapsedMs:
            Math.max(
              1,
              Math.round(
                finalElapsedMs
              )
            ),
          bricks:
            Math.max(
              1,
              totalDestroyedBricks
            ),
          fullHood,
          submitted:
            false,
        });

        phase =
          "run-clear";

        publishStatus(
          fullHood
            ? "Full Hood"
            : "Run clear"
        );

        return;
      }

      enterSelectRoom();
    }

    function hasActivePowerUp(
      now = performance.now()
    ) {
      return (
        now < speedUntil ||
        now < laserUntil ||
        balls.length > 1
      );
    }

    function destroyBrick(
      gridX: number,
      gridY: number
    ) {
      if (
        !bricks[
          gridY
        ]?.[
          gridX
        ]
      ) {
        return;
      }

      bricks[
        gridY
      ][
        gridX
      ] =
        false;

      remainingBricks -=
        1;

      totalDestroyedBricks +=
        1;

      publishStatus();

      destroyedSinceDrop += 1;

      if (
        destroyedSinceDrop >= DROP_EVERY_N_BRICKS &&
        remainingBricks > 0
      ) {
        /*
         * One power-up at a time.
         *
         * If SPEED / LASER / MULTI is currently active, or a pickup pixel
         * is already falling, this drop opportunity is deliberately skipped.
         * The deck is not consumed, so the next eligible check still has the
         * same deterministic power-up order. There is no queued falling pixel.
         */
        destroyedSinceDrop = 0;

        if (
          pickups.length === 0 &&
          !hasActivePowerUp()
        ) {
          const nextDrop =
            dropDeck[0] ?? null;

          dropDeck.shift();

          if (dropDeck.length === 0) {
            dropDeck = shuffle([
              "speed",
              null,
              null,
              "multi",
              null,
              "laser",
              null,
              null,
              null,
              "life",
              null,
              null,
            ]);
          }

          const eligibleDrop =
            nextDrop === "life"
              ? (
                  lives < startingLives &&
                  !lifeRecoveredThisRun
                )
                ? nextDrop
                : null
              : nextDrop;

          if (eligibleDrop) {
            const geometry =
              spriteGeometry(currentAsset);

            pickups.push({
              kind: eligibleDrop,
              x:
                geometry.x +
                gridX * geometry.scale,
              y:
                geometry.y +
                gridY * geometry.scale,
              size: geometry.scale,
            });
          }
        }
      }

      if (
        remainingBricks <=
        0
      ) {
        finishCurrentStage();
      }
    }

    function loseLife() {
      lives -=
        1;

      beep(
        80,
        0.12,
        "square",
        0.05
      );

      if (
        lives <=
        0
      ) {
        lives =
          0;

        if (
          timerStartedAt !==
          null
        ) {
          finalElapsedMs =
            performance.now() -
            timerStartedAt;
        }

        timerStartedAt =
          null;

        phase =
          "game-over";

        publishStatus(
          "Game over"
        );

        return;
      }

      phase =
        "between-lives";

      resetBallToPaddle();

      publishStatus(
        `Miss ${lives}`
      );
    }

    function movePaddle(
      deltaTime:
        number
    ) {
      const temporaryPaddleBoost =
        performance.now() < speedUntil
          ? SPEED_PADDLE_MULTIPLIER
          : 1;

      const speed =
        62 * temporaryPaddleBoost;

      if (
        keys.left
      ) {
        paddleX -=
          speed *
          deltaTime;
      }

      if (
        keys.right
      ) {
        paddleX +=
          speed *
          deltaTime;
      }

      paddleX =
        Math.max(
          0,
          Math.min(
            W -
              paddleWidth,
            paddleX
          )
        );

      if (
        phase ===
          "start" ||
        phase ===
          "between-lives" ||
        phase ===
          "select-ready"
      ) {
        if (
          balls[0]
        ) {
          balls[0].x =
            paddleX +
            Math.floor(
              paddleWidth /
                2
            );

          balls[0].y =
            PADDLE_Y -
            2;
        }
      }
    }

    function stageBrickAtScreen(
      x: number,
      y: number
    ) {
      const geometry =
        spriteGeometry(
          currentAsset
        );

      const localX =
        x -
        geometry.x;

      const localY =
        y -
        geometry.y;

      if (
        localX <
          0 ||
        localY <
          0
      ) {
        return null;
      }

      const gridX =
        Math.floor(
          localX /
            geometry.scale
        );

      const gridY =
        Math.floor(
          localY /
            geometry.scale
        );

      if (
        gridX <
          0 ||
        gridY <
          0 ||
        gridX >=
          currentAsset
            .sprite
            .width ||
        gridY >=
          currentAsset
            .sprite
            .height ||
        !bricks[
          gridY
        ]?.[
          gridX
        ]
      ) {
        return null;
      }

      return {
        gridX,
        gridY,
        geometry,
      };
    }

    function selectorAtScreen(
      x: number,
      y: number
    ) {
      return (
        selectorBlocks.find(
          (block) =>
            x >=
              block.x &&
            x <
              block.x +
                3 &&
            y >=
              block.y &&
            y <
              block.y +
                3
        ) ??
        null
      );
    }

    function chooseSelector(
      block:
        SelectorBlock
    ) {
      const selected =
        block.asset;

      remainingAssets =
        remainingAssets.filter(
          (asset) =>
            !(
              asset.kind ===
                selected.kind &&
              asset.tokenId ===
                selected.tokenId
            )
        );

      currentAsset =
        selected;

      selectorBlocks =
        [];

      loadCurrentStageBricks();
      resetBallToPaddle();

      phase =
        "stage-intro";

      introUntil =
        performance.now() +
        900;

      publishStatus(
        assetLabel(
          selected.kind
        )
      );

      beep(
        620,
        0.04
      );

      window.setTimeout(
        () =>
          beep(
            820,
            0.05
          ),
        45
      );
    }

    function fireSelectorLaser() {
      if (
        phase !==
        "select"
      ) {
        return;
      }

      // Keep selection deliberate and visually clean: one selector beam at a time.
      if (
        selectorShots.length >
        0
      ) {
        return;
      }

      selectorShots.push({
        x:
          paddleX +
          paddleWidth / 2,
        y:
          PADDLE_Y - 1,
      });

      beep(
        920,
        0.018
      );
    }

    function updateSelectorShots(
      deltaTime:
        number
    ) {
      if (
        phase !==
        "select"
      ) {
        return;
      }

      const survivors:
        LaserShot[] = [];

      for (
        const shot of
        selectorShots
      ) {
        shot.y -=
          LASER_SPEED *
          deltaTime;

        const target =
          selectorAtScreen(
            Math.floor(
              shot.x
            ),
            Math.floor(
              shot.y
            )
          );

        if (target) {
          chooseSelector(
            target
          );
          return;
        }

        if (
          shot.y >= 8
        ) {
          survivors.push(
            shot
          );
        }
      }

      selectorShots =
        survivors;
    }

    function drawSelectorShots() {
      gameContext.fillStyle =
        GREEN;

      for (
        const shot of
        selectorShots
      ) {
        gameContext.fillRect(
          Math.round(
            shot.x
          ),
          Math.round(
            shot.y
          ),
          1,
          3
        );
      }
    }

    function stepStageBall(
      ball:
        Ball,
      deltaTime:
        number
    ) {
      const speed =
        Math.hypot(
          ball.vx,
          ball.vy
        );

      const temporaryBallBoost =
        performance.now() < speedUntil
          ? SPEED_BALL_MULTIPLIER
          : 1;

      const distance =
        speed *
        temporaryBallBoost *
        60 *
        deltaTime;

      const steps =
        Math.max(
          1,
          Math.ceil(
            distance /
              0.35
          )
        );

      const stepTime =
        deltaTime /
        steps;

      for (
        let step =
          0;
        step <
        steps;
        step +=
          1
      ) {
        if (
          phase !==
          "playing"
        ) {
          return true;
        }

        const previousX =
          ball.x;

        const previousY =
          ball.y;

        let nextX =
          ball.x +
          ball.vx *
            temporaryBallBoost *
            60 *
            stepTime;

        let nextY =
          ball.y +
          ball.vy *
            temporaryBallBoost *
            60 *
            stepTime;

        if (
          nextX <
          0
        ) {
          nextX =
            -nextX;

          ball.vx =
            Math.abs(
              ball.vx
            );

          beep(
            180,
            0.018
          );
        } else if (
          nextX >=
          W
        ) {
          nextX =
            W -
            1 -
            (nextX -
              (W -
                1));

          ball.vx =
            -Math.abs(
              ball.vx
            );

          beep(
            180,
            0.018
          );
        }

        if (
          nextY <
          0
        ) {
          nextY =
            -nextY;

          ball.vy =
            Math.abs(
              ball.vy
            );

          beep(
            210,
            0.018
          );
        }

        const movingDown =
          ball.vy >
          0;

        if (
          movingDown &&
          previousY <
            PADDLE_Y &&
          nextY >=
            PADDLE_Y &&
          nextX >=
            paddleX &&
          nextX <
            paddleX +
              paddleWidth
        ) {
          const hitPosition =
            (nextX -
              paddleX) /
            paddleWidth;

          const centered =
            (hitPosition -
              0.5) *
            2;

          ball.vx =
            centered *
            0.95 *
            speedMultiplier;

          ball.vy =
            -Math.max(
              0.48,
              1.0 -
                Math.abs(
                  centered
                ) *
                  0.18
            ) *
            speedMultiplier;

          nextY =
            PADDLE_Y -
            1;

          beep(
            120,
            0.025
          );
        }

        const hitBrick =
          stageBrickAtScreen(
            Math.floor(
              nextX
            ),
            Math.floor(
              nextY
            )
          );

        if (
          hitBrick
        ) {
          destroyBrick(
            hitBrick.gridX,
            hitBrick.gridY
          );

          beep(
            520,
            0.018
          );

          if (
            phase !==
            "playing"
          ) {
            return true;
          }

          const brickLeft =
            hitBrick
              .geometry
              .x +
            hitBrick
              .gridX *
              hitBrick
                .geometry
                .scale;

          const brickTop =
            hitBrick
              .geometry
              .y +
            hitBrick
              .gridY *
              hitBrick
                .geometry
                .scale;

          const brickRight =
            brickLeft +
            hitBrick
              .geometry
              .scale;

          const brickBottom =
            brickTop +
            hitBrick
              .geometry
              .scale;

          const cameFromLeft =
            previousX <
            brickLeft;

          const cameFromRight =
            previousX >=
            brickRight;

          const cameFromTop =
            previousY <
            brickTop;

          const cameFromBottom =
            previousY >=
            brickBottom;

          if (
            (cameFromLeft ||
              cameFromRight) &&
            !(
              cameFromTop ||
              cameFromBottom
            )
          ) {
            ball.vx *=
              -1;
          } else if (
            (cameFromTop ||
              cameFromBottom) &&
            !(
              cameFromLeft ||
              cameFromRight
            )
          ) {
            ball.vy *=
              -1;
          } else {
            const deltaX =
              Math.abs(
                nextX -
                  previousX
              );

            const deltaY =
              Math.abs(
                nextY -
                  previousY
              );

            if (
              deltaX >
              deltaY
            ) {
              ball.vx *=
                -1;
            } else {
              ball.vy *=
                -1;
            }
          }

          nextX =
            previousX;

          nextY =
            previousY;
        }

        ball.x =
          nextX;

        ball.y =
          nextY;

        if (
          ball.y >=
          H
        ) {
          return false;
        }
      }

      return true;
    }

    function updatePickups(deltaTime: number) {
      if (phase !== "playing") return;

      const survivors: Pickup[] = [];
      for (const pickup of pickups) {
        pickup.y += PICKUP_FALL_SPEED * deltaTime;

        const caught =
          pickup.y + pickup.size >= PADDLE_Y &&
          pickup.y <= PADDLE_Y + PADDLE_H + 1 &&
          pickup.x + pickup.size >= paddleX &&
          pickup.x <= paddleX + paddleWidth;

        if (caught) {
          activatePickup(pickup.kind);
          continue;
        }

        if (pickup.y < H) survivors.push(pickup);
      }
      pickups = survivors;
    }

    function updateLaserShots(deltaTime: number) {
      if (phase !== "playing") return;

      const survivors: LaserShot[] = [];
      for (const shot of laserShots) {
        shot.y -= LASER_SPEED * deltaTime;
        const hit = stageBrickAtScreen(Math.floor(shot.x), Math.floor(shot.y));

        if (hit) {
          destroyBrick(hit.gridX, hit.gridY);
          beep(1120, 0.012);
          continue;
        }

        if (shot.y >= 8) survivors.push(shot);
      }
      laserShots = survivors;
    }

    function stepBalls(
      deltaTime:
        number
    ) {
      if (
        phase !==
        "playing"
      ) {
        return;
      }

      const survivors:
        Ball[] = [];

      for (
        const ball of
        balls
      ) {
        const survived =
          stepStageBall(
            ball,
            deltaTime
          );

        if (
          survived &&
          phase ===
            "playing"
        ) {
          survivors.push(
            ball
          );
        }
      }

      if (
        phase !==
        "playing"
      ) {
        return;
      }

      balls =
        survivors;

      if (
        balls.length ===
        0
      ) {
        loseLife();
      }
    }

    function drawPaddle() {
      gameContext.fillStyle =
        GREEN;

      gameContext.fillRect(
        Math.round(
          paddleX
        ),
        PADDLE_Y,
        paddleWidth,
        PADDLE_H
      );
    }

    function drawBalls() {
      gameContext.fillStyle =
        GREEN;

      for (
        const ball of
        balls
      ) {
        gameContext.fillRect(
          Math.round(
            ball.x
          ),
          Math.round(
            ball.y
          ),
          1,
          1
        );
      }
    }

    function drawStageBricks() {
      const geometry =
        spriteGeometry(
          currentAsset
        );

      gameContext.fillStyle =
        GREEN;

      for (
        let y =
          0;
        y <
        currentAsset
          .sprite
          .height;
        y +=
          1
      ) {
        for (
          let x =
            0;
          x <
          currentAsset
            .sprite
            .width;
          x +=
            1
        ) {
          if (
            !bricks[
              y
            ]?.[
              x
            ]
          ) {
            continue;
          }

          gameContext.fillRect(
            geometry.x +
              x *
                geometry.scale,
            geometry.y +
              y *
                geometry.scale,
            geometry.scale,
            geometry.scale
          );
        }
      }
    }

    function drawSelectorBlocks() {
      gameContext.fillStyle =
        GREEN;

      for (
        const block of
        selectorBlocks
      ) {
        gameContext.fillRect(
          block.x,
          block.y,
          3,
          3
        );
      }
    }

    function drawPickups() {
      gameContext.fillStyle = GREEN;

      for (const pickup of pickups) {
        gameContext.fillRect(
          Math.round(pickup.x),
          Math.round(pickup.y),
          pickup.size,
          pickup.size
        );
      }
    }

    function drawPickupReveal(now: number) {
      if (
        pickupRevealText &&
        now < pickupRevealUntil
      ) {
        drawBitmapText(
          pickupRevealText,
          W / 2,
          103,
          1,
          "center"
        );
      }
    }

    function drawLaserShots() {
      gameContext.fillStyle = GREEN;
      for (const shot of laserShots) {
        gameContext.fillRect(Math.round(shot.x), Math.round(shot.y), 1, 2);
      }
    }

    function drawHud(
      now:
        number
    ) {
      const elapsed =
        currentElapsedMs(
          now
        );

      const levelText =
        `${currentLevelNumber()}/${totalLevels}`;

      const bricksText =
        phase ===
        "select"
          ? `B${selectorBlocks.length}`
          : `B${remainingBricks}`;

      drawBitmapText(
        levelText,
        1,
        1,
        1,
        "left"
      );

      drawBitmapText(
        bricksText,
        24,
        1,
        1,
        "left"
      );

      drawBitmapText(
        formatHudTime(
          elapsed
        ),
        82,
        1,
        1,
        "center"
      );

      drawBitmapText(
        `L${lives}`,
        W - 1,
        1,
        1,
        "right"
      );

      const nowMs = performance.now();
      const active: string[] = [];
      if (nowMs < speedUntil) active.push("SPD");
      if (nowMs < laserUntil) active.push("LAS");
      if (breakCharges > 0) active.push("BRK1");

      if (active.length > 0) {
        drawBitmapText(active.join(" "), 1, 9, 1, "left");
      }
    }

    function drawStartScreen() {
      drawBitmapText(
        "HOOD",
        W / 2,
        15,
        2,
        "center"
      );

      drawBitmapText(
        "BREAK",
        W / 2,
        31,
        2,
        "center"
      );

      drawBitmapText(
        `#${hoodie.tokenId}`,
        W / 2,
        57,
        1,
        "center"
      );

      drawBitmapText(
        String(
          archetype
        ),
        W / 2,
        69,
        1,
        "center"
      );

      drawBitmapText(
        archetypePower(
          hoodie.archetype
        ),
        W / 2,
        80,
        1,
        "center"
      );

      drawBitmapText(
        `${totalLevels} STAGES`,
        W / 2,
        93,
        1,
        "center"
      );

      drawBitmapText(
        "SPACE",
        W / 2,
        108,
        1,
        "center"
      );
    }

    function drawSelectScreen(
      now:
        number
    ) {
      drawHud(
        now
      );

      drawSelectorBlocks();
      drawSelectorShots();
      drawPaddle();

      // A tiny instruction only; this room is a selector, not another life-based stage.
      drawBitmapText(
        "FIRE",
        W / 2,
        108,
        1,
        "center"
      );
    }

    function drawStageIntro() {
      drawBitmapText(
        `${currentLevelNumber()}/${totalLevels}`,
        W / 2,
        25,
        1,
        "center"
      );

      drawBitmapText(
        assetLabel(
          currentAsset.kind
        ),
        W / 2,
        42,
        2,
        "center"
      );

      drawBitmapText(
        `#${currentAsset.tokenId}`,
        W / 2,
        68,
        1,
        "center"
      );
    }

    function drawRunClear() {
      drawBitmapText(
        "RUN",
        W / 2,
        16,
        2,
        "center"
      );

      drawBitmapText(
        "CLEAR",
        W / 2,
        32,
        2,
        "center"
      );

      drawBitmapText(
        `${totalLevels}/${totalLevels}`,
        W / 2,
        60,
        1,
        "center"
      );

      drawBitmapText(
        "TIME",
        W / 2,
        74,
        1,
        "center"
      );

      drawBitmapText(
        formatFinalTime(
          finalElapsedMs
        ),
        W / 2,
        84,
        1,
        "center"
      );

      drawBitmapText(
        `LIVES ${lives}`,
        W / 2,
        99,
        1,
        "center"
      );
    }

    function drawGameOver() {
      drawBitmapText(
        "GAME",
        W / 2,
        20,
        2,
        "center"
      );

      drawBitmapText(
        "OVER",
        W / 2,
        36,
        2,
        "center"
      );

      drawBitmapText(
        `${completedLevels}/${totalLevels}`,
        W / 2,
        63,
        1,
        "center"
      );

      drawBitmapText(
        "TIME",
        W / 2,
        76,
        1,
        "center"
      );

      drawBitmapText(
        formatFinalTime(
          finalElapsedMs
        ),
        W / 2,
        86,
        1,
        "center"
      );
    }

    function drawBetweenLives(
      now:
        number
    ) {
      drawStageBricks();
      drawPickups();
      drawLaserShots();
      drawPaddle();
      drawBalls();
      drawHud(
        now
      );
      drawPickupReveal(
        now
      );

      drawBitmapText(
        "READY",
        W / 2,
        103,
        1,
        "center"
      );
    }

    function drawPlaying(
      now:
        number
    ) {
      drawStageBricks();
      drawPickups();
      drawLaserShots();
      drawPaddle();
      drawBalls();
      drawHud(
        now
      );
      drawPickupReveal(
        now
      );
    }

    function draw(
      now =
        performance.now()
    ) {
      gameContext.fillStyle =
        BLACK;

      gameContext.fillRect(
        0,
        0,
        W,
        H
      );

      if (
        phase ===
        "start"
      ) {
        drawStartScreen();
        return;
      }

      if (
        phase ===
          "select" ||
        phase ===
          "select-ready"
      ) {
        drawSelectScreen(
          now
        );
        return;
      }

      if (
        phase ===
        "stage-intro"
      ) {
        drawStageIntro();
        return;
      }

      if (
        phase ===
        "run-clear"
      ) {
        drawRunClear();
        return;
      }

      if (
        phase ===
        "game-over"
      ) {
        drawGameOver();
        return;
      }

      if (
        phase ===
        "between-lives"
      ) {
        drawBetweenLives(
          now
        );
        return;
      }

      drawPlaying(
        now
      );
    }

    function update(
      deltaTime:
        number,
      now:
        number
    ) {
      if (
        phase ===
          "stage-intro" &&
        now >=
          introUntil
      ) {
        phase =
          "playing";

        publishStatus(
          "Playing"
        );
      }

      movePaddle(
        deltaTime
      );

      updatePickups(deltaTime);
      updateLaserShots(deltaTime);
      updateSelectorShots(deltaTime);

      stepBalls(
        deltaTime
      );
    }

    function frame(
      now:
        number
    ) {
      const rawDeltaTime =
        (now -
          lastTime) /
        1000;

      const deltaTime =
        Math.min(
          rawDeltaTime,
          1 / 30
        );

      lastTime =
        now;

      update(
        deltaTime,
        now
      );

      draw(
        now
      );

      animationFrameId =
        requestAnimationFrame(
          frame
        );
    }

    function setKey(
      key: string,
      value:
        boolean
    ) {
      const lowerKey =
        key.toLowerCase();

      if (
        key ===
          "ArrowLeft" ||
        lowerKey ===
          "a"
      ) {
        keys.left =
          value;
      }

      if (
        key ===
          "ArrowRight" ||
        lowerKey ===
          "d"
      ) {
        keys.right =
          value;
      }
    }

    function handleKeyDown(
      event:
        KeyboardEvent
    ) {
      if (
        [
          "ArrowLeft",
          "ArrowRight",
          " ",
        ].includes(
          event.key
        )
      ) {
        event.preventDefault();
      }

      setKey(
        event.key,
        true
      );

      if (
        event.code === "Space" &&
        !event.repeat
      ) {
        if (
          phase ===
          "select"
        ) {
          fireSelectorLaser();
        } else if (
          phase ===
            "playing" &&
          performance.now() <
            laserUntil
        ) {
          fireLaser();
        } else {
          startRunOrContinue();
        }
      }

      if (
        event.key.toLowerCase() === "b" &&
        !event.repeat
      ) {
        activateBreak();
      }

      if (
        event.key.toLowerCase() ===
          "r" &&
        !event.repeat
      ) {
        resetRun();
      }
    }

    function handleKeyUp(
      event:
        KeyboardEvent
    ) {
      setKey(
        event.key,
        false
      );
    }

    function movePaddleToPointer(
      event:
        PointerEvent
    ) {
      const rect =
        gameCanvas.getBoundingClientRect();

      const x =
        ((event.clientX -
          rect.left) /
          rect.width) *
        W;

      paddleX =
        x -
        paddleWidth /
          2;

      paddleX =
        Math.max(
          0,
          Math.min(
            W -
              paddleWidth,
            paddleX
          )
        );

      if (
        phase ===
          "start" ||
        phase ===
          "between-lives" ||
        phase ===
          "select-ready"
      ) {
        if (
          balls[0]
        ) {
          balls[0].x =
            paddleX +
            Math.floor(
              paddleWidth /
                2
            );

          balls[0].y =
            PADDLE_Y -
            2;
        }
      }
    }

    function handleCanvasPointerDown(
      event:
        PointerEvent
    ) {
      event.preventDefault();

      ensureAudio();

      if (
        phase ===
          "start" ||
        phase ===
          "between-lives" ||
        phase ===
          "select-ready" ||
        phase ===
          "run-clear" ||
        phase ===
          "game-over"
      ) {
        startRunOrContinue();
        return;
      }

      if (
        phase ===
        "stage-intro"
      ) {
        return;
      }

      draggingCanvas =
        true;

      gameCanvas.setPointerCapture(
        event.pointerId
      );

      movePaddleToPointer(
        event
      );
    }

    function handleCanvasPointerMove(
      event:
        PointerEvent
    ) {
      if (
        !draggingCanvas
      ) {
        return;
      }

      event.preventDefault();

      movePaddleToPointer(
        event
      );
    }

    function handleCanvasPointerUp(
      event:
        PointerEvent
    ) {
      draggingCanvas =
        false;

      if (
        gameCanvas.hasPointerCapture(
          event.pointerId
        )
      ) {
        gameCanvas.releasePointerCapture(
          event.pointerId
        );
      }
    }

    function bindHold(
      button:
        HTMLButtonElement,
      side:
        | "left"
        | "right"
    ) {
      const down =
        (
          event:
            PointerEvent
        ) => {
          event.preventDefault();

          ensureAudio();

          keys[side] =
            true;

          button.setPointerCapture(
            event.pointerId
          );
        };

      const up =
        (
          event:
            PointerEvent
        ) => {
          event.preventDefault();

          keys[side] =
            false;

          if (
            button.hasPointerCapture(
              event.pointerId
            )
          ) {
            button.releasePointerCapture(
              event.pointerId
            );
          }
        };

      button.addEventListener(
        "pointerdown",
        down
      );

      button.addEventListener(
        "pointerup",
        up
      );

      button.addEventListener(
        "pointercancel",
        up
      );

      return () => {
        button.removeEventListener(
          "pointerdown",
          down
        );

        button.removeEventListener(
          "pointerup",
          up
        );

        button.removeEventListener(
          "pointercancel",
          up
        );
      };
    }

    const unbindLeft =
      bindHold(
        leftControl,
        "left"
      );

    const unbindRight =
      bindHold(
        rightControl,
        "right"
      );

    function handleLaunchPointerDown(
      event:
        PointerEvent
    ) {
      event.preventDefault();

      if (
        phase ===
        "select"
      ) {
        fireSelectorLaser();
      } else if (
        phase ===
          "playing" &&
        performance.now() <
          laserUntil
      ) {
        fireLaser();
      } else {
        startRunOrContinue();
      }
    }

    function handleBreakPointerDown(event: PointerEvent) {
      event.preventDefault();
      ensureAudio();
      activateBreak();
    }

    window.addEventListener(
      "keydown",
      handleKeyDown,
      {
        passive:
          false,
      }
    );

    window.addEventListener(
      "keyup",
      handleKeyUp
    );

    gameCanvas.addEventListener(
      "pointerdown",
      handleCanvasPointerDown,
      {
        passive:
          false,
      }
    );

    gameCanvas.addEventListener(
      "pointermove",
      handleCanvasPointerMove,
      {
        passive:
          false,
      }
    );

    gameCanvas.addEventListener(
      "pointerup",
      handleCanvasPointerUp
    );

    gameCanvas.addEventListener(
      "pointercancel",
      handleCanvasPointerUp
    );

    launchControl.addEventListener(
      "pointerdown",
      handleLaunchPointerDown
    );

    breakButton.addEventListener(
      "pointerdown",
      handleBreakPointerDown
    );

    resetRun();

    animationFrameId =
      requestAnimationFrame(
        frame
      );

    return () => {
      cancelAnimationFrame(
        animationFrameId
      );

      window.removeEventListener(
        "keydown",
        handleKeyDown
      );

      window.removeEventListener(
        "keyup",
        handleKeyUp
      );

      gameCanvas.removeEventListener(
        "pointerdown",
        handleCanvasPointerDown
      );

      gameCanvas.removeEventListener(
        "pointermove",
        handleCanvasPointerMove
      );

      gameCanvas.removeEventListener(
        "pointerup",
        handleCanvasPointerUp
      );

      gameCanvas.removeEventListener(
        "pointercancel",
        handleCanvasPointerUp
      );

      launchControl.removeEventListener(
        "pointerdown",
        handleLaunchPointerDown
      );

      breakButton.removeEventListener(
        "pointerdown",
        handleBreakPointerDown
      );

      unbindLeft();
      unbindRight();

      if (
        audioContext
      ) {
        void audioContext.close();
      }
    };
  }, [
    assets,
    runRevision,
    ochBalance,
    setupMode,
  ]);

  function reconnectSetup() {
    if (address) {
      void loadWalletHoodies();
      return;
    }

    void connect();
  }

  return (
    <main className="min-h-screen bg-[#ccff00] text-black">
      <SiteHeader />

      <section className="mx-auto max-w-[1200px] px-4 pb-16 pt-20 md:px-6 md:pt-24">
        <div className="flex items-end justify-between gap-5 border-b-2 border-black pb-3">
          <div>
            <p className="mb-2 text-[9px] uppercase tracking-[0.18em]">
              Arcade 01 / Stage Select Test
            </p>

            <h1 className="text-[clamp(3rem,9vw,6rem)] leading-[0.78] tracking-[-0.07em]">
              HOOD
              <br />
              BREAK
            </h1>
          </div>

          <div className="pb-1 text-right text-[9px] uppercase leading-relaxed tracking-[0.17em] sm:text-[10px]">
            120×120
            <br />
            {setupMode === "game"
              ? `${status.level}/${status.totalLevels} stages`
              : "setup"}
          </div>
        </div>

        <div className="mx-auto mt-5 w-full max-w-[600px]">
          <div className="border-2 border-black">
            <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-3">
              <div>
                <p className="text-[8px] uppercase tracking-[0.14em]">
                  {address
                    ? "Wallet connected"
                    : "Public demo"}
                </p>

                <p className="mt-1 text-[7px] uppercase opacity-60">
                  {address
                    ? setupMode === "game"
                      ? `Hoodie #${hoodieAsset.tokenId} / ${Math.max(0, assets.length - 1)} selected levels`
                      : "Choose your Hoodie and levels inside the 120×120 screen."
                    : "No wallet required. Demo assets are loaded automatically."}
                </p>
              </div>

              <button
                type="button"
                disabled={loading}
                onClick={reconnectSetup}
                className="border-2 border-black px-4 py-2 text-[8px] uppercase tracking-[0.12em] disabled:opacity-40"
              >
                {address
                  ? "Select Hoodie / levels"
                  : "Connect wallet"}
              </button>
            </div>
          </div>

          {address &&
            setupMode ===
              "asset-select" && (
              <div className="mt-2 border-2 border-black px-3 py-2 text-[9px] uppercase tracking-[0.12em]">
                {selectedFullHoodReady
                  ? "FULL HOOD READY ✓ / PING + FRAME + ART"
                  : "FULL HOOD NEEDS / PING + FRAME + ART"}
              </div>
            )}

          {loadError && (
            <div className="mt-2 border-2 border-black bg-black px-3 py-2 text-[10px] leading-relaxed text-[#ccff00]">
              {loadError}
            </div>
          )}

          <div className="mb-2 mt-3 flex items-center justify-between gap-4 text-[8px] uppercase tracking-[0.13em] sm:text-[9px]">
            <span>
              Hoodie #{hoodieAsset.tokenId}
            </span>

            <span className="text-right">
              {normalizeArchetype(
                hoodieAsset.archetype
              )} /{" "}
              {archetypePower(
                hoodieAsset.archetype
              )}
            </span>
          </div>

          <div className="aspect-square w-full overflow-hidden bg-black">
            <canvas
              ref={canvasRef}
              width={W}
              height={H}
              aria-label="Hood Break"
              className="block h-full w-full select-none touch-none bg-black [image-rendering:pixelated]"
            />
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <button
              ref={leftButtonRef}
              type="button"
              className="min-h-12 touch-none border-2 border-black bg-[#ccff00] px-3 py-3 text-[10px] uppercase tracking-[0.14em] active:bg-black active:text-[#ccff00]"
            >
              ← Left
            </button>

            <button
              ref={rightButtonRef}
              type="button"
              className="min-h-12 touch-none border-2 border-black bg-[#ccff00] px-3 py-3 text-[10px] uppercase tracking-[0.14em] active:bg-black active:text-[#ccff00]"
            >
              Right →
            </button>

            <button
              ref={launchButtonRef}
              type="button"
              className="col-span-2 min-h-12 touch-manipulation border-2 border-black bg-[#ccff00] px-3 py-3 text-[10px] uppercase tracking-[0.14em] active:bg-black active:text-[#ccff00] sm:col-span-1"
            >
              {status.phase === "select"
                ? "Fire"
                : "Launch"}
            </button>

            <button
              ref={breakButtonRef}
              type="button"
              disabled={
                !breakUnlocked ||
                !status.breakAvailable ||
                setupMode !== "game"
              }
              className="col-span-2 min-h-12 touch-manipulation border-2 border-black bg-[#ccff00] px-3 py-3 text-[10px] uppercase tracking-[0.14em] active:bg-black active:text-[#ccff00] disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-3"
            >
              {!breakUnlocked
                ? "Break locked / needs 5K OCH"
                : status.breakAvailable
                  ? "Break / B (5K OCH, once per run)"
                  : "Break used"}
            </button>
          </div>

          <div className="mt-3 grid grid-cols-4 gap-2 border-t-2 border-black pt-2 text-[8px] uppercase tracking-[0.12em] sm:text-[9px]">
            <span>
              {status.label}
            </span>

            <span className="text-center">
              {status.level}/{status.totalLevels}
            </span>

            <span className="text-center">
              {status.bricks} bricks
            </span>

            <span className="text-right">
              L{status.lives}
            </span>
          </div>

          {completedRun && (
            <div className="mt-4 border-2 border-black">
              <div className="border-b-2 border-black px-3 py-2 text-[9px] uppercase tracking-[0.14em]">
                {completedRun.fullHood
                  ? "FULL HOOD COMPLETE"
                  : "RUN COMPLETE / NOT FULL HOOD"}
              </div>

              <div className="grid grid-cols-2 gap-px bg-black text-[8px] uppercase tracking-[0.1em]">
                <div className="bg-[#ccff00] p-3">
                  Hoodie #{completedRun.hoodieId}
                </div>
                <div className="bg-[#ccff00] p-3 text-right">
                  {formatRunTime(
                    completedRun.elapsedMs
                  )}
                </div>
                <div className="bg-[#ccff00] p-3">
                  {completedRun.bricks} bricks
                </div>
                <div className="bg-[#ccff00] p-3 text-right">
                  P{completedRun.pingId} / F{completedRun.frameId} / A{completedRun.artId}
                </div>
              </div>

              {completedRun.fullHood && (
                <button
                  type="button"
                  disabled={
                    scoreSubmitting ||
                    completedRun.submitted ||
                    !address
                  }
                  onClick={() => {
                    void submitCompletedScore();
                  }}
                  className="w-full border-t-2 border-black px-3 py-3 text-[9px] uppercase tracking-[0.14em] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {completedRun.submitted
                    ? "SCORE RECORDED ✓ / HOOD IT"
                    : scoreSubmitting
                      ? "SUBMITTING..."
                      : "SUBMIT SCORE"}
                </button>
              )}
            </div>
          )}

          {(onchainMessage ||
            scoreTxHash ||
            tournamentTxHash) && (
            <div className="mt-2 border-2 border-black px-3 py-3 text-[9px] uppercase leading-relaxed tracking-[0.1em]">
              {onchainMessage && (
                <div>
                  {onchainMessage}
                </div>
              )}

              {scoreTxHash && (
                <a
                  href={`${TX_EXPLORER_BASE}${scoreTxHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 block break-all underline underline-offset-4"
                >
                  Score tx / {scoreTxHash}
                </a>
              )}

              {tournamentTxHash && (
                <a
                  href={`${TX_EXPLORER_BASE}${tournamentTxHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 block break-all underline underline-offset-4"
                >
                  Tournament tx / {tournamentTxHash}
                </a>
              )}
            </div>
          )}

          <div className="mt-4 border-2 border-black">
            <div className="flex items-center justify-between border-b-2 border-black px-3 py-2 text-[9px] uppercase tracking-[0.14em]">
              <span>
                48H Tournament
              </span>
              <button
                type="button"
                onClick={() => {
                  void refreshTournament();
                }}
                className="underline underline-offset-4"
              >
                Refresh
              </button>
            </div>

            <div className="px-3 py-3 text-[8px] uppercase leading-relaxed tracking-[0.1em]">
              {tournament?.active ? (
                <>
                  <div>
                    Tournament #{tournament.activeId} / LIVE
                  </div>
                  <div>
                    Ends {new Date(
                      tournament.endsAt *
                        1000
                    ).toLocaleString()}
                  </div>
                  <div>
                    Leader {tournament.hasLeader
                      ? `Hoodie #${tournament.leaderHoodieId} / ${formatRunTime(tournament.bestElapsedMs)} / ${tournament.bestBricks} bricks`
                      : "No score yet"}
                  </div>
                </>
              ) : (
                <div>
                  No active tournament.
                </div>
              )}
            </div>

            {connectedIsContractOwner &&
              !tournament?.active && (
                <div className="flex gap-2 border-t-2 border-black p-2">
                  <input
                    value={
                      tournamentPrize
                    }
                    onChange={(
                      event
                    ) =>
                      setTournamentPrize(
                        event.target.value
                      )
                    }
                    inputMode="decimal"
                    aria-label="Tournament prize in OCH"
                    className="min-w-0 flex-1 border-2 border-black bg-[#ccff00] px-3 py-2 text-[9px] outline-none"
                  />

                  <button
                    type="button"
                    disabled={
                      tournamentBusy
                    }
                    onClick={() => {
                      void startTournament();
                    }}
                    className="border-2 border-black px-3 py-2 text-[9px] uppercase tracking-[0.12em] disabled:opacity-50"
                  >
                    {tournamentBusy
                      ? "Starting..."
                      : "Start / OCH"}
                  </button>
                </div>
              )}

            {tournament &&
              !tournament.active &&
              tournament.count !==
                "0" &&
              !tournament.settled &&
              tournament.endsAt > 0 &&
              tournamentNow >=
                tournament.endsAt *
                  1000 && (
                <button
                  type="button"
                  disabled={
                    tournamentBusy
                  }
                  onClick={() => {
                    void settleTournament();
                  }}
                  className="w-full border-t-2 border-black px-3 py-3 text-[9px] uppercase tracking-[0.12em] disabled:opacity-50"
                >
                  Settle Tournament
                </button>
              )}
          </div>

          <p className="mt-3 text-[10px] leading-relaxed opacity-70">
            Connected holders select a Hoodie and up to 8 playable NFTs from
            its HoodWallet directly inside the 120×120 screen. The Hoodie is
            always stage 1. Without a connected wallet, Hood Break loads the
            public demo run. Mystery stages stay hidden until the ball hits them.
            Catch falling pixels for Speed, Multiball, Laser or a rare Extra Life.
            Extra Life only appears after a life was lost, can restore at most one life
            per run, and never exceeds the Hoodie&apos;s starting lives. BREAK is available
            once per run when the selected HoodWallet holds at least 5,000 OCH.
            A completed FULL HOOD run is first submitted to the onchain leaderboard
            through the Hoodie&apos;s own HoodWallet; that accepted score is what makes
            the Hoodie eligible for the FULL HOOD / Hood It milestone. Active 48-hour
            tournaments automatically use the same verified score submission.
          </p>
        </div>

        <div className="mx-auto mt-10 flex max-w-[600px] justify-between border-t border-black pt-3 text-[9px] uppercase tracking-[0.14em]">
          <span>
            {status.currentAsset} / {status.level}/{status.totalLevels}
          </span>

          <Link
            href="/"
            className="underline underline-offset-4"
          >
            Back to Hood
          </Link>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
