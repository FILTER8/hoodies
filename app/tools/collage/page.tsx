"use client";

import {
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { GIFEncoder, applyPalette } from "gifenc";
import SiteHeader from "../../../components/SiteHeader";
import SiteFooter from "../../../components/SiteFooter";
import {
  HOOD_SPRITES,
  type PixelValue,
  type Sprite,
} from "../../../lib/hoodSprites";

const CANVAS_SIZE = 40;
const HOODIE_SIZE = 20;
const STICKER_EDITOR_SIZE = 20;
const MAX_FRAMES = 8;

const PNG_EXPORT_SIZE = 800;
const GIF_EXPORT_SIZE = 800;

const GREEN = "#ccff00";
const BLACK = "#000000";

const EDITOR_BACKGROUND = "#687b00";
const EMPTY_EDITOR_PIXEL = "#879e00";

const MIN_HOODIE_ID = 0;
const MAX_HOODIE_ID = 5999;

const CUSTOM_SPRITES_STORAGE_KEY =
  "hood-collage-custom-sprites";

const GIF_PALETTE: number[][] = [
  [204, 255, 0],
  [0, 0, 0],
];

type EditorTool =
  | "move"
  | "green"
  | "black"
  | "erase";

type StickerTool =
  | "green"
  | "black"
  | "erase";

type HoodieScale = 1 | 2 | 3;

type AnimationMode =
  | "loop"
  | "ping-pong";

type LibrarySprite = Sprite & {
  custom?: boolean;
};

type StickerInstance = {
  id: string;
  spriteId: string;
  x: number;
  y: number;
};

type AnimationFrame = {
  id: string;
  hoodieId: number;
  hoodiePixels: PixelValue[];
  hoodieScale: HoodieScale;
  hoodieX: number;
  hoodieY: number;
  stickers: StickerInstance[];
  drawingPixels: PixelValue[];
};

type DragState =
  | {
      type: "sticker";
      stickerId: string;
      offsetX: number;
      offsetY: number;
    }
  | {
      type: "hoodie";
      offsetX: number;
      offsetY: number;
    }
  | {
      type: "drawing";
    }
  | null;

function createPixelArray(
  width: number,
  height: number,
): PixelValue[] {
  return new Array<PixelValue>(
    width * height,
  ).fill(0);
}

function createId(): string {
  return `${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}`;
}

function createSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeTypeScriptString(
  value: string,
): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, " ");
}

function getPixelColor(
  pixel: PixelValue,
): string | null {
  if (pixel === 1) {
    return GREEN;
  }

  if (pixel === 2) {
    return BLACK;
  }

  return null;
}

function clampHoodieId(
  value: number,
): number {
  if (!Number.isFinite(value)) {
    return MIN_HOODIE_ID;
  }

  return Math.max(
    MIN_HOODIE_ID,
    Math.min(
      MAX_HOODIE_ID,
      Math.floor(value),
    ),
  );
}

function randomHoodieId(): number {
  return Math.floor(
    Math.random() *
      (MAX_HOODIE_ID -
        MIN_HOODIE_ID +
        1),
  );
}

function getCenteredPosition(
  size: number,
): number {
  return Math.floor(
    (CANVAS_SIZE - size) / 2,
  );
}

function clampStickerPosition(
  value: number,
  objectSize: number,
): number {
  return Math.max(
    0,
    Math.min(
      CANVAS_SIZE - objectSize,
      Math.floor(value),
    ),
  );
}

function clampHoodiePosition(
  value: number,
  objectSize: number,
): number {
  const minimum = -objectSize + 1;
  const maximum = CANVAS_SIZE - 1;

  return Math.max(
    minimum,
    Math.min(
      maximum,
      Math.floor(value),
    ),
  );
}

function createEmptyFrame(
  hoodieId = 0,
): AnimationFrame {
  return {
    id: createId(),
    hoodieId,
    hoodiePixels: createPixelArray(
      HOODIE_SIZE,
      HOODIE_SIZE,
    ),
    hoodieScale: 1,
    hoodieX: getCenteredPosition(
      HOODIE_SIZE,
    ),
    hoodieY: getCenteredPosition(
      HOODIE_SIZE,
    ),
    stickers: [],
    drawingPixels: createPixelArray(
      CANVAS_SIZE,
      CANVAS_SIZE,
    ),
  };
}

function copyAnimationFrame(
  frame: AnimationFrame,
): AnimationFrame {
  return {
    ...frame,
    id: createId(),
    hoodiePixels: [
      ...frame.hoodiePixels,
    ],
    drawingPixels: [
      ...frame.drawingPixels,
    ],
    stickers: frame.stickers.map(
      (sticker) => ({
        ...sticker,
        id: createId(),
      }),
    ),
  };
}

function getCanvasPosition(
  event: ReactPointerEvent<HTMLCanvasElement>,
  shouldClamp = true,
): {
  x: number;
  y: number;
} {
  const bounds =
    event.currentTarget.getBoundingClientRect();

  const rawX =
    ((event.clientX - bounds.left) /
      bounds.width) *
    CANVAS_SIZE;

  const rawY =
    ((event.clientY - bounds.top) /
      bounds.height) *
    CANVAS_SIZE;

  const x = Math.floor(rawX);
  const y = Math.floor(rawY);

  if (!shouldClamp) {
    return {
      x,
      y,
    };
  }

  return {
    x: Math.max(
      0,
      Math.min(
        CANVAS_SIZE - 1,
        x,
      ),
    ),
    y: Math.max(
      0,
      Math.min(
        CANVAS_SIZE - 1,
        y,
      ),
    ),
  };
}

function loadImageFromBlob(
  blob: Blob,
): Promise<HTMLImageElement> {
  return new Promise(
    (resolve, reject) => {
      const objectUrl =
        URL.createObjectURL(blob);

      const image = new Image();

      image.onload = () => {
        URL.revokeObjectURL(
          objectUrl,
        );

        resolve(image);
      };

      image.onerror = () => {
        URL.revokeObjectURL(
          objectUrl,
        );

        reject(
          new Error(
            "Unable to decode Hoodie image.",
          ),
        );
      };

      image.src = objectUrl;
    },
  );
}

