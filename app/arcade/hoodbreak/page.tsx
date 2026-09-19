"use client";

import Link from "next/link";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import SiteHeader from "../../../components/SiteHeader";
import SiteFooter from "../../../components/SiteFooter";

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

const FONT_SPACING = 2;

const FONT_5X7: Record<string, string[]> = {
  "0": [" xxx ", "x   x", "x   x", "x   x", "x   x", "x   x", " xxx "],
  "1": ["  x  ", " xx  ", "  x  ", "  x  ", "  x  ", "  x  ", " xxx "],
  "2": ["xxxx ", "    x", "    x", " xxx ", "x    ", "x    ", " xxxx"],
  "3": ["xxxx ", "    x", "    x", "xxxx ", "    x", "    x", "xxxx "],
  "4": ["   xx", "  x x", " x  x", "xxxxx", "    x", "    x", "    x"],
  "5": ["xxxxx", "x    ", "x    ", "xxxx ", "    x", "    x", "xxxx "],
  "6": [" xxxx", "x    ", "x    ", "xxxx ", "x   x", "x   x", " xxx "],
  "7": ["xxxxx", "    x", "    x", "    x", "    x", "    x", "    x"],
  "8": [" xxx ", "x   x", "x   x", " xxx ", "x   x", "x   x", " xxx "],
  "9": [" xxx ", "x   x", "x   x", " xxxx", "    x", "    x", "    x"],

  A: [" xxx ", "x   x", "xxxxx", "x   x", "x   x", "x   x", "x   x"],
  B: ["xxxx ", "x   x", "x   x", "xxxx ", "x   x", "x   x", "xxxx "],
  C: [" xxxx", "x    ", "x    ", "x    ", "x    ", "x    ", " xxxx"],
  D: ["xxxx ", "x   x", "x   x", "x   x", "x   x", "x   x", "xxxx "],
  E: ["xxxxx", "x    ", "x    ", "xxxxx", "x    ", "x    ", "xxxxx"],
  F: ["xxxxx", "x    ", "x    ", "xxxxx", "x    ", "x    ", "x    "],
  G: [" xxxx", "x    ", "x    ", "x xxx", "x   x", "x   x", " xxx "],
  H: ["x   x", "x   x", "x   x", "xxxxx", "x   x", "x   x", "x   x"],
  I: ["xxxxx", "  x  ", "  x  ", "  x  ", "  x  ", "  x  ", "xxxxx"],
  J: ["xxxxx", "   x ", "   x ", "   x ", "   x ", "   x ", "xxxx "],
  K: ["x   x", "x  x ", "x x  ", "xx   ", "x x  ", "x  x ", "x   x"],
  L: ["x    ", "x    ", "x    ", "x    ", "x    ", "x    ", "xxxxx"],
  M: ["x   x", "x   x", "xx xx", "x x x", "x   x", "x   x", "x   x"],
  N: ["x   x", "x   x", "xx  x", "x x x", "x  xx", "x   x", "x   x"],
  O: [" xxx ", "x   x", "x   x", "x   x", "x   x", "x   x", " xxx "],
  P: ["xxxx ", "x   x", "x   x", "xxxx ", "x    ", "x    ", "x    "],
  Q: ["xxxxx", "x   x", "x   x", "x   x", "x   x", "x  x ", "xxx x"],
  R: ["xxxx ", "x   x", "x   x", "xxxx ", "x   x", "x   x", "x   x"],
  S: [" xxxx", "x    ", "x    ", "xxxxx", "    x", "    x", "xxxxx"],
  T: ["xxxxx", "  x  ", "  x  ", "  x  ", "  x  ", "  x  ", "  x  "],
  U: ["x   x", "x   x", "x   x", "x   x", "x   x", "x   x", " xxx "],
  V: ["x   x", "x   x", "x   x", " x x ", " x x ", " x x ", "  x  "],
  W: ["x x x", "x x x", "x x x", "x x x", "x x x", "x x x", " x x "],
  X: ["x   x", "x   x", " x x ", "  x  ", " x x ", "x   x", "x   x"],
  Y: ["x   x", "x   x", " x x ", "  x  ", "  x  ", "  x  ", "  x  "],
  Z: ["xxxxx", "    x", "   x ", "  x  ", " x   ", "x    ", "xxxxx"],

  " ": ["   "],
  ":": [" ", " ", "x", " ", " ", " ", "x"],
  ".": [" ", " ", " ", " ", " ", " ", "x"],
  "#": [" x x ", " x x ", "xxxxx", " x x ", "xxxxx", " x x ", " x x "],
  "/": ["  x", "  x", " x ", " x ", " x ", "x  ", "x  "],
  "?": [" xxx ", "x   x", "   x ", "  x  ", "  x  ", "     ", "  x  "],
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
  | "laser";

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

function isValidNumericId(
  value: string
) {
  return (
    /^\d+$/.test(value) &&
    BigInt(value) >= BigInt(0)
  );
}

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

export default function HoodBreakPage() {
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

  const [
    hoodieId,
    setHoodieId,
  ] =
    useState("125");

  const [
    pingId,
    setPingId,
  ] =
    useState("1");

  const [
    studioId,
    setStudioId,
  ] =
    useState("488");

  const [
    frameId,
    setFrameId,
  ] =
    useState("120");

  // Temporary test value until the HoodWallet balance route is wired in.
  // 5000+ grants one BREAK charge per run.
  const [
    ochBalance,
    setOchBalance,
  ] = useState("5000");

  const [
    assets,
    setAssets,
  ] =
    useState<
      PlayableAsset[]
    >([
      FALLBACK_HOODIE,
    ]);

  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const [
    loadError,
    setLoadError,
  ] =
    useState<
      string | null
    >(null);

  const [
    runRevision,
    setRunRevision,
  ] =
    useState(0);

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

  const loadRunAssets =
    useCallback(
      async () => {
        const ids = {
          hoodie:
            hoodieId.trim(),
          ping:
            pingId.trim(),
          studio:
            studioId.trim(),
          frame:
            frameId.trim(),
        };

        if (
          !Object.values(
            ids
          ).every(
            isValidNumericId
          )
        ) {
          setLoadError(
            "All four test IDs must be valid non-negative numbers."
          );

          return;
        }

        setLoading(true);
        setLoadError(null);

        try {
          const [
            hoodieResponse,
            pingResponse,
            studioResponse,
            frameResponse,
          ] =
            await Promise.all([
              fetch(
                `/api/arcade/hoodie/${encodeURIComponent(
                  ids.hoodie
                )}`,
                {
                  cache:
                    "no-store",
                }
              ),

              fetch(
                `/api/arcade/ping/${encodeURIComponent(
                  ids.ping
                )}`,
                {
                  cache:
                    "no-store",
                }
              ),

              fetch(
                `/api/arcade/studio/${encodeURIComponent(
                  ids.studio
                )}`,
                {
                  cache:
                    "no-store",
                }
              ),

              fetch(
                `/api/arcade/hoodframe/${encodeURIComponent(
                  ids.frame
                )}`,
                {
                  cache:
                    "no-store",
                }
              ),
            ]);

          const [
            hoodieData,
            pingData,
            studioData,
            frameData,
          ] =
            (await Promise.all([
              hoodieResponse.json(),
              pingResponse.json(),
              studioResponse.json(),
              frameResponse.json(),
            ])) as [
              HoodieResponse,
              PingResponse,
              StudioResponse,
              HoodFrameResponse,
            ];

          if (
            !hoodieResponse.ok
          ) {
            throw new Error(
              hoodieData.error ||
                "Unable to load Hoodie."
            );
          }

          if (
            !pingResponse.ok
          ) {
            throw new Error(
              pingData.error ||
                "Unable to load Ping."
            );
          }

          if (
            !studioResponse.ok
          ) {
            throw new Error(
              studioData.error ||
                "Unable to load Studio."
            );
          }

          if (
            !frameResponse.ok
          ) {
            throw new Error(
              frameData.error ||
                "Unable to load HoodFrame."
            );
          }

          const archetype =
            hoodieData.archetype;

          const nextAssets: PlayableAsset[] =
            [
              {
                kind:
                  "hoodie",
                tokenId:
                  hoodieData.tokenId,
                name:
                  hoodieData.name,
                archetype,
                sprite: {
                  ...hoodieData.sprite,
                  gameScale:
                    hoodieData
                      .sprite
                      .gameScale ??
                    3,
                },
              },

              {
                kind:
                  "ping",
                tokenId:
                  pingData.tokenId,
                name:
                  pingData.name,
                archetype,
                sprite: {
                  ...pingData.sprite,
                  gameScale:
                    pingData
                      .sprite
                      .gameScale ??
                    2,
                },
              },

              {
                kind:
                  "studio",
                tokenId:
                  studioData.tokenId,
                name:
                  studioData.name,
                archetype,
                sprite: {
                  ...studioData.sprite,
                  gameScale:
                    studioData
                      .sprite
                      .gameScale ??
                    3,
                },
              },

              {
                kind:
                  "hoodframe",
                tokenId:
                  frameData.tokenId,
                name:
                  frameData.name,
                archetype,
                sprite: {
                  ...frameData.sprite,
                  gameScale:
                    frameData
                      .sprite
                      .gameScale ??
                    5,
                },
              },
            ];

          setAssets(
            nextAssets
          );

          setRunRevision(
            (value) =>
              value + 1
          );
        } catch (
          error
        ) {
          setLoadError(
            error instanceof
              Error
              ? error.message
              : "Unable to load the run assets."
          );
        } finally {
          setLoading(false);
        }
      },
      [
        hoodieId,
        pingId,
        studioId,
        frameId,
      ]
    );

  useEffect(() => {
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

    let pickups: Pickup[] = [];

    let laserShots: LaserShot[] = [];

    let destroyedSinceDrop = 0;

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
        FONT_5X7[
          character
        ] ??
        FONT_5X7[" "]
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
          {
            x: 25,
            y: 35,
          },
          {
            x: 58,
            y: 27,
          },
          {
            x: 91,
            y: 38,
          },
          {
            x: 42,
            y: 60,
          },
          {
            x: 76,
            y: 62,
          },
          {
            x: 59,
            y: 82,
          },
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

      breakCharges =
        breakEligible ? 1 : 0;

      phase =
        "start";

      selectorBlocks =
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
            : "LASER";

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
        "select-ready";

      createSelectorBlocks();
      resetBallToPaddle();

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

        phase =
          "run-clear";

        publishStatus(
          "Run clear"
        );

        return;
      }

      enterSelectRoom();
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

      publishStatus();

      destroyedSinceDrop += 1;

      if (
        destroyedSinceDrop >= DROP_EVERY_N_BRICKS &&
        remainingBricks > 0 &&
        pickups.length === 0
      ) {
        destroyedSinceDrop = 0;

        const nextDrop =
          dropDeck[0] ?? null;

        // Only consume the deck entry when we are actually allowed
        // to resolve a drop check. While a pickup is already falling,
        // the counter and deck are preserved for the next destroyed brick.
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
          ]);
        }

        if (nextDrop) {
          const geometry =
            spriteGeometry(currentAsset);

          pickups.push({
            kind: nextDrop,
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

    function stepSelectorBall(
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

      const distance =
        speed *
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
          "select"
        ) {
          return true;
        }

        const previousY =
          ball.y;

        let nextX =
          ball.x +
          ball.vx *
            60 *
            stepTime;

        let nextY =
          ball.y +
          ball.vy *
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
        }

        const selector =
          selectorAtScreen(
            Math.floor(
              nextX
            ),
            Math.floor(
              nextY
            )
          );

        if (
          selector
        ) {
          chooseSelector(
            selector
          );

          return true;
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
          "playing" &&
        phase !==
          "select"
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
          phase ===
          "select"
            ? stepSelectorBall(
                ball,
                deltaTime
              )
            : stepStageBall(
                ball,
                deltaTime
              );

        if (
          survived &&
          (phase ===
            "playing" ||
            phase ===
              "select")
        ) {
          survivors.push(
            ball
          );
        }
      }

      if (
        phase !==
          "playing" &&
        phase !==
          "select"
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
      drawPaddle();
      drawBalls();

      drawBitmapText(
        "SELECT",
        W / 2,
        92,
        1,
        "center"
      );

      if (
        phase ===
        "select-ready"
      ) {
        drawBitmapText(
          "LAUNCH",
          W / 2,
          103,
          1,
          "center"
        );
      }
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
        if (phase === "playing" && performance.now() < laserUntil) {
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

      if (phase === "playing" && performance.now() < laserUntil) {
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
  ]);

  function handleLoadRun(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      loading
    ) {
      return;
    }

    void loadRunAssets();
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
            {status.level}/{status.totalLevels} stages
          </div>
        </div>

        <div className="mx-auto mt-5 w-full max-w-[600px]">
          <form
            onSubmit={handleLoadRun}
            className="border-2 border-black"
          >
            <div className="grid grid-cols-2 sm:grid-cols-4">
              {[
                {
                  label: "Hoodie",
                  value: hoodieId,
                  setter: setHoodieId,
                },
                {
                  label: "Ping",
                  value: pingId,
                  setter: setPingId,
                },
                {
                  label: "Studio",
                  value: studioId,
                  setter: setStudioId,
                },
                {
                  label: "Frame",
                  value: frameId,
                  setter: setFrameId,
                },
              ].map(
                (
                  item,
                  index
                ) => (
                  <label
                    key={item.label}
                    className={[
                      "block",
                      index > 0
                        ? "border-l border-black"
                        : "",
                      index > 1
                        ? "border-t border-black sm:border-t-0"
                        : "",
                    ].join(" ")}
                  >
                    <span className="block border-b border-black px-2 py-1 text-[7px] uppercase tracking-[0.12em]">
                      {item.label} ID
                    </span>

                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={item.value}
                      onChange={(event) => {
                        item.setter(
                          event.target.value.replace(
                            /\D/g,
                            ""
                          )
                        );

                        setLoadError(
                          null
                        );
                      }}
                      className="w-full bg-[#ccff00] px-2 py-2 text-xs outline-none"
                    />
                  </label>
                )
              )}
            </div>

            <label className="block border-t-2 border-black">
              <span className="block border-b border-black px-2 py-1 text-[7px] uppercase tracking-[0.12em]">
                HoodWallet OCH / test until balance route is wired
              </span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={ochBalance}
                onChange={(event) => setOchBalance(event.target.value.replace(/\D/g, ""))}
                className="w-full bg-[#ccff00] px-2 py-2 text-xs outline-none"
              />
            </label>

            <button
              type="submit"
              disabled={loading}
              className="w-full border-t-2 border-black px-3 py-3 text-[9px] uppercase tracking-[0.16em] disabled:opacity-50 active:bg-black active:text-[#ccff00]"
            >
              {loading
                ? "Loading run..."
                : "Load / restart run"}
            </button>
          </form>

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
              Launch
            </button>

            <button
              ref={breakButtonRef}
              type="button"
              className="col-span-2 min-h-12 touch-manipulation border-2 border-black bg-[#ccff00] px-3 py-3 text-[10px] uppercase tracking-[0.14em] active:bg-black active:text-[#ccff00] sm:col-span-3"
            >
              Break / B (5K OCH, once per run)
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

          <p className="mt-3 text-[10px] leading-relaxed opacity-70">
            Stage 1 is always the Hoodie. After each clear, the remaining
            assets become identical 3×3 mystery blocks. Hit one with the ball
            to reveal and enter the next stage. Their mapping is reshuffled
            every select room. Catch falling S / M / L pixels for temporary
            Speed, Multiball and Laser. SPACE fires Laser while active. BREAK
            is available once per run when the HoodWallet has at least 5,000 OCH.
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