async function fetchHoodiePixels(
  requestedId: number,
): Promise<{
  hoodieId: number;
  pixels: PixelValue[];
}> {
  const safeId =
    clampHoodieId(requestedId);

  const response = await fetch(
    `https://api.onchainhoodies.xyz/images/${safeId}.svg`,
    {
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(
      `Image request failed: ${response.status}`,
    );
  }

  const blob = await response.blob();
  const image =
    await loadImageFromBlob(blob);

  const temporaryCanvas =
    document.createElement("canvas");

  temporaryCanvas.width = HOODIE_SIZE;
  temporaryCanvas.height = HOODIE_SIZE;

  const context =
    temporaryCanvas.getContext("2d", {
      willReadFrequently: true,
    });

  if (!context) {
    throw new Error(
      "Canvas is unavailable.",
    );
  }

  context.imageSmoothingEnabled = false;

  context.clearRect(
    0,
    0,
    HOODIE_SIZE,
    HOODIE_SIZE,
  );

  context.drawImage(
    image,
    0,
    0,
    HOODIE_SIZE,
    HOODIE_SIZE,
  );

  const imageData =
    context.getImageData(
      0,
      0,
      HOODIE_SIZE,
      HOODIE_SIZE,
    );

  const nextPixels =
    createPixelArray(
      HOODIE_SIZE,
      HOODIE_SIZE,
    );

  for (
    let index = 0;
    index <
    HOODIE_SIZE * HOODIE_SIZE;
    index += 1
  ) {
    const dataIndex = index * 4;

    const red =
      imageData.data[dataIndex];

    const green =
      imageData.data[dataIndex + 1];

    const blue =
      imageData.data[dataIndex + 2];

    const alpha =
      imageData.data[dataIndex + 3];

    if (alpha < 20) {
      nextPixels[index] = 0;
      continue;
    }

    const brightness =
      red * 0.2126 +
      green * 0.7152 +
      blue * 0.0722;

    nextPixels[index] =
      brightness < 100 ? 2 : 1;
  }

  return {
    hoodieId: safeId,
    pixels: nextPixels,
  };
}

function copySpriteToEditor(
  sprite: Sprite,
): PixelValue[] {
  const editorPixels =
    createPixelArray(
      STICKER_EDITOR_SIZE,
      STICKER_EDITOR_SIZE,
    );

  const copyWidth = Math.min(
    sprite.width,
    STICKER_EDITOR_SIZE,
  );

  const copyHeight = Math.min(
    sprite.height,
    STICKER_EDITOR_SIZE,
  );

  for (
    let y = 0;
    y < copyHeight;
    y += 1
  ) {
    for (
      let x = 0;
      x < copyWidth;
      x += 1
    ) {
      editorPixels[
        y *
          STICKER_EDITOR_SIZE +
          x
      ] =
        sprite.pixels[
          y * sprite.width + x
        ] ?? 0;
    }
  }

  return editorPixels;
}

function createStickerLibraryCode(
  name: string,
  pixels: PixelValue[],
): string {
  const cleanName =
    name.trim() ||
    "Custom Sticker";

  const id =
    createSlug(cleanName) ||
    "custom-sticker";

  const rows: string[] = [];

  for (
    let y = 0;
    y < STICKER_EDITOR_SIZE;
    y += 1
  ) {
    let row = "";

    for (
      let x = 0;
      x < STICKER_EDITOR_SIZE;
      x += 1
    ) {
      row += String(
        pixels[
          y *
            STICKER_EDITOR_SIZE +
            x
        ] ?? 0,
      );
    }

    rows.push(row);
  }

  const rowsText = rows
    .map(
      (row) =>
        `      "${row}",`,
    )
    .join("\n");

  return `{
  id: "${id}",
  name: "${escapeTypeScriptString(
    cleanName,
  )}",
  width: 20,
  height: 20,
  pixels: rowsToPixels([
${rowsText}
  ]),
},`;
}

function getAnimationFrames(
  frames: AnimationFrame[],
  mode: AnimationMode,
): AnimationFrame[] {
  if (
    mode === "loop" ||
    frames.length <= 2
  ) {
    return frames;
  }

  return [
    ...frames,
    ...frames.slice(1, -1).reverse(),
  ];
}

function drawFrameContent(
  context:
    CanvasRenderingContext2D,
  frame: AnimationFrame,
  spriteMap: Map<
    string,
    LibrarySprite
  >,
) {
  context.imageSmoothingEnabled =
    false;

  context.clearRect(
    0,
    0,
    CANVAS_SIZE,
    CANVAS_SIZE,
  );

  /*
   * Background
   */
  context.fillStyle = GREEN;

  context.fillRect(
    0,
    0,
    CANVAS_SIZE,
    CANVAS_SIZE,
  );

  /*
   * Hoodie
   */
  frame.hoodiePixels.forEach(
    (pixel, index) => {
      const color =
        getPixelColor(pixel);

      if (!color) {
        return;
      }

      const sourceX =
        index % HOODIE_SIZE;

      const sourceY = Math.floor(
        index / HOODIE_SIZE,
      );

      context.fillStyle = color;

      context.fillRect(
        frame.hoodieX +
          sourceX *
            frame.hoodieScale,
        frame.hoodieY +
          sourceY *
            frame.hoodieScale,
        frame.hoodieScale,
        frame.hoodieScale,
      );
    },
  );

  /*
   * Stickers
   */
  frame.stickers.forEach(
    (sticker) => {
      const sprite =
        spriteMap.get(
          sticker.spriteId,
        );

      if (!sprite) {
        return;
      }

      sprite.pixels.forEach(
        (pixel, index) => {
          const color =
            getPixelColor(pixel);

          if (!color) {
            return;
          }

          const localX =
            index % sprite.width;

          const localY =
            Math.floor(
              index /
                sprite.width,
            );

          const x =
            sticker.x + localX;

          const y =
            sticker.y + localY;

          if (
            x < 0 ||
            y < 0 ||
            x >= CANVAS_SIZE ||
            y >= CANVAS_SIZE
          ) {
            return;
          }

          context.fillStyle =
            color;

          context.fillRect(
            x,
            y,
            1,
            1,
          );
        },
      );
    },
  );

  /*
   * Painting is always the top layer.
   */
  frame.drawingPixels.forEach(
    (pixel, index) => {
      const color =
        getPixelColor(pixel);

      if (!color) {
        return;
      }

      const x =
        index % CANVAS_SIZE;

      const y = Math.floor(
        index / CANVAS_SIZE,
      );

      context.fillStyle = color;

      context.fillRect(
        x,
        y,
        1,
        1,
      );
    },
  );
}

function renderFrameToExportCanvas(
  frame: AnimationFrame,
  spriteMap: Map<
    string,
    LibrarySprite
  >,
  outputSize: number,
): HTMLCanvasElement | null {
  const sourceCanvas =
    document.createElement("canvas");

  sourceCanvas.width = CANVAS_SIZE;
  sourceCanvas.height = CANVAS_SIZE;

  const sourceContext =
    sourceCanvas.getContext("2d");

  if (!sourceContext) {
    return null;
  }

  drawFrameContent(
    sourceContext,
    frame,
    spriteMap,
  );

  const exportCanvas =
    document.createElement("canvas");

  exportCanvas.width = outputSize;
  exportCanvas.height = outputSize;

  const exportContext =
    exportCanvas.getContext("2d");

  if (!exportContext) {
    return null;
  }

  exportContext.imageSmoothingEnabled =
    false;

  exportContext.drawImage(
    sourceCanvas,
    0,
    0,
    CANVAS_SIZE,
    CANVAS_SIZE,
    0,
    0,
    outputSize,
    outputSize,
  );

  return exportCanvas;
}

function readStoredCustomSprites(): LibrarySprite[] {
  if (
    typeof window === "undefined"
  ) {
    return [];
  }

  try {
    const stored =
      window.localStorage.getItem(
        CUSTOM_SPRITES_STORAGE_KEY,
      );

    if (!stored) {
      return [];
    }

    const parsed: unknown =
      JSON.parse(stored);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed as LibrarySprite[];
  } catch {
    return [];
  }
}

function SpritePreview({
  sprite,
}: {
  sprite: Sprite;
}) {
  const canvasRef =
    useRef<HTMLCanvasElement | null>(
      null,
    );

  useEffect(() => {
    const canvas =
      canvasRef.current;

    if (!canvas) {
      return;
    }

    canvas.width = sprite.width;
    canvas.height = sprite.height;

    const context =
      canvas.getContext("2d");

    if (!context) {
      return;
    }

    context.clearRect(
      0,
      0,
      sprite.width,
      sprite.height,
    );

    context.imageSmoothingEnabled =
      false;

    sprite.pixels.forEach(
      (pixel, index) => {
        const color =
          getPixelColor(pixel);

        if (!color) {
          return;
        }

        const x =
          index % sprite.width;

        const y = Math.floor(
          index / sprite.width,
        );

        context.fillStyle =
          color;

        context.fillRect(
          x,
          y,
          1,
          1,
        );
      },
    );
  }, [sprite]);

  return (
    <canvas
      ref={canvasRef}
      width={sprite.width}
      height={sprite.height}
      className="block h-full w-full"
      style={{
        imageRendering:
          "pixelated",
        objectFit: "contain",
      }}
    />
  );
}

function FramePreview({
  frame,
  spriteMap,
}: {
  frame: AnimationFrame;
  spriteMap: Map<
    string,
    LibrarySprite
  >;
}) {
  const canvasRef =
    useRef<HTMLCanvasElement | null>(
      null,
    );

  useEffect(() => {
    const canvas =
      canvasRef.current;

    if (!canvas) {
      return;
    }

    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;

    const context =
      canvas.getContext("2d");

    if (!context) {
      return;
    }

    drawFrameContent(
      context,
      frame,
      spriteMap,
    );
  }, [frame, spriteMap]);

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_SIZE}
      height={CANVAS_SIZE}
      className="block h-full w-full"
      style={{
        imageRendering:
          "pixelated",
      }}
    />
  );
}

function ActionButton({
  children,
  active = false,
  disabled = false,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`min-h-12 border-2 px-4 py-3 text-[8px] uppercase tracking-[0.14em] transition-colors ${
        active
          ? "border-[#ccff00] bg-[#ccff00] text-black"
          : "border-[#ccff00] bg-black text-[#ccff00] hover:bg-[#ccff00] hover:text-black"
      } disabled:cursor-not-allowed disabled:opacity-35`}
    >
      {children}
    </button>
  );
}

export default function HoodCollagePage() {
  const canvasRef =
    useRef<HTMLCanvasElement | null>(
      null,
    );

  const dragRef =
    useRef<DragState>(null);

  const [frames, setFrames] =
    useState<AnimationFrame[]>(
      () => [createEmptyFrame(0)],
    );

  const [
    activeFrameIndex,
    setActiveFrameIndex,
  ] = useState(0);

  const currentFrame =
    frames[activeFrameIndex] ??
    frames[0]!;

  const [
    hoodieInput,
    setHoodieInput,
  ] = useState("0");

  const [
    hoodieLoading,
    setHoodieLoading,
  ] = useState(true);

  const [
    hoodieError,
    setHoodieError,
  ] = useState("");

  const [tool, setTool] =
    useState<EditorTool>("move");

  const [
    showGrid,
    setShowGrid,
  ] = useState(true);

  const [
    hoodieSelected,
    setHoodieSelected,
  ] = useState(false);

  const [
    selectedStickerId,
    setSelectedStickerId,
  ] = useState<string | null>(
    null,
  );

  const [
    animationMode,
    setAnimationMode,
  ] =
    useState<AnimationMode>(
      "loop",
    );

  const [
    frameDelay,
    setFrameDelay,
  ] = useState(250);

  const [
    gifExporting,
    setGifExporting,
  ] = useState(false);

  const [
    isPlaying,
    setIsPlaying,
  ] = useState(false);

  const [
    previewFrameIndex,
    setPreviewFrameIndex,
  ] = useState(0);

  const [
    customSprites,
    setCustomSprites,
  ] = useState<
    LibrarySprite[]
  >([]);

  const [
    stickerName,
    setStickerName,
  ] = useState("New Sticker");

  const [
    stickerPixels,
    setStickerPixels,
  ] = useState<PixelValue[]>(
    createPixelArray(
      STICKER_EDITOR_SIZE,
      STICKER_EDITOR_SIZE,
    ),
  );

  const [
    stickerTool,
    setStickerTool,
  ] =
    useState<StickerTool>(
      "black",
    );

  const [
    stickerDrawing,
    setStickerDrawing,
  ] = useState(false);

  const [
    editingSpriteId,
    setEditingSpriteId,
  ] = useState<string | null>(
    null,
  );

  const [
    editorMessage,
    setEditorMessage,
  ] = useState("");

  const [
    copiedSticker,
    setCopiedSticker,
  ] = useState(false);

  const allSprites =
    useMemo<LibrarySprite[]>(
      () => [
        ...HOOD_SPRITES,
        ...customSprites,
      ],
      [customSprites],
    );

  const spriteMap = useMemo(
    () =>
      new Map<
        string,
        LibrarySprite
      >(
        allSprites.map(
          (sprite) => [
            sprite.id,
            sprite,
          ],
        ),
      ),
    [allSprites],
  );

  const playbackFrames =
    useMemo(
      () =>
        getAnimationFrames(
          frames,
          animationMode,
        ),
      [
        frames,
        animationMode,
      ],
    );

  const displayedFrame =
    isPlaying
      ? playbackFrames[
          previewFrameIndex
        ] ?? currentFrame
      : currentFrame;

  const selectedSticker =
    currentFrame.stickers.find(
      (sticker) =>
        sticker.id ===
        selectedStickerId,
    ) ?? null;

  const editingSprite =
    editingSpriteId
      ? spriteMap.get(
          editingSpriteId,
        ) ?? null
      : null;

  const hoodieDisplaySize =
    HOODIE_SIZE *
    currentFrame.hoodieScale;

  const stickerLibraryCode =
    useMemo(
      () =>
        createStickerLibraryCode(
          stickerName,
          stickerPixels,
        ),
      [
        stickerName,
        stickerPixels,
      ],
    );

  const updateCurrentFrame =
    useCallback(
      (
        updater:
          | Partial<AnimationFrame>
          | ((
              frame:
                AnimationFrame,
            ) =>
              AnimationFrame),
      ) => {
        setFrames((current) =>
          current.map(
            (frame, index) => {
              if (
                index !==
                activeFrameIndex
              ) {
                return frame;
              }

              if (
                typeof updater ===
                "function"
              ) {
                return updater(
                  frame,
                );
              }

              return {
                ...frame,
                ...updater,
              };
            },
          ),
        );
      },
      [activeFrameIndex],
    );

  /*
   * Load custom sprites after hydration.
   * The state update happens in a timer callback,
   * not synchronously inside the effect.
   */
  useEffect(() => {
    const timeoutId =
      window.setTimeout(() => {
        setCustomSprites(
          readStoredCustomSprites(),
        );
      }, 0);

    return () => {
      window.clearTimeout(
        timeoutId,
      );
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        CUSTOM_SPRITES_STORAGE_KEY,
        JSON.stringify(
          customSprites,
        ),
      );
    } catch {
      // Local storage is optional.
    }
  }, [customSprites]);

  /*
   * Initial Hoodie load.
   */
  useEffect(() => {
    let cancelled = false;

    const firstFrameId =
      frames[0]?.id;

    if (!firstFrameId) {
      return;
    }

    void fetchHoodiePixels(0)
      .then((result) => {
        if (cancelled) {
          return;
        }

        setFrames((current) =>
          current.map(
            (frame) =>
              frame.id ===
              firstFrameId
                ? {
                    ...frame,
                    hoodieId:
                      result.hoodieId,
                    hoodiePixels:
                      result.pixels,
                  }
                : frame,
          ),
        );
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        console.error(error);

        setHoodieError(
          "The Hoodie could not be loaded.",
        );
      })
      .finally(() => {
        if (!cancelled) {
          setHoodieLoading(
            false,
          );
        }
      });

    return () => {
      cancelled = true;
    };

    // The initial Hoodie loads once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
   * Animation preview playback.
   */
  useEffect(() => {
    if (
      !isPlaying ||
      playbackFrames.length <= 1
    ) {
      return;
    }

    const intervalId =
      window.setInterval(() => {
        setPreviewFrameIndex(
          (current) =>
            (current + 1) %
            playbackFrames.length,
        );
      }, frameDelay);

    return () => {
      window.clearInterval(
        intervalId,
      );
    };
  }, [
    frameDelay,
    isPlaying,
    playbackFrames.length,
  ]);

  const drawScene =
    useCallback(
      (
        context:
          CanvasRenderingContext2D,
        showSelection: boolean,
      ) => {
        drawFrameContent(
          context,
          displayedFrame,
          spriteMap,
        );

        if (
          isPlaying ||
          displayedFrame.id !==
            currentFrame.id
        ) {
          return;
        }

        if (
          showSelection &&
          hoodieSelected &&
          tool === "move"
        ) {
          context.save();

          context.strokeStyle =
            BLACK;

          context.lineWidth =
            0.15;

          context.setLineDash([
            0.6,
            0.6,
          ]);

          context.strokeRect(
            currentFrame.hoodieX -
              0.2,
            currentFrame.hoodieY -
              0.2,
            hoodieDisplaySize +
              0.4,
            hoodieDisplaySize +
              0.4,
          );

          context.restore();
        }

        if (
          showSelection &&
          selectedSticker &&
          tool === "move"
        ) {
          const sprite =
            spriteMap.get(
              selectedSticker.spriteId,
            );

          if (sprite) {
            context.save();

            context.strokeStyle =
              BLACK;

            context.lineWidth =
              0.15;

            context.setLineDash([
              0.6,
              0.6,
            ]);

            context.strokeRect(
              selectedSticker.x -
                0.2,
              selectedSticker.y -
                0.2,
              sprite.width +
                0.4,
              sprite.height +
                0.4,
            );

            context.restore();
          }
        }
      },
      [
        currentFrame,
        displayedFrame,
        hoodieDisplaySize,
        hoodieSelected,
        isPlaying,
        selectedSticker,
        spriteMap,
        tool,
      ],
    );

  const renderCanvas =
    useCallback(() => {
      const canvas =
        canvasRef.current;

      if (!canvas) {
        return;
      }

      const context =
        canvas.getContext("2d");

      if (!context) {
        return;
      }

      drawScene(
        context,
        true,
      );
    }, [drawScene]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  async function loadHoodie(
    requestedId: number,
  ) {
    const targetFrameId =
      currentFrame.id;

    setIsPlaying(false);
    setHoodieLoading(true);
    setHoodieError("");

    try {
      const result =
        await fetchHoodiePixels(
          requestedId,
        );

      setFrames((current) =>
        current.map(
          (frame) =>
            frame.id ===
            targetFrameId
              ? {
                  ...frame,
                  hoodieId:
                    result.hoodieId,
                  hoodiePixels:
                    result.pixels,
                }
              : frame,
        ),
      );

      setHoodieInput(
        String(
          result.hoodieId,
        ),
      );
    } catch (error) {
      console.error(error);

      setHoodieError(
        "The Hoodie could not be loaded.",
      );
    } finally {
      setHoodieLoading(false);
    }
  }

  function stopPlayback() {
    setIsPlaying(false);
    setPreviewFrameIndex(0);
  }

  function togglePlayback() {
    if (isPlaying) {
      stopPlayback();
      return;
    }

    if (
      playbackFrames.length <= 1
    ) {
      return;
    }

    const startingIndex =
      playbackFrames.findIndex(
        (frame) =>
          frame.id ===
          currentFrame.id,
      );

    setSelectedStickerId(null);
    setHoodieSelected(false);
    setTool("move");

    setPreviewFrameIndex(
      startingIndex >= 0
        ? startingIndex
        : 0,
    );

    setIsPlaying(true);
  }

  function setScale(
    nextScale: HoodieScale,
  ) {
    stopPlayback();

    updateCurrentFrame(
      (frame) => {
        const oldSize =
          HOODIE_SIZE *
          frame.hoodieScale;

        const nextSize =
          HOODIE_SIZE *
          nextScale;

        const centerX =
          frame.hoodieX +
          oldSize / 2;

        const centerY =
          frame.hoodieY +
          oldSize / 2;

        return {
          ...frame,
          hoodieScale:
            nextScale,
          hoodieX:
            clampHoodiePosition(
              centerX -
                nextSize / 2,
              nextSize,
            ),
          hoodieY:
            clampHoodiePosition(
              centerY -
                nextSize / 2,
              nextSize,
            ),
        };
      },
    );

    setHoodieSelected(true);
    setSelectedStickerId(null);
    setTool("move");
  }

  function centerHoodie() {
    stopPlayback();

    updateCurrentFrame(
      (frame) => {
        const size =
          HOODIE_SIZE *
          frame.hoodieScale;

        const centered =
          getCenteredPosition(
            size,
          );

        return {
          ...frame,
          hoodieX: centered,
          hoodieY: centered,
        };
      },
    );

    setHoodieSelected(true);
    setSelectedStickerId(null);
    setTool("move");
  }

  function loadSpriteIntoEditor(
    sprite: LibrarySprite,
  ) {
    setStickerName(
      sprite.name,
    );

    setStickerPixels(
      copySpriteToEditor(
        sprite,
      ),
    );

    setEditingSpriteId(
      sprite.id,
    );

    setCopiedSticker(false);

    setEditorMessage(
      sprite.custom
        ? "Custom sticker loaded."
        : "Library sticker loaded.",
    );
  }

  function selectLibrarySprite(
    sprite: LibrarySprite,
  ) {
    stopPlayback();

    loadSpriteIntoEditor(
      sprite,
    );

    const instance: StickerInstance =
      {
        id: createId(),
        spriteId: sprite.id,
        x: getCenteredPosition(
          sprite.width,
        ),
        y: getCenteredPosition(
          sprite.height,
        ),
      };

    updateCurrentFrame(
      (frame) => ({
        ...frame,
        stickers: [
          ...frame.stickers,
          instance,
        ],
      }),
    );

    setSelectedStickerId(
      instance.id,
    );

    setHoodieSelected(false);
    setTool("move");
  }

  function findStickerAt(
    x: number,
    y: number,
  ): StickerInstance | null {
    for (
      let index =
        currentFrame.stickers
          .length - 1;
      index >= 0;
      index -= 1
    ) {
      const sticker =
        currentFrame.stickers[
          index
        ];

      const sprite =
        spriteMap.get(
          sticker.spriteId,
        );

      if (!sprite) {
        continue;
      }

      const localX =
        x - sticker.x;

      const localY =
        y - sticker.y;

      if (
        localX < 0 ||
        localY < 0 ||
        localX >=
          sprite.width ||
        localY >=
          sprite.height
      ) {
        continue;
      }

      const pixel =
        sprite.pixels[
          localY *
            sprite.width +
            localX
        ];

      if (pixel !== 0) {
        return sticker;
      }
    }

    return null;
  }

  function isHoodieAt(
    x: number,
    y: number,
  ): boolean {
    const localX =
      x -
      currentFrame.hoodieX;

    const localY =
      y -
      currentFrame.hoodieY;

    if (
      localX < 0 ||
      localY < 0 ||
      localX >=
        hoodieDisplaySize ||
      localY >=
        hoodieDisplaySize
    ) {
      return false;
    }

    const sourceX =
      Math.floor(
        localX /
          currentFrame.hoodieScale,
      );

    const sourceY =
      Math.floor(
        localY /
          currentFrame.hoodieScale,
      );

    return (
      currentFrame.hoodiePixels[
        sourceY *
          HOODIE_SIZE +
          sourceX
      ] !== 0
    );
  }

  function paintCanvasPixel(
    x: number,
    y: number,
  ) {
    if (
      tool === "move" ||
      x < 0 ||
      y < 0 ||
      x >= CANVAS_SIZE ||
      y >= CANVAS_SIZE
    ) {
      return;
    }

    const value: PixelValue =
      tool === "green"
        ? 1
        : tool === "black"
          ? 2
          : 0;

    updateCurrentFrame(
      (frame) => {
        const index =
          y *
            CANVAS_SIZE +
          x;

        if (
          frame.drawingPixels[
            index
          ] === value
        ) {
          return frame;
        }

        const nextPixels = [
          ...frame.drawingPixels,
        ];

        nextPixels[index] =
          value;

        return {
          ...frame,
          drawingPixels:
            nextPixels,
        };
      },
    );
  }

  function handleCanvasPointerDown(
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) {
    if (isPlaying) {
      return;
    }

    event.preventDefault();

    event.currentTarget.setPointerCapture(
      event.pointerId,
    );

    const position =
      getCanvasPosition(
        event,
        true,
      );

    if (tool !== "move") {
      dragRef.current = {
        type: "drawing",
      };

      setSelectedStickerId(null);
      setHoodieSelected(false);

      paintCanvasPixel(
        position.x,
        position.y,
      );

      return;
    }

    const hitSticker =
      findStickerAt(
        position.x,
        position.y,
      );

    if (hitSticker) {
      const sprite =
        spriteMap.get(
          hitSticker.spriteId,
        );

      setSelectedStickerId(
        hitSticker.id,
      );

      setHoodieSelected(false);

      if (sprite) {
        loadSpriteIntoEditor(
          sprite,
        );
      }

      dragRef.current = {
        type: "sticker",
        stickerId:
          hitSticker.id,
        offsetX:
          position.x -
          hitSticker.x,
        offsetY:
          position.y -
          hitSticker.y,
      };

      updateCurrentFrame(
        (frame) => {
          const selected =
            frame.stickers.find(
              (sticker) =>
                sticker.id ===
                hitSticker.id,
            );

          if (!selected) {
            return frame;
          }

          return {
            ...frame,
            stickers: [
              ...frame.stickers.filter(
                (sticker) =>
                  sticker.id !==
                  hitSticker.id,
              ),
              selected,
            ],
          };
        },
      );

      return;
    }

    if (
      isHoodieAt(
        position.x,
        position.y,
      )
    ) {
      setHoodieSelected(true);
      setSelectedStickerId(null);

      dragRef.current = {
        type: "hoodie",
        offsetX:
          position.x -
          currentFrame.hoodieX,
        offsetY:
          position.y -
          currentFrame.hoodieY,
      };

      return;
    }

    setSelectedStickerId(null);
    setHoodieSelected(false);

    dragRef.current = null;
  }

  function handleCanvasPointerMove(
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) {
    if (isPlaying) {
      return;
    }

    const dragState =
      dragRef.current;

    if (!dragState) {
      return;
    }

    event.preventDefault();

    /*
     * Hoodie dragging uses unclamped coordinates,
     * allowing movement beyond the canvas edges.
     */
    const position =
      getCanvasPosition(
        event,
        dragState.type !==
          "hoodie",
      );

    if (
      dragState.type ===
      "drawing"
    ) {
      paintCanvasPixel(
        position.x,
        position.y,
      );

      return;
    }

    if (
      dragState.type ===
      "hoodie"
    ) {
      updateCurrentFrame(
        (frame) => {
          const objectSize =
            HOODIE_SIZE *
            frame.hoodieScale;

          return {
            ...frame,
            hoodieX:
              clampHoodiePosition(
                position.x -
                  dragState.offsetX,
                objectSize,
              ),
            hoodieY:
              clampHoodiePosition(
                position.y -
                  dragState.offsetY,
                objectSize,
              ),
          };
        },
      );

      return;
    }

    const sticker =
      currentFrame.stickers.find(
        (item) =>
          item.id ===
          dragState.stickerId,
      );

    if (!sticker) {
      return;
    }

    const sprite =
      spriteMap.get(
        sticker.spriteId,
      );

    if (!sprite) {
      return;
    }

    const x =
      clampStickerPosition(
        position.x -
          dragState.offsetX,
        sprite.width,
      );

    const y =
      clampStickerPosition(
        position.y -
          dragState.offsetY,
        sprite.height,
      );

    updateCurrentFrame(
      (frame) => ({
        ...frame,
        stickers:
          frame.stickers.map(
            (item) =>
              item.id ===
              dragState.stickerId
                ? {
                    ...item,
                    x,
                    y,
                  }
                : item,
          ),
      }),
    );
  }

  function stopCanvasInteraction() {
    dragRef.current = null;
  }

  function deleteSelectedSticker() {
    stopPlayback();

    if (!selectedStickerId) {
      return;
    }

    updateCurrentFrame(
      (frame) => ({
        ...frame,
        stickers:
          frame.stickers.filter(
            (sticker) =>
              sticker.id !==
              selectedStickerId,
          ),
      }),
    );

    setSelectedStickerId(null);
  }

  function clearPaint() {
    stopPlayback();

    updateCurrentFrame({
      drawingPixels:
        createPixelArray(
          CANVAS_SIZE,
          CANVAS_SIZE,
        ),
    });
  }

  function resetCurrentFrame() {
    stopPlayback();

    updateCurrentFrame(
      (frame) => ({
        ...frame,
        hoodieScale: 1,
        hoodieX:
          getCenteredPosition(
            HOODIE_SIZE,
          ),
        hoodieY:
          getCenteredPosition(
            HOODIE_SIZE,
          ),
        stickers: [],
        drawingPixels:
          createPixelArray(
            CANVAS_SIZE,
            CANVAS_SIZE,
          ),
      }),
    );

    setSelectedStickerId(null);
    setHoodieSelected(false);
    setTool("move");
  }

  function addFrame() {
    stopPlayback();

    if (
      frames.length >=
      MAX_FRAMES
    ) {
      return;
    }

    const copiedFrame =
      copyAnimationFrame(
        currentFrame,
      );

    const nextIndex =
      frames.length;

    setFrames((current) => [
      ...current,
      copiedFrame,
    ]);

    setActiveFrameIndex(
      nextIndex,
    );

    setHoodieInput(
      String(
        copiedFrame.hoodieId,
      ),
    );

    setSelectedStickerId(null);
    setHoodieSelected(false);
    setTool("move");
  }

  function selectFrame(
    index: number,
  ) {
    stopPlayback();

    const nextFrame =
      frames[index];

    if (!nextFrame) {
      return;
    }

    setActiveFrameIndex(index);

    setHoodieInput(
      String(
        nextFrame.hoodieId,
      ),
    );

    setSelectedStickerId(null);
    setHoodieSelected(false);
    setTool("move");

    dragRef.current = null;
  }

  function deleteFrame(
    index: number,
  ) {
    stopPlayback();

    if (
      frames.length <= 1
    ) {
      return;
    }

    const nextFrames =
      frames.filter(
        (_, frameIndex) =>
          frameIndex !== index,
      );

    let nextActiveIndex =
      activeFrameIndex;

    if (
      activeFrameIndex >
      index
    ) {
      nextActiveIndex =
        activeFrameIndex - 1;
    } else if (
      activeFrameIndex ===
      index
    ) {
      nextActiveIndex =
        Math.min(
          index,
          nextFrames.length - 1,
        );
    }

    const nextActiveFrame =
      nextFrames[
        nextActiveIndex
      ];

    setFrames(nextFrames);

    setActiveFrameIndex(
      nextActiveIndex,
    );

    if (nextActiveFrame) {
      setHoodieInput(
        String(
          nextActiveFrame.hoodieId,
        ),
      );
    }

    setSelectedStickerId(null);
    setHoodieSelected(false);
  }

  function exportPng() {
    const exportCanvas =
      renderFrameToExportCanvas(
        currentFrame,
        spriteMap,
        PNG_EXPORT_SIZE,
      );

    if (!exportCanvas) {
      return;
    }

    const link =
      document.createElement("a");

    link.download =
      `hood-collage-${currentFrame.hoodieId}` +
      `-frame-${activeFrameIndex + 1}.png`;

    link.href =
      exportCanvas.toDataURL(
        "image/png",
      );

    link.click();
  }

  async function exportGif() {
    if (gifExporting) {
      return;
    }

    stopPlayback();
    setGifExporting(true);

    try {
      await new Promise<void>(
        (resolve) => {
          window.setTimeout(
            resolve,
            10,
          );
        },
      );

      const animationFrames =
        getAnimationFrames(
          frames,
          animationMode,
        );

      const gif =
        GIFEncoder();

      animationFrames.forEach(
        (frame, index) => {
          const exportCanvas =
            renderFrameToExportCanvas(
              frame,
              spriteMap,
              GIF_EXPORT_SIZE,
            );

          if (!exportCanvas) {
            return;
          }

          const context =
            exportCanvas.getContext(
              "2d",
              {
                willReadFrequently:
                  true,
              },
            );

          if (!context) {
            return;
          }

          const imageData =
            context.getImageData(
              0,
              0,
              GIF_EXPORT_SIZE,
              GIF_EXPORT_SIZE,
            );

          const indexedPixels =
            applyPalette(
              imageData.data,
              GIF_PALETTE,
            );

          gif.writeFrame(
            indexedPixels,
            GIF_EXPORT_SIZE,
            GIF_EXPORT_SIZE,
            {
              palette:
                index === 0
                  ? GIF_PALETTE
                  : undefined,
              delay: frameDelay,
              repeat: 0,
              dispose: 1,
            },
          );
        },
      );

     gif.finish();

const output = gif.bytes();

const gifBuffer = new Uint8Array(output).buffer;

const blob = new Blob(
  [gifBuffer],
  {
    type: "image/gif",
  },
);

const objectUrl =
  URL.createObjectURL(blob);

const link =
  document.createElement("a");

link.href = objectUrl;

link.download =
  `hood-animation-${animationMode}` +
  `-${frames.length}-frames.gif`;

link.click();

window.setTimeout(() => {
  URL.revokeObjectURL(objectUrl);
}, 1000);

    } catch (error) {
      console.error(
        "Unable to export GIF:",
        error,
      );
    } finally {
      setGifExporting(false);
    }
  }

  function paintStickerPixel(
    index: number,
  ) {
    const value: PixelValue =
      stickerTool === "green"
        ? 1
        : stickerTool ===
            "black"
          ? 2
          : 0;

    setStickerPixels(
      (current) => {
        if (
          current[index] ===
          value
        ) {
          return current;
        }

        const next = [
          ...current,
        ];

        next[index] = value;

        return next;
      },
    );

    setCopiedSticker(false);
  }

  function createNewSticker() {
    setStickerName(
      "New Sticker",
    );

    setStickerPixels(
      createPixelArray(
        STICKER_EDITOR_SIZE,
        STICKER_EDITOR_SIZE,
      ),
    );

    setEditingSpriteId(null);
    setCopiedSticker(false);

    setEditorMessage(
      "New empty sticker.",
    );
  }

  function saveSticker() {
    const hasPixels =
      stickerPixels.some(
        (pixel) =>
          pixel !== 0,
      );

    if (!hasPixels) {
      setEditorMessage(
        "Paint at least one pixel first.",
      );

      return;
    }

    const name =
      stickerName.trim() ||
      "Custom Sticker";

    const existingCustom =
      customSprites.find(
        (sprite) =>
          sprite.id ===
          editingSpriteId,
      );

    if (existingCustom) {
      const updatedSprite:
        LibrarySprite = {
        ...existingCustom,
        name,
        width:
          STICKER_EDITOR_SIZE,
        height:
          STICKER_EDITOR_SIZE,
        pixels: [
          ...stickerPixels,
        ],
        custom: true,
      };

      setCustomSprites(
        (current) =>
          current.map(
            (sprite) =>
              sprite.id ===
              existingCustom.id
                ? updatedSprite
                : sprite,
          ),
      );

      setEditorMessage(
        "Custom sticker updated.",
      );

      return;
    }

    const sprite:
      LibrarySprite = {
      id:
        `custom-${
          createSlug(name) ||
          "sticker"
        }-${Date.now()}`,
      name,
      width:
        STICKER_EDITOR_SIZE,
      height:
        STICKER_EDITOR_SIZE,
      pixels: [
        ...stickerPixels,
      ],
      custom: true,
    };

    setCustomSprites(
      (current) => [
        ...current,
        sprite,
      ],
    );

    setEditingSpriteId(
      sprite.id,
    );

    setEditorMessage(
      "Sticker saved locally.",
    );
  }

  async function copyStickerForLibrary() {
    const hasPixels =
      stickerPixels.some(
        (pixel) =>
          pixel !== 0,
      );

    if (!hasPixels) {
      setEditorMessage(
        "Paint or load a sticker first.",
      );

      return;
    }

    try {
      await navigator.clipboard.writeText(
        stickerLibraryCode,
      );

      setCopiedSticker(true);

      setEditorMessage(
        "Copied. Paste it inside HOOD_SPRITES in hoodSprites.ts.",
      );

      window.setTimeout(() => {
        setCopiedSticker(
          false,
        );
      }, 2000);
    } catch (error) {
      console.error(error);

      setEditorMessage(
        "Copy failed. Select the code below and copy it manually.",
      );
    }
  }

  function deleteCustomSprite(
    spriteId: string,
  ) {
    stopPlayback();

    setCustomSprites(
      (current) =>
        current.filter(
          (sprite) =>
            sprite.id !==
            spriteId,
        ),
    );

    setFrames((current) =>
      current.map(
        (frame) => ({
          ...frame,
          stickers:
            frame.stickers.filter(
              (sticker) =>
                sticker.spriteId !==
                spriteId,
            ),
        }),
      ),
    );

    if (
      editingSpriteId ===
      spriteId
    ) {
      createNewSticker();
    }

    const selected =
      currentFrame.stickers.find(
        (sticker) =>
          sticker.id ===
          selectedStickerId,
      );

    if (
      selected?.spriteId ===
      spriteId
    ) {
      setSelectedStickerId(null);
    }
  }

  return (
    <main className="min-h-screen bg-black text-[#ccff00]">
      <SiteHeader />

      <section className="px-4 pb-24 pt-28 md:px-6 md:pt-32">
        <div className="mx-auto max-w-[1440px]">
          <div className="section-heading-row border-[#ccff00]">
            <p>
              Hood Tools / Collage
            </p>

            <p>
              40 × 40 PX / Animated
            </p>
          </div>

          <div className="mt-7 border-b-2 border-[#ccff00] pb-7">
            <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
              <div>
                <h1 className="text-[clamp(2.4rem,5vw,5rem)] leading-[0.88] tracking-[-0.06em]">
                  HOOD COLLAGE MAKER.
                </h1>

                <p className="mt-5 max-w-2xl text-sm leading-relaxed opacity-75 md:text-base">
                  Move the Hoodie beyond
                  the canvas, animate up
                  to eight frames and
                  export a looping GIF.
                </p>
              </div>

              <p className="text-[8px] uppercase tracking-[0.16em] opacity-60">
                Movable Hoodie /
                Top-layer paint / GIF
              </p>
            </div>
          </div>

          <div className="mt-6 grid items-start gap-4 xl:grid-cols-[280px_minmax(0,1fr)_390px]">
            <aside className="order-2 overflow-hidden border-2 border-[#ccff00] xl:order-1">
              <div className="flex items-center justify-between border-b-2 border-[#ccff00] px-4 py-4">
                <p className="text-[9px] uppercase tracking-[0.16em]">
                  Sticker Library
                </p>

                <p className="text-[8px] uppercase tracking-[0.14em] opacity-60">
                  {String(
                    allSprites.length,
                  ).padStart(2, "0")}
                </p>
              </div>

              <div className="grid grid-cols-2 pb-px">
                {allSprites.map(
                  (
                    sprite,
                    index,
                  ) => {
                    const isLastColumn =
                      index % 2 === 1;

                    const isLastRow =
                      index >=
                      allSprites.length -
                        2;

                    return (
                      <div
                        key={
                          sprite.id
                        }
                        className={`relative ${
                          !isLastColumn
                            ? "border-r border-[#ccff00]"
                            : ""
                        } ${
                          !isLastRow
                            ? "border-b border-[#ccff00]"
                            : ""
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            selectLibrarySprite(
                              sprite,
                            )
                          }
                          className={`flex w-full flex-col gap-3 p-3 text-[#ccff00] transition-colors hover:bg-[#ccff00] hover:text-black ${
                            editingSpriteId ===
                            sprite.id
                              ? "bg-[#ccff00] text-black"
                              : "bg-black"
                          }`}
                        >
                          <div
                            className="flex aspect-square w-full items-center justify-center p-3"
                            style={{
                              backgroundColor:
                                EDITOR_BACKGROUND,
                            }}
                          >
                            <SpritePreview
                              sprite={
                                sprite
                              }
                            />
                          </div>

                          <span className="min-h-8 text-center text-[7px] uppercase leading-relaxed tracking-[0.12em]">
                            {
                              sprite.name
                            }
                          </span>
                        </button>

                        {sprite.custom ? (
                          <button
                            type="button"
                            aria-label={`Delete ${sprite.name}`}
                            onClick={(
                              event,
                            ) => {
                              event.stopPropagation();

                              deleteCustomSprite(
                                sprite.id,
                              );
                            }}
                            className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center border border-black bg-[#ccff00] text-[11px] text-black hover:bg-black hover:text-[#ccff00]"
                          >
                            ×
                          </button>
                        ) : null}
                      </div>
                    );
                  },
                )}
              </div>
            </aside>

            <section className="order-1 border-2 border-[#ccff00] xl:order-2">
              <div className="flex flex-col gap-3 border-b-2 border-[#ccff00] p-4 md:flex-row md:items-end">
                <label className="flex-1">
                  <span className="mb-2 block text-[8px] uppercase tracking-[0.14em] opacity-65">
                    Hoodie ID / Frame{" "}
                    {activeFrameIndex +
                      1}
                  </span>

                  <input
                    type="number"
                    min={
                      MIN_HOODIE_ID
                    }
                    max={
                      MAX_HOODIE_ID
                    }
                    value={
                      hoodieInput
                    }
                    disabled={
                      isPlaying
                    }
                    onChange={(
                      event,
                    ) =>
                      setHoodieInput(
                        event.target
                          .value,
                      )
                    }
                    onKeyDown={(
                      event,
                    ) => {
                      if (
                        event.key ===
                        "Enter"
                      ) {
                        void loadHoodie(
                          Number(
                            hoodieInput,
                          ),
                        );
                      }
                    }}
                    className="min-h-12 w-full border-2 border-[#ccff00] bg-black px-4 text-sm text-[#ccff00] outline-none disabled:opacity-40"
                  />
                </label>

                <button
                  type="button"
                  disabled={
                    hoodieLoading ||
                    isPlaying
                  }
                  onClick={() =>
                    void loadHoodie(
                      Number(
                        hoodieInput,
                      ),
                    )
                  }
                  className="min-h-12 border-2 border-[#ccff00] bg-[#ccff00] px-6 text-[8px] uppercase tracking-[0.14em] text-black transition-colors hover:bg-black hover:text-[#ccff00] disabled:opacity-40"
                >
                  {hoodieLoading
                    ? "Loading..."
                    : "Load Hoodie"}
                </button>

                <button
                  type="button"
                  disabled={
                    hoodieLoading ||
                    isPlaying
                  }
                  onClick={() =>
                    void loadHoodie(
                      randomHoodieId(),
                    )
                  }
                  className="min-h-12 border-2 border-[#ccff00] bg-black px-6 text-[8px] uppercase tracking-[0.14em] text-[#ccff00] transition-colors hover:bg-[#ccff00] hover:text-black disabled:opacity-40"
                >
                  Random
                </button>
              </div>

              {hoodieError ? (
                <div className="border-b-2 border-[#ccff00] px-4 py-3 text-[9px] uppercase tracking-[0.1em]">
                  {hoodieError}
                </div>
              ) : null}

              <div className="grid grid-cols-4 gap-2 border-b-2 border-[#ccff00] p-4">
                <ActionButton
                  active={
                    currentFrame.hoodieScale ===
                    1
                  }
                  disabled={
                    isPlaying
                  }
                  onClick={() =>
                    setScale(1)
                  }
                >
                  Hoodie 1×
                </ActionButton>

                <ActionButton
                  active={
                    currentFrame.hoodieScale ===
                    2
                  }
                  disabled={
                    isPlaying
                  }
                  onClick={() =>
                    setScale(2)
                  }
                >
                  Hoodie 2×
                </ActionButton>

                <ActionButton
                  active={
                    currentFrame.hoodieScale ===
                    3
                  }
                  disabled={
                    isPlaying
                  }
                  onClick={() =>
                    setScale(3)
                  }
                >
                  Hoodie 3×
                </ActionButton>

                <ActionButton
                  disabled={
                    isPlaying
                  }
                  onClick={
                    centerHoodie
                  }
                >
                  Center
                </ActionButton>
              </div>

              <div className="flex min-h-[420px] items-center justify-center bg-[#ccff00] p-4 md:min-h-[650px] md:p-8">
                <div className="relative aspect-square w-full max-w-[620px] overflow-hidden border-2 border-black bg-[#ccff00]">
                  <canvas
                    ref={canvasRef}
                    width={
                      CANVAS_SIZE
                    }
                    height={
                      CANVAS_SIZE
                    }
                    onPointerDown={
                      handleCanvasPointerDown
                    }
                    onPointerMove={
                      handleCanvasPointerMove
                    }
                    onPointerUp={
                      stopCanvasInteraction
                    }
                    onPointerCancel={
                      stopCanvasInteraction
                    }
                    onPointerLeave={(
                      event,
                    ) => {
                      if (
                        event.buttons ===
                        0
                      ) {
                        stopCanvasInteraction();
                      }
                    }}
                    className="block h-full w-full touch-none"
                    style={{
                      imageRendering:
                        "pixelated",
                      cursor:
                        isPlaying
                          ? "default"
                          : tool ===
                              "move"
                            ? "grab"
                            : "crosshair",
                    }}
                  />

                  {showGrid ? (
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0"
                      style={{
                        backgroundImage:
                          "linear-gradient(to right, rgba(0,0,0,0.28) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.28) 1px, transparent 1px)",
                        backgroundSize:
                          "2.5% 2.5%",
                      }}
                    />
                  ) : null}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 border-t-2 border-[#ccff00] p-4 sm:grid-cols-4">
                <ActionButton
                  active={
                    tool ===
                    "move"
                  }
                  disabled={
                    isPlaying
                  }
                  onClick={() =>
                    setTool(
                      "move",
                    )
                  }
                >
                  Move
                </ActionButton>

                <ActionButton
                  active={
                    tool ===
                    "black"
                  }
                  disabled={
                    isPlaying
                  }
                  onClick={() =>
                    setTool(
                      "black",
                    )
                  }
                >
                  Black
                </ActionButton>

                <ActionButton
                  active={
                    tool ===
                    "green"
                  }
                  disabled={
                    isPlaying
                  }
                  onClick={() =>
                    setTool(
                      "green",
                    )
                  }
                >
                  Green
                </ActionButton>

                <ActionButton
                  active={
                    tool ===
                    "erase"
                  }
                  disabled={
                    isPlaying
                  }
                  onClick={() =>
                    setTool(
                      "erase",
                    )
                  }
                >
                  Eraser
                </ActionButton>

                <ActionButton
                  active={
                    showGrid
                  }
                  onClick={() =>
                    setShowGrid(
                      (current) =>
                        !current,
                    )
                  }
                >
                  Grid{" "}
                  {showGrid
                    ? "On"
                    : "Off"}
                </ActionButton>

                <ActionButton
                  disabled={
                    !selectedStickerId ||
                    isPlaying
                  }
                  onClick={
                    deleteSelectedSticker
                  }
                >
                  Delete Sticker
                </ActionButton>

                <ActionButton
                  disabled={
                    isPlaying
                  }
                  onClick={
                    clearPaint
                  }
                >
                  Clear Paint
                </ActionButton>

                <ActionButton
                  disabled={
                    isPlaying
                  }
                  onClick={
                    resetCurrentFrame
                  }
                >
                  Reset Frame
                </ActionButton>
              </div>

              <div className="grid grid-cols-1 gap-2 border-t-2 border-[#ccff00] p-4 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={
                    exportPng
                  }
                  className="flex min-h-14 w-full items-center justify-center border-2 border-[#ccff00] bg-black px-5 text-[9px] uppercase tracking-[0.16em] text-[#ccff00] transition-colors hover:bg-[#ccff00] hover:text-black"
                >
                  Export Current PNG
                </button>

                <button
                  type="button"
                  disabled={
                    gifExporting
                  }
                  onClick={() =>
                    void exportGif()
                  }
                  className="flex min-h-14 w-full items-center justify-center border-2 border-[#ccff00] bg-[#ccff00] px-5 text-[9px] uppercase tracking-[0.16em] text-black transition-colors hover:bg-black hover:text-[#ccff00] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {gifExporting
                    ? "Creating GIF..."
                    : "Export Animated GIF"}
                </button>
              </div>

              <div className="flex flex-col justify-between gap-2 border-t-2 border-[#ccff00] px-4 py-4 text-[7px] uppercase tracking-[0.13em] opacity-65 sm:flex-row">
                <p>
                  Frame{" "}
                  {activeFrameIndex +
                    1}
                  /{frames.length}
                </p>

                <p>
                  Hoodie #
                  {String(
                    currentFrame.hoodieId,
                  ).padStart(
                    4,
                    "0",
                  )}
                </p>

                <p>
                  Scale{" "}
                  {
                    currentFrame.hoodieScale
                  }
                  ×
                </p>

                <p>
                  40 × 40 PX
                </p>
              </div>
            </section>

            <aside className="order-3 border-2 border-[#ccff00]">
              <div className="flex items-start justify-between gap-4 border-b-2 border-[#ccff00] px-4 py-4">
                <div>
                  <p className="text-[9px] uppercase tracking-[0.16em]">
                    Sticker Creator
                  </p>

                  <p className="mt-2 text-[8px] uppercase tracking-[0.12em] opacity-60">
                    20 × 20 PX
                  </p>
                </div>

                <button
                  type="button"
                  disabled={
                    isPlaying
                  }
                  onClick={
                    createNewSticker
                  }
                  className="border border-[#ccff00] px-3 py-2 text-[7px] uppercase tracking-[0.12em] hover:bg-[#ccff00] hover:text-black disabled:opacity-35"
                >
                  New
                </button>
              </div>

              <div className="p-4">
                <label>
                  <span className="mb-2 block text-[8px] uppercase tracking-[0.14em] opacity-65">
                    Sticker name
                  </span>

                  <input
                    type="text"
                    maxLength={32}
                    value={
                      stickerName
                    }
                    disabled={
                      isPlaying
                    }
                    onChange={(
                      event,
                    ) => {
                      setStickerName(
                        event.target
                          .value,
                      );

                      setCopiedSticker(
                        false,
                      );
                    }}
                    className="min-h-12 w-full border-2 border-[#ccff00] bg-black px-4 text-sm text-[#ccff00] outline-none disabled:opacity-40"
                  />
                </label>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  <ActionButton
                    active={
                      stickerTool ===
                      "black"
                    }
                    disabled={
                      isPlaying
                    }
                    onClick={() =>
                      setStickerTool(
                        "black",
                      )
                    }
                  >
                    Black
                  </ActionButton>

                  <ActionButton
                    active={
                      stickerTool ===
                      "green"
                    }
                    disabled={
                      isPlaying
                    }
                    onClick={() =>
                      setStickerTool(
                        "green",
                      )
                    }
                  >
                    Green
                  </ActionButton>

                  <ActionButton
                    active={
                      stickerTool ===
                      "erase"
                    }
                    disabled={
                      isPlaying
                    }
                    onClick={() =>
                      setStickerTool(
                        "erase",
                      )
                    }
                  >
                    Erase
                  </ActionButton>
                </div>

                <div
                  className="mt-4 grid aspect-square w-full touch-none border-2 border-[#ccff00] p-1"
                  style={{
                    gridTemplateColumns: `repeat(${STICKER_EDITOR_SIZE}, minmax(0, 1fr))`,
                    backgroundColor:
                      EDITOR_BACKGROUND,
                  }}
                  onPointerLeave={() =>
                    setStickerDrawing(
                      false,
                    )
                  }
                  onPointerUp={() =>
                    setStickerDrawing(
                      false,
                    )
                  }
                  onPointerCancel={() =>
                    setStickerDrawing(
                      false,
                    )
                  }
                >
                  {stickerPixels.map(
                    (
                      pixel,
                      index,
                    ) => (
                      <button
                        key={index}
                        type="button"
                        disabled={
                          isPlaying
                        }
                        aria-label={`Sticker pixel ${
                          index + 1
                        }`}
                        onPointerDown={(
                          event,
                        ) => {
                          event.preventDefault();

                          setStickerDrawing(
                            true,
                          );

                          paintStickerPixel(
                            index,
                          );
                        }}
                        onPointerEnter={() => {
                          if (
                            stickerDrawing &&
                            !isPlaying
                          ) {
                            paintStickerPixel(
                              index,
                            );
                          }
                        }}
                        className="aspect-square border border-black/20 disabled:cursor-not-allowed"
                        style={{
                          backgroundColor:
                            pixel === 2
                              ? BLACK
                              : pixel ===
                                  1
                                ? GREEN
                                : EMPTY_EDITOR_PIXEL,
                        }}
                      />
                    ),
                  )}
                </div>

                {editorMessage ? (
                  <p className="mt-4 border border-[#ccff00] px-3 py-3 text-[8px] uppercase leading-relaxed tracking-[0.1em]">
                    {editorMessage}
                  </p>
                ) : null}

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <ActionButton
                    disabled={
                      isPlaying
                    }
                    onClick={() => {
                      setStickerPixels(
                        createPixelArray(
                          STICKER_EDITOR_SIZE,
                          STICKER_EDITOR_SIZE,
                        ),
                      );

                      setCopiedSticker(
                        false,
                      );

                      setEditorMessage(
                        "Sticker cleared.",
                      );
                    }}
                  >
                    Clear
                  </ActionButton>

                  <button
                    type="button"
                    disabled={
                      isPlaying
                    }
                    onClick={
                      saveSticker
                    }
                    className="min-h-12 border-2 border-[#ccff00] bg-[#ccff00] px-4 py-3 text-[8px] uppercase tracking-[0.14em] text-black transition-colors hover:bg-black hover:text-[#ccff00] disabled:opacity-35"
                  >
                    {editingSprite?.custom
                      ? "Update"
                      : "Save"}
                  </button>
                </div>

                <button
                  type="button"
                  disabled={
                    isPlaying
                  }
                  onClick={() =>
                    void copyStickerForLibrary()
                  }
                  className="mt-2 flex min-h-12 w-full items-center justify-center border-2 border-[#ccff00] bg-black px-4 py-3 text-[8px] uppercase tracking-[0.14em] text-[#ccff00] transition-colors hover:bg-[#ccff00] hover:text-black disabled:opacity-35"
                >
                  {copiedSticker
                    ? "Copied!"
                    : "Copy Sticker"}
                </button>

                <div className="mt-5">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-[8px] uppercase tracking-[0.14em] opacity-65">
                      Ready for
                      hoodSprites.ts
                    </p>

                    <p className="text-[7px] uppercase tracking-[0.12em] opacity-50">
                      Copy + Paste
                    </p>
                  </div>

                  <textarea
                    readOnly
                    value={
                      stickerLibraryCode
                    }
                    onFocus={(
                      event,
                    ) =>
                      event.currentTarget.select()
                    }
                    className="h-64 w-full resize-none border-2 border-[#ccff00] bg-black p-3 font-mono text-[8px] leading-relaxed text-[#ccff00] outline-none"
                  />
                </div>
              </div>
            </aside>
          </div>

          <section className="mt-4 border-2 border-[#ccff00]">
            <div className="flex flex-col gap-4 border-b-2 border-[#ccff00] p-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-[0.16em]">
                  Animation Frames
                </p>

                <p className="mt-2 text-[8px] uppercase tracking-[0.12em] opacity-60">
                  Add Frame copies the
                  active frame / Maximum
                  8
                </p>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <label>
                  <span className="mb-2 block text-[7px] uppercase tracking-[0.12em] opacity-65">
                    Playback
                  </span>

                  <select
                    value={
                      animationMode
                    }
                    disabled={
                      isPlaying
                    }
                    onChange={(
                      event,
                    ) =>
                      setAnimationMode(
                        event.target
                          .value as AnimationMode,
                      )
                    }
                    className="min-h-12 w-full border-2 border-[#ccff00] bg-black px-4 text-[8px] uppercase tracking-[0.12em] text-[#ccff00] outline-none disabled:opacity-40"
                  >
                    <option value="loop">
                      Loop
                    </option>

                    <option value="ping-pong">
                      Ping Pong
                    </option>
                  </select>
                </label>

                <label>
                  <span className="mb-2 block text-[7px] uppercase tracking-[0.12em] opacity-65">
                    Frame Delay
                  </span>

                  <select
                    value={
                      frameDelay
                    }
                    onChange={(
                      event,
                    ) =>
                      setFrameDelay(
                        Number(
                          event.target
                            .value,
                        ),
                      )
                    }
                    className="min-h-12 w-full border-2 border-[#ccff00] bg-black px-4 text-[8px] uppercase tracking-[0.12em] text-[#ccff00] outline-none"
                  >
                    <option
                      value={100}
                    >
                      100 MS / Fast
                    </option>

                    <option
                      value={150}
                    >
                      150 MS
                    </option>

                    <option
                      value={200}
                    >
                      200 MS
                    </option>

                    <option
                      value={250}
                    >
                      250 MS
                    </option>

                    <option
                      value={350}
                    >
                      350 MS
                    </option>

                    <option
                      value={500}
                    >
                      500 MS / Slow
                    </option>

                    <option
                      value={750}
                    >
                      750 MS
                    </option>

                    <option
                      value={1000}
                    >
                      1000 MS
                    </option>
                  </select>
                </label>

                <button
                  type="button"
                  disabled={
                    frames.length <= 1
                  }
                  onClick={
                    togglePlayback
                  }
                  className={`min-h-12 self-end border-2 border-[#ccff00] px-5 text-[8px] uppercase tracking-[0.14em] transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
                    isPlaying
                      ? "bg-[#ccff00] text-black"
                      : "bg-black text-[#ccff00] hover:bg-[#ccff00] hover:text-black"
                  }`}
                >
                  {isPlaying
                    ? "■ Stop"
                    : "▶ Play"}
                </button>

                <button
                  type="button"
                  disabled={
                    frames.length >=
                      MAX_FRAMES ||
                    isPlaying
                  }
                  onClick={
                    addFrame
                  }
                  className="min-h-12 self-end border-2 border-[#ccff00] bg-[#ccff00] px-5 text-[8px] uppercase tracking-[0.14em] text-black transition-colors hover:bg-black hover:text-[#ccff00] disabled:cursor-not-allowed disabled:opacity-35"
                >
                  {frames.length >=
                  MAX_FRAMES
                    ? "8 Frames Maximum"
                    : "+ Add Frame"}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8">
              {frames.map(
                (
                  frame,
                  index,
                ) => (
                  <div
                    key={
                      frame.id
                    }
                    className={`relative border-b border-r border-[#ccff00] p-2 ${
                      activeFrameIndex ===
                      index
                        ? "bg-[#ccff00] text-black"
                        : "bg-black text-[#ccff00]"
                    }`}
                  >
                    <button
                      type="button"
                      disabled={
                        isPlaying
                      }
                      onClick={() =>
                        selectFrame(
                          index,
                        )
                      }
                      className="block w-full text-left disabled:cursor-not-allowed"
                    >
                      <div className="aspect-square w-full overflow-hidden border border-current">
                        <FramePreview
                          frame={
                            frame
                          }
                          spriteMap={
                            spriteMap
                          }
                        />
                      </div>

                      <div className="mt-2 flex items-center justify-between gap-2 text-[7px] uppercase tracking-[0.1em]">
                        <span>
                          Frame{" "}
                          {index +
                            1}
                        </span>

                        <span>
                          #
                          {
                            frame.hoodieId
                          }
                        </span>
                      </div>
                    </button>

                    {frames.length >
                    1 ? (
                      <button
                        type="button"
                        disabled={
                          isPlaying
                        }
                        aria-label={`Delete frame ${
                          index +
                          1
                        }`}
                        onClick={() =>
                          deleteFrame(
                            index,
                          )
                        }
                        className={`absolute right-3 top-3 flex h-6 w-6 items-center justify-center border text-[11px] disabled:opacity-35 ${
                          activeFrameIndex ===
                          index
                            ? "border-black bg-black text-[#ccff00]"
                            : "border-[#ccff00] bg-[#ccff00] text-black"
                        }`}
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                ),
              )}
            </div>

            <div className="flex flex-col justify-between gap-2 border-t-2 border-[#ccff00] px-4 py-4 text-[7px] uppercase tracking-[0.13em] opacity-65 sm:flex-row">
              <p>
                {frames.length}/
                {MAX_FRAMES} Frames
              </p>

              <p>
                {animationMode ===
                "loop"
                  ? "Loop Playback"
                  : "Forward + Reverse Playback"}
              </p>

              <p>
                {frameDelay} MS Per
                Frame
              </p>

              <p>
                Each frame has its own
                Hoodie ID
              </p>
            </div>
          </section>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}